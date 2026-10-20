import {
  defineDatabasePermission,
  recordAccess,
} from '@nocobase/app-plugin-authorization/server';
import {
  condition,
  type DatabaseScope,
} from '@nocobase/app-plugin-authorization/server';
import {
  defineCompositeResource,
  defineRecordAccess,
} from '@nocobase/authorization/core';
import type { AuthorizationTitle } from '@nocobase/authorization/core';

export interface TicketRow {
  id: string;
  ticketNo: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  requesterId: string;
  assigneeId: string | null;
  resolution: string | null;
  closeNote: string | null;
  cancelReason: string | null;
  statusChangedAt: Date;
  lifecycleVersion: number;
  resolvedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const title = (key: string): AuthorizationTitle => ({
  key,
  ns: 'nb3-factory',
});

const TICKET_READ_FIELDS = [
  'id',
  'ticketNo',
  'title',
  'description',
  'category',
  'priority',
  'status',
  'requesterId',
  'assigneeId',
  'resolution',
  'closeNote',
  'cancelReason',
  'statusChangedAt',
  'lifecycleVersion',
  'resolvedAt',
  'closedAt',
  'createdAt',
  'updatedAt',
] as const;

type TicketUpdateField =
  | 'assigneeId'
  | 'status'
  | 'resolution'
  | 'closeNote'
  | 'cancelReason'
  | 'statusChangedAt'
  | 'lifecycleVersion'
  | 'resolvedAt'
  | 'closedAt'
  | 'updatedAt';

const TICKET_CREATE_FIELDS = [
  'id',
  'ticketNo',
  'title',
  'description',
  'category',
  'priority',
  'status',
  'requesterId',
  'statusChangedAt',
  'lifecycleVersion',
  'createdAt',
  'updatedAt',
] as const;

export const ownTicketsDefinition = defineRecordAccess(
  'helpdesk.ownTickets',
  (access) =>
    access
      .title(title('helpdesk.authorization.resources.ownTickets'))
      .description(
        title('helpdesk.authorization.resources.ownTicketsDescription'),
      )
      .collections('tickets')
      .resolver((context) =>
        condition('requesterId', '$eq', context.principal.id),
      ),
);
export const ownTickets = ownTicketsDefinition.reference();

export const engineerTicketsDefinition = defineRecordAccess(
  'helpdesk.engineerTickets',
  (access) =>
    access
      .title(title('helpdesk.authorization.resources.engineerTickets'))
      .description(
        title('helpdesk.authorization.resources.engineerTicketsDescription'),
      )
      .collections('tickets')
      .resolver((context): DatabaseScope =>
        condition('assigneeId', '$eq', context.principal.id),
      ),
);
export const engineerTickets = engineerTicketsDefinition.reference();

const readTickets = defineDatabasePermission<TicketRow, string>((permission) =>
  permission
    .collection<TicketRow>('tickets')
    .title(title('helpdesk.authorization.resources.readTickets'))
    .read(TICKET_READ_FIELDS),
);

const writeTickets = (
  fields: TicketUpdateField[],
  actionTitle: AuthorizationTitle,
) =>
  defineDatabasePermission<TicketRow, string>((permission) =>
    permission
      .collection<TicketRow>('tickets')
      .title(actionTitle)
      .read(TICKET_READ_FIELDS)
      .update(fields),
  );

const createTickets = defineDatabasePermission<TicketRow, string>(
  (permission) =>
    permission
      .collection<TicketRow>('tickets')
      .title(title('helpdesk.authorization.resources.createTickets'))
      .create(TICKET_CREATE_FIELDS),
);

const assignTickets = writeTickets(
  ['assigneeId'],
  title('helpdesk.authorization.resources.assignTickets'),
);
const claimTickets = writeTickets(
  ['assigneeId'],
  title('helpdesk.authorization.resources.claimTickets'),
);
const startTickets = writeTickets(
  ['assigneeId'],
  title('helpdesk.authorization.resources.startTickets'),
);
const resolveTickets = writeTickets(
  ['resolution', 'resolvedAt'],
  title('helpdesk.authorization.resources.resolveTickets'),
);
const reopenTickets = writeTickets(
  ['assigneeId', 'resolvedAt', 'closedAt'],
  title('helpdesk.authorization.resources.reopenTickets'),
);
const closeTickets = writeTickets(
  ['closeNote', 'closedAt'],
  title('helpdesk.authorization.resources.closeTickets'),
);
const cancelTickets = writeTickets(
  ['cancelReason'],
  title('helpdesk.authorization.resources.cancelTickets'),
);
const escalateTickets = writeTickets(
  [],
  title('helpdesk.authorization.resources.escalateTickets'),
);

/**
 * Composite actions are the business verbs. Each one expands into a ticket
 * collection grant carrying the action's record-access scope, so the same
 * stored permission set works both for the API route and for the list query.
 */
export const ticketResourceDefinition = defineCompositeResource(
  'helpdesk.tickets',
  (resource) =>
    resource
      .title(title('helpdesk.authorization.resources.tickets'))
      .action('view', (action) =>
        action
          .title(title('helpdesk.authorization.resources.viewTickets'))
          .grant('ticket', readTickets),
      )
      .action('create', (action) =>
        action
          .title(title('helpdesk.authorization.resources.createTicket'))
          .grant('ticket', createTickets),
      )
      .action('claim', (action) =>
        action
          .title(title('helpdesk.authorization.resources.claimTicket'))
          .grant('ticket', claimTickets),
      )
      .action('assign', (action) =>
        action
          .title(title('helpdesk.authorization.resources.assignTicket'))
          .grant('ticket', assignTickets),
      )
      .action('start', (action) =>
        action
          .title(title('helpdesk.authorization.resources.startTicket'))
          .grant('ticket', startTickets),
      )
      .action('resolve', (action) =>
        action
          .title(title('helpdesk.authorization.resources.resolveTicket'))
          .grant('ticket', resolveTickets),
      )
      .action('reopen', (action) =>
        action
          .title(title('helpdesk.authorization.resources.reopenTicket'))
          .grant('ticket', reopenTickets),
      )
      .action('close', (action) =>
        action
          .title(title('helpdesk.authorization.resources.closeTicket'))
          .grant('ticket', closeTickets),
      )
      .action('cancel', (action) =>
        action
          .title(title('helpdesk.authorization.resources.cancelTicket'))
          .grant('ticket', cancelTickets),
      )
      .action('escalate', (action) =>
        action
          .title(title('helpdesk.authorization.resources.escalateTicket'))
          .grant('ticket', escalateTickets),
      )
      .action('comment', (action) =>
        action
          .title(title('helpdesk.authorization.resources.commentTicket'))
          .grant('ticket', readTickets),
      )
      .action('attach', (action) =>
        action
          .title(title('helpdesk.authorization.resources.attachTicket'))
          .grant('ticket', readTickets),
      ),
);
export const ticketResource = ticketResourceDefinition.reference();

export const TICKET_ACTIONS = [
  'view',
  'create',
  'claim',
  'assign',
  'start',
  'resolve',
  'reopen',
  'close',
  'cancel',
  'escalate',
  'comment',
  'attach',
] as const;

export type TicketAction = (typeof TICKET_ACTIONS)[number];

export const TICKET_RESOURCE_METADATA = {
  ownTickets,
  engineerTickets,
  allRecords: recordAccess.allRecords,
  ticketResource,
};
