import { defineCompositeResource } from '@nocobase/authorization/core';
import { defineDatabasePermission } from '@nocobase/app-plugin-authorization/server';

export const SERVICE_DESK_NAMESPACE = 'nb3-factory';
export const SERVICE_DESK_TICKET_RESOURCE = 'serviceDesk.tickets';

export type TicketStatus = 'open' | 'assigned' | 'resolved' | 'closed';
export type TicketPriority = 'urgent' | 'high' | 'normal' | 'low';

export interface TicketAttachmentSnapshot {
  id: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface TicketRow {
  id: number;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  requesterId: string;
  assigneeId: string | null;
  resolution: string | null;
  slaDueAt: Date | string;
  assignedAt: Date | string | null;
  resolvedAt: Date | string | null;
  closedAt: Date | string | null;
  reopenedAt: Date | string | null;
  overdueNotifiedAt: Date | string | null;
  commentCount: number;
  attachments: readonly TicketAttachmentSnapshot[] | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface CommentRow {
  id: number;
  ticketId: number;
  authorId: string;
  kind:
    'created' | 'comment' | 'assigned' | 'resolved' | 'reopened' | 'confirmed';
  body: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export const requesterTicketsAccess = {
  key: 'serviceDesk.requesterTickets',
  collections: ['serviceDeskTickets'],
} as const;

export const assigneeTicketsAccess = {
  key: 'serviceDesk.assigneeTickets',
  collections: ['serviceDeskTickets'],
} as const;

export const requesterCommentsAccess = {
  key: 'serviceDesk.requesterComments',
  collections: ['serviceDeskComments'],
} as const;

export const assigneeCommentsAccess = {
  key: 'serviceDesk.assigneeComments',
  collections: ['serviceDeskComments'],
} as const;

function label(key: string) {
  return { key, ns: SERVICE_DESK_NAMESPACE };
}

const ticketViewData = defineDatabasePermission<TicketRow, string>(
  (permission) =>
    permission
      .collection<TicketRow>('serviceDeskTickets')
      .title(label('serviceDesk.resources.tickets'))
      .read([
        'id',
        'title',
        'description',
        'status',
        'priority',
        'requesterId',
        'assigneeId',
        'resolution',
        'slaDueAt',
        'assignedAt',
        'resolvedAt',
        'closedAt',
        'reopenedAt',
        'commentCount',
        'attachments',
        'createdAt',
        'updatedAt',
      ]),
);

const ticketCreateData = defineDatabasePermission<TicketRow, string>(
  (permission) =>
    permission
      .collection<TicketRow>('serviceDeskTickets')
      .title(label('serviceDesk.resources.tickets'))
      .read(['id', 'title', 'status', 'requesterId', 'assigneeId'])
      .create([
        'title',
        'description',
        'status',
        'priority',
        'requesterId',
        'slaDueAt',
        'commentCount',
        'attachments',
        'createdAt',
        'updatedAt',
      ]),
);

const ticketAssignData = defineDatabasePermission<TicketRow, string>(
  (permission) =>
    permission
      .collection<TicketRow>('serviceDeskTickets')
      .title(label('serviceDesk.resources.tickets'))
      .read(['id', 'title', 'status', 'assigneeId', 'slaDueAt'])
      .update([
        'assigneeId',
        'status',
        'assignedAt',
        'overdueNotifiedAt',
        'updatedAt',
      ]),
);

const ticketCommentData = defineDatabasePermission<TicketRow, string>(
  (permission) =>
    permission
      .collection<TicketRow>('serviceDeskTickets')
      .title(label('serviceDesk.resources.tickets'))
      .read([
        'id',
        'title',
        'status',
        'requesterId',
        'assigneeId',
        'commentCount',
        'slaDueAt',
        'assignedAt',
      ])
      .update(['commentCount', 'updatedAt']),
);

const ticketResolveData = defineDatabasePermission<TicketRow, string>(
  (permission) =>
    permission
      .collection<TicketRow>('serviceDeskTickets')
      .title(label('serviceDesk.resources.tickets'))
      .read([
        'id',
        'title',
        'status',
        'requesterId',
        'assigneeId',
        'slaDueAt',
        'assignedAt',
      ])
      .update(['status', 'resolution', 'resolvedAt', 'updatedAt']),
);

const ticketConfirmData = defineDatabasePermission<TicketRow, string>(
  (permission) =>
    permission
      .collection<TicketRow>('serviceDeskTickets')
      .title(label('serviceDesk.resources.tickets'))
      .read([
        'id',
        'title',
        'status',
        'requesterId',
        'assigneeId',
        'resolvedAt',
        'slaDueAt',
      ])
      .update(['status', 'closedAt', 'updatedAt']),
);

const ticketReopenData = defineDatabasePermission<TicketRow, string>(
  (permission) =>
    permission
      .collection<TicketRow>('serviceDeskTickets')
      .title(label('serviceDesk.resources.tickets'))
      .read([
        'id',
        'title',
        'status',
        'requesterId',
        'assigneeId',
        'slaDueAt',
        'assignedAt',
      ])
      .update([
        'status',
        'resolution',
        'resolvedAt',
        'closedAt',
        'reopenedAt',
        'overdueNotifiedAt',
        'updatedAt',
      ]),
);

const commentViewData = defineDatabasePermission<CommentRow, string>(
  (permission) =>
    permission
      .collection<CommentRow>('serviceDeskComments')
      .title(label('serviceDesk.resources.comments'))
      .read(['id', 'ticketId', 'authorId', 'kind', 'body', 'createdAt']),
);

const commentCreateData = defineDatabasePermission<CommentRow, string>(
  (permission) =>
    permission
      .collection<CommentRow>('serviceDeskComments')
      .title(label('serviceDesk.resources.comments'))
      .read(['id'])
      .create([
        'ticketId',
        'authorId',
        'kind',
        'body',
        'createdAt',
        'updatedAt',
      ]),
);

const ticketScopes = [requesterTicketsAccess, assigneeTicketsAccess] as const;
const commentScopes = [
  requesterCommentsAccess,
  assigneeCommentsAccess,
] as const;

function allRecordsFor(collection: string) {
  return { key: 'allRecords', collections: [collection] } as const;
}

export const serviceDeskTickets = defineCompositeResource(
  SERVICE_DESK_TICKET_RESOURCE,
  (resource) =>
    resource
      .title(label('serviceDesk.serviceDeskTickets'))
      .action('view', (action) =>
        action
          .title(label('serviceDesk.actions.view'))
          .grant(
            'tickets',
            ticketViewData.options(
              ...ticketScopes,
              allRecordsFor('serviceDeskTickets'),
            ),
          )
          .grant(
            'comments',
            commentViewData.options(
              ...commentScopes,
              allRecordsFor('serviceDeskComments'),
            ),
          ),
      )
      .action('create', (action) =>
        action
          .title(label('serviceDesk.actions.create'))
          .grant(
            'tickets',
            ticketCreateData.options(allRecordsFor('serviceDeskTickets')),
          )
          .grant(
            'comments',
            commentCreateData.options(allRecordsFor('serviceDeskComments')),
          ),
      )
      .action('assign', (action) =>
        action
          .title(label('serviceDesk.actions.assign'))
          .grant(
            'tickets',
            ticketAssignData.options(allRecordsFor('serviceDeskTickets')),
          )
          .grant(
            'comments',
            commentCreateData.options(allRecordsFor('serviceDeskComments')),
          ),
      )
      .action('comment', (action) =>
        action
          .title(label('serviceDesk.actions.comment'))
          .grant(
            'tickets',
            ticketCommentData.options(
              ...ticketScopes,
              allRecordsFor('serviceDeskTickets'),
            ),
          )
          .grant(
            'comments',
            commentCreateData.options(allRecordsFor('serviceDeskComments')),
          ),
      )
      .action('resolve', (action) =>
        action
          .title(label('serviceDesk.actions.resolve'))
          .grant(
            'tickets',
            ticketResolveData.options(
              assigneeTicketsAccess,
              allRecordsFor('serviceDeskTickets'),
            ),
          )
          .grant(
            'comments',
            commentCreateData.options(allRecordsFor('serviceDeskComments')),
          ),
      )
      .action('confirm', (action) =>
        action
          .title(label('serviceDesk.actions.confirm'))
          .grant(
            'tickets',
            ticketConfirmData.options(
              requesterTicketsAccess,
              allRecordsFor('serviceDeskTickets'),
            ),
          )
          .grant(
            'comments',
            commentCreateData.options(allRecordsFor('serviceDeskComments')),
          ),
      )
      .action('reopen', (action) =>
        action
          .title(label('serviceDesk.actions.reopen'))
          .grant(
            'tickets',
            ticketReopenData.options(
              requesterTicketsAccess,
              allRecordsFor('serviceDeskTickets'),
            ),
          )
          .grant(
            'comments',
            commentCreateData.options(allRecordsFor('serviceDeskComments')),
          ),
      ),
);
