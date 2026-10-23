import { defineCompositeResource } from '@nocobase/authorization/core';
import {
  condition,
  defineDatabasePermission,
} from '@nocobase/app-plugin-authorization/server';
import { defineRecordAccess } from '@nocobase/authorization/core';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';

import type { TicketRecord } from '../lifecycles/ticket-types.js';

/** The comment rows the ticket pages read and write. */
export interface TicketCommentRecord {
  id: string;
  ticketId: string;
  authorId: string;
  authorName: string;
  kind: 'comment' | 'resolution' | 'system';
  body: string;
  createdAt: string;
  updatedAt: string;
}

/*
 * Record access: how a permission set decides which tickets its holder may reach.
 *
 * The keys are business wording, not field names: a service desk set selects every ticket, an employee set the tickets
 * they reported, and an engineer set the tickets assigned to them. A person who holds two sets reaches the union,
 * because the authorization service combines the scopes of every matching grant.
 */
export const allTicketsAccess = defineRecordAccess(
  'tickets.allTickets',
  (access) =>
    access
      .title('All tickets / 全部工单')
      .collections('tickets')
      .resolver(() => true),
);

export const reportedByMeAccess = defineRecordAccess(
  'tickets.reportedByMe',
  (access) =>
    access
      .title('Reported by me / 我提交的工单')
      .collections('tickets')
      .resolver(({ principal }) =>
        principal.type === 'user'
          ? condition('reporterId', '$eq', principal.id)
          : false,
      ),
);

export const assignedToMeAccess = defineRecordAccess(
  'tickets.assignedToMe',
  (access) =>
    access
      .title('Assigned to me / 分派给我的工单')
      .collections('tickets')
      .resolver(({ principal }) =>
        principal.type === 'user'
          ? condition('assigneeId', '$eq', principal.id)
          : false,
      ),
);

/*
 * A comment's own scope is never narrowed: which ticket a comment may be attached to is decided by the ticket scope of
 * the same action, and the comment row itself is keyed by that ticket. The scope still has to exist and default to
 * something, because a data scope with no selection permits nothing.
 */
export const allCommentsAccess = defineRecordAccess(
  'tickets.allComments',
  (access) =>
    access
      .title('All comments / 全部工单留言')
      .collections('ticketComments')
      .resolver(() => true),
);

/*
 * Collection permissions: which fields each operation may touch. The read list is `*` so a page never has to be
 * changed when a display-only column is added; writes name the business fields the service desk or the lifecycle
 * actually sets, so a future endpoint cannot widen them by accident.
 */
const ticketRead = defineDatabasePermission((permission) =>
  permission
    .collection<TicketRecord>('tickets')
    .title('Repair tickets / 报修工单')
    .read('*')
    .options(
      allTicketsAccess.reference(),
      reportedByMeAccess.reference(),
      assignedToMeAccess.reference(),
    )
    .default(allTicketsAccess.reference()),
);

const ticketCreate = defineDatabasePermission((permission) =>
  permission
    .collection<TicketRecord>('tickets')
    .title('Report a ticket / 提交报修')
    .create('*')
    .options(allTicketsAccess.reference())
    .default(allTicketsAccess.reference()),
);

/*
 * Every action that moves a ticket carries the same read+update pair, so one authorization decision answers both
 * questions an endpoint asks: may this actor perform the verb, and which tickets may it perform it on. The update list
 * names the fields the service desk and the lifecycle actually write; a future endpoint cannot widen them by accident.
 */
const ticketMutate = defineDatabasePermission((permission) =>
  permission
    .collection<TicketRecord>('tickets')
    .title('Handle a ticket / 处理工单')
    .read('*')
    .update([
      'assigneeId',
      'assigneeName',
      'resolution',
      'resolvedAt',
      'closedAt',
      'reopenCount',
      'lastReopenedAt',
      'overdueNotifiedAt',
    ])
    .options(
      allTicketsAccess.reference(),
      reportedByMeAccess.reference(),
      assignedToMeAccess.reference(),
    )
    .default(allTicketsAccess.reference()),
);

const commentCreate = defineDatabasePermission((permission) =>
  permission
    .collection<TicketCommentRecord>('ticketComments')
    .title('Ticket comments / 工单沟通')
    .create(['ticketId', 'authorId', 'authorName', 'kind', 'body'])
    .options(allCommentsAccess.reference())
    .default(allCommentsAccess.reference()),
);

/**
 * The `tickets` business operation.
 *
 * Every action is a business verb rather than CRUD: `assign` is the service desk handing work out, `handle` is the
 * engineer moving it along, `confirm` is the reporter's decision to close or send it back. A permission set grants the
 * verbs a job performs and picks a record scope for each, and the server checks the verb — never the table.
 */
export const tickets = defineCompositeResource('tickets', (resource) =>
  resource
    .title('Repair tickets / 报修工单')
    .action('view', (action) =>
      action.title('View / 查看').grant('tickets', ticketRead),
    )
    .action('create', (action) =>
      action.title('Report / 提交报修').grant('tickets', ticketCreate),
    )
    .action('comment', (action) =>
      action
        .title('Comment / 留言')
        .grant('tickets', ticketRead)
        .grant('ticketComments', commentCreate),
    )
    .action('assign', (action) =>
      action.title('Assign / 分派').grant('tickets', ticketMutate),
    )
    .action('handle', (action) =>
      action.title('Handle / 处理').grant('tickets', ticketMutate),
    )
    .action('confirm', (action) =>
      action
        .title('Confirm, return or reopen / 确认、退回或重开')
        .grant('tickets', ticketMutate),
    )
    .action('dashboard', (action) =>
      action
        .title('Service desk overview / 服务台看板')
        .grant('tickets', ticketRead),
    )
    .action('lifecycle', (action) =>
      action
        .title('Process management / 流程管理')
        .grant('tickets', ticketRead),
    ),
);

/**
 * Registers the feature's permission model.
 *
 * A declaration grants nothing; the seeds select the actions and scopes each job starts with, and an administrator
 * changes them afterwards in the permission workspace. Registration only has to run once per process, in the owning
 * provider's `boot`.
 */
export function registerTicketAuthorization(authz: AppAuthorization): void {
  authz.database.collections.add({
    name: 'tickets',
    title: 'Repair tickets / 报修工单',
  });
  authz.database.collections.add({
    name: 'ticketComments',
    title: 'Ticket comments / 工单沟通',
  });

  authz.recordAccess.define(allTicketsAccess);
  authz.recordAccess.define(reportedByMeAccess);
  authz.recordAccess.define(assignedToMeAccess);
  authz.recordAccess.define(allCommentsAccess);

  const reference = authz.compositeResources.define(tickets);
  authz.ui.sections.add({
    name: 'ticket-management',
    title: 'IT service desk / IT 服务台',
    parent: 'business',
    order: 30,
  });
  authz.ui.place(reference, { section: 'ticket-management' });
}
