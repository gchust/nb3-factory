/**
 * Fictional demo accounts and tickets for the IT repair workflow (Issue #505).
 *
 * The Issue asks for two employee accounts, one handler account and three
 * sample tickets so the workflow can be operated end to end. They are seeded by
 * `database/main/seeds/202609300003_it_repair_demo_data.ts`, which is idempotent
 * and safe to run against an existing database.
 *
 * These are demonstration credentials for a locally provisioned application,
 * not secrets: every string below is deliberately fictional.
 */
export const DEMO_PASSWORD = 'demo1234';

/** A moment every seeded timestamp is derived from, so runs are reproducible. */
export const DEMO_BASE_TIME = new Date('2026-10-01T01:00:00.000Z');

export type DemoPermissionSet = 'it-reporter' | 'it-handler';
export type DemoCategory = 'computer' | 'account' | 'other';
export type DemoStatus = 'pending' | 'processing' | 'completed';

export interface DemoUser {
  /** Fixed UUID, so an assignment id and a ticket reference stay stable. */
  id: string;
  name: string;
  username: string;
  email: string;
  permissionSet: DemoPermissionSet;
}

export const DEMO_USERS: readonly DemoUser[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Li Ming',
    username: 'employee.li',
    email: 'employee.li@example.com',
    permissionSet: 'it-reporter',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Wang Fang',
    username: 'employee.wang',
    email: 'employee.wang@example.com',
    permissionSet: 'it-reporter',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Zhao Lei',
    username: 'handler.zhao',
    email: 'handler.zhao@example.com',
    permissionSet: 'it-handler',
  },
];

export interface DemoTicket {
  title: string;
  category: DemoCategory;
  description: string;
  status: DemoStatus;
  /** `username` of the submitter. */
  submittedBy: string;
  /** `username` of the handler, once the ticket has been started. */
  handledBy?: string;
  resolution?: string;
}

export const DEMO_TICKETS: readonly DemoTicket[] = [
  {
    title: 'Laptop will not power on',
    category: 'computer',
    description:
      'The laptop does not boot after the last driver update. The power light blinks twice.',
    status: 'pending',
    submittedBy: 'employee.li',
  },
  {
    title: 'Cannot sign in to email',
    category: 'account',
    description:
      'The password is rejected although it was changed yesterday. Mail is needed for the daily report.',
    status: 'processing',
    submittedBy: 'employee.wang',
    handledBy: 'handler.zhao',
  },
  {
    title: 'Broken office chair',
    category: 'other',
    description:
      'The gas lift sinks to the lowest position as soon as I sit down.',
    status: 'completed',
    submittedBy: 'employee.li',
    handledBy: 'handler.zhao',
    resolution:
      'Replaced the gas lift and tested the chair. Collect it from desk 4-12.',
  },
];
