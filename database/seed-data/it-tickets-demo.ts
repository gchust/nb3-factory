/**
 * The demonstration dataset for the IT repair-request feature.
 *
 * These are sample people and sample requests, not required initial data: the
 * application works without them, and the permission sets that make the
 * feature reachable are installed by the separate permission-set seed. Keep
 * this module's values out of user-facing documentation, and in particular
 * never print `DEMO_PASSWORD`.
 *
 * The seeds that read this module all look people up by `username`, so a
 * database that already has an account with one of these names is used as it
 * is rather than duplicated.
 */

/** The password every demonstration account is created with. */
export const DEMO_PASSWORD = 'ItDemo#2026';

export interface DemoAccount {
  readonly username: string;
  readonly name: string;
  readonly email: string;
  /** The permission set key assigned to this person. */
  readonly permissionSet: string;
}

/** Two employees who file requests, and one handler who processes them. */
export const demoAccounts: readonly DemoAccount[] = [
  {
    username: 'lia.employee',
    name: 'Lina Zhao',
    email: 'lina.zhao@example.com',
    permissionSet: 'it-employee',
  },
  {
    username: 'wang.employee',
    name: 'Lei Wang',
    email: 'lei.wang@example.com',
    permissionSet: 'it-employee',
  },
  {
    username: 'chen.handler',
    name: 'Wei Chen',
    email: 'wei.chen@example.com',
    permissionSet: 'it-processor',
  },
];

export interface DemoTicket {
  readonly title: string;
  readonly category: 'computer' | 'account' | 'other';
  readonly description: string;
  readonly status: 'pending' | 'processing' | 'completed';
  /** The username of the person who filed the request. */
  readonly requester: string;
  /** The username of the handler, once handling has started. */
  readonly handler?: string;
  readonly resolution?: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * One request in each state, so the queue, the status filter and a finished
 * result all have something to show. The people and the states are fixed
 * rather than random, which keeps the demonstration repeatable.
 */
export const demoTickets: readonly DemoTicket[] = [
  {
    title: 'Laptop will not power on after the update',
    category: 'computer',
    description:
      'The laptop shut down during the system update and now nothing on the keyboard responds. The charging light is on.',
    status: 'pending',
    requester: 'lia.employee',
    createdAt: '2026-09-15T02:10:00.000Z',
    updatedAt: '2026-09-15T02:10:00.000Z',
  },
  {
    title: 'Cannot sign in to the expense system',
    category: 'account',
    description:
      'The expense system rejects the password that still works for every other application. Resetting it from the login page did not help.',
    status: 'processing',
    requester: 'wang.employee',
    handler: 'chen.handler',
    startedAt: '2026-09-16T01:05:00.000Z',
    createdAt: '2026-09-16T00:40:00.000Z',
    updatedAt: '2026-09-16T01:05:00.000Z',
  },
  {
    title: 'External monitor flickers at its highest refresh rate',
    category: 'other',
    description:
      'The external monitor flickers when it is set to 144 Hz and is stable at 60 Hz.',
    status: 'completed',
    requester: 'lia.employee',
    handler: 'chen.handler',
    resolution:
      'Replaced the DisplayPort cable, which was not rated for the bandwidth, and reinstalled the graphics driver. Verified stable at 144 Hz for a full working day.',
    startedAt: '2026-09-14T03:00:00.000Z',
    completedAt: '2026-09-14T06:30:00.000Z',
    createdAt: '2026-09-14T02:30:00.000Z',
    updatedAt: '2026-09-14T06:30:00.000Z',
  },
];
