import { AppCommand } from '@nocobase/app-cli';
import { Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';

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
}

export interface SeedHelpdeskResult {
  readonly dryRun: boolean;
  readonly users: readonly {
    readonly email: string;
    readonly permissionSet: string;
    readonly status: 'created' | 'updated' | 'unchanged';
  }[];
  readonly tickets: readonly {
    readonly title: string;
    readonly status: 'created' | 'existing' | 'planned';
    readonly stage: DemoTicket['stage'];
  }[];
}

// These credentials are for local demonstrations only. Rerunning the command
// leaves existing accounts and tickets in place, so it is safe after a restart.
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
];

function nextTicketNo(now = new Date()): string {
  const date = [
    String(now.getUTCFullYear()).slice(2),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('');
  return `HD-${date}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export default class SeedHelpdesk extends AppCommand {
  static override summary =
    'Create the helpdesk demo people and a reproducible set of tickets.';
  static override description =
    'Idempotently provisions employee, engineer and service-desk accounts with their permission sets, then opens one sample ticket for each lifecycle stage. Safe to rerun.';
  static override examples = [
    '<%= config.bin %> <%= command.id %> --dry-run --json',
    '<%= config.bin %> <%= command.id %> --json',
  ];
  static override flags: {
    'dry-run': Interfaces.BooleanFlag<boolean>;
  } = {
    'dry-run': Flags.boolean({
      default: false,
      description: 'Report what would be created without writing anything.',
    }),
  };

  public async run(): Promise<SeedHelpdeskResult> {
    const { flags } = await this.parse(SeedHelpdesk);
    const dryRun = flags['dry-run'];
    const result = await this.withApp(async ({ app }) => {
      await app.start();

      const [
        { userManagementServiceToken },
        { databaseManagerToken },
        runtimeModule,
      ] = await Promise.all([
        import('@nocobase/app-plugin-users/server/tokens'),
        import('@nocobase/db'),
        import('../../server/helpdesk/lifecycle-provider.js'),
      ]);
      const users = app.container.resolve(userManagementServiceToken);
      const database = app.container.resolve(databaseManagerToken);
      const runtime = app.container.resolve(
        runtimeModule.helpdeskLifecycleRuntimeToken,
      );
      const repository =
        database.repository<Record<string, unknown>>('helpdeskTickets');

      const provisions: SeedHelpdeskResult['users'][number][] = [];
      const ids = new Map<string, string>();
      for (const demo of DEMO_USERS) {
        const page = await users.list({
          search: demo.email,
          pageSize: 100,
        });
        const existing = page.items.find((user) => user.email === demo.email);
        if (existing) {
          ids.set(demo.permissionSet, String(existing.id));
          const assigned = existing.roleScopes.app;
          const unchanged =
            assigned === demo.permissionSet ||
            (Array.isArray(assigned) && assigned.includes(demo.permissionSet));
          if (!unchanged && !dryRun) {
            await users.replaceRoleScope(String(existing.id), 'app', [
              demo.permissionSet,
            ]);
          }
          provisions.push({
            email: demo.email,
            permissionSet: demo.permissionSet,
            status: unchanged ? 'unchanged' : dryRun ? 'created' : 'updated',
          });
          continue;
        }
        provisions.push({
          email: demo.email,
          permissionSet: demo.permissionSet,
          status: 'created',
        });
        if (dryRun) continue;
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
      if (!dryRun && (!employeeId || !engineerId || !deskId)) {
        throw new Error('The demo accounts could not be provisioned.');
      }

      const tickets: SeedHelpdeskResult['tickets'][number][] = [];
      for (const demo of DEMO_TICKETS) {
        const existing = await repository.findOne({
          filter: { title: demo.title },
        });
        if (existing) {
          tickets.push({
            title: demo.title,
            status: 'existing',
            stage: demo.stage,
          });
          continue;
        }
        tickets.push({
          title: demo.title,
          status: dryRun ? 'planned' : 'created',
          stage: demo.stage,
        });
        if (dryRun) continue;

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
            reporterId: employeeId!,
            assigneeId: null,
            resolution: null,
            resolvedAt: null,
            closedAt: null,
            lastReminderAt: null,
            createdAt: now,
            updatedAt: now,
          },
          { actor: { id: employeeId! } },
        );
        if (demo.stage === 'open') continue;

        const ticketId = String(created.record.id);
        const fire = async (
          transition: string,
          actorId: string,
          input: Readonly<Record<string, string>> = {},
        ) =>
          runtime.fire(LIFECYCLE, ticketId, transition, {
            actor: { id: actorId },
            input,
            requestId: `sample-${demo.key}-${transition}`,
          });
        await fire('assign', deskId!, { assigneeId: engineerId! });
        if (demo.stage === 'processing') continue;
        await fire('resolve', engineerId!, {
          resolution:
            'Reinstalled the vendor driver and confirmed the device works.',
        });
        if (demo.stage === 'resolved') continue;
        await fire('confirm', employeeId!);
      }

      return { dryRun, users: provisions, tickets };
    });

    if (dryRun) this.setStatus('success-noop');
    this.log(
      dryRun
        ? 'Dry run: no demo accounts or tickets were written.'
        : `Provisioned ${result.users.filter((user) => user.status !== 'unchanged').length} demo account(s) and ${result.tickets.filter((ticket) => ticket.status === 'created').length} ticket(s). Demo password: ${DEMO_PASSWORD}`,
    );
    return result;
  }
}
