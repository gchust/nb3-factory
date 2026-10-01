import { defineSeed } from '@nocobase/db';

/**
 * Three sample tickets, one per status, so the list, the status filter and the
 * processor workflow all have something to show on a fresh install.
 *
 * The strings are written out rather than imported from `server/`, and
 * `wallClock` is repeated here, because a Seed is a snapshot of history that
 * has to keep inserting the same rows. It is also loaded directly by Node in a
 * test, where a relative `.js` import into the source tree does not resolve.
 */

const IT_TICKETS_COLLECTION = 'itTickets';

const STATUS = {
  pending: 'pending',
  processing: 'processing',
  completed: 'completed',
} as const;

const CATEGORY = {
  computer: 'computer',
  account: 'account',
  other: 'other',
} as const;

/** Renders an instant the way a `datetime` Field stores it. */
function wallClock(date: Date): string {
  const pad = (value: number, length: number = 2): string =>
    String(value).padStart(length, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
  return `${day}T${clock}`;
}

interface DemoUserRef {
  readonly username: string;
  readonly name: string;
}

interface DemoTicket {
  readonly title: string;
  readonly category: string;
  readonly description: string;
  readonly status: string;
  readonly submitter: DemoUserRef;
  readonly handler?: DemoUserRef;
  readonly resolution?: string;
  readonly ageMinutes: number;
  readonly startAfterMinutes?: number;
  readonly completeAfterMinutes?: number;
}

const EMPLOYEE_ONE: DemoUserRef = { username: 'employee1', name: 'Chen Ming' };
const EMPLOYEE_TWO: DemoUserRef = { username: 'employee2', name: 'Li Na' };
const TECHNICIAN: DemoUserRef = { username: 'technician', name: 'Wang Qiang' };

const DEMO_TICKETS: readonly DemoTicket[] = [
  {
    title: 'Laptop will not power on',
    category: CATEGORY.computer,
    description:
      'The laptop stays black when I press the power button, even with the charger connected. No fan noise.',
    status: STATUS.pending,
    submitter: EMPLOYEE_ONE,
    ageMinutes: 30,
  },
  {
    title: 'Cannot sign in to the finance system',
    category: CATEGORY.account,
    description:
      'My finance account password was reset yesterday and the new one is rejected. I need access before the monthly close.',
    status: STATUS.processing,
    submitter: EMPLOYEE_TWO,
    handler: TECHNICIAN,
    ageMinutes: 180,
    startAfterMinutes: 120,
  },
  {
    title: 'Meeting room monitor shows no signal',
    category: CATEGORY.other,
    description:
      'The monitor in meeting room 3 shows "no signal" for every cable. A replacement adapter did not help.',
    status: STATUS.completed,
    submitter: EMPLOYEE_ONE,
    handler: TECHNICIAN,
    resolution:
      'Replaced the faulty display cable and verified the signal with two laptops. Room back in service.',
    ageMinutes: 1440,
    startAfterMinutes: 1200,
    completeAfterMinutes: 600,
  },
];

function minutesBefore(reference: Date, minutes: number): Date {
  return new Date(reference.getTime() - minutes * 60_000);
}

const seed = defineSeed({
  name: '202609280004_it_support_sample_tickets',
  async run({ query }) {
    const now = new Date();

    for (const demo of DEMO_TICKETS) {
      const existing = await query
        .selectFrom(IT_TICKETS_COLLECTION)
        .select('id')
        .where('title', '=', demo.title)
        .executeTakeFirst();
      if (existing) {
        continue;
      }

      const submitter = await query
        .selectFrom('user')
        .select(['id', 'name'])
        .where('username', '=', demo.submitter.username)
        .executeTakeFirst();
      if (!submitter) {
        continue;
      }

      let handlerId: string | null = null;
      let handlerName: string | null = null;
      if (demo.handler) {
        const handler = await query
          .selectFrom('user')
          .select(['id', 'name'])
          .where('username', '=', demo.handler.username)
          .executeTakeFirst();
        if (handler) {
          handlerId = String(handler.id);
          handlerName =
            typeof handler.name === 'string' ? handler.name : demo.handler.name;
        }
      }

      const createdAt = minutesBefore(now, demo.ageMinutes);
      const startedAt =
        demo.startAfterMinutes === undefined
          ? null
          : minutesBefore(now, demo.startAfterMinutes);
      const completedAt =
        demo.completeAfterMinutes === undefined
          ? null
          : minutesBefore(now, demo.completeAfterMinutes);

      await query
        .insertInto(IT_TICKETS_COLLECTION)
        .values({
          title: demo.title,
          category: demo.category,
          description: demo.description,
          status: demo.status,
          submitterId: String(submitter.id),
          submitterName:
            typeof submitter.name === 'string'
              ? submitter.name
              : demo.submitter.name,
          handlerId,
          handlerName,
          resolution: demo.resolution ?? null,
          startedAt: startedAt ? wallClock(startedAt) : null,
          completedAt: completedAt ? wallClock(completedAt) : null,
          createdAt: wallClock(createdAt),
          updatedAt: wallClock(completedAt ?? startedAt ?? createdAt),
        })
        .execute();
    }
  },
});

export default seed;
