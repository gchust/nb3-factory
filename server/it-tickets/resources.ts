/**
 * Authorization declarations for the IT repair feature.
 *
 * These are portable values: they describe what the business supports, which
 * fields each operation may read or write, and which record access an
 * administrator may choose. They grant nobody access on their own — the
 * permission sets in `database/seed-data/it-tickets.ts` select the scopes and
 * assign them.
 *
 * Each composite action composes exactly the grants listed, so every action
 * that loads a record before writing it grants `read` as well as the write:
 * the Repository refuses to return the record it just wrote under a policy
 * that denies reads.
 */
import {
  IT_TICKET_COLLECTION,
  IT_TICKET_RESOURCE,
  type ItTicketRow,
} from './domain.ts';

import {
  defineDatabasePermission,
  recordAccess,
} from '@nocobase/app-plugin-authorization/server';
import { defineCompositeResource } from '@nocobase/authorization/core';

const NS = 'nb3-factory';

/** Every scalar field the client and the service ever display. */
const READ_FIELDS = [
  'id',
  'title',
  'category',
  'description',
  'status',
  'ownerId',
  'handlerId',
  'resolution',
  'startedAt',
  'completedAt',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof ItTicketRow)[];

/** Read a ticket, limited to the records the administrator selects. */
const ticketRead = defineDatabasePermission((permission) =>
  permission
    .collection<ItTicketRow>(IT_TICKET_COLLECTION)
    .title({ key: 'itTickets.permission.read', ns: NS })
    .options(recordAccess.recordsIOwn, recordAccess.allRecords)
    .default(recordAccess.recordsIOwn)
    .read((read) => read.fields(...READ_FIELDS)),
);

/**
 * Submit a ticket. Create reads no record scope, so the read branch only
 * lets the service return the row it just inserted; the scope that matters is
 * the employee's own-record filter on every other action.
 */
const ticketCreate = defineDatabasePermission((permission) =>
  permission
    .collection<ItTicketRow>(IT_TICKET_COLLECTION)
    .title({ key: 'itTickets.permission.create', ns: NS })
    .options(recordAccess.recordsIOwn, recordAccess.allRecords)
    .default(recordAccess.recordsIOwn)
    .read((read) => read.fields(...READ_FIELDS))
    .create((create) =>
      create.fields(
        'id',
        'title',
        'category',
        'description',
        'status',
        'ownerId',
        'handlerId',
        'resolution',
        'startedAt',
        'completedAt',
        'createdAt',
        'updatedAt',
      ),
    ),
);

/** Claim a pending ticket. Only a handler scope reaches this action. */
const ticketStart = defineDatabasePermission((permission) =>
  permission
    .collection<ItTicketRow>(IT_TICKET_COLLECTION)
    .title({ key: 'itTickets.permission.start', ns: NS })
    .options(recordAccess.allRecords)
    .default(recordAccess.allRecords)
    .read((read) => read.fields(...READ_FIELDS))
    .update((update) =>
      update.fields('status', 'handlerId', 'startedAt', 'updatedAt'),
    ),
);

/** Close a ticket in progress, recording the handling note. */
const ticketComplete = defineDatabasePermission((permission) =>
  permission
    .collection<ItTicketRow>(IT_TICKET_COLLECTION)
    .title({ key: 'itTickets.permission.complete', ns: NS })
    .options(recordAccess.allRecords)
    .default(recordAccess.allRecords)
    .read((read) => read.fields(...READ_FIELDS))
    .update((update) =>
      update.fields('status', 'resolution', 'completedAt', 'updatedAt'),
    ),
);

export const itTicketsResource = defineCompositeResource(
  IT_TICKET_RESOURCE,
  (resource) =>
    resource
      .title({ key: 'itTickets.resource.title', ns: NS })
      .action('view', (action) =>
        action
          .title({ key: 'itTickets.action.view', ns: NS })
          .grant('tickets', ticketRead),
      )
      .action('create', (action) =>
        action
          .title({ key: 'itTickets.action.create', ns: NS })
          .grant('tickets', ticketCreate),
      )
      .action('start', (action) =>
        action
          .title({ key: 'itTickets.action.start', ns: NS })
          .grant('tickets', ticketStart),
      )
      .action('complete', (action) =>
        action
          .title({ key: 'itTickets.action.complete', ns: NS })
          .grant('tickets', ticketComplete),
      ),
);

export { ticketRead, ticketCreate, ticketStart, ticketComplete };
