import { defineCompositeResource } from '@nocobase/authorization/core';
import {
  defineDatabasePermission,
  recordAccess,
} from '@nocobase/app-plugin-authorization/server';

import {
  IT_TICKETS_ACTION,
  IT_TICKETS_COLLECTION,
  IT_TICKETS_DATA_SCOPE,
  IT_TICKETS_RESOURCE,
  type ItTicketAction,
} from './constants.js';
import { itOwnTicketsReference } from './record-access.js';

/**
 * The shape the server reads and writes on `itTickets`.
 *
 * Field allowlists below are typed against this interface, so a typo in a
 * permission field list is a compile error rather than a silently missing
 * field in a stored grant.
 */
export interface ItTicketRecord {
  id: number;
  title: string;
  category: string;
  description: string | null;
  status: string;
  submitterId: string;
  submitterName: string | null;
  handlerId: string | null;
  handlerName: string | null;
  resolution: string | null;
  /** Wall-clock `datetime` values: written as a `Date`, read back as text. */
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Every field a permitted reader may see. */
export const IT_TICKET_READ_FIELDS = [
  'id',
  'title',
  'category',
  'description',
  'status',
  'submitterId',
  'submitterName',
  'handlerId',
  'handlerName',
  'resolution',
  'startedAt',
  'completedAt',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof ItTicketRecord)[];

/** Fields a submitter supplies when creating a ticket. */
export const IT_TICKET_CREATE_FIELDS = [
  'title',
  'category',
  'description',
  'status',
  'submitterId',
  'submitterName',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof ItTicketRecord)[];

/** Fields the `start` transition writes. */
export const IT_TICKET_START_FIELDS = [
  'status',
  'handlerId',
  'handlerName',
  'startedAt',
  'updatedAt',
] as const satisfies readonly (keyof ItTicketRecord)[];

/** Fields the `complete` transition writes. */
export const IT_TICKET_COMPLETE_FIELDS = [
  'status',
  'resolution',
  'completedAt',
  'updatedAt',
] as const satisfies readonly (keyof ItTicketRecord)[];

function title(key: string): { readonly key: string; readonly ns: string } {
  return { key, ns: 'nb3-factory' };
}

/**
 * Reading one's own tickets, or all of them.
 *
 * `read` is declared on the mutation permissions as well: a Repository returns
 * the row it just wrote, and db refuses a permission that writes but may not
 * read.
 */
export const itTicketReadPermission = defineDatabasePermission((permission) =>
  permission
    .collection<ItTicketRecord>(IT_TICKETS_COLLECTION)
    .title(title('itSupport.permission.ticketView'))
    .options(itOwnTicketsReference, recordAccess.allRecords)
    .read(IT_TICKET_READ_FIELDS),
);

/** Submitting a new ticket. The data scope narrows it to the submitter's own. */
export const itTicketCreatePermission = defineDatabasePermission((permission) =>
  permission
    .collection<ItTicketRecord>(IT_TICKETS_COLLECTION)
    .title(title('itSupport.permission.ticketCreate'))
    .options(itOwnTicketsReference, recordAccess.allRecords)
    .read(IT_TICKET_READ_FIELDS)
    .create(IT_TICKET_CREATE_FIELDS),
);

/** Claiming a submitted ticket and moving it to `processing`. */
export const itTicketStartPermission = defineDatabasePermission((permission) =>
  permission
    .collection<ItTicketRecord>(IT_TICKETS_COLLECTION)
    .title(title('itSupport.permission.ticketStart'))
    .options(recordAccess.allRecords)
    .read(IT_TICKET_READ_FIELDS)
    .update(IT_TICKET_START_FIELDS),
);

/** Resolving a `processing` ticket with a processing note. */
export const itTicketCompletePermission = defineDatabasePermission(
  (permission) =>
    permission
      .collection<ItTicketRecord>(IT_TICKETS_COLLECTION)
      .title(title('itSupport.permission.ticketComplete'))
      .options(recordAccess.allRecords)
      .read(IT_TICKET_READ_FIELDS)
      .update(IT_TICKET_COMPLETE_FIELDS),
);

/**
 * The `it.tickets` business resource: four actions over one table, each bound
 * to the same `tickets` data scope so a Permission Set can choose `allRecords`
 * or `it.ownTickets` per action.
 */
export const itTicketsComposite = defineCompositeResource(
  IT_TICKETS_RESOURCE,
  (resource) =>
    resource
      .title(title('itSupport.resource.tickets'))
      .action(IT_TICKETS_ACTION.view, (action) =>
        action
          .title(title('itSupport.action.view'))
          .grant(IT_TICKETS_DATA_SCOPE, itTicketReadPermission, {
            title: title('itSupport.action.view'),
          }),
      )
      .action(IT_TICKETS_ACTION.create, (action) =>
        action
          .title(title('itSupport.action.create'))
          .grant(IT_TICKETS_DATA_SCOPE, itTicketCreatePermission, {
            title: title('itSupport.action.create'),
          }),
      )
      .action(IT_TICKETS_ACTION.start, (action) =>
        action
          .title(title('itSupport.action.start'))
          .grant(IT_TICKETS_DATA_SCOPE, itTicketStartPermission, {
            title: title('itSupport.action.start'),
          }),
      )
      .action(IT_TICKETS_ACTION.complete, (action) =>
        action
          .title(title('itSupport.action.complete'))
          .grant(IT_TICKETS_DATA_SCOPE, itTicketCompletePermission, {
            title: title('itSupport.action.complete'),
          }),
      ),
);

/** A stable reference used to grant and place the resource. */
export type ItTicketsCompositeReference = ReturnType<
  typeof itTicketsComposite.reference
>;

/** The actions this feature exposes, for tests and routes. */
export const IT_TICKETS_ACTIONS: readonly ItTicketAction[] = [
  IT_TICKETS_ACTION.view,
  IT_TICKETS_ACTION.create,
  IT_TICKETS_ACTION.start,
  IT_TICKETS_ACTION.complete,
];
