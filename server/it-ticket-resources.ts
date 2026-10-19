import {
  defineCompositeResource,
  defineRecordAccess,
} from '@nocobase/authorization/core';
import {
  defineDatabasePermission,
  recordAccess,
} from '@nocobase/app-plugin-authorization/server';
import { buildFilter } from '@nocobase/repository-input';

/** The scalar fields every read of a ticket may return. */
export const IT_TICKET_READ_FIELDS = [
  'id',
  'title',
  'description',
  'urgency',
  'status',
  'requesterId',
  'assigneeId',
  'resolution',
  'statusChangedAt',
  'assignedAt',
  'resolvedAt',
  'closedAt',
  'returnedAt',
  'overdueNotifiedAt',
  'createdAt',
  'updatedAt',
] as const;

const CREATE_FIELDS = [
  'title',
  'description',
  'urgency',
  'status',
  'requesterId',
  'statusChangedAt',
  'createdAt',
  'updatedAt',
] as const;

const ASSIGN_FIELDS = [
  'assigneeId',
  'status',
  'assignedAt',
  'statusChangedAt',
  'updatedAt',
] as const;

const PROGRESS_FIELDS = ['status', 'statusChangedAt', 'updatedAt'] as const;
const RESOLVE_FIELDS = [
  'status',
  'resolution',
  'resolvedAt',
  'statusChangedAt',
  'updatedAt',
] as const;
const CLOSE_FIELDS = [
  'status',
  'closedAt',
  'statusChangedAt',
  'updatedAt',
] as const;
const RETURN_FIELDS = [
  'status',
  'returnedAt',
  'statusChangedAt',
  'updatedAt',
] as const;

/** A ticket requested by the signed-in user. */
export const itTicketsOwn = defineRecordAccess('it.tickets.own', (access) =>
  access
    .title('Requested by me')
    .collections('itTickets')
    .resolver(({ principal }) =>
      principal.type === 'user'
        ? buildFilter((f) => f.string('requesterId').eq(principal.id))
        : false,
    ),
);

/** A ticket assigned to the signed-in engineer. */
export const itTicketsAssigned = defineRecordAccess(
  'it.tickets.assigned',
  (access) =>
    access
      .title('Assigned to me')
      .collections('itTickets')
      .resolver(({ principal }) =>
        principal.type === 'user'
          ? buildFilter((f) => f.string('assigneeId').eq(principal.id))
          : false,
      ),
);

const ticketRead = defineDatabasePermission((p) =>
  p
    .collection('itTickets')
    .title('IT tickets')
    .read(IT_TICKET_READ_FIELDS)
    .options(
      itTicketsOwn.reference(),
      itTicketsAssigned.reference(),
      recordAccess.allRecords,
    )
    .default(itTicketsOwn.reference()),
);

function ticketWorkPermission(fields: readonly string[]) {
  return defineDatabasePermission((p) =>
    p
      .collection('itTickets')
      .title('IT tickets')
      .read(IT_TICKET_READ_FIELDS)
      .update(fields)
      .options(
        itTicketsOwn.reference(),
        itTicketsAssigned.reference(),
        recordAccess.allRecords,
      )
      .default(itTicketsOwn.reference()),
  );
}

const ticketCreate = defineDatabasePermission((p) =>
  p
    .collection('itTickets')
    .title('IT tickets')
    .read(IT_TICKET_READ_FIELDS)
    .create(CREATE_FIELDS)
    .options(
      itTicketsOwn.reference(),
      itTicketsAssigned.reference(),
      recordAccess.allRecords,
    )
    .default(itTicketsOwn.reference()),
);

const ticketAssign = ticketWorkPermission(ASSIGN_FIELDS);
const ticketProgress = ticketWorkPermission(PROGRESS_FIELDS);
const ticketResolve = ticketWorkPermission(RESOLVE_FIELDS);
const ticketClose = ticketWorkPermission(CLOSE_FIELDS);
const ticketReturn = ticketWorkPermission(RETURN_FIELDS);

/**
 * The service desk's operations. `view` decides which tickets a person sees;
 * every other action also needs the state check the service applies.
 */
export const itTickets = defineCompositeResource('it.tickets', (resource) =>
  resource
    .title('IT tickets')
    .action('view', (action) =>
      action.title('View tickets').grant('ticket', ticketRead),
    )
    .action('create', (action) =>
      action.title('Create a ticket').grant('ticket', ticketCreate),
    )
    .action('assign', (action) =>
      action.title('Assign an engineer').grant('ticket', ticketAssign),
    )
    .action('progress', (action) =>
      action.title('Record progress').grant('ticket', ticketProgress),
    )
    .action('resolve', (action) =>
      action.title('Resolve a ticket').grant('ticket', ticketResolve),
    )
    .action('close', (action) =>
      action.title('Confirm resolution').grant('ticket', ticketClose),
    )
    .action('return', (action) =>
      action.title('Return for further handling').grant('ticket', ticketReturn),
    )
    .action('comment', (action) =>
      action.title('Comment on a ticket').grant('ticket', ticketRead),
    )
    .action('dashboard', (action) =>
      action
        .title('View the service desk dashboard')
        .grant('ticket', ticketRead),
    )
    .action('manage', (action) =>
      action.title('Manage the service desk').grant('ticket', ticketRead),
    ),
);
