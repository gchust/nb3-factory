import { defineSeed } from '@nocobase/db';
import { demoTickets } from '../../seed-data/it-tickets-demo.ts';

/**
 * Creates three demonstration requests, one per state.
 *
 * This is sample data, kept apart from the permission-set seed. A request is
 * matched on its title and submitter, so re-running the seed neither
 * duplicates it nor overwrites a status a person has since advanced.
 */
const seed = defineSeed({
  name: '202609240005_it_tickets_demo_tickets',
  transaction: true,
  async run({ query }) {
    for (const ticket of demoTickets) {
      const submitter = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', ticket.submitter.toLowerCase())
        .executeTakeFirst();
      if (!submitter) {
        continue;
      }
      const submitterId = String(submitter.id);
      const existing = await query
        .selectFrom('itTickets')
        .select('id')
        .where('title', '=', ticket.title)
        .where('submitterId', '=', submitterId)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      let assigneeId: string | null = null;
      if (ticket.assignee) {
        const assignee = await query
          .selectFrom('user')
          .select('id')
          .where('username', '=', ticket.assignee.toLowerCase())
          .executeTakeFirst();
        if (!assignee) {
          continue;
        }
        assigneeId = String(assignee.id);
      }
      await query
        .insertInto('itTickets')
        .values({
          title: ticket.title,
          category: ticket.category,
          description: ticket.description,
          status: ticket.status,
          submitterId,
          assigneeId,
          resolution: ticket.resolution ?? null,
          startedAt: ticket.startedAt ? new Date(ticket.startedAt) : null,
          completedAt: ticket.completedAt ? new Date(ticket.completedAt) : null,
          createdAt: new Date(ticket.createdAt),
          updatedAt: new Date(ticket.updatedAt),
        })
        .execute();
    }
  },
});

export default seed;
