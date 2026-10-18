import { defineRecordAccess } from '@nocobase/authorization/core';
import { defineCompositeResource } from '@nocobase/authorization/core';
import {
  condition,
  defineDatabasePermission,
  recordAccess,
} from '@nocobase/app-plugin-authorization/server';
import type { TicketRecord } from './domain.js';

/**
 * The service desk's portable permission model. Code defines what the business
 * supports — the ticket actions, the fields each may write and the record
 * selections they accept — while the entities that grant it live in seeds and
 * the authorization backend, where an administrator can change them.
 *
 * Nothing here registers or persists anything; the provider registers these
 * declarations at boot and the seed references them when it creates the
 * initial permission sets.
 *
 * `TicketRecord` is passed as the row type so a write's field allowlist is
 * checked against the real ticket columns instead of accepting any string.
 */

/** A ticket is visible to the person it was raised by. */
export const assignedToMe = defineRecordAccess(
  'serviceDesk.assignedToMe',
  (access) =>
    access
      .title('Tickets assigned to me')
      .collections('tickets')
      .resolver(({ principal }) =>
        principal.type === 'user'
          ? condition('assigneeId', '$eq', principal.id)
          : false,
      ),
);

/** A ticket is visible to the person who raised it. */
export const myTickets = defineRecordAccess('serviceDesk.myTickets', (access) =>
  access
    .title('Tickets I raised')
    .collections('tickets')
    .resolver(({ principal }) =>
      principal.type === 'user'
        ? condition('requesterId', '$eq', principal.id)
        : false,
    ),
);

const ticketRead = defineDatabasePermission<TicketRecord, string>(
  (permission) => permission.collection<TicketRecord>('tickets').read('*'),
);

/**
 * Reading tickets accepts every selection; the narrowest one is the default so
 * a grant that forgets to name a scope cannot see more than its own tickets.
 */
const ticketView = ticketRead
  .options(
    recordAccess.allRecords,
    assignedToMe.reference(),
    myTickets.reference(),
  )
  .default(myTickets.reference());

/**
 * Every state-changing action also stamps the shared bookkeeping columns, so
 * each update allowlist has to name them. They are ordinary columns, not
 * generated ones, so a grant may write them.
 */
const TICKET_STATE_FIELDS = [
  'status',
  'statusChangedAt',
  'lifecycleVersion',
  'overdueNotifiedAt',
  'updatedAt',
] as const;

const ticketCreate = ticketRead
  .create('*')
  .options(recordAccess.allRecords)
  .default(recordAccess.allRecords);

const ticketAssign = ticketRead
  .update(['assigneeId', ...TICKET_STATE_FIELDS])
  .options(recordAccess.allRecords)
  .default(recordAccess.allRecords);

const ticketResolve = ticketRead
  .update(['resolution', ...TICKET_STATE_FIELDS])
  .options(recordAccess.allRecords, assignedToMe.reference())
  .default(assignedToMe.reference());

const ticketConfirm = ticketRead
  .update([...TICKET_STATE_FIELDS])
  .options(recordAccess.allRecords, myTickets.reference())
  .default(myTickets.reference());

const ticketComment = ticketRead
  .options(
    recordAccess.allRecords,
    assignedToMe.reference(),
    myTickets.reference(),
  )
  .default(myTickets.reference());

/**
 * The home view reuses the read permission, so an employee's dashboard counts
 * only their own tickets and an engineer's only the ones assigned to them; the
 * desk sees everything.
 */
const ticketDashboard = ticketRead
  .options(
    recordAccess.allRecords,
    assignedToMe.reference(),
    myTickets.reference(),
  )
  .default(recordAccess.allRecords);

/**
 * Every action the service desk can perform on a ticket. A data scope key names
 * the one collection that action touches; `tickets` is the only one, because a
 * note and the audit trail are child data of a ticket the caller has already
 * been allowed to see.
 */
export const serviceDeskTickets = defineCompositeResource(
  'serviceDesk.tickets',
  (resource) =>
    resource
      .title('Service tickets')
      .action('view', (action) =>
        action.title('View tickets').grant('tickets', ticketView),
      )
      .action('create', (action) =>
        action.title('Raise a ticket').grant('tickets', ticketCreate),
      )
      .action('assign', (action) =>
        action.title('Assign a ticket').grant('tickets', ticketAssign),
      )
      .action('resolve', (action) =>
        action.title('Resolve a ticket').grant('tickets', ticketResolve),
      )
      .action('confirm', (action) =>
        action.title('Confirm resolution').grant('tickets', ticketConfirm),
      )
      .action('return', (action) =>
        action.title('Return a ticket').grant('tickets', ticketConfirm),
      )
      .action('comment', (action) =>
        action.title('Comment on a ticket').grant('tickets', ticketComment),
      )
      .action('dashboard', (action) =>
        action.title('View the service desk').grant('tickets', ticketDashboard),
      ),
);

/** The composite resource id used by the routes and the service. */
export const SERVICE_DESK_RESOURCE = 'serviceDesk.tickets';
