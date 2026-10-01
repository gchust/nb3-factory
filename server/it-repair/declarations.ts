import { APP_NS } from '@nocobase/i18n';
import {
  condition,
  defineDatabasePermission,
  recordAccess,
  type DatabaseScope,
} from '@nocobase/app-plugin-authorization/server';
import {
  defineCompositeResource,
  defineRecordAccess,
  type AuthorizationTitle,
} from '@nocobase/authorization/core';

/**
 * Authorization declarations for the IT repair workflow (Issue #505).
 *
 * The workflow is modelled as one composite resource (`it.tickets`) whose
 * actions are the business operations `view`, `create`, `start` and `complete`.
 * A Permission Set binds each action to a record-access rule, so an
 * administrator grants a colleague the workflow by assigning a set — there is
 * no role check hard-coded in the route handlers.
 *
 * The strings here are shared with the client (which uses the same literals,
 * not imports, so the server module never enters the browser bundle).
 */

/** The Collection the workflow reads and writes. */
export const REPAIR_TICKET_COLLECTION = 'repairTickets';
/** The composite resource id; the page resource keeps the same id in its own type. */
export const REPAIR_TICKET_RESOURCE_ID = 'it.tickets';
/** The `page` resource id declared on the client route. */
export const REPAIR_TICKET_PAGE_ID = 'it.tickets';
/** The single data scope every composite action exposes. */
export const REPAIR_TICKET_SCOPE = 'tickets';

export const TICKET_CATEGORIES = ['computer', 'account', 'other'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_STATUSES = ['pending', 'processing', 'completed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** The columns the routes read and write, used to type the permission builders. */
export interface RepairTicketRow {
  id: number;
  title: string;
  category: string;
  description: string | null;
  status: string;
  resolution: string | null;
  submittedById: string;
  submittedByName: string;
  handlerId: string | null;
  handlerName: string | null;
  processingAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function localized(key: string): AuthorizationTitle {
  return { key, ns: APP_NS };
}

/**
 * The reporter's own tickets. The built-in `recordsIOwn` / `recordsICreated`
 * cannot be reused because they require an `ownerId` / `createdById` column.
 */
export const ownSubmittedTickets = defineRecordAccess(
  'ownSubmittedTickets',
  (access) =>
    access
      .title(localized('itRepair.recordAccess.ownSubmitted'))
      .description(localized('itRepair.recordAccess.ownSubmittedDescription'))
      .collections(REPAIR_TICKET_COLLECTION)
      .resolver(({ principal }): DatabaseScope =>
        condition('submittedById', '$eq', principal.id),
      ),
);

/** Record-access key for "every ticket"; used by permission-set grants. */
export const ALL_RECORDS_SCOPE = recordAccess.allRecords.key;
/** Record-access key for "the caller's own submissions"; used by permission-set grants. */
export const OWN_SUBMITTED_SCOPE = ownSubmittedTickets.reference().key;

/**
 * Reading one or many tickets. A reporter is offered only their own records; a
 * handler may be granted every record.
 */
export const ticketViewPermission = defineDatabasePermission((permission) =>
  permission
    .collection<RepairTicketRow>(REPAIR_TICKET_COLLECTION)
    .title(localized('itRepair.permission.view'))
    .options(recordAccess.allRecords, ownSubmittedTickets.reference())
    .default(recordAccess.allRecords)
    .read('*'),
);

/**
 * Creating a ticket. `read('*')` is required because the route returns the
 * created record; the write allowlist is exactly what the route assigns.
 */
export const ticketCreatePermission = defineDatabasePermission((permission) =>
  permission
    .collection<RepairTicketRow>(REPAIR_TICKET_COLLECTION)
    .title(localized('itRepair.permission.create'))
    .options(recordAccess.allRecords)
    .default(recordAccess.allRecords)
    .read('*')
    .create([
      'title',
      'category',
      'description',
      'submittedById',
      'submittedByName',
      'status',
      'createdAt',
      'updatedAt',
    ]),
);

/**
 * Advancing a ticket. Bound to both `start` and `complete`; the route enforces
 * the `pending → processing → completed` transition and the resolution note.
 */
export const ticketProcessPermission = defineDatabasePermission((permission) =>
  permission
    .collection<RepairTicketRow>(REPAIR_TICKET_COLLECTION)
    .title(localized('itRepair.permission.process'))
    .options(recordAccess.allRecords)
    .default(recordAccess.allRecords)
    .read('*')
    .update([
      'status',
      'handlerId',
      'handlerName',
      'processingAt',
      'completedAt',
      'resolution',
      'updatedAt',
    ]),
);

export const repairTicketsResource = defineCompositeResource(
  REPAIR_TICKET_RESOURCE_ID,
  (resource) =>
    resource
      .title(localized('itRepair.resource.title'))
      .action('view', (action) =>
        action
          .title(localized('itRepair.action.view'))
          .grant(REPAIR_TICKET_SCOPE, ticketViewPermission),
      )
      .action('create', (action) =>
        action
          .title(localized('itRepair.action.create'))
          .grant(REPAIR_TICKET_SCOPE, ticketCreatePermission),
      )
      .action('start', (action) =>
        action
          .title(localized('itRepair.action.start'))
          .grant(REPAIR_TICKET_SCOPE, ticketProcessPermission),
      )
      .action('complete', (action) =>
        action
          .title(localized('itRepair.action.complete'))
          .grant(REPAIR_TICKET_SCOPE, ticketProcessPermission),
      ),
);

/** Type-safe grant target for Permission Sets and UI placement. */
export const repairTickets = repairTicketsResource.reference();
