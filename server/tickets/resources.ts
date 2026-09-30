import {
  condition,
  defineDatabasePermission,
} from '@nocobase/app-plugin-authorization/server';
import {
  defineCompositeResource,
  defineRecordAccess,
} from '@nocobase/authorization/core';

/**
 * The IT support ticket domain.
 *
 * This module is portable: it declares what the feature can do and which
 * records an action reaches, without touching a database or an application.
 * `server/providers/tickets.ts` registers the declarations at boot, the seed
 * data selects grants from them, and the routes enforce them per request.
 */

/** A ticket's lifecycle. `pending` is where every new ticket starts. */
export const TICKET_STATUSES = ['pending', 'in_progress', 'completed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** The only categories an employee may choose when submitting a ticket. */
export const TICKET_CATEGORIES = ['computer', 'account', 'other'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export interface Ticket {
  id: number;
  title: string;
  category: string;
  description: string | null;
  status: string;
  resolution: string | null;
  submitterId: string;
  handlerId: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  handledAt: string | Date | null;
}

/** Every column a reader may receive. */
const READ_FIELDS = [
  'id',
  'title',
  'category',
  'description',
  'status',
  'resolution',
  'submitterId',
  'handlerId',
  'createdAt',
  'updatedAt',
  'handledAt',
] as const;

/** The server writes `status`, `submitterId` and the timestamps on creation. */
const CREATE_FIELDS = [
  'title',
  'category',
  'description',
  'status',
  'submitterId',
  'createdAt',
  'updatedAt',
] as const;

const START_FIELDS = ['status', 'handlerId', 'updatedAt'] as const;

const COMPLETE_FIELDS = [
  'status',
  'resolution',
  'handledAt',
  'updatedAt',
] as const;

export const ticketView = defineDatabasePermission((p) =>
  p
    .collection<Ticket>('tickets')
    .title('Ticket records')
    .read([...READ_FIELDS]),
);

export const ticketCreate = defineDatabasePermission((p) =>
  p
    .collection<Ticket>('tickets')
    .title('Ticket submission')
    // `createOne` reads the inserted record back, so submission also needs the
    // read side of the columns it returns. The action's record scope decides
    // which rows that read reaches; it is the submitter's own for an employee.
    .read([...READ_FIELDS])
    .create([...CREATE_FIELDS]),
);

export const ticketStart = defineDatabasePermission((p) =>
  p
    .collection<Ticket>('tickets')
    .title('Ticket handling')
    .read([...READ_FIELDS])
    .update([...START_FIELDS]),
);

export const ticketComplete = defineDatabasePermission((p) =>
  p
    .collection<Ticket>('tickets')
    .title('Ticket resolution')
    .read([...READ_FIELDS])
    .update([...COMPLETE_FIELDS]),
);

/**
 * `it.ownsTickets` — the submitter sees their own tickets.
 *
 * The built-in `recordsIOwn` requires an `ownerId` column, and this table names
 * its owner `submitterId`, so the selection is declared here rather than by
 * parameterising the built-in. A non-user principal is answered with `false`
 * (nothing), never with every record.
 */
export const ticketOwnership = defineRecordAccess('it.ownsTickets', (access) =>
  access
    .title('Submitted by me')
    .collections('tickets')
    .resolver(({ principal }) =>
      principal.type === 'user'
        ? condition('submitterId', '$eq', principal.id)
        : false,
    ),
);

/**
 * The composite business operation. One data scope key, `tickets`, is bound to
 * the single collection every action writes; each action grants only the
 * fields and the operation that action needs.
 */
export const tickets = defineCompositeResource('it.tickets', (resource) =>
  resource
    .title('IT support tickets')
    .action('view', (action) =>
      action.title('View tickets').grant('tickets', ticketView),
    )
    .action('create', (action) =>
      action.title('Submit a ticket').grant('tickets', ticketCreate),
    )
    .action('start', (action) =>
      action.title('Start handling').grant('tickets', ticketStart),
    )
    .action('complete', (action) =>
      action.title('Resolve a ticket').grant('tickets', ticketComplete),
    ),
);
