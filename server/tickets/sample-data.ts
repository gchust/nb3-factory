import type { UserAdministrationService } from '@nocobase/app-plugin-authentication/server';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseConnection } from '@nocobase/db';
import { SYSTEM_ACTOR, type LifecycleRuntime } from '@nocobase/lifecycle';

import type { TicketComment, TicketService } from './service.js';
import type { TicketCategory, TicketPriority, TicketRecord } from './types.js';

/**
 * Demonstration accounts and tickets. A fresh install receives the same demo
 * from the sample seed in `database/main/seeds`; a direct development start
 * runs this provider to enrich those ticket titles through the real lifecycle.
 * Both paths are disabled in production. All sample accounts share this
 * password and are listed in `.agents/rules/helpdesk.md` with the demo setup.
 */
export const HELPDESK_SAMPLE_PASSWORD = 'Helpdesk!2026';

const SAMPLE_USERS = [
  {
    key: 'alice',
    name: 'Alice Chen',
    username: 'alice.chen',
    email: 'alice.chen@example.com',
    roles: ['employee'],
  },
  {
    key: 'evan',
    name: 'Evan Park',
    username: 'evan.park',
    email: 'evan.park@example.com',
    roles: ['employee'],
  },
  {
    key: 'bob',
    name: 'Bob Liu',
    username: 'bob.liu',
    email: 'bob.liu@example.com',
    roles: ['employee', 'support-engineer'],
  },
  {
    key: 'carol',
    name: 'Carol Wang',
    username: 'carol.wang',
    email: 'carol.wang@example.com',
    roles: ['employee', 'support-engineer'],
  },
  {
    key: 'dana',
    name: 'Dana Zhao',
    username: 'dana.zhao',
    email: 'dana.zhao@example.com',
    roles: ['employee', 'service-desk'],
  },
] as const;

type SampleUserKey = (typeof SAMPLE_USERS)[number]['key'];

interface SampleDependencies {
  readonly database: DatabaseConnection;
  readonly users: UserAdministrationService;
  readonly authz: AppAuthorization;
  readonly tickets: TicketService;
  readonly runtime: LifecycleRuntime;
}

interface SampleTicket {
  readonly title: string;
  readonly description: string;
  readonly category: TicketCategory;
  readonly priority: TicketPriority;
  readonly requester: SampleUserKey;
  readonly ageHours?: number;
}

const SAMPLE_TICKETS: readonly SampleTicket[] = [
  {
    title: 'VPN disconnects every few minutes',
    description:
      'While working from home the VPN drops every few minutes. Reconnecting works for a while, then it drops again.',
    category: 'network',
    priority: 'high',
    requester: 'alice',
    ageHours: 30,
  },
  {
    title: 'Finance application asks for a license key',
    description:
      'The finance reporting application opens a license dialog after the latest update. The rest of the team can still use it.',
    category: 'software',
    priority: 'high',
    requester: 'evan',
  },
  {
    title: 'Third-floor printer stays offline',
    description:
      'The printer next to the meeting rooms shows offline even after restarting it. Printing from the second floor works.',
    category: 'hardware',
    priority: 'normal',
    requester: 'alice',
  },
  {
    title: 'Shared drive access lost after password reset',
    description:
      'I changed my password yesterday and now the shared finance drive returns access denied. I need it for the monthly close.',
    category: 'account',
    priority: 'urgent',
    requester: 'evan',
    ageHours: 28,
  },
  {
    title: 'Monitor flickers when docked',
    description:
      'The external monitor flickers whenever the laptop is connected to the desk dock. A different cable did not help.',
    category: 'hardware',
    priority: 'low',
    requester: 'alice',
  },
  {
    title: 'Request a replacement headset',
    description:
      'The microphone on my headset cuts out during calls. Please replace it with the same model if possible.',
    category: 'hardware',
    priority: 'normal',
    requester: 'evan',
  },
  {
    title: 'Email signature template is missing',
    description:
      'The company signature template disappeared from my mail client after the update. I need the standard template back.',
    category: 'software',
    priority: 'low',
    requester: 'alice',
  },
  {
    title: 'Duplicate ticket: laptop bag request',
    description:
      'This duplicates an earlier request for a laptop bag. Please close it.',
    category: 'other',
    priority: 'low',
    requester: 'evan',
  },
];

const hoursAgo = (hours: number): Date =>
  new Date(Date.now() - hours * 60 * 60 * 1000);

async function ensureUser(
  users: UserAdministrationService,
  user: (typeof SAMPLE_USERS)[number],
): Promise<string> {
  const existing = await users.list({
    kind: 'all',
    pageSize: 100,
    search: user.email,
  });
  const match = existing.items.find(
    (item) => item.email.toLowerCase() === user.email.toLowerCase(),
  );
  if (match) return match.id;

  try {
    const created = await users.create({
      name: user.name,
      username: user.username,
      email: user.email,
      password: HELPDESK_SAMPLE_PASSWORD,
    });
    return created.id;
  } catch (error) {
    // A concurrent installation may have created it between the lookup and
    // the insert. Resolve that race by looking it up again.
    const retry = await users.list({
      kind: 'all',
      pageSize: 100,
      search: user.email,
    });
    const found = retry.items.find(
      (item) => item.email.toLowerCase() === user.email.toLowerCase(),
    );
    if (found) return found.id;
    throw error;
  }
}

async function ensureRole(
  authz: AppAuthorization,
  userId: string,
  permissionSet: string,
): Promise<void> {
  const assignments = await authz.permissionSets.listAssignments(permissionSet);
  if (
    assignments.some(
      (assignment) =>
        assignment.subject.type === 'user' && assignment.subject.id === userId,
    )
  ) {
    return;
  }
  await authz.permissionSets.assign({
    permissionSet,
    subject: { type: 'user', id: userId },
  });
}

async function ensureTicket(
  dependencies: SampleDependencies,
  userId: string,
  input: SampleTicket,
): Promise<{ ticket: TicketRecord; created: boolean }> {
  const repository = dependencies.database.repository<TicketRecord>('tickets');
  const existing = await repository.findOne({
    filter: { title: input.title },
  });
  if (existing) return { ticket: existing, created: false };

  const ticket = await dependencies.tickets.create(userId, {
    title: input.title,
    description: input.description,
    category: input.category,
    priority: input.priority,
  });
  return { ticket, created: true };
}

async function addSampleComment(
  dependencies: SampleDependencies,
  ticketId: string,
  authorId: string,
  body: string,
): Promise<void> {
  const existing = await dependencies.database
    .repository<TicketComment>('ticketComments')
    .findOne({ filter: { ticketId, authorId, body } });
  if (existing) return;
  await dependencies.tickets.addComment(ticketId, authorId, body);
}

async function ageTicket(
  database: DatabaseConnection,
  ticket: TicketRecord,
  ageHours: number,
): Promise<TicketRecord> {
  const createdAt = hoursAgo(ageHours);
  const updated = await database.repository<TicketRecord>('tickets').updateOne({
    filter: { id: ticket.id },
    values: { createdAt, updatedAt: createdAt, statusChangedAt: createdAt },
  });
  return updated.record;
}

async function assign(
  tickets: TicketService,
  ticket: TicketRecord,
  serviceDeskId: string,
  engineerId: string,
): Promise<TicketRecord> {
  if (ticket.status !== 'pending') return ticket;
  return tickets.fire(ticket.id, 'assign', serviceDeskId, {
    assigneeId: engineerId,
  });
}

async function resolve(
  tickets: TicketService,
  ticket: TicketRecord,
  actorId: string,
  resolution: string,
): Promise<TicketRecord> {
  if (ticket.status !== 'processing' && ticket.status !== 'escalated') {
    return ticket;
  }
  return tickets.fire(ticket.id, 'resolve', actorId, { resolution });
}

/**
 * Builds the demo accounts, assigns their jobs, and creates tickets in every
 * state the desk works with. The ledger runs it once, and each step checks
 * existing rows first so a retried run cannot duplicate the sample.
 */
export async function createHelpdeskSampleData(
  dependencies: SampleDependencies,
): Promise<void> {
  const ids = new Map<SampleUserKey, string>();
  for (const user of SAMPLE_USERS) {
    const id = await ensureUser(dependencies.users, user);
    ids.set(user.key, id);
    for (const role of user.roles) {
      await ensureRole(dependencies.authz, id, role);
    }
  }

  const id = (key: SampleUserKey): string => {
    const value = ids.get(key);
    if (!value) throw new Error(`Missing sample user: ${key}`);
    return value;
  };
  const serviceDesk = id('dana');
  const bob = id('bob');
  const carol = id('carol');

  const tickets = new Map<string, TicketRecord>();
  for (const input of SAMPLE_TICKETS) {
    const result = await ensureTicket(dependencies, id(input.requester), input);
    let ticket = result.ticket;
    if (result.created && input.ageHours) {
      ticket = await ageTicket(dependencies.database, ticket, input.ageHours);
    }
    tickets.set(input.title, ticket);
  }

  const ticket = (title: string): TicketRecord => {
    const value = tickets.get(title);
    if (!value) throw new Error(`Missing sample ticket: ${title}`);
    return value;
  };

  // A pending ticket left unassigned beyond the 24-hour threshold.
  const vpn = ticket('VPN disconnects every few minutes');

  // Two engineers with active work.
  const finance = await assign(
    dependencies.tickets,
    ticket('Finance application asks for a license key'),
    serviceDesk,
    bob,
  );
  if (finance.status === 'processing') {
    await addSampleComment(
      dependencies,
      finance.id,
      bob,
      'I am checking the license server assignment and will update this ticket shortly.',
    );
  }
  await assign(
    dependencies.tickets,
    ticket('Third-floor printer stays offline'),
    serviceDesk,
    carol,
  );

  // An escalated ticket, the desk's urgent work.
  const sharedDrive = await assign(
    dependencies.tickets,
    ticket('Shared drive access lost after password reset'),
    serviceDesk,
    bob,
  );
  if (sharedDrive.status === 'processing') {
    await dependencies.runtime.fire('tickets', sharedDrive.id, 'escalate', {
      actor: SYSTEM_ACTOR,
    });
  }

  // A resolved ticket waiting for its requester to confirm closure.
  let monitor = await assign(
    dependencies.tickets,
    ticket('Monitor flickers when docked'),
    serviceDesk,
    bob,
  );
  monitor = await resolve(
    dependencies.tickets,
    monitor,
    bob,
    'Replaced the dock firmware and the flicker stopped. Please confirm after a day of use.',
  );
  if (monitor.status === 'resolved') {
    await addSampleComment(
      dependencies,
      monitor.id,
      bob,
      'The replacement dock is at reception if the issue returns.',
    );
  }

  // A closed request, so history and the resolved count are both visible.
  let signature = await assign(
    dependencies.tickets,
    ticket('Email signature template is missing'),
    serviceDesk,
    carol,
  );
  signature = await resolve(
    dependencies.tickets,
    signature,
    carol,
    'Restored the standard signature template from the company profile.',
  );
  if (signature.status === 'resolved') {
    await dependencies.runtime.fire('tickets', signature.id, 'close', {
      actor: SYSTEM_ACTOR,
      input: { closeNote: 'Closed after the requester confirmed the fix.' },
    });
  }

  // A cancelled duplicate, showing the desk's final state.
  const duplicate = ticket('Duplicate ticket: laptop bag request');
  if (duplicate.status === 'pending') {
    await dependencies.tickets.fire(duplicate.id, 'cancel', serviceDesk, {
      cancelReason: 'Duplicate of an earlier request.',
    });
  }

  // Keep the oldest unassigned ticket in view even on a rerun.
  if (vpn.status === 'pending' && !vpn.assigneeId) {
    const age = hoursAgo(30);
    if (new Date(vpn.statusChangedAt).getTime() > age.getTime()) {
      await dependencies.database
        .repository<TicketRecord>('tickets')
        .updateOne({
          filter: { id: vpn.id },
          values: {
            createdAt: age,
            updatedAt: age,
            statusChangedAt: age,
          },
        });
    }
  }
}
