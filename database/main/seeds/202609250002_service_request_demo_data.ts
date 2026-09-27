import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * Deterministic demo data for the simplified service-request flow:
 * one assignee account, and two requests (one normal, one urgent).
 *
 * The seed is idempotent by stable business identifiers — the username and the
 * request titles — so re-running it never duplicates rows and never overwrites
 * data a user has since edited. It never uses a timestamp or random value as an
 * identifier. `createdAt` is the only non-deterministic value, and it only
 * affects a row the seed is inserting for the first time.
 */

const ASSIGNEE_USER_ID = 'service-request-assignee';
const ASSIGNEE_ACCOUNT_ID = 'service-request-assignee-account';
const ASSIGNEE = {
  username: 'assignee',
  email: 'assignee@nocobase.com',
  name: 'Service Assignee',
  password: 'assignee123',
} as const;

const DEMO_REQUESTS: readonly {
  readonly title: string;
  readonly urgent: boolean;
}[] = [
  { title: 'Third-floor printer is offline', urgent: false },
  { title: 'Customer cannot sign in to the portal', urgent: true },
];

interface ServiceRequestRecord {
  id: number;
  title: string;
  urgent: boolean;
  assigneeId: string;
  status: string;
  result: string | null;
  acceptedAt: Date | null;
  createdAt: Date;
}

export default defineSeed({
  name: '202609250002_service_request_demo_data',
  async run(context) {
    const { query } = context;
    const now = new Date();

    // Better Auth owns the user/account tables, so they are written through the
    // row-level query adapter the authentication seed also uses, rather than a
    // Collection repository.
    const existingUser = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', ASSIGNEE.username)
      .executeTakeFirst();
    if (!existingUser) {
      const passwordHash = await hashPassword(ASSIGNEE.password);
      await query
        .insertInto('user')
        .values({
          id: ASSIGNEE_USER_ID,
          name: ASSIGNEE.name,
          username: ASSIGNEE.username,
          email: ASSIGNEE.email,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await query
        .insertInto('account')
        .values({
          id: ASSIGNEE_ACCOUNT_ID,
          accountId: ASSIGNEE_USER_ID,
          providerId: 'credential',
          userId: ASSIGNEE_USER_ID,
          password: passwordHash,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const requests =
      context.repository<ServiceRequestRecord>('serviceRequests');
    for (const request of DEMO_REQUESTS) {
      const existing = await requests.findOne({
        filter: { title: request.title },
      });
      if (existing) continue;
      await requests.createOne({
        values: {
          title: request.title,
          urgent: request.urgent,
          assigneeId: ASSIGNEE_USER_ID,
          status: 'pending',
          result: null,
          acceptedAt: null,
          createdAt: now,
        },
      });
    }
  },
});
