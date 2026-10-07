import { defineSeed } from '@nocobase/db';

import type {
  ItTicketCategory,
  ItTicketCreate,
  ItTicketRow,
  ItTicketStatus,
} from '../../../server/it-tickets/ticket.js';

/**
 * Writes the three starter tickets, one in each state, so the list has
 * something to show the moment the application starts and so the difference
 * between an employee's view and a handler's is visible without typing.
 *
 * The rows go through the Repository rather than raw SQL so the values are
 * written in Collection terms and the driver encodes the dates itself. A row
 * that already exists is left alone, and every timestamp is fixed in the data
 * rather than taken from the clock, so two installations show the same history.
 *
 * The data stays in this file rather than in a shared module: a seed is loaded
 * on its own, by its own path, and the rows it writes are what an installation
 * already holds, so it must read the same however the rest of the source is
 * arranged. Only the vocabulary is imported, and only as a type, which the
 * compiler erases: a category or a status this file writes is one the
 * collection and the feature agree on.
 */

interface DemoAccount {
  readonly id: string;
  readonly name: string;
}

/** The two colleagues who report problems, and the one who works the queue. */
const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { id: 'demo-employee-1', name: 'Emma Reed' },
  { id: 'demo-employee-2', name: 'Ben Ortiz' },
  { id: 'demo-handler-1', name: 'Hank Ford' },
];

interface DemoTicket {
  readonly id: string;
  readonly title: string;
  readonly category: ItTicketCategory;
  readonly description: string;
  readonly status: ItTicketStatus;
  /** The account id of the colleague who reported it. */
  readonly submitterId: string;
  /** The account id that took it, or `null` while nobody has. */
  readonly handlerId: string | null;
  readonly resolutionNote: string | null;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly updatedAt: string;
}

/**
 * Employee one owns two of them and employee two owns one, which is what makes
 * the isolation visible when each signs in. The timestamps are fixed rather
 * than "now" so two installations show the same history; nothing depends on
 * them being recent.
 */
const DEMO_TICKETS: readonly DemoTicket[] = [
  {
    id: 'demo-ticket-1',
    title: 'Laptop will not power on',
    category: 'computer',
    description:
      'The charging light stays dark and the machine does nothing when the power button is held. It worked yesterday evening.',
    status: 'pending',
    submitterId: 'demo-employee-1',
    handlerId: null,
    resolutionNote: null,
    createdAt: '2026-09-28T08:15:00.000Z',
    startedAt: null,
    completedAt: null,
    updatedAt: '2026-09-28T08:15:00.000Z',
  },
  {
    id: 'demo-ticket-2',
    title: 'Cannot sign in to the intranet',
    category: 'account',
    description:
      'The intranet rejects the password that works everywhere else, and the reset mail never arrives.',
    status: 'processing',
    submitterId: 'demo-employee-2',
    handlerId: 'demo-handler-1',
    resolutionNote: null,
    createdAt: '2026-09-29T01:40:00.000Z',
    startedAt: '2026-09-29T02:30:00.000Z',
    completedAt: null,
    updatedAt: '2026-09-29T02:30:00.000Z',
  },
  {
    id: 'demo-ticket-3',
    title: 'Second monitor flickers',
    category: 'other',
    description:
      'The monitor on the left goes black for a second every few minutes, mostly while scrolling.',
    status: 'completed',
    submitterId: 'demo-employee-1',
    handlerId: 'demo-handler-1',
    resolutionNote:
      'Replaced the DisplayPort cable and re-seated the adapter. No flicker after thirty minutes of scrolling.',
    createdAt: '2026-09-25T07:05:00.000Z',
    startedAt: '2026-09-25T09:00:00.000Z',
    completedAt: '2026-09-26T07:05:00.000Z',
    updatedAt: '2026-09-26T07:05:00.000Z',
  },
];

const seed = defineSeed({
  name: '202609210003_it_tickets_sample_tickets',
  // `repository` is a method of the seed context, so it is called on the
  // context rather than destructured, which would detach it from its receiver.
  async run(context) {
    const nameById = new Map(
      DEMO_ACCOUNTS.map((account) => [account.id, account.name]),
    );
    const tickets = context.repository<ItTicketRow, ItTicketCreate>(
      'itTickets',
    );

    for (const ticket of DEMO_TICKETS) {
      const existing = await tickets.exists({ filter: { id: ticket.id } });
      if (existing) {
        continue;
      }
      const submitterName = nameById.get(ticket.submitterId);
      const handlerName =
        ticket.handlerId === null ? null : nameById.get(ticket.handlerId);
      if (!submitterName || (ticket.handlerId !== null && !handlerName)) {
        throw new Error(
          `Demo ticket ${ticket.id} names a colleague that does not exist.`,
        );
      }
      await tickets.createOne({
        values: {
          id: ticket.id,
          title: ticket.title,
          category: ticket.category,
          description: ticket.description,
          status: ticket.status,
          resolutionNote: ticket.resolutionNote,
          submitterId: ticket.submitterId,
          submitterName,
          handlerId: ticket.handlerId,
          handlerName: handlerName ?? null,
          startedAt:
            ticket.startedAt === null ? null : new Date(ticket.startedAt),
          completedAt:
            ticket.completedAt === null ? null : new Date(ticket.completedAt),
          createdAt: new Date(ticket.createdAt),
          updatedAt: new Date(ticket.updatedAt),
        },
      });
    }
  },
});

export default seed;
