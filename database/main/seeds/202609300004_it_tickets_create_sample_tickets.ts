import { defineSeed, type SeedDefinition } from '@nocobase/db';

// Inline, not imported: a seed file is loaded directly at runtime, so a
// relative import into `server/` would need `.js`-to-`.ts` resolution that only
// exists under the test transform. The seed test cross-checks these values
// against the server's constants.
const SAMPLE_HANDLER_USERNAME = 'it-handler';
const [EMPLOYEE_ONE, EMPLOYEE_TWO] = ['it-employee-1', 'it-employee-2'];

interface SampleTicket {
  readonly title: string;
  readonly category: string;
  readonly description: string;
  readonly submitterUsername: string;
  readonly handlerUsername: string | null;
  readonly status: string;
  readonly resolutionNote: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Timestamps are fixed so the sample data is reproducible on every install. */
const SAMPLE_TICKETS: readonly SampleTicket[] = [
  {
    title: 'Unable to connect to the office VPN',
    category: 'computer',
    description: 'The VPN client fails with error 809 from the home office.',
    submitterUsername: EMPLOYEE_ONE,
    handlerUsername: null,
    status: 'pending',
    resolutionNote: null,
    createdAt: '2026-09-15T02:00:00.000Z',
    updatedAt: '2026-09-15T02:00:00.000Z',
  },
  {
    title: 'Password reset for the finance system',
    category: 'account',
    description: 'Locked out after too many failed sign-in attempts.',
    submitterUsername: EMPLOYEE_TWO,
    handlerUsername: SAMPLE_HANDLER_USERNAME,
    status: 'in-progress',
    resolutionNote: null,
    createdAt: '2026-09-16T03:30:00.000Z',
    updatedAt: '2026-09-17T01:00:00.000Z',
  },
  {
    title: 'Printer on the 3rd floor is out of toner',
    category: 'other',
    description: 'Replacement toner is kept in the storage room.',
    submitterUsername: EMPLOYEE_ONE,
    handlerUsername: SAMPLE_HANDLER_USERNAME,
    status: 'completed',
    resolutionNote: 'Replaced the toner cartridge and printed a test page.',
    createdAt: '2026-09-10T06:00:00.000Z',
    updatedAt: '2026-09-10T08:00:00.000Z',
  },
];

/**
 * Three tickets covering each status in the flow: one waiting, one being
 * processed, and one finished with a resolution. Each is inserted only when no
 * ticket with the same title exists, so re-running the seed neither duplicates
 * nor overwrites a ticket somebody edited.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609300004_it_tickets_create_sample_tickets',
  async run({ query }) {
    const userId = async (username: string): Promise<string | undefined> => {
      const user = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', username.toLowerCase())
        .executeTakeFirst();
      return user ? String(user.id) : undefined;
    };

    const handlerId = await userId(SAMPLE_HANDLER_USERNAME);

    for (const ticket of SAMPLE_TICKETS) {
      const existing = await query
        .selectFrom('itTickets')
        .select('id')
        .where('title', '=', ticket.title)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      const submitterId = await userId(ticket.submitterUsername);
      if (!submitterId) {
        continue;
      }
      const resolvedHandlerId =
        ticket.handlerUsername === null
          ? null
          : ((await userId(ticket.handlerUsername)) ?? handlerId ?? null);
      await query
        .insertInto('itTickets')
        .values({
          title: ticket.title,
          category: ticket.category,
          description: ticket.description,
          submitterId,
          handlerId: resolvedHandlerId,
          status: ticket.status,
          resolutionNote: ticket.resolutionNote,
          createdAt: new Date(ticket.createdAt),
          updatedAt: new Date(ticket.updatedAt),
        })
        .execute();
    }
  },
});

export default seed;
