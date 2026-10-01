/**
 * Shared vocabulary for the IT repair ticket feature.
 *
 * The collection name, the composite resource id, its actions and the
 * `status`/`category` values are used by the migration, the seeds, the server
 * routes, the client page and the tests. Keeping them in one file is what
 * stops a route and a permission set from disagreeing on a string.
 */

export const IT_TICKETS_COLLECTION = 'itTickets';

/** The composite resource the permission sets grant; its id is stable. */
export const IT_TICKETS_RESOURCE = 'it.tickets';

/** Page id the client route declares in `client/routes.ts`. */
export const IT_TICKETS_PAGE_ID = 'it.tickets';

/** Composite action names. Each maps to one business operation. */
export const IT_TICKETS_ACTION = {
  complete: 'complete',
  create: 'create',
  start: 'start',
  view: 'view',
} as const;

export type ItTicketAction =
  (typeof IT_TICKETS_ACTION)[keyof typeof IT_TICKETS_ACTION];

/** Permission set keys the seed installs and an administrator may assign. */
export const IT_EMPLOYEE_PERMISSION_SET = 'it-employee';
export const IT_PROCESSOR_PERMISSION_SET = 'it-processor';

/** The one data scope every ticket action is filtered through. */
export const IT_TICKETS_DATA_SCOPE = 'tickets';

/** PostgreSQL/SQLite `status` values, in lifecycle order. */
export const IT_TICKET_STATUS = {
  completed: 'completed',
  pending: 'pending',
  processing: 'processing',
} as const;

export type ItTicketStatus =
  (typeof IT_TICKET_STATUS)[keyof typeof IT_TICKET_STATUS];

export const IT_TICKET_STATUSES: readonly ItTicketStatus[] = [
  IT_TICKET_STATUS.pending,
  IT_TICKET_STATUS.processing,
  IT_TICKET_STATUS.completed,
];

/** `category` values; anything else is rejected at the route boundary. */
export const IT_TICKET_CATEGORY = {
  account: 'account',
  computer: 'computer',
  other: 'other',
} as const;

export type ItTicketCategory =
  (typeof IT_TICKET_CATEGORY)[keyof typeof IT_TICKET_CATEGORY];

export const IT_TICKET_CATEGORIES: readonly ItTicketCategory[] = [
  IT_TICKET_CATEGORY.computer,
  IT_TICKET_CATEGORY.account,
  IT_TICKET_CATEGORY.other,
];

export function isItTicketCategory(value: unknown): value is ItTicketCategory {
  return (
    typeof value === 'string' &&
    (IT_TICKET_CATEGORIES as readonly string[]).includes(value)
  );
}

export function isItTicketStatus(value: unknown): value is ItTicketStatus {
  return (
    typeof value === 'string' &&
    (IT_TICKET_STATUSES as readonly string[]).includes(value)
  );
}

/** The subsection the permission workspace lists the ticket resource under. */
export const IT_SUPPORT_UI_SECTION = 'itSupport';
