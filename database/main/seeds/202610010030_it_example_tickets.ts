import { defineSeed } from '@nocobase/db';

/**
 * Three example tickets that exercise all three statuses: one waiting, one in
 * progress, one finished with a resolution.
 *
 * `zhangwei` owns two of them, `liuyang` one, and `chenhao` handles the two
 * that have moved past submission — enough to see the employee scope and the
 * handler scope differ. Each row is inserted only when its id is absent, so a
 * re-run changes nothing.
 */
interface ExampleTicket {
  readonly id: number;
  readonly title: string;
  readonly category: string;
  readonly description: string;
  readonly status: string;
  readonly submitter: string;
  readonly handler?: string;
  readonly resolution?: string;
  readonly createdDaysAgo: number;
  readonly startedDaysAgo?: number;
  readonly completedDaysAgo?: number;
}

const TICKETS: readonly ExampleTicket[] = [
  {
    id: 1,
    title: 'Laptop will not power on',
    category: 'computer',
    description:
      'The power light blinks but the screen stays black after the battery drained completely.',
    status: 'pending',
    submitter: 'zhangwei',
    createdDaysAgo: 3,
  },
  {
    id: 2,
    title: 'Cannot sign in to the finance portal',
    category: 'account',
    description:
      'The password reset email never arrives and the account now looks locked.',
    status: 'processing',
    submitter: 'liuyang',
    handler: 'chenhao',
    createdDaysAgo: 2,
    startedDaysAgo: 1,
  },
  {
    id: 3,
    title: 'Headset microphone is not detected',
    category: 'other',
    description:
      'Video calls cannot hear me since the last system update, though playback works.',
    status: 'completed',
    submitter: 'zhangwei',
    handler: 'chenhao',
    resolution:
      'Replaced the USB headset cable, reinstalled the audio driver and confirmed the microphone in a test call.',
    createdDaysAgo: 5,
    startedDaysAgo: 4,
    completedDaysAgo: 3,
  },
];

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export default defineSeed({
  name: '202610010030_it_example_tickets',
  transaction: true,
  async run({ query }) {
    const users = await query
      .selectFrom('user')
      .select(['id', 'username'])
      .execute();
    const userIds = new Map<string, string>(
      users.map((user) => [String(user.username), String(user.id)]),
    );

    for (const ticket of TICKETS) {
      const submitterId = userIds.get(ticket.submitter);
      if (!submitterId) continue;

      const existing = await query
        .selectFrom('itTickets')
        .select('id')
        .where('id', '=', ticket.id)
        .executeTakeFirst();
      if (existing) continue;

      const createdAt = daysAgo(ticket.createdDaysAgo);
      const startedAt =
        ticket.startedDaysAgo === undefined
          ? null
          : daysAgo(ticket.startedDaysAgo);
      const completedAt =
        ticket.completedDaysAgo === undefined
          ? null
          : daysAgo(ticket.completedDaysAgo);

      await query
        .insertInto('itTickets')
        .values({
          id: ticket.id,
          title: ticket.title,
          category: ticket.category,
          description: ticket.description,
          status: ticket.status,
          resolution: ticket.resolution ?? null,
          submitterId,
          handlerId: ticket.handler
            ? (userIds.get(ticket.handler) ?? null)
            : null,
          createdAt,
          updatedAt: completedAt ?? startedAt ?? createdAt,
          startedAt,
          completedAt,
        })
        .execute();
    }
  },
});
