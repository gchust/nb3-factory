import {
  defineCompositeResource,
  defineRecordAccess,
} from '@nocobase/authorization/core';
import {
  defineDatabasePermission,
  recordAccess,
} from '@nocobase/app-plugin-authorization/server';
import { buildFilter } from '@nocobase/repository-input';

/**
 * Portable declarations of the help desk's business operations.
 *
 * This module performs no registration and no queries, so the installation seeds can import the same references to
 * write the initial permission sets. The owning provider registers the record access, the collections and the
 * composite resource at boot; see `server/providers/helpdesk.ts`.
 */

/** The page id and composite resource id a ticket page declares in `authz`. */
export const TICKETS_PAGE = 'helpdesk.tickets';
export const TICKETS_RESOURCE = 'helpdesk.tickets';

/** The three jobs the feature ships with. */
export const EMPLOYEE_PERMISSION_SET = 'helpdesk-employee';
export const ENGINEER_PERMISSION_SET = 'helpdesk-engineer';
export const SERVICE_DESK_PERMISSION_SET = 'helpdesk-service-desk';

/** Every field a reader may see. */
export const TICKET_READ_FIELDS = [
  'id',
  'title',
  'description',
  'category',
  'priority',
  'status',
  'statusChangedAt',
  'lifecycleVersion',
  'reporterId',
  'reporterName',
  'assigneeId',
  'assigneeName',
  'resolution',
  'serviceDeskNote',
  'reopenReason',
  'reopenedCount',
  'screenshotIds',
  'resolvedAt',
  'closedAt',
  'lastReminderAt',
  'createdAt',
  'updatedAt',
] as const;

interface Ticket {
  id: string;
  title: string;
  description: string;
  category: string | null;
  priority: string;
  status: string;
  statusChangedAt: Date;
  lifecycleVersion: number;
  reporterId: string;
  reporterName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  resolution: string | null;
  serviceDeskNote: string | null;
  reopenReason: string | null;
  reopenedCount: number;
  screenshotIds: string[] | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  lastReminderAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * "Tickets I reported". The reporter owns the confirmation: only they close a resolution or send it back.
 */
export const reporterRecordAccess = defineRecordAccess(
  'helpdesk.reporter',
  (access) =>
    access
      .title('Tickets I reported')
      .collections('tickets')
      .resolver(({ principal }) =>
        principal.type === 'user'
          ? buildFilter((f) => f.string('reporterId').eq(principal.id))
          : false,
      ),
);
export const reporterAccess = reporterRecordAccess.reference();

/**
 * "Tickets assigned to me". An engineer works the tickets the service desk handed them.
 */
export const assignedRecordAccess = defineRecordAccess(
  'helpdesk.assigned',
  (access) =>
    access
      .title('Tickets assigned to me')
      .collections('tickets')
      .resolver(({ principal }) =>
        principal.type === 'user'
          ? buildFilter((f) => f.string('assigneeId').eq(principal.id))
          : false,
      ),
);
export const assignedAccess = assignedRecordAccess.reference();

const ticketRead = defineDatabasePermission((p) =>
  p
    .collection<Ticket>('tickets')
    .title('Tickets')
    .read([...TICKET_READ_FIELDS]),
);

/** A ticket is created by its reporter; the server writes the lifecycle fields. */
const ticketCreate = defineDatabasePermission((p) =>
  p
    .collection<Ticket>('tickets')
    .title('Tickets')
    .create([
      'title',
      'description',
      'category',
      'priority',
      'reporterId',
      'reporterName',
      'screenshotIds',
    ]),
);

interface TicketComment {
  id: string;
  ticketId: string;
  authorId: string;
  authorName: string;
  kind: string;
  body: string;
  createdAt: Date;
}

const commentCreate = defineDatabasePermission((p) =>
  p
    .collection<TicketComment>('ticketComments')
    .title('Ticket comments')
    .create(['ticketId', 'authorId', 'authorName', 'kind', 'body']),
);

/** Read a ticket under one of the three scopes the product supports. */
const readable = () =>
  ticketRead
    .options(reporterAccess, assignedAccess, recordAccess.allRecords)
    .default(reporterAccess);

export const tickets = defineCompositeResource(TICKETS_RESOURCE, (resource) =>
  resource
    .title('Tickets')
    // Any of the three jobs may read tickets, each through its own scope.
    .action('view', (action) =>
      action.title('View tickets').grant('tickets', readable()),
    )
    // An employee opens a ticket and attaches screenshots.
    .action('create', (action) =>
      action
        .title('Submit a ticket')
        .grant(
          'tickets',
          ticketCreate
            .options(recordAccess.allRecords)
            .default(recordAccess.allRecords),
        ),
    )
    // A comment is added to a ticket the author can already read.
    .action('comment', (action) =>
      action
        .title('Comment on a ticket')
        .grant('tickets', readable())
        .grant(
          'ticketComments',
          commentCreate
            .options(recordAccess.allRecords)
            .default(recordAccess.allRecords),
        ),
    )
    // The service desk picks the engineer.
    .action('assign', (action) =>
      action
        .title('Assign a ticket')
        .grant(
          'tickets',
          ticketRead
            .options(recordAccess.allRecords)
            .default(recordAccess.allRecords)
            .update([
              'assigneeId',
              'assigneeName',
              'priority',
              'category',
              'serviceDeskNote',
            ]),
        ),
    )
    // The assigned engineer begins work.
    .action('start', (action) =>
      action
        .title('Start processing')
        .grant(
          'tickets',
          ticketRead
            .options(assignedAccess, recordAccess.allRecords)
            .default(assignedAccess),
        ),
    )
    // The assigned engineer records the resolution.
    .action('resolve', (action) =>
      action
        .title('Record a resolution')
        .grant(
          'tickets',
          ticketRead
            .options(assignedAccess, recordAccess.allRecords)
            .default(assignedAccess)
            .update(['resolution']),
        ),
    )
    // The reporter accepts the resolution and closes the ticket.
    .action('confirm', (action) =>
      action
        .title('Confirm the resolution')
        .grant(
          'tickets',
          ticketRead.options(reporterAccess).default(reporterAccess),
        ),
    )
    // The reporter sends a resolution back for further processing.
    .action('reopen', (action) =>
      action
        .title('Return for further processing')
        .grant(
          'tickets',
          ticketRead
            .options(reporterAccess)
            .default(reporterAccess)
            .update(['reopenReason']),
        ),
    )
    // The service desk's overview: unassigned, overdue and each engineer's workload.
    .action('dashboard', (action) =>
      action
        .title('Service desk dashboard')
        .grant(
          'tickets',
          ticketRead
            .options(recordAccess.allRecords)
            .default(recordAccess.allRecords),
        ),
    ),
);

export const ticketsReference = tickets.reference();
