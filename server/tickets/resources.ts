import { APP_NS } from '@nocobase/i18n';
import {
  defineCompositeResource,
  defineRecordAccess,
} from '@nocobase/authorization/core';
import {
  defineDatabasePermission,
  recordAccess,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';
import type { DatabaseManager } from '@nocobase/db';
import { buildFilter } from '@nocobase/repository-input';

export interface TicketRow {
  id: string;
  ticketNo: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  category: string;
  requesterId: string;
  assigneeId: string | null;
  resolvedAt: string | Date | null;
  closedAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface TicketCommentRow {
  id: string;
  ticketId: string;
  authorId: string;
  body: string;
  internal: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface TicketScreenshotRow {
  id: string;
  ticketId: string;
  fileId: string;
  commentId: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

const title = (key: string) => ({ key, ns: APP_NS });

const ticketData = defineDatabasePermission<TicketRow, string>((permission) =>
  permission
    .collection<TicketRow>('tickets')
    .title(title('tickets.authorization.collections.tickets'))
    .default(recordAccess.recordsIOwn)
    .read([
      'id',
      'ticketNo',
      'title',
      'description',
      'status',
      'priority',
      'category',
      'requesterId',
      'assigneeId',
      'resolvedAt',
      'closedAt',
      'createdAt',
      'updatedAt',
    ])
    .create([
      'id',
      'ticketNo',
      'title',
      'description',
      'priority',
      'category',
      'requesterId',
      'assigneeId',
      'status',
      'resolvedAt',
      'closedAt',
      'createdAt',
      'updatedAt',
    ])
    .update(['status', 'assigneeId', 'resolvedAt', 'closedAt', 'updatedAt']),
);

const commentData = defineDatabasePermission<TicketCommentRow, string>(
  (permission) =>
    permission
      .collection<TicketCommentRow>('ticketComments')
      .title(title('tickets.authorization.collections.comments'))
      .default(recordAccess.recordsIOwn)
      .read([
        'id',
        'ticketId',
        'authorId',
        'body',
        'internal',
        'createdAt',
        'updatedAt',
      ])
      .create([
        'id',
        'ticketId',
        'authorId',
        'body',
        'internal',
        'createdAt',
        'updatedAt',
      ]),
);

const screenshotData = defineDatabasePermission<TicketScreenshotRow, string>(
  (permission) =>
    permission
      .collection<TicketScreenshotRow>('ticketScreenshots')
      .title(title('tickets.authorization.collections.screenshots'))
      .default(recordAccess.recordsIOwn)
      .read(['id', 'ticketId', 'fileId', 'commentId', 'createdAt', 'updatedAt'])
      .create([
        'id',
        'ticketId',
        'fileId',
        'commentId',
        'createdAt',
        'updatedAt',
      ]),
);

export const ticketsResource = defineCompositeResource(
  'support.tickets',
  (resource) =>
    resource
      .title(title('tickets.authorization.resource'))
      .action('view', (action) =>
        action
          .title(title('tickets.authorization.actions.view'))
          .grant('tickets', ticketData)
          .grant('comments', commentData)
          .grant('screenshots', screenshotData),
      )
      .action('create', (action) =>
        action
          .title(title('tickets.authorization.actions.create'))
          .grant('tickets', ticketData),
      )
      .action('comment', (action) =>
        action
          .title(title('tickets.authorization.actions.comment'))
          .grant('tickets', ticketData)
          .grant('comments', commentData),
      )
      .action('commentInternal', (action) =>
        action
          .title(title('tickets.authorization.actions.commentInternal'))
          .grant('tickets', ticketData)
          .grant('comments', commentData),
      )
      .action('attach', (action) =>
        action
          .title(title('tickets.authorization.actions.attach'))
          .grant('tickets', ticketData)
          .grant('comments', commentData)
          .grant('screenshots', screenshotData),
      )
      .action('download', (action) =>
        action
          .title(title('tickets.authorization.actions.download'))
          .grant('tickets', ticketData)
          .grant('screenshots', screenshotData),
      )
      .action('accept', (action) =>
        action
          .title(title('tickets.authorization.actions.accept'))
          .grant('tickets', ticketData),
      )
      .action('assign', (action) =>
        action
          .title(title('tickets.authorization.actions.assign'))
          .grant('tickets', ticketData),
      )
      .action('resolve', (action) =>
        action
          .title(title('tickets.authorization.actions.resolve'))
          .grant('tickets', ticketData),
      )
      .action('close', (action) =>
        action
          .title(title('tickets.authorization.actions.close'))
          .grant('tickets', ticketData),
      )
      .action('reopen', (action) =>
        action
          .title(title('tickets.authorization.actions.reopen'))
          .grant('tickets', ticketData),
      ),
);

/**
 * Registers the ticket permission model. Record access resolvers need the
 * application's connection, so the definitions are built here rather than at
 * module load.
 */
export function registerTicketAuthorization(
  authz: AppAuthorization,
  database: DatabaseManager,
): void {
  authz.database.collections.add({
    name: 'tickets',
    title: title('tickets.authorization.collections.tickets'),
    actions: ['read', 'create', 'update'],
  });
  authz.database.collections.add({
    name: 'ticketComments',
    title: title('tickets.authorization.collections.comments'),
    actions: ['read', 'create'],
  });
  authz.database.collections.add({
    name: 'ticketScreenshots',
    title: title('tickets.authorization.collections.screenshots'),
    actions: ['read', 'create'],
  });

  const ownedTickets = defineRecordAccess('support.ownTickets', (access) =>
    access
      .title(title('tickets.authorization.scopes.ownTickets'))
      .collections('tickets')
      .resolver(({ principal }) =>
        buildFilter((filter) => filter.string('requesterId').eq(principal.id)),
      ),
  );
  const ownedComments = defineRecordAccess('support.ownComments', (access) =>
    access
      .title(title('tickets.authorization.scopes.ownComments'))
      .collections('ticketComments')
      .resolver(async ({ principal }) => {
        const ticketIds = await ownedTicketIds(database, principal.id);
        if (ticketIds.length === 0) return false;
        return buildFilter((filter) =>
          filter.and([
            filter.or(ticketIds.map((id) => filter.string('ticketId').eq(id))),
            filter.boolean('internal').isFalse(),
          ]),
        );
      }),
  );
  const assignedTickets = defineRecordAccess(
    'support.assignedTickets',
    (access) =>
      access
        .title(title('tickets.authorization.scopes.assignedTickets'))
        .collections('tickets')
        .resolver(({ principal }) =>
          buildFilter((filter) => filter.string('assigneeId').eq(principal.id)),
        ),
  );
  const assignedComments = defineRecordAccess(
    'support.assignedComments',
    (access) =>
      access
        .title(title('tickets.authorization.scopes.assignedComments'))
        .collections('ticketComments')
        .resolver(async ({ principal }) => {
          const ticketIds = await assignedTicketIds(database, principal.id);
          if (ticketIds.length === 0) return false;
          return buildFilter((filter) =>
            filter.or(ticketIds.map((id) => filter.string('ticketId').eq(id))),
          );
        }),
  );
  const assignedScreenshots = defineRecordAccess(
    'support.assignedScreenshots',
    (access) =>
      access
        .title(title('tickets.authorization.scopes.assignedScreenshots'))
        .collections('ticketScreenshots')
        .resolver(async ({ principal }) => {
          const ticketIds = await assignedTicketIds(database, principal.id);
          if (ticketIds.length === 0) return false;
          return buildFilter((filter) =>
            filter.or(ticketIds.map((id) => filter.string('ticketId').eq(id))),
          );
        }),
  );
  const ownedScreenshots = defineRecordAccess(
    'support.ownScreenshots',
    (access) =>
      access
        .title(title('tickets.authorization.scopes.ownScreenshots'))
        .collections('ticketScreenshots')
        .resolver(async ({ principal }) => {
          const ticketIds = await ownedTicketIds(database, principal.id);
          if (ticketIds.length === 0) return false;
          const comments = await database
            .connection()
            .query.selectFrom('ticketComments')
            .select('id')
            .where('internal', '=', false)
            .where('ticketId', 'in', ticketIds)
            .limit(500)
            .execute();
          const commentIds = comments.map((row) => String(row.id));
          return buildFilter((filter) =>
            filter.and([
              filter.or(
                ticketIds.map((id) => filter.string('ticketId').eq(id)),
              ),
              filter.or([
                filter.string('commentId').eq(null),
                ...commentIds.map((id) => filter.string('commentId').eq(id)),
              ]),
            ]),
          );
        }),
  );

  authz.recordAccess.define(ownedTickets);
  authz.recordAccess.define(ownedComments);
  authz.recordAccess.define(ownedScreenshots);
  authz.recordAccess.define(assignedTickets);
  authz.recordAccess.define(assignedComments);
  authz.recordAccess.define(assignedScreenshots);
  authz.compositeResources.define(ticketsResource);
  authz.ui.sections.add({
    name: 'support',
    title: title('tickets.authorization.section'),
    parent: 'business',
    order: 100,
    extend: true,
  });
  authz.ui.place(ticketsResource.reference(), {
    section: 'support',
    order: 100,
  });
}

async function assignedTicketIds(
  database: DatabaseManager,
  userId: string,
): Promise<string[]> {
  const rows = await database
    .connection()
    .query.selectFrom('tickets')
    .select('id')
    .where('assigneeId', '=', userId)
    .limit(500)
    .execute();
  return rows.map((row) => String(row.id));
}

async function ownedTicketIds(
  database: DatabaseManager,
  userId: string,
): Promise<string[]> {
  const rows = await database
    .connection()
    .query.selectFrom('tickets')
    .select('id')
    .where('requesterId', '=', userId)
    .limit(500)
    .execute();
  return rows.map((row) => String(row.id));
}
