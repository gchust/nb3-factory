/**
 * Portable declarations for the IT repair ticket feature.
 *
 * This module only builds immutable descriptions: the collection opt-in, the
 * record access that scopes a ticket to its submitter, and the composite
 * business operation with its data scopes. It performs no registration,
 * query or assignment, so the server provider and the database seeds can both
 * reuse the same typed references without importing runtime instances.
 */
import {
  defineCompositeResource,
  defineRecordAccess,
  type AuthorizationTitle,
} from '@nocobase/authorization/core';
import {
  condition,
  defineDatabasePermission,
  type DatabaseScope,
} from '@nocobase/app-plugin-authorization/server';

/** The application's locale namespace; server titles resolve here and on the client. */
export const IT_TICKETS_NAMESPACE = 'nb3-factory';

export const IT_TICKETS_COLLECTION = 'itTickets';
export const IT_TICKETS_COMPOSITE = 'it.tickets';
export const IT_TICKETS_PAGE = 'tickets';
export const IT_TICKETS_BUSINESS_SECTION = 'it-support';
export const IT_TICKETS_OWN_RECORD_ACCESS = 'it.own';

export const IT_TICKET_CATEGORIES = ['computer', 'account', 'other'] as const;
export type ItTicketCategory = (typeof IT_TICKET_CATEGORIES)[number];

export const IT_TICKET_STATUSES = [
  'pending',
  'in_progress',
  'completed',
] as const;
export type ItTicketStatus = (typeof IT_TICKET_STATUSES)[number];

/** The row shape read and written through the repository; mirrors the migration. */
export interface ItTicketRecord {
  id: number;
  title: string;
  category: ItTicketCategory;
  description: string | null;
  status: ItTicketStatus;
  resolution: string | null;
  submitterId: string;
  handlerId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const title = (key: string): AuthorizationTitle => ({
  key,
  ns: IT_TICKETS_NAMESPACE,
});

const READ_FIELDS: readonly (keyof ItTicketRecord)[] = [
  'id',
  'title',
  'category',
  'description',
  'status',
  'resolution',
  'submitterId',
  'handlerId',
  'startedAt',
  'completedAt',
  'createdAt',
  'updatedAt',
];

const CREATE_FIELDS: readonly (keyof ItTicketRecord)[] = [
  'title',
  'category',
  'description',
  'status',
  'submitterId',
  'createdAt',
  'updatedAt',
];

const START_FIELDS: readonly (keyof ItTicketRecord)[] = [
  'status',
  'handlerId',
  'startedAt',
  'updatedAt',
];

const COMPLETE_FIELDS: readonly (keyof ItTicketRecord)[] = [
  'status',
  'resolution',
  'completedAt',
  'updatedAt',
];

/**
 * Tickets are visible to their submitter. Handlers and root use the built-in
 * `allRecords` instead of this.
 */
export const ownTicketsRecordAccess = defineRecordAccess(
  IT_TICKETS_OWN_RECORD_ACCESS,
  (access) =>
    access
      .title(title('recordAccess.own'))
      .description(title('recordAccess.ownDescription'))
      .collections(IT_TICKETS_COLLECTION)
      .resolver(({ principal }): DatabaseScope =>
        principal.type === 'user'
          ? condition('submitterId', '$eq', principal.id)
          : false,
      ),
);

const viewTickets = defineDatabasePermission((permission) =>
  permission
    .collection<ItTicketRecord>(IT_TICKETS_COLLECTION)
    .title(title('scopes.tickets'))
    .read(READ_FIELDS),
);

const createTickets = defineDatabasePermission((permission) =>
  permission
    .collection<ItTicketRecord>(IT_TICKETS_COLLECTION)
    .title(title('scopes.tickets'))
    // A create returns the new row, so the same policy must also allow reading
    // it; a create-only policy is refused when the Repository reads the result.
    .read(READ_FIELDS)
    .create(CREATE_FIELDS),
);

const startTickets = defineDatabasePermission((permission) =>
  permission
    .collection<ItTicketRecord>(IT_TICKETS_COLLECTION)
    .title(title('scopes.tickets'))
    .read(READ_FIELDS)
    .update(START_FIELDS),
);

const completeTickets = defineDatabasePermission((permission) =>
  permission
    .collection<ItTicketRecord>(IT_TICKETS_COLLECTION)
    .title(title('scopes.tickets'))
    .read(READ_FIELDS)
    .update(COMPLETE_FIELDS),
);

/**
 * IT repair tickets: a submitter and a handler act on the same table with
 * different scopes and transitions. Every action is a separate permission so
 * an administrator can grant submitting, viewing, starting and completing
 * independently, and each action exposes one `tickets` data scope an assigned
 * permission set narrows (`it.own` for submitters, `allRecords` for handlers).
 */
export const itTickets = defineCompositeResource(
  IT_TICKETS_COMPOSITE,
  (resource) =>
    resource
      .title(title('resource'))
      .action('view', (action) =>
        action.title(title('actions.view')).grant('tickets', viewTickets),
      )
      .action('create', (action) =>
        action.title(title('actions.create')).grant('tickets', createTickets),
      )
      .action('start', (action) =>
        action.title(title('actions.start')).grant('tickets', startTickets),
      )
      .action('complete', (action) =>
        action
          .title(title('actions.complete'))
          .grant('tickets', completeTickets),
      ),
);

/** Permission set keys the application seeds; administrators assign them to colleagues. */
export const IT_TICKETS_EMPLOYEE_SET = 'it-employee';
export const IT_TICKETS_HANDLER_SET = 'it-handler';
