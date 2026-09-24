import { defineSeed, type SeedDefinition } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * Installation data for the service-request acceptance flow.
 *
 * The authentication plugin already seeds exactly one administrator when the
 * `user` table is empty. This seed adds the second and final test account the
 * scenario needs — the assignee — and two example requests, one per branch of
 * the acceptance workflow. Every write is keyed on a stable business identity
 * and skipped when it already exists, so re-running the seed never overwrites
 * data a user has changed (for example, an accepted request).
 */
const AGENT_USERNAME = 'agent';
const AGENT_EMAIL = 'agent@example.com';
const AGENT_PASSWORD = 'agent123';

interface SeedRequest {
  readonly reference: string;
  readonly title: string;
  readonly urgent: boolean;
}

const REQUESTS: readonly SeedRequest[] = [
  {
    reference: 'REQ-2026-0001',
    title: 'Third-floor printer is offline',
    urgent: false,
  },
  {
    reference: 'REQ-2026-0002',
    title: 'Production database alert needs immediate triage',
    urgent: true,
  },
];

const seed: SeedDefinition = defineSeed({
  name: '202609240002_seed_service_request_data',
  run: async (context) => {
    const { query } = context;
    const now = new Date();

    const existingAgent = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', AGENT_USERNAME)
      .executeTakeFirst();

    let agentId = existingAgent ? String(existingAgent.id) : undefined;

    if (!agentId) {
      agentId = crypto.randomUUID();
      const passwordHash = await hashPassword(AGENT_PASSWORD);
      await query
        .insertInto('user')
        .values({
          id: agentId,
          name: 'Service Agent',
          username: AGENT_USERNAME,
          email: AGENT_EMAIL,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await query
        .insertInto('account')
        .values({
          id: crypto.randomUUID(),
          accountId: agentId,
          providerId: 'credential',
          userId: agentId,
          password: passwordHash,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const requests = context.repository('serviceRequests');
    for (const request of REQUESTS) {
      const existing = await requests.findOne({
        filter: { reference: request.reference },
      });
      if (existing) {
        continue;
      }
      await requests.createOne({
        values: {
          reference: request.reference,
          title: request.title,
          urgent: request.urgent,
          assigneeId: agentId,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  },
});

export default seed;
