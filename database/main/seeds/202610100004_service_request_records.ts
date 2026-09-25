import { defineSeed } from '@nocobase/db';
import {
  SERVICE_REQUEST_RECORDS,
  SERVICE_REQUEST_TEST_USERS,
} from '../../seed-data/service-request-fixtures.ts';

/**
 * The two requests the flow starts from: one urgent, one normal, both assigned
 * to the test assignee. Idempotent by title, which is the fixture's business
 * key. Seeds never create structure; the table comes from the migration.
 */
const seed = defineSeed({
  name: '202610100004_service_request_records',
  transaction: true,
  async run({ query }) {
    const assignee = SERVICE_REQUEST_TEST_USERS[1];
    const assigneeRow = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', assignee.username)
      .limit(1)
      .executeTakeFirst();
    // The users seed sorts before this one; without its account there is nobody
    // to assign to, and a dangling foreign key would fail the whole run.
    if (!assigneeRow) return;

    const assigneeId = String(assigneeRow.id);
    const now = new Date();

    for (const record of SERVICE_REQUEST_RECORDS) {
      const existing = await query
        .selectFrom('serviceRequests')
        .select('id')
        .where('title', '=', record.title)
        .executeTakeFirst();
      if (existing) continue;

      await query
        .insertInto('serviceRequests')
        .values({
          title: record.title,
          urgent: record.urgent,
          assigneeId,
          status: 'pending',
          result: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
