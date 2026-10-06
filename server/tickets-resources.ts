import { APP_NS } from '@nocobase/i18n';
import {
  defineCompositeResource,
  defineRecordAccess,
} from '@nocobase/authorization/core';
import {
  condition,
  defineDatabasePermission,
  recordAccess,
} from '@nocobase/app-plugin-authorization/server';

/**
 * The portable declaration of the IT repair-ticket business operations.
 *
 * Nothing here queries a database, registers a resource or grants access: the
 * builders are immutable values shared by the server provider that registers
 * them and the installation seeds that configure initial permission sets. Keep
 * the action names, data scope keys and record access keys stable — grants and
 * rules persist them.
 */

export const REPAIR_TICKETS_COLLECTION = 'repairTickets';
export const REPAIR_TICKETS_PAGE_ID = 'repair-tickets';
export const REPAIR_TICKETS_RESOURCE = 'it.repairTickets';

/** One independent record set the actions address. */
export const TICKET_SCOPE = 'tickets';

/** Record access that selects only the rows the signed-in user submitted. */
export const SUBMITTED_BY_ME_ACCESS = 'it.repairTickets.submittedByMe';

export const TICKET_ACTIONS = {
  view: 'view',
  create: 'create',
  start: 'start',
  complete: 'complete',
} as const;

export const TICKET_CATEGORIES = ['computer', 'account', 'other'] as const;
export const TICKET_STATUSES = ['pending', 'processing', 'completed'] as const;

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** The row shape the permission builders type-check their field lists against. */
export interface RepairTicketRow {
  id: string;
  title: string;
  category: string;
  description: string | null;
  status: string;
  resolution: string | null;
  submitterId: string;
  handlerId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// A title descriptor rather than a literal so the persisted workspace label
// travels through a translation key in the application's own namespace.
const title = (key: string) => ({ key, ns: APP_NS });

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
] as const satisfies readonly (keyof RepairTicketRow)[];

/** Employees may read only the tickets they submitted. */
export const submittedByMeAccess = defineRecordAccess(
  SUBMITTED_BY_ME_ACCESS,
  (access) =>
    access
      .title(title('tickets.authz.access.submittedByMe'))
      .collections(REPAIR_TICKETS_COLLECTION)
      .resolver(({ principal }) =>
        principal.type === 'user'
          ? condition('submitterId', '$eq', principal.id)
          : false,
      ),
);

/** The reference grants store; the builder above is what the provider registers. */
export const submittedByMe = submittedByMeAccess.reference();

/** Read a ticket. Output fields only, so a handler can load a row before editing it. */
const ticketRead = () =>
  defineDatabasePermission((permission) =>
    permission
      .collection<RepairTicketRow>(REPAIR_TICKETS_COLLECTION)
      .title(title('tickets.authz.collection'))
      .read(READ_FIELDS),
  );

/** Submit a ticket. Server-written assignment and timestamps are writable. */
const ticketCreate = () =>
  defineDatabasePermission((permission) =>
    permission
      .collection<RepairTicketRow>(REPAIR_TICKETS_COLLECTION)
      .title(title('tickets.authz.collection'))
      .read(READ_FIELDS)
      .create([
        'id',
        'title',
        'category',
        'description',
        'submitterId',
        'status',
        'createdAt',
        'updatedAt',
      ]),
  );

/** Claim and start a pending ticket. */
const ticketStart = () =>
  defineDatabasePermission((permission) =>
    permission
      .collection<RepairTicketRow>(REPAIR_TICKETS_COLLECTION)
      .title(title('tickets.authz.collection'))
      .read(READ_FIELDS)
      .update(['status', 'handlerId', 'startedAt', 'updatedAt']),
  );

/** Record the resolution and complete a ticket that is being handled. */
const ticketComplete = () =>
  defineDatabasePermission((permission) =>
    permission
      .collection<RepairTicketRow>(REPAIR_TICKETS_COLLECTION)
      .title(title('tickets.authz.collection'))
      .read(READ_FIELDS)
      .update(['status', 'resolution', 'completedAt', 'updatedAt']),
  );

/**
 * Viewing offers both record sets and defaults to "mine" so a grant that
 * chooses nothing cannot widen an employee to every ticket. The handling
 * actions address the whole collection; eligibility is decided by ticket state
 * in the route, not by the data scope.
 */
export const repairTickets = defineCompositeResource(
  REPAIR_TICKETS_RESOURCE,
  (resource) =>
    resource
      .title(title('tickets.authz.resource'))
      .action(TICKET_ACTIONS.view, (action) =>
        action
          .title(title('tickets.authz.action.view'))
          .grant(
            TICKET_SCOPE,
            ticketRead()
              .options(recordAccess.allRecords, submittedByMe)
              .default(submittedByMe),
          ),
      )
      .action(TICKET_ACTIONS.create, (action) =>
        action
          .title(title('tickets.authz.action.create'))
          .grant(
            TICKET_SCOPE,
            ticketCreate()
              .options(recordAccess.allRecords)
              .default(recordAccess.allRecords),
          ),
      )
      .action(TICKET_ACTIONS.start, (action) =>
        action
          .title(title('tickets.authz.action.start'))
          .grant(
            TICKET_SCOPE,
            ticketStart()
              .options(recordAccess.allRecords)
              .default(recordAccess.allRecords),
          ),
      )
      .action(TICKET_ACTIONS.complete, (action) =>
        action
          .title(title('tickets.authz.action.complete'))
          .grant(
            TICKET_SCOPE,
            ticketComplete()
              .options(recordAccess.allRecords)
              .default(recordAccess.allRecords),
          ),
      ),
);
