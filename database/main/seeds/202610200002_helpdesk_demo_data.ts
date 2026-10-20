import { hashPassword } from 'better-auth/crypto';
import { defineSeed } from '@nocobase/db';

/**
 * Demo accounts and tickets used by the factory's fresh test installation and
 * by a development install. The seed is marked `sample`, so it runs only when
 * `app.sampleData` is enabled, and the production guard keeps an accidental
 * `APP_SAMPLE_DATA=true` from creating known-password accounts in production.
 *
 * Accounts and rows use stable ids, so re-running the seed cannot duplicate the
 * demo. The ticket titles match `server/tickets/sample-data.ts`; a direct
 * development start therefore enriches these rows through the lifecycle
 * instead of creating a second copy.
 */
export const HELPDESK_DEMO_PASSWORD = 'Helpdesk!2026';

const USERS = [
  {
    key: 'alice',
    id: 'demo-user-alice',
    name: 'Alice Chen',
    username: 'alice.chen',
    email: 'alice.chen@example.com',
    roles: ['employee'],
  },
  {
    key: 'evan',
    id: 'demo-user-evan',
    name: 'Evan Park',
    username: 'evan.park',
    email: 'evan.park@example.com',
    roles: ['employee'],
  },
  {
    key: 'bob',
    id: 'demo-user-bob',
    name: 'Bob Liu',
    username: 'bob.liu',
    email: 'bob.liu@example.com',
    roles: ['employee', 'support-engineer'],
  },
  {
    key: 'carol',
    id: 'demo-user-carol',
    name: 'Carol Wang',
    username: 'carol.wang',
    email: 'carol.wang@example.com',
    roles: ['employee', 'support-engineer'],
  },
  {
    key: 'dana',
    id: 'demo-user-dana',
    name: 'Dana Zhao',
    username: 'dana.zhao',
    email: 'dana.zhao@example.com',
    roles: ['employee', 'service-desk'],
  },
] as const;

const hoursAgo = (hours: number): Date =>
  new Date(Date.now() - hours * 60 * 60 * 1000);

interface DemoTicket {
  readonly id: string;
  readonly ticketNo: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly priority: string;
  readonly status: string;
  readonly requester: (typeof USERS)[number]['key'];
  readonly assignee?: (typeof USERS)[number]['key'];
  readonly ageHours: number;
  readonly changedHours: number;
  readonly resolution?: string;
  readonly closeNote?: string;
  readonly cancelReason?: string;
  readonly resolvedHours?: number;
  readonly closedHours?: number;
}

const TICKETS: readonly DemoTicket[] = [
  {
    id: 'demo-ticket-vpn',
    ticketNo: 'TK-20261020-DEMO01',
    title: 'VPN disconnects every few minutes',
    description:
      'While working from home the VPN drops every few minutes. Reconnecting works for a while, then it drops again.',
    category: 'network',
    priority: 'high',
    status: 'pending',
    requester: 'alice',
    ageHours: 30,
    changedHours: 30,
  },
  {
    id: 'demo-ticket-finance',
    ticketNo: 'TK-20261020-DEMO02',
    title: 'Finance application asks for a license key',
    description:
      'The finance reporting application opens a license dialog after the latest update. The rest of the team can still use it.',
    category: 'software',
    priority: 'high',
    status: 'processing',
    requester: 'evan',
    assignee: 'bob',
    ageHours: 2,
    changedHours: 1,
  },
  {
    id: 'demo-ticket-printer',
    ticketNo: 'TK-20261020-DEMO03',
    title: 'Third-floor printer stays offline',
    description:
      'The printer next to the meeting rooms shows offline even after restarting it. Printing from the second floor works.',
    category: 'hardware',
    priority: 'normal',
    status: 'processing',
    requester: 'alice',
    assignee: 'carol',
    ageHours: 4,
    changedHours: 3,
  },
  {
    id: 'demo-ticket-shared-drive',
    ticketNo: 'TK-20261020-DEMO04',
    title: 'Shared drive access lost after password reset',
    description:
      'I changed my password yesterday and now the shared finance drive returns access denied. I need it for the monthly close.',
    category: 'account',
    priority: 'urgent',
    status: 'escalated',
    requester: 'evan',
    assignee: 'bob',
    ageHours: 28,
    changedHours: 26,
  },
  {
    id: 'demo-ticket-monitor',
    ticketNo: 'TK-20261020-DEMO05',
    title: 'Monitor flickers when docked',
    description:
      'The external monitor flickers whenever the laptop is connected to the desk dock. A different cable did not help.',
    category: 'hardware',
    priority: 'low',
    status: 'resolved',
    requester: 'alice',
    assignee: 'bob',
    ageHours: 8,
    changedHours: 1,
    resolution:
      'Replaced the dock firmware and the flicker stopped. Please confirm after a day of use.',
    resolvedHours: 1,
  },
  {
    id: 'demo-ticket-headset',
    ticketNo: 'TK-20261020-DEMO06',
    title: 'Request a replacement headset',
    description:
      'The microphone on my headset cuts out during calls. Please replace it with the same model if possible.',
    category: 'hardware',
    priority: 'normal',
    status: 'pending',
    requester: 'evan',
    ageHours: 1,
    changedHours: 1,
  },
  {
    id: 'demo-ticket-signature',
    ticketNo: 'TK-20261020-DEMO07',
    title: 'Email signature template is missing',
    description:
      'The company signature template disappeared from my mail client after the update. I need the standard template back.',
    category: 'software',
    priority: 'low',
    status: 'closed',
    requester: 'alice',
    assignee: 'carol',
    ageHours: 48,
    changedHours: 23,
    resolution:
      'Restored the standard signature template from the company profile.',
    closeNote: 'Closed after the requester confirmed the fix.',
    resolvedHours: 24,
    closedHours: 23,
  },
  {
    id: 'demo-ticket-duplicate',
    ticketNo: 'TK-20261020-DEMO08',
    title: 'Duplicate ticket: laptop bag request',
    description:
      'This duplicates an earlier request for a laptop bag. Please close it.',
    category: 'other',
    priority: 'low',
    status: 'cancelled',
    requester: 'evan',
    ageHours: 6,
    changedHours: 5,
    cancelReason: 'Duplicate of an earlier request.',
  },
];

const COMMENTS = [
  {
    id: 'demo-comment-finance',
    ticketId: 'demo-ticket-finance',
    author: 'bob',
    body: 'I am checking the license server assignment and will update this ticket shortly.',
    ageHours: 1,
  },
  {
    id: 'demo-comment-monitor',
    ticketId: 'demo-ticket-monitor',
    author: 'bob',
    body: 'The replacement dock is at reception if the issue returns.',
    ageHours: 1,
  },
] as const;

export default defineSeed({
  name: '202610200002_helpdesk_demo_data',
  sample: true,
  transaction: false,
  async run(seed) {
    if (process.env.NODE_ENV === 'production') return;

    const users = seed.repository('user');
    const accounts = seed.repository('account');
    const assignments = seed.repository('authorizationPermissionSetAssignments');
    const tickets = seed.repository('tickets');
    const comments = seed.repository('ticketComments');
    const now = new Date();
    const ids = new Map<string, string>();

    for (const user of USERS) {
      const existing = await users.findOne({ filter: { email: user.email } });
      const userId =
        existing && typeof existing.id === 'string' ? existing.id : user.id;
      ids.set(user.key, userId);
      if (!existing) {
        await users.createOne({
          values: {
            id: userId,
            name: user.name,
            username: user.username,
            email: user.email,
            emailVerified: false,
            kind: 'person',
            createdAt: now,
            updatedAt: now,
          } as never,
        });
      }

      const account = await accounts.findOne({
        filter: { userId, providerId: 'credential' },
      });
      if (!account) {
        await accounts.createOne({
          values: {
            id: `demo-account-${user.key}`,
            accountId: userId,
            providerId: 'credential',
            userId,
            password: await hashPassword(HELPDESK_DEMO_PASSWORD),
            createdAt: now,
            updatedAt: now,
          } as never,
        });
      }

      for (const role of user.roles) {
        const assignmentId = `demo-assignment-${user.key}-${role}`;
        const assignment = await assignments.findOne({
          filter: { id: assignmentId },
        });
        if (!assignment) {
          await assignments.createOne({
            values: {
              id: assignmentId,
              subjectType: 'user',
              subjectId: userId,
              permissionSetKey: role,
              createdAt: now,
              updatedAt: now,
            } as never,
          });
        }
      }
    }

    const id = (key: (typeof USERS)[number]['key']): string => {
      const value = ids.get(key);
      if (!value) throw new Error(`Missing demo user: ${key}`);
      return value;
    };

    for (const ticket of TICKETS) {
      const existing = await tickets.findOne({ filter: { id: ticket.id } });
      if (existing) continue;
      const createdAt = hoursAgo(ticket.ageHours);
      const statusChangedAt = hoursAgo(ticket.changedHours);
      await tickets.createOne({
        values: {
          id: ticket.id,
          ticketNo: ticket.ticketNo,
          title: ticket.title,
          description: ticket.description,
          category: ticket.category,
          priority: ticket.priority,
          status: ticket.status,
          requesterId: id(ticket.requester),
          assigneeId: ticket.assignee ? id(ticket.assignee) : null,
          resolution: ticket.resolution ?? null,
          closeNote: ticket.closeNote ?? null,
          cancelReason: ticket.cancelReason ?? null,
          statusChangedAt,
          lifecycleVersion: 1,
          resolvedAt:
            ticket.resolvedHours === undefined
              ? null
              : hoursAgo(ticket.resolvedHours),
          closedAt:
            ticket.closedHours === undefined
              ? null
              : hoursAgo(ticket.closedHours),
          createdAt,
          updatedAt: statusChangedAt,
        } as never,
      });
    }

    for (const comment of COMMENTS) {
      const existing = await comments.findOne({ filter: { id: comment.id } });
      if (existing) continue;
      await comments.createOne({
        values: {
          id: comment.id,
          ticketId: comment.ticketId,
          authorId: id(comment.author),
          body: comment.body,
          createdAt: hoursAgo(comment.ageHours),
        } as never,
      });
    }
  },
});
