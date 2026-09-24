import { defineSeed } from '@nocobase/db';

/**
 * Three example tickets, one per state.
 *
 * They exist so the flow can be seen without first typing one in: the employee
 * has a submitted ticket and a completed one, and the handler has a ticket
 * waiting to be started and one already in progress. The records reference the
 * accounts this feature seeds and nothing else.
 */

interface SeedTicket {
  readonly title: string;
  readonly category: string;
  readonly description: string;
  readonly submitter: string;
  readonly handler: string | null;
  readonly status: string;
  readonly handlingNote: string | null;
  /** How long before now the ticket was created, so the order is stable. */
  readonly ageMinutes: number;
}

const TICKETS: readonly SeedTicket[] = [
  {
    title: 'The laptop in meeting room B will not power on',
    category: 'computer',
    description:
      'Pressing the power button does nothing, and the charger light stays off.',
    submitter: 'employee1',
    handler: null,
    status: 'pending',
    handlingNote: null,
    ageMinutes: 30,
  },
  {
    title: 'I cannot sign in to my email account',
    category: 'account',
    description:
      'The password is rejected even after I copy it from the password manager.',
    submitter: 'employee2',
    handler: 'handler1',
    status: 'processing',
    handlingNote: 'Verifying the account state before resetting the password.',
    ageMinutes: 180,
  },
  {
    title: 'The printer on the second floor is offline',
    category: 'other',
    description: 'Print jobs stay in the queue and the panel shows offline.',
    submitter: 'employee1',
    handler: 'handler1',
    status: 'completed',
    handlingNote:
      'Replaced the network cable and confirmed the printer responds.',
    ageMinutes: 2880,
  },
];

export default defineSeed({
  name: '202609010004_tickets_seed_records',
  async run({ query }) {
    const existing = await query
      .selectFrom('tickets')
      .select('id')
      .limit(1)
      .executeTakeFirst();
    if (existing) {
      return;
    }

    const users = await query
      .selectFrom('user')
      .select(['id', 'username'])
      .execute();
    const idByUsername = new Map(
      users.map((user) => [String(user.username), String(user.id)]),
    );

    const now = Date.now();
    for (const ticket of TICKETS) {
      const submitterId = idByUsername.get(ticket.submitter);
      if (!submitterId) {
        continue;
      }
      const handlerId = ticket.handler
        ? (idByUsername.get(ticket.handler) ?? null)
        : null;
      const createdAt = new Date(now - ticket.ageMinutes * 60_000);
      await query
        .insertInto('tickets')
        .values({
          title: ticket.title,
          category: ticket.category,
          description: ticket.description,
          submitterId,
          handlerId,
          status: ticket.status,
          handlingNote: ticket.handlingNote,
          createdAt,
          updatedAt: createdAt,
        })
        .execute();
    }
  },
});
