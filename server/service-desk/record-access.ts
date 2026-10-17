import { buildFilter } from '@nocobase/repository-input';
import {
  defineRecordAccess,
  type RecordAccessBuilder,
} from '@nocobase/authorization/core';
import type { DatabaseManager } from '@nocobase/db';
import {
  assigneeCommentsAccess,
  assigneeTicketsAccess,
  requesterCommentsAccess,
  requesterTicketsAccess,
  SERVICE_DESK_NAMESPACE,
} from './resources.js';

const ns = SERVICE_DESK_NAMESPACE;

export function createServiceDeskRecordAccess(database: DatabaseManager) {
  const ticketsBy = (
    key: string,
    field: 'requesterId' | 'assigneeId',
    titleKey: string,
  ) =>
    defineRecordAccess(key, (access: RecordAccessBuilder<string>) =>
      access
        .title({ key: titleKey, ns })
        .collections('serviceDeskTickets')
        .resolver(({ principal }) =>
          buildFilter((filter) => filter.string(field).eq(principal.id)),
        ),
    );

  const commentsBy = (
    key: string,
    ticketField: 'requesterId' | 'assigneeId',
    titleKey: string,
  ) =>
    defineRecordAccess(key, (access: RecordAccessBuilder<string>) =>
      access
        .title({ key: titleKey, ns })
        .collections('serviceDeskComments')
        .resolver(async ({ principal }) => {
          const tickets = await database
            .repository('serviceDeskTickets')
            .findMany({
              filter: buildFilter((filter) =>
                filter.string(ticketField).eq(principal.id),
              ),
              select: (select) => select.fields('id'),
            });
          if (tickets.length === 0) return false;
          const ticketIds = tickets.map((ticket) => Number(ticket.id));
          return buildFilter((filter) =>
            filter.or(
              ticketIds.map((ticketId) =>
                filter.number('ticketId').eq(ticketId),
              ),
            ),
          );
        }),
    );

  return [
    ticketsBy(
      requesterTicketsAccess.key,
      'requesterId',
      'serviceDesk.scopes.requesterTickets',
    ).build(),
    ticketsBy(
      assigneeTicketsAccess.key,
      'assigneeId',
      'serviceDesk.scopes.assigneeTickets',
    ).build(),
    commentsBy(
      requesterCommentsAccess.key,
      'requesterId',
      'serviceDesk.scopes.requesterComments',
    ).build(),
    commentsBy(
      assigneeCommentsAccess.key,
      'assigneeId',
      'serviceDesk.scopes.assigneeComments',
    ).build(),
  ];
}
