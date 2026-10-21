import type { Application } from '@nocobase/app-server/application';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import { databaseManagerToken } from '@nocobase/db';

/**
 * Demo accounts and tickets for a new installation started with APP_SAMPLE_DATA=true.
 *
 * Every demo account uses the same password so the requester, engineer and service-desk views can be inspected
 * without changing configuration. The tickets deliberately cover an unassigned request, an overdue assignment, a
 * resolution waiting for the requester and a closed ticket.
 */
const SAMPLE_PASSWORD = 'Demo123!';

type AccountKey =
  'requester' | 'requester2' | 'engineer' | 'engineer2' | 'desk';

const accounts: readonly {
  readonly key: AccountKey;
  readonly email: string;
  readonly name: string;
  readonly permissionSetKey: string;
  readonly username: string;
}[] = [
  {
    key: 'requester',
    email: 'demo.requester@example.com',
    name: 'Emma Employee',
    permissionSetKey: 'tickets-requester',
    username: 'demo.requester',
  },
  {
    key: 'requester2',
    email: 'demo.requester2@example.com',
    name: 'Liam Employee',
    permissionSetKey: 'tickets-requester',
    username: 'demo.requester2',
  },
  {
    key: 'engineer',
    email: 'demo.engineer@example.com',
    name: 'Grace Engineer',
    permissionSetKey: 'tickets-maintainer',
    username: 'demo.engineer',
  },
  {
    key: 'engineer2',
    email: 'demo.engineer2@example.com',
    name: 'Henry Engineer',
    permissionSetKey: 'tickets-maintainer',
    username: 'demo.engineer2',
  },
  {
    key: 'desk',
    email: 'demo.desk@example.com',
    name: 'Dana Service Desk',
    permissionSetKey: 'tickets-admin',
    username: 'demo.desk',
  },
] as const;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

type SampleTicket = {
  readonly id: string;
  readonly ticketNo: string;
  readonly title: string;
  readonly description: string;
  readonly status: 'open' | 'in_progress' | 'resolved' | 'closed';
  readonly priority: 'low' | 'medium' | 'high' | 'urgent';
  readonly category: 'incident' | 'access' | 'hardware' | 'software' | 'other';
  readonly requesterKey: 'requester' | 'requester2';
  readonly assigneeKey?: 'engineer' | 'engineer2';
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly resolvedAt?: Date;
  readonly closedAt?: Date;
};

type SampleComment = {
  readonly id: string;
  readonly ticketId: string;
  readonly authorKey: AccountKey;
  readonly body: string;
  readonly internal: boolean;
  readonly createdAt: Date;
};

export async function buildTicketSampleData(app: Application): Promise<void> {
  const database = app.container.resolve(databaseManagerToken);
  const administration = app.container.resolve(userAdministrationServiceToken);
  const connection = database.connection('main');
  const now = Date.now();

  const userIds = new Map<AccountKey, string>();
  for (const account of accounts) {
    const existing = await connection.query
      .selectFrom('user')
      .select(['id'])
      .where('email', '=', account.email)
      .executeTakeFirst();
    const user = existing
      ? { id: String(existing.id) }
      : await administration.create({
          email: account.email,
          name: account.name,
          password: SAMPLE_PASSWORD,
          username: account.username,
        });
    userIds.set(account.key, user.id);

    const assignmentId = `user:${user.id}:${account.permissionSetKey}`;
    const assignment = await connection.query
      .selectFrom('authorizationPermissionSetAssignments')
      .select(['id'])
      .where('id', '=', assignmentId)
      .executeTakeFirst();
    if (!assignment) {
      const timestamp = new Date(now);
      await connection.query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: assignmentId,
          subjectType: 'user',
          subjectId: user.id,
          permissionSetKey: account.permissionSetKey,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .execute();
    }
  }

  const user = (key: AccountKey): string => {
    const id = userIds.get(key);
    if (!id) throw new Error(`Sample user ${key} was not created.`);
    return id;
  };

  const tickets: readonly SampleTicket[] = [
    {
      id: '11111111-1111-4111-8111-111111111101',
      ticketNo: 'DEMO-1001',
      title: 'VPN disconnects every few minutes',
      description:
        'The VPN drops while I am working from home. Reconnecting works, but it happens several times an hour.',
      status: 'open',
      priority: 'urgent',
      category: 'access',
      requesterKey: 'requester',
      createdAt: new Date(now - 3 * HOUR),
      updatedAt: new Date(now - 3 * HOUR),
    },
    {
      id: '11111111-1111-4111-8111-111111111102',
      ticketNo: 'DEMO-1002',
      title: 'Laptop battery drains within an hour',
      description:
        'The laptop used to last most of the day. Now the battery warning appears before lunch.',
      status: 'in_progress',
      priority: 'high',
      category: 'hardware',
      requesterKey: 'requester2',
      assigneeKey: 'engineer',
      createdAt: new Date(now - 30 * HOUR),
      updatedAt: new Date(now - 2 * HOUR),
    },
    {
      id: '11111111-1111-4111-8111-111111111103',
      ticketNo: 'DEMO-1003',
      title: 'Cannot open the shared finance folder',
      description:
        'The shared finance folder asks for credentials and then refuses access.',
      status: 'resolved',
      priority: 'medium',
      category: 'access',
      requesterKey: 'requester',
      assigneeKey: 'engineer',
      createdAt: new Date(now - 2 * DAY),
      updatedAt: new Date(now - 1 * HOUR),
      resolvedAt: new Date(now - 1 * HOUR),
    },
    {
      id: '11111111-1111-4111-8111-111111111104',
      ticketNo: 'DEMO-1004',
      title: 'Office printer stays offline',
      description:
        'The printer on the second floor shows offline even after it is restarted.',
      status: 'closed',
      priority: 'low',
      category: 'hardware',
      requesterKey: 'requester2',
      assigneeKey: 'engineer2',
      createdAt: new Date(now - 5 * DAY),
      updatedAt: new Date(now - 3 * DAY),
      resolvedAt: new Date(now - 4 * DAY),
      closedAt: new Date(now - 3 * DAY),
    },
    {
      id: '11111111-1111-4111-8111-111111111105',
      ticketNo: 'DEMO-1005',
      title: 'Request access to the design repository',
      description:
        'I need read access to the design repository for the new onboarding project.',
      status: 'open',
      priority: 'medium',
      category: 'access',
      requesterKey: 'requester2',
      createdAt: new Date(now - 26 * HOUR),
      updatedAt: new Date(now - 26 * HOUR),
    },
    {
      id: '11111111-1111-4111-8111-111111111106',
      ticketNo: 'DEMO-1006',
      title: 'Email delivery delayed for the sales team',
      description:
        'Messages to the sales distribution list arrive 20 to 40 minutes late.',
      status: 'in_progress',
      priority: 'high',
      category: 'software',
      requesterKey: 'requester',
      assigneeKey: 'engineer2',
      createdAt: new Date(now - 5 * HOUR),
      updatedAt: new Date(now - 30 * 60 * 1000),
    },
  ];

  for (const ticket of tickets) {
    const existing = await database.repository('tickets').findOne({
      filter: { ticketNo: ticket.ticketNo },
    });
    if (existing) continue;
    await database.repository('tickets').createOne({
      values: {
        id: ticket.id,
        ticketNo: ticket.ticketNo,
        title: ticket.title,
        description: ticket.description,
        status: ticket.status,
        priority: ticket.priority,
        category: ticket.category,
        requesterId: user(ticket.requesterKey),
        assigneeId: ticket.assigneeKey ? user(ticket.assigneeKey) : null,
        resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
        closedAt: ticket.closedAt?.toISOString() ?? null,
        createdAt: ticket.createdAt.toISOString(),
        updatedAt: ticket.updatedAt.toISOString(),
      },
    });
  }

  const comments: readonly SampleComment[] = [
    {
      id: '22222222-2222-4222-8222-222222222201',
      ticketId: '11111111-1111-4111-8111-111111111102',
      authorKey: 'engineer',
      internal: true,
      body: 'Battery health is down to 61%. The adapter and charging port both test normally.',
      createdAt: new Date(now - 3 * HOUR),
    },
    {
      id: '22222222-2222-4222-8222-222222222202',
      ticketId: '11111111-1111-4111-8111-111111111102',
      authorKey: 'engineer',
      internal: false,
      body: 'A replacement battery has been ordered. I will install it as soon as it arrives and then test a full charge cycle.',
      createdAt: new Date(now - 2 * HOUR),
    },
    {
      id: '22222222-2222-4222-8222-222222222203',
      ticketId: '11111111-1111-4111-8111-111111111103',
      authorKey: 'engineer',
      internal: false,
      body: 'Your finance group membership was missing. Access has been restored; please reopen the ticket if the folder is still unavailable.',
      createdAt: new Date(now - 1 * HOUR),
    },
    {
      id: '22222222-2222-4222-8222-222222222204',
      ticketId: '11111111-1111-4111-8111-111111111104',
      authorKey: 'engineer2',
      internal: false,
      body: 'The printer network cable was replaced and the device is online again.',
      createdAt: new Date(now - 4 * DAY),
    },
    {
      id: '22222222-2222-4222-8222-222222222205',
      ticketId: '11111111-1111-4111-8111-111111111106',
      authorKey: 'engineer2',
      internal: false,
      body: 'The mail queue is being drained and delivery times are returning to normal. I am monitoring the next few batches.',
      createdAt: new Date(now - 30 * 60 * 1000),
    },
  ];

  for (const comment of comments) {
    const existing = await database.repository('ticketComments').findOne({
      filter: { id: comment.id },
    });
    if (existing) continue;
    await database.repository('ticketComments').createOne({
      values: {
        id: comment.id,
        ticketId: comment.ticketId,
        authorId: user(comment.authorKey),
        body: comment.body,
        internal: comment.internal,
        createdAt: comment.createdAt.toISOString(),
        updatedAt: comment.createdAt.toISOString(),
      },
    });
  }
}
