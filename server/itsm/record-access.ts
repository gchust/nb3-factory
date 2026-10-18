import { defineRecordAccess } from '@nocobase/authorization/core';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseManager } from '@nocobase/db';
import { buildFilter } from '@nocobase/repository-input';
import { TICKET_COLLECTION, TICKET_LOG_COLLECTION } from './resources.js';

/** Record access key for "tickets I raised". */
export const REQUESTER_ACCESS = 'itsm.requester';
/** Record access key for "tickets assigned to me". */
export const ASSIGNEE_ACCESS = 'itsm.assignee';

/**
 * The two record boundaries the service-desk jobs need. Both apply to the
 * ticket table and to its process-log table: for a log, the parent ticket's
 * owner or assignee decides, so the resolver first selects the ticket ids the
 * principal may see and then filters the logs by `ticketId`. An id list keeps
 * the check trusted and is measured against a small service desk, not a
 * general-purpose scale design.
 */
export function registerItsmRecordAccess(
  authz: AppAuthorization,
  database: DatabaseManager,
): void {
  authz.recordAccess.define(
    defineRecordAccess(REQUESTER_ACCESS, (access) =>
      access
        .title('Tickets I raised')
        .description(
          'Tickets the current user submitted, and their process logs.',
        )
        .collections(TICKET_COLLECTION, TICKET_LOG_COLLECTION)
        .resolver(async ({ principal, collection }) => {
          if (principal.type !== 'user') return false;
          if (collection === TICKET_COLLECTION) {
            return buildFilter((f) => f.string('requesterId').eq(principal.id));
          }
          const ids = await ticketIds(database, 'requesterId', principal.id);
          return logFilter(ids);
        }),
    ),
  );

  authz.recordAccess.define(
    defineRecordAccess(ASSIGNEE_ACCESS, (access) =>
      access
        .title('Tickets assigned to me')
        .description(
          'Tickets the current user is handling, and their process logs.',
        )
        .collections(TICKET_COLLECTION, TICKET_LOG_COLLECTION)
        .resolver(async ({ principal, collection }) => {
          if (principal.type !== 'user') return false;
          if (collection === TICKET_COLLECTION) {
            return buildFilter((f) => f.string('assigneeId').eq(principal.id));
          }
          const ids = await ticketIds(database, 'assigneeId', principal.id);
          return logFilter(ids);
        }),
    ),
  );
}

async function ticketIds(
  database: DatabaseManager,
  column: 'requesterId' | 'assigneeId',
  userId: string,
): Promise<number[]> {
  // The raw query adapter names the physical table, which the collection's
  // `underscored` naming turns `serviceTickets` into. Selecting through the
  // Repository instead would use the logical name, but this resolver is given
  // a DatabaseManager and the id list it builds is the same either way.
  const rows = await database
    .connection()
    .query.selectFrom('service_tickets')
    .select('id')
    .where(column, '=', userId)
    .execute();
  return rows.map((row) => row.id as number);
}

/**
 * A log filter for a set of parent tickets. No tickets means no logs, which is
 * `false` rather than an empty id list — an empty filter would mean "all".
 */
function logFilter(ids: readonly number[]) {
  if (ids.length === 0) return false;
  return buildFilter((f) => f.or(ids.map((id) => f.number('ticketId').eq(id))));
}
