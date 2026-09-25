/**
 * Domain vocabulary for the IT ticket application feature.
 *
 * Kept free of framework imports. The `database/main/seeds` files deliberately
 * repeat these literals rather than import them: a seed is loaded by its own
 * path at runtime, so a relative import from `database/` into `server/` would
 * need `.js`-to-`.ts` resolution that only the test transform provides. The
 * seed test cross-checks the two copies so they cannot drift silently.
 */

/** The Permission Set that marks a user as an IT ticket handler (处理人员). */
export const IT_TICKET_HANDLER_SET = 'it-ticket-handler';

/** The Permission Set that marks a user as an IT ticket employee (员工). */
export const IT_TICKET_EMPLOYEE_SET = 'it-ticket-employee';

/** The i18n namespace the application's own locale files are registered under. */
export const IT_TICKET_LOCALE_NAMESPACE = 'nb3-factory';

export const IT_TICKET_STATUSES = [
  'pending',
  'in-progress',
  'completed',
] as const;
export type ItTicketStatus = (typeof IT_TICKET_STATUSES)[number];

export const IT_TICKET_CATEGORIES = ['computer', 'account', 'other'] as const;
export type ItTicketCategory = (typeof IT_TICKET_CATEGORIES)[number];

/** The three sample accounts the sample-data seeds create. */
export const SAMPLE_HANDLER_USERNAME = 'it-handler';
export const SAMPLE_EMPLOYEE_USERNAMES = [
  'it-employee-1',
  'it-employee-2',
] as const;
