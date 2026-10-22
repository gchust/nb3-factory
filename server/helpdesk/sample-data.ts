import type { Application } from '@nocobase/app-server/application';
import { userManagementServiceToken } from '@nocobase/app-plugin-users/server/tokens';
import type { DatabaseManager } from '@nocobase/db';
import type { LifecycleRuntime } from '@nocobase/lifecycle';

interface DemoUser {
  readonly name: string;
  readonly email: string;
  readonly permissionSet: string;
}

interface DemoTicket {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly category: 'hardware' | 'software' | 'network' | 'access' | 'other';
  readonly priority: 'low' | 'medium' | 'high' | 'urgent';
  readonly stage: 'open' | 'processing' | 'resolved' | 'closed';
  /** Makes the ticket look untouched for longer than the default reminder window. */
  readonly idleHours?: number;
}

/** Local demonstration accounts; never used outside a sample installation. */
const DEMO_PASSWORD = 'Helpdesk123!';
const LIFECYCLE = 'helpdeskTicket';

const DEMO_USERS: readonly DemoUser[] = [
  {
    name: 'Helpdesk Employee',
    email: 'employee@example.com',
    permissionSet: 'helpdesk-employee',
  },
  {
    name: 'Helpdesk Engineer',
    email: 'engineer@example.com',
    permissionSet: 'helpdesk-engineer',
  },
  {
    name: 'Helpdesk Service Desk',
    email: 'service.desk@example.com',
    permissionSet: 'helpdesk-service-desk',
  },
];

const DEMO_TICKETS: readonly DemoTicket[] = [
  {
    key: 'laptop',
    title: 'Sample: laptop will not start after the update',
    description:
      'The laptop shows the manufacturer logo and then restarts. This started after last night’s update.',
    category: 'hardware',
    priority: 'high',
    stage: 'open',
  },
  {
    key: 'vpn',
    title: 'Sample: VPN disconnects every few minutes',
    description:
      'The VPN client connects, then drops the session after three to five minutes from home.',
    category: 'network',
    priority: 'medium',
    stage: 'processing',
  },
  {
    key: 'printer',
    title: 'Sample: cannot install the office printer',
    description:
      'The printer is listed on the network but adding it on the new laptop asks for a driver we do not have.',
    category: 'hardware',
    priority: 'low',
    stage: 'resolved',
  },
  {
    key: 'access',
    title: 'Sample: access to the finance shared drive',
    description:
      'I moved to the finance team this week and need read access to the shared drive.',
    category: 'access',
    priority: 'medium',
    stage: 'closed',
  },
  {
    key: 'overdue',
    title: 'Sample: meeting room display has no signal',
    description:
      'The display in meeting room 3 shows “no signal” when a laptop is connected. The room is booked this afternoon.',
    category: 'hardware',
    priority: 'urgent',
    stage: 'processing',
    idleHours: 30,
  },
];

function nextTicketNo(now = new Date()): string {
  const date = [
    String(now.getUTCFullYear()).slice(2),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('');
  return `HD-${date}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

/**
 * Builds the helpdesk demonstration: three accounts with their permission sets,
 * one ticket per lifecycle stage, an overdue processing ticket for the reminder
 * sweep, and enough assignments for the dashboard workload panel.
 *
 * Every step tolerates existing data, so a retried sample never duplicates a
 * demo ticket.
 */
export async function buildHelpdeskSampleData(options: {
  readonly app: Application;
  readonly database: DatabaseManager;
  readonly runtime: LifecycleRuntime;
}): Promise<void> {
  const { app, database, runtime } = options;
  const users = app.container.resolve(userManagementServiceToken);
  const repository =
    database.repository<Record<string, unknown>>('helpdeskTickets');
  const ids = new Map<string, string>();

  for (const demo of DEMO_USERS) {
    const page = await users.list({ search: demo.email, pageSize: 100 });
    const existing = page.items.find((user) => user.email === demo.email);
    if (existing) {
      ids.set(demo.permissionSet, String(existing.id));
      const assigned = existing.roleScopes.app;
      const hasRole =
        assigned === demo.permissionSet ||
        (Array.isArray(assigned) && assigned.includes(demo.permissionSet));
      if (!hasRole) {
        await users.replaceRoleScope(String(existing.id), 'app', [
          demo.permissionSet,
        ]);
      }
      continue;
    }
    const created = await users.create({
      name: demo.name,
      email: demo.email,
      password: DEMO_PASSWORD,
      roleScopes: { app: [demo.permissionSet] },
    });
    ids.set(demo.permissionSet, String(created.id));
  }

  const employeeId = ids.get('helpdesk-employee');
  const engineerId = ids.get('helpdesk-engineer');
  const deskId = ids.get('helpdesk-service-desk');
  if (!employeeId || !engineerId || !deskId) {
    throw new Error('The demo accounts could not be provisioned.');
  }

  for (const demo of DEMO_TICKETS) {
    const existing = await repository.findOne({
      filter: { title: demo.title },
    });
    if (existing) continue;

    const now = new Date().toISOString();
    const created = await runtime.create(
      LIFECYCLE,
      {
        id: crypto.randomUUID(),
        ticketNo: nextTicketNo(),
        title: demo.title,
        description: demo.description,
        category: demo.category,
        priority: demo.priority,
        reporterId: employeeId,
        assigneeId: null,
        resolution: null,
        resolvedAt: null,
        closedAt: null,
        lastReminderAt: null,
        createdAt: now,
        updatedAt: now,
      },
      { actor: { id: employeeId } },
    );
    if (demo.stage === 'open') continue;

    const ticketId = String(created.record.id);
    const fire = (
      transition: string,
      actorId: string,
      input: Readonly<Record<string, string>> = {},
    ) =>
      runtime.fire(LIFECYCLE, ticketId, transition, {
        actor: { id: actorId },
        input,
        requestId: `sample-${demo.key}-${transition}`,
      });
    await fire('assign', deskId, { assigneeId: engineerId });
    if (demo.stage === 'processing') {
      if (demo.idleHours) {
        const changedAt = new Date(
          Date.now() - demo.idleHours * 3_600_000,
        ).toISOString();
        await repository.updateOne({
          filter: { id: ticketId },
          values: { statusChangedAt: changedAt, updatedAt: changedAt },
        });
      }
      continue;
    }
    await fire('resolve', engineerId, {
      resolution:
        'Reinstalled the vendor driver and confirmed the device works.',
    });
    if (demo.stage === 'resolved') continue;
    await fire('confirm', employeeId);
  }
}
