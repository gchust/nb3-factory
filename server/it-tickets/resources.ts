import { defineCompositeResource } from '@nocobase/authorization/core';
import {
  defineDatabasePermission,
  recordAccess,
} from '@nocobase/app-plugin-authorization/server';
import {
  IT_TICKETS_COLLECTION,
  itSubmittedByMeReference,
} from './record-access.ts';

/** The business resource the repair-request endpoints authorize against. */
export const IT_TICKETS_RESOURCE = 'it.tickets';

/**
 * The Client Route's page resource id. The page, its navigation entry and the
 * `/api/it/tickets` endpoints all resolve to this one grant.
 */
export const IT_TICKETS_PAGE = 'it-tickets';

/** The one data scope key every action of this resource binds its collection to. */
const IT_TICKETS_SCOPE = IT_TICKETS_COLLECTION;

/** A repair request as the authorization declarations see it. */
export interface ItTicketRow {
  id: number;
  title: string;
  category: string;
  description: string;
  status: string;
  requesterId: string;
  handlerId: string | null;
  resolution: string | null;
  startedAt: string | Date | null;
  completedAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

/** Everything a reader may see. */
const READ_FIELDS = [
  'id',
  'title',
  'category',
  'description',
  'status',
  'requesterId',
  'handlerId',
  'resolution',
  'startedAt',
  'completedAt',
  'createdAt',
  'updatedAt',
] as const;

/** `status`, `requesterId` and the timestamps are written by the server. */
const CREATE_FIELDS = [
  'title',
  'category',
  'description',
  'status',
  'requesterId',
  'createdAt',
  'updatedAt',
] as const;

const START_FIELDS = ['status', 'handlerId', 'startedAt', 'updatedAt'] as const;

const COMPLETE_FIELDS = [
  'status',
  'resolution',
  'completedAt',
  'updatedAt',
] as const;

/**
 * One collection permission per action.
 *
 * Every action reads the same fields, so a handler and a requester see the same
 * ticket shape; what differs between them is the operation and the record
 * scope. Every action offers both a "submitted by me" scope and "all records",
 * and defaults to the narrower one, so a grant that names no scope cannot
 * widen access by accident.
 */
const viewPermission = defineDatabasePermission((permission) =>
  permission
    .collection<ItTicketRow>(IT_TICKETS_COLLECTION)
    .title('IT repair requests')
    .options(itSubmittedByMeReference, recordAccess.allRecords)
    .default(itSubmittedByMeReference)
    .read(READ_FIELDS),
);

const createPermission = defineDatabasePermission((permission) =>
  permission
    .collection<ItTicketRow>(IT_TICKETS_COLLECTION)
    .title('IT repair requests')
    .options(itSubmittedByMeReference, recordAccess.allRecords)
    .default(itSubmittedByMeReference)
    .read(READ_FIELDS)
    .create(CREATE_FIELDS),
);

const startPermission = defineDatabasePermission((permission) =>
  permission
    .collection<ItTicketRow>(IT_TICKETS_COLLECTION)
    .title('IT repair requests')
    .options(itSubmittedByMeReference, recordAccess.allRecords)
    .default(itSubmittedByMeReference)
    .read(READ_FIELDS)
    .update(START_FIELDS),
);

const completePermission = defineDatabasePermission((permission) =>
  permission
    .collection<ItTicketRow>(IT_TICKETS_COLLECTION)
    .title('IT repair requests')
    .options(itSubmittedByMeReference, recordAccess.allRecords)
    .default(itSubmittedByMeReference)
    .read(READ_FIELDS)
    .update(COMPLETE_FIELDS),
);

/**
 * The repair-request business operations.
 *
 * `view` and `create` describe what an employee may do with their own
 * requests; `start` and `complete` describe the handler's work. State
 * transitions are enforced by the server, not by these declarations: a grant
 * says whether the operation is allowed at all and which records it reaches.
 */
export const itTicketsResource = defineCompositeResource(
  IT_TICKETS_RESOURCE,
  (resource) =>
    resource
      .title('IT repair requests')
      .action('view', (action) =>
        action.title('View requests').grant(IT_TICKETS_SCOPE, viewPermission),
      )
      .action('create', (action) =>
        action
          .title('Submit a request')
          .grant(IT_TICKETS_SCOPE, createPermission),
      )
      .action('start', (action) =>
        action.title('Start handling').grant(IT_TICKETS_SCOPE, startPermission),
      )
      .action('complete', (action) =>
        action
          .title('Complete a request')
          .grant(IT_TICKETS_SCOPE, completePermission),
      ),
);

/** The reference permission sets and seeds store grants against. */
export const itTicketsReference = itTicketsResource.reference();

/** Every business action the resource declares. */
export type ItTicketsAction = 'view' | 'create' | 'start' | 'complete';
