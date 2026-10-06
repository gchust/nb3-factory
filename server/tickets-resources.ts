import {
  defineCompositeResource,
  defineRecordAccess,
} from '@nocobase/authorization/core';
import {
  condition,
  defineDatabasePermission,
  recordAccess,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';

/**
 * The fields of a ticket as the permission declaration knows them. The database
 * metadata stays authoritative; this interface only type-checks the names.
 */
export interface TicketRow {
  id: number;
  title: string;
  category: string;
  description: string | null;
  status: string;
  resolution: string | null;
  submitterId: string;
  handlerId: string | null;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export const TICKET_RESOURCE = 'tickets';

export const TICKET_STATUSES = ['pending', 'in_progress', 'completed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const TICKET_CATEGORIES = ['computer', 'account', 'other'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

const READ_FIELDS = [
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
] as const satisfies readonly (keyof TicketRow)[];

// `id` is auto-increment, so it is not a writable create field.
const CREATE_FIELDS = [
  'title',
  'category',
  'description',
  'status',
  'submitterId',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof TicketRow)[];

const START_FIELDS = [
  'status',
  'handlerId',
  'startedAt',
  'updatedAt',
] as const satisfies readonly (keyof TicketRow)[];

const COMPLETE_FIELDS = [
  'status',
  'resolution',
  'completedAt',
  'updatedAt',
] as const satisfies readonly (keyof TicketRow)[];

/**
 * The tickets an employee submitted. The built-in `recordsIOwn` targets an
 * `ownerId` column; this application records the submitter in `submitterId`.
 */
export const ticketSubmittedByMe = defineRecordAccess(
  'tickets.submitted',
  (access) =>
    access
      .title('Tickets I submitted')
      .collections('tickets')
      .resolver(({ principal }) =>
        principal.type === 'user'
          ? condition('submitterId', '$eq', principal.id)
          : false,
      ),
);

/** A full ticket read: content, resolution and both people. An employee's
 *  grant narrows it to their own submissions. */
const readPermission = defineDatabasePermission((permission) =>
  permission
    .collection<TicketRow>('tickets')
    .title('Tickets')
    .read(READ_FIELDS)
    .options(ticketSubmittedByMe.reference(), recordAccess.allRecords)
    .default(ticketSubmittedByMe.reference()),
);

/** Submitting a ticket. */
const createPermission = defineDatabasePermission((permission) =>
  permission
    .collection<TicketRow>('tickets')
    .title('Tickets')
    .create(CREATE_FIELDS)
    .options(recordAccess.allRecords)
    .default(recordAccess.allRecords),
);

/** Taking a pending ticket over. */
const startPermission = defineDatabasePermission((permission) =>
  permission
    .collection<TicketRow>('tickets')
    .title('Tickets')
    .update(START_FIELDS)
    .options(recordAccess.allRecords)
    .default(recordAccess.allRecords),
);

/** Finishing an in-progress ticket with a resolution. */
const completePermission = defineDatabasePermission((permission) =>
  permission
    .collection<TicketRow>('tickets')
    .title('Tickets')
    .update(COMPLETE_FIELDS)
    .options(recordAccess.allRecords)
    .default(recordAccess.allRecords),
);

/**
 * The ticket business actions:
 *
 * - `view` reads a ticket. An employee's grant selects only their own tickets;
 *   a handler selects all records.
 * - `create` submits a ticket. Only employees hold it.
 * - `start` moves a pending ticket to in progress and records the handler.
 * - `complete` finishes an in-progress ticket with a resolution. No action
 *   writes a completed ticket, so a completed ticket cannot change.
 */
export const tickets = defineCompositeResource(TICKET_RESOURCE, (resource) =>
  resource
    .title('Tickets')
    .action('view', (action) =>
      action.title('View').grant('tickets', readPermission),
    )
    .action('create', (action) =>
      action.title('Submit').grant('tickets', createPermission),
    )
    .action('start', (action) =>
      action.title('Start handling').grant('tickets', startPermission),
    )
    .action('complete', (action) =>
      action.title('Complete').grant('tickets', completePermission),
    ),
);

/**
 * Register the ticket collection, its record access and its composite with the
 * running application, and place it in the authorization workspace so an
 * administrator can grant the actions to a job. Called from the owning
 * provider's boot phase, after the authorization plugin has created its
 * services.
 */
export function registerTicketResources(authz: AppAuthorization): void {
  authz.database.collections.add({ name: 'tickets', title: 'Tickets' });
  authz.recordAccess.define(ticketSubmittedByMe);
  authz.compositeResources.define(tickets);
  authz.ui.sections.add({
    name: 'ticketService',
    title: 'IT service',
    parent: 'business',
  });
  authz.ui.place(tickets.reference(), { section: 'ticketService' });
}
