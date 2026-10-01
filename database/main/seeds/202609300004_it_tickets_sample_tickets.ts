import { IT_DEMO_TICKETS } from '../../seed-data/it-tickets.ts';

import { defineSeed } from '@nocobase/db';

/**
 * Inserts the three fixed sample tickets, one per lifecycle stage, so the
 * list has something to show on a fresh installation. Submitter and handler
 * are resolved from the demo usernames, so a pre-existing account with that
 * username is used instead of the fixture id. Existing tickets are left as
 * they are.
 */
export default defineSeed({
  name: '202609300004_it_tickets_sample_tickets',
  transaction: true,
  async run({ query }) {
    const usernames = new Set<string>();
    for (const ticket of IT_DEMO_TICKETS) {
      usernames.add(ticket.ownerUsername);
      if (ticket.handlerUsername) {
        usernames.add(ticket.handlerUsername);
      }
    }
    const users = await query
      .selectFrom('user')
      .select(['id', 'username'])
      .where('username', 'in', [...usernames])
      .execute();
    const idByUsername = new Map<string, string>();
    for (const user of users) {
      idByUsername.set(String(user.username), String(user.id));
    }

    for (const ticket of IT_DEMO_TICKETS) {
      const existing = await query
        .selectFrom('itTickets')
        .select('id')
        .where('id', '=', ticket.id)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      const ownerId = idByUsername.get(ticket.ownerUsername);
      if (!ownerId) {
        continue;
      }
      const handlerId = ticket.handlerUsername
        ? (idByUsername.get(ticket.handlerUsername) ?? null)
        : null;
      await query
        .insertInto('itTickets')
        .values({
          id: ticket.id,
          title: ticket.title,
          category: ticket.category,
          description: ticket.description,
          status: ticket.status,
          ownerId,
          handlerId,
          resolution: ticket.resolution,
          startedAt: ticket.startedAt ? new Date(ticket.startedAt) : null,
          completedAt: ticket.completedAt ? new Date(ticket.completedAt) : null,
          createdAt: new Date(ticket.createdAt),
          updatedAt: new Date(ticket.updatedAt),
        })
        .execute();
    }
  },
});
