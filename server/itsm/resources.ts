import {
  defineCompositeResource,
  type CompositeResourceActions,
  type CompositeResourceReference,
} from '@nocobase/authorization/core';
import {
  defineDatabasePermission,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';

/**
 * The ticket table as the permission declarations see it. Only the columns the
 * declarations name need to be listed; the compiler uses this to reject a
 * field name the schema does not have.
 */
export interface ServiceTicketRow {
  readonly id: number;
  readonly title: string;
  readonly description: string;
  readonly urgency: string;
  readonly status: string;
  readonly requesterId: string;
  readonly requesterName: string | null;
  readonly assigneeId: string | null;
  readonly assigneeName: string | null;
  readonly resolution: string | null;
  readonly screenshotIds: unknown;
  readonly submittedAt: string;
  readonly assignedAt: string | null;
  readonly resolvedAt: string | null;
  readonly closedAt: string | null;
  readonly reminderSentAt: string | null;
  readonly lastReturnedAt: string | null;
  readonly returnCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ServiceTicketLogRow {
  readonly id: number;
  readonly ticketId: number;
  readonly authorId: string | null;
  readonly authorName: string | null;
  readonly kind: string;
  readonly content: string;
  readonly createdAt: string;
}

const TICKET = 'serviceTickets';
const LOG = 'serviceTicketLogs';

/** Fields the dispatcher may set when assigning a ticket. */
const assignFields = [
  'assigneeId',
  'assigneeName',
  'status',
  'assignedAt',
  'updatedAt',
] as const satisfies readonly (keyof ServiceTicketRow)[];

/** Fields an engineer may set while handling or resolving a ticket. */
const processFields = [
  'status',
  'resolution',
  'resolvedAt',
  'updatedAt',
] as const satisfies readonly (keyof ServiceTicketRow)[];

/** Fields the requester sets when confirming or returning a ticket. */
const confirmFields = [
  'status',
  'closedAt',
  'lastReturnedAt',
  'returnCount',
  'assigneeId',
  'assigneeName',
  'updatedAt',
] as const satisfies readonly (keyof ServiceTicketRow)[];

/** Fields the requester supplies when submitting a ticket. */
const submitFields = [
  'title',
  'description',
  'urgency',
  'status',
  'requesterId',
  'requesterName',
  'screenshotIds',
  'submittedAt',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof ServiceTicketRow)[];

/**
 * A ticket permission with read plus the fields one action may write. Read is
 * included so an action can load the record it is about to change through the
 * same policy, which is what keeps the state check and the write in one
 * authorization decision.
 */
const ticketReadUpdate = defineDatabasePermission<ServiceTicketRow, string>(
  (permission) =>
    permission
      .collection<ServiceTicketRow>(TICKET)
      .title('Service tickets')
      .read('*')
      .update(processFields),
);

const ticketReadUpdateAssign = defineDatabasePermission<
  ServiceTicketRow,
  string
>((permission) =>
  permission
    .collection<ServiceTicketRow>(TICKET)
    .title('Service tickets')
    .read('*')
    .update(assignFields),
);

const ticketReadUpdateConfirm = defineDatabasePermission<
  ServiceTicketRow,
  string
>((permission) =>
  permission
    .collection<ServiceTicketRow>(TICKET)
    .title('Service tickets')
    .read('*')
    .update(confirmFields),
);

const ticketRead = defineDatabasePermission<ServiceTicketRow, string>(
  (permission) =>
    permission
      .collection<ServiceTicketRow>(TICKET)
      .title('Service tickets')
      .read('*'),
);

const ticketReadCreate = defineDatabasePermission<ServiceTicketRow, string>(
  (permission) =>
    permission
      .collection<ServiceTicketRow>(TICKET)
      .title('Service tickets')
      .read('*')
      .create(submitFields),
);

const logRead = defineDatabasePermission<ServiceTicketLogRow, string>(
  (permission) =>
    permission
      .collection<ServiceTicketLogRow>(LOG)
      .title('Service ticket process log')
      .read('*'),
);

const logReadCreate = defineDatabasePermission<ServiceTicketLogRow, string>(
  (permission) =>
    permission
      .collection<ServiceTicketLogRow>(LOG)
      .title('Service ticket process log')
      .read('*')
      .create('*'),
);

/**
 * The service desk's business operations. Each action composes the underlying
 * collection grants it actually needs; the record boundary is chosen by the
 * permission set through a record access key (`itsm.requester`,
 * `itsm.assignee` or the built-in `allRecords`).
 */
export const ticketsResource = defineCompositeResource(
  'itsm.tickets',
  (resource) =>
    resource
      .title('Service tickets')
      .action('view', (action) =>
        action
          .title('View')
          .grant('tickets', ticketRead)
          .grant('logs', logRead),
      )
      .action('submit', (action) =>
        action.title('Submit').grant('tickets', ticketReadCreate),
      )
      .action('assign', (action) =>
        action
          .title('Assign')
          .grant('tickets', ticketReadUpdateAssign)
          .grant('logs', logReadCreate),
      )
      .action('process', (action) =>
        action
          .title('Record handling')
          .grant('tickets', ticketReadUpdate)
          .grant('logs', logReadCreate),
      )
      .action('resolve', (action) =>
        action
          .title('Mark resolved')
          .grant('tickets', ticketReadUpdate)
          .grant('logs', logReadCreate),
      )
      .action('confirm', (action) =>
        action
          .title('Confirm resolution')
          .grant('tickets', ticketReadUpdateConfirm)
          .grant('logs', logReadCreate),
      )
      .action('return', (action) =>
        action
          .title('Return for processing')
          .grant('tickets', ticketReadUpdateConfirm)
          .grant('logs', logReadCreate),
      )
      .action('comment', (action) =>
        action
          .title('Comment')
          .grant('tickets', ticketRead)
          .grant('logs', logReadCreate),
      ),
);

/** The keys each action's data scopes use; the permission seeds select values for them. */
export const TICKET_SCOPE = 'tickets';
export const LOG_SCOPE = 'logs';

/** Collection names the ticket routes bind their policies to. */
export const TICKET_COLLECTION = TICKET;
export const TICKET_LOG_COLLECTION = LOG;

/**
 * Registers the ticket collections, the composite resource and its place in
 * the authorization workspace. Called from the service desk provider's boot,
 * before the first request.
 */
export function registerItsmResources(
  authz: AppAuthorization,
): CompositeResourceReference<CompositeResourceActions> {
  authz.database.collections.add({
    name: TICKET_COLLECTION,
    title: 'Service tickets',
  });
  authz.database.collections.add({
    name: TICKET_LOG_COLLECTION,
    title: 'Service ticket process log',
  });
  const reference = authz.compositeResources.define(ticketsResource);
  authz.ui.sections.add({
    name: 'service-desk',
    title: 'Service desk',
    parent: 'business',
  });
  authz.ui.place(reference, { section: 'service-desk' });
  return reference;
}
