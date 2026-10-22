import {
  defineCompositeResource,
  defineRecordAccess,
} from '@nocobase/authorization/core';
import {
  condition,
  defineDatabasePermission,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';
import type { DatabaseManager } from '@nocobase/db';

const NS = 'nb3-factory';
const title = (key: string) => ({ key, ns: NS });

/** The fields a ticket page may read. */
const TICKET_READ_FIELDS = [
  'id',
  'ticketNo',
  'title',
  'description',
  'category',
  'priority',
  'status',
  'statusChangedAt',
  'lifecycleVersion',
  'reporterId',
  'assigneeId',
  'resolution',
  'resolvedAt',
  'closedAt',
  'lastReminderAt',
  'createdAt',
  'updatedAt',
] as const;

/** The fields a create action may write. Lifecycle fields are server-owned. */
const TICKET_CREATE_FIELDS = [
  'id',
  'ticketNo',
  'title',
  'description',
  'category',
  'priority',
  'reporterId',
  'assigneeId',
  'createdAt',
  'updatedAt',
] as const;

/** Fields the lifecycle writes when it moves the ticket. */
const TICKET_TRANSITION_FIELDS = [
  'assigneeId',
  'resolution',
  'resolvedAt',
  'closedAt',
  'lastReminderAt',
  'status',
  'statusChangedAt',
  'lifecycleVersion',
  'updatedAt',
] as const;

const ownTicketsDefinition = defineRecordAccess(
  'helpdesk.ownTickets',
  (access) =>
    access
      .title(title('helpdesk.scopes.ownTickets'))
      .description(title('helpdesk.scopes.ownTicketsDescription'))
      .collections('helpdeskTickets')
      .resolver(({ principal }) =>
        principal.type === 'user'
          ? condition('reporterId', '$eq', principal.id)
          : false,
      ),
);
export const ownTickets = ownTicketsDefinition.reference();

const assignedTicketsDefinition = defineRecordAccess(
  'helpdesk.assignedTickets',
  (access) =>
    access
      .title(title('helpdesk.scopes.assignedTickets'))
      .description(title('helpdesk.scopes.assignedTicketsDescription'))
      .collections('helpdeskTickets')
      .resolver(({ principal }) =>
        principal.type === 'user'
          ? condition('assigneeId', '$eq', principal.id)
          : false,
      ),
);
export const assignedTickets = assignedTicketsDefinition.reference();

const allTicketsDefinition = defineRecordAccess(
  'helpdesk.allTickets',
  (access) =>
    access
      .title(title('helpdesk.scopes.allTickets'))
      .description(title('helpdesk.scopes.allTicketsDescription'))
      .collections('helpdeskTickets')
      .resolver(() => true),
);
export const allTickets = allTicketsDefinition.reference();

/** Read access constrained to one of the ticket record-access selections. */
const ticketRead = defineDatabasePermission((p) =>
  p
    .collection<Record<string, unknown>>('helpdeskTickets')
    .title(title('helpdesk.resources.tickets'))
    .options(ownTickets, assignedTickets, allTickets)
    .default(ownTickets)
    .read([...TICKET_READ_FIELDS]),
);

/** Read access over every ticket, for the service-desk dashboard. */
const ticketAllRead = defineDatabasePermission((p) =>
  p
    .collection('helpdeskTickets')
    .title(title('helpdesk.resources.allTickets'))
    .options(allTickets)
    .default(allTickets)
    .read([...TICKET_READ_FIELDS]),
);

const ticketCreate = defineDatabasePermission((p) =>
  p
    .collection('helpdeskTickets')
    .title(title('helpdesk.resources.tickets'))
    .options(ownTickets, assignedTickets, allTickets)
    .default(ownTickets)
    .read([...TICKET_READ_FIELDS])
    .create([...TICKET_CREATE_FIELDS]),
);

const ticketTransition = defineDatabasePermission((p) =>
  p
    .collection('helpdeskTickets')
    .title(title('helpdesk.resources.tickets'))
    .options(ownTickets, assignedTickets, allTickets)
    .default(ownTickets)
    .read([...TICKET_READ_FIELDS])
    .update([...TICKET_TRANSITION_FIELDS]),
);

/**
 * The business operation. The lifecycle owns state changes; each action here
 * authorizes one of them, and the data scope chooses which tickets it applies
 * to. Creating a ticket is separate from viewing it.
 */
export const helpdeskTicketsResource = defineCompositeResource(
  'helpdesk.tickets',
  (resource) =>
    resource
      .title(title('helpdesk.resources.tickets'))
      .action('view', (action) =>
        action
          .title(title('helpdesk.actions.view'))
          .grant('helpdeskTickets', ticketRead),
      )
      .action('create', (action) =>
        action
          .title(title('helpdesk.actions.create'))
          .grant('helpdeskTickets', ticketCreate),
      )
      .action('assign', (action) =>
        action
          .title(title('helpdesk.actions.assign'))
          .grant('helpdeskTickets', ticketTransition),
      )
      .action('progress', (action) =>
        action
          .title(title('helpdesk.actions.progress'))
          .grant('helpdeskTickets', ticketTransition),
      )
      .action('resolve', (action) =>
        action
          .title(title('helpdesk.actions.resolve'))
          .grant('helpdeskTickets', ticketTransition),
      )
      .action('confirm', (action) =>
        action
          .title(title('helpdesk.actions.confirm'))
          .grant('helpdeskTickets', ticketTransition),
      )
      .action('return', (action) =>
        action
          .title(title('helpdesk.actions.return'))
          .grant('helpdeskTickets', ticketTransition),
      ),
);

/** Dashboard aggregates are a separate operation with an all-ticket scope. */
export const helpdeskDashboardResource = defineCompositeResource(
  'helpdesk.dashboard',
  (resource) =>
    resource
      .title(title('helpdesk.resources.dashboard'))
      .action('view', (action) =>
        action
          .title(title('helpdesk.actions.viewDashboard'))
          .grant('helpdeskTickets', ticketAllRead),
      ),
);

export function registerHelpdeskAuthorization(
  authz: AppAuthorization,
  database: DatabaseManager,
): void {
  authz.database.collections.add({
    name: 'helpdeskTickets',
    title: title('helpdesk.resources.tickets'),
    actions: ['read', 'create', 'update'],
  });

  authz.recordAccess.define(ownTicketsDefinition);
  authz.recordAccess.define(assignedTicketsDefinition);
  authz.recordAccess.define(allTicketsDefinition);

  const tickets = authz.compositeResources.define(helpdeskTicketsResource);
  const dashboard = authz.compositeResources.define(helpdeskDashboardResource);

  authz.ui.sections.add({
    name: 'helpdesk',
    title: title('helpdesk.sections.helpdesk'),
    parent: 'business',
  });
  authz.ui.place(tickets, { section: 'helpdesk' });
  authz.ui.place(dashboard, { section: 'helpdesk' });

  authz.settings.add({
    id: 'helpdesk.reminders',
    title: title('helpdesk.settings.reminders'),
    actions: [{ name: 'read' }, { name: 'update' }],
  });
  authz.ui.place(
    { type: 'settings', id: 'helpdesk.reminders' },
    { section: 'helpdesk' },
  );

  authz.settings.add({
    id: 'helpdesk.workflow',
    title: title('helpdesk.settings.workflow'),
    actions: [{ name: 'read' }],
  });
  authz.ui.place(
    { type: 'settings', id: 'helpdesk.workflow' },
    { section: 'helpdesk' },
  );

  // Keep this reference in the function: registering record access through the
  // service above uses the same database the resolvers read from. The parameter
  // is deliberately part of the signature so a future resolver that needs a
  // trusted lookup has it without changing the provider call.
  void database;
}
