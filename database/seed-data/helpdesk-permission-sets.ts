import type {
  AuthorizationTitle,
  PermissionGrant,
} from '@nocobase/authorization/core';
import { definePermissionSet } from '@nocobase/authorization/permission-sets';

const title = (key: string): AuthorizationTitle => ({
  key: `helpdesk.permissionSets.${key}`,
  ns: 'nb3-factory',
});

type TicketAction =
  | 'view'
  | 'create'
  | 'claim'
  | 'assign'
  | 'start'
  | 'resolve'
  | 'reopen'
  | 'close'
  | 'cancel'
  | 'comment'
  | 'attach';

/**
 * The composite grants these seeds store. Kept as plain data, without importing
 * `server/tickets/resources.ts`, so the seed file is loadable by the database
 * task runner from source as well as from the compiled application.
 */
const ticketGrant = (
  actions: readonly [TicketAction, string][],
): PermissionGrant => ({
  resource: { type: 'composite', id: 'helpdesk.tickets' },
  actions: actions.map(([action, scope]) => ({
    action,
    policy: { type: 'composite', scopes: { ticket: scope } },
  })),
});

/**
 * Initial job definitions for the helpdesk. These are ordinary permission sets:
 * an administrator can change their grants, scopes and assignments afterwards.
 * No user is assigned here because the application does not know the people
 * who hold each job at installation time.
 */
export const employeePermissionSet = definePermissionSet('employee')
  .title(title('employee'))
  .grant(
    ticketGrant([
      ['view', 'helpdesk.ownTickets'],
      ['create', 'helpdesk.ownTickets'],
      ['reopen', 'helpdesk.ownTickets'],
      ['close', 'helpdesk.ownTickets'],
      ['comment', 'helpdesk.ownTickets'],
      ['attach', 'helpdesk.ownTickets'],
    ]),
  )
  .build();

export const supportEngineerPermissionSet = definePermissionSet(
  'support-engineer',
)
  .title(title('supportEngineer'))
  .grant(
    ticketGrant([
      ['view', 'helpdesk.engineerTickets'],
      ['claim', 'helpdesk.engineerTickets'],
      ['start', 'helpdesk.engineerTickets'],
      ['resolve', 'helpdesk.engineerTickets'],
      ['comment', 'helpdesk.engineerTickets'],
      ['attach', 'helpdesk.engineerTickets'],
    ]),
  )
  .build();

export const serviceDeskPermissionSet = definePermissionSet('service-desk')
  .title(title('serviceDesk'))
  .grant(
    ticketGrant([
      ['view', 'allRecords'],
      ['create', 'allRecords'],
      ['assign', 'allRecords'],
      ['start', 'allRecords'],
      ['resolve', 'allRecords'],
      ['reopen', 'allRecords'],
      ['cancel', 'allRecords'],
      ['comment', 'allRecords'],
      ['attach', 'allRecords'],
    ]),
  )
  .build();

export const helpdeskPermissionSets = [
  employeePermissionSet,
  supportEngineerPermissionSet,
  serviceDeskPermissionSet,
] as const;
