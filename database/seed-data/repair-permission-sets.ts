import { APP_NS } from '@nocobase/i18n';
import { definePermissionSet } from '@nocobase/authorization/permission-sets';
import type { PermissionSet } from '@nocobase/authorization/permission-sets';
import {
  REPAIR_TICKETS_PAGE_ID,
  SUBMITTED_BY_ME_ACCESS,
  TICKET_ACTIONS,
  TICKET_SCOPE,
  repairTickets,
} from '../../server/tickets-resources.ts';

/**
 * The installation's initial repair-ticket permission sets.
 *
 * These are ordinary persisted configuration: the seed below writes them once
 * on a fresh database and never overwrites a set an administrator has edited.
 * Both sets are assignable from the Users page, so a new colleague gets the
 * same access as the seeded demonstration accounts.
 */

const title = (key: string) => ({ key, ns: APP_NS });

const pageAccess = {
  resource: { type: 'page', id: REPAIR_TICKETS_PAGE_ID },
  actions: [{ action: 'access' }],
} as const;

/** Employees: open the page, submit a ticket, and read only their own. */
export const employeePermissionSet: PermissionSet = definePermissionSet(
  'it-employee',
)
  .title(title('tickets.role.employee'))
  .grant(pageAccess)
  .grant(
    repairTickets.reference().grant({
      [TICKET_ACTIONS.view]: { [TICKET_SCOPE]: SUBMITTED_BY_ME_ACCESS },
      [TICKET_ACTIONS.create]: { [TICKET_SCOPE]: 'allRecords' },
    }),
  )
  .build();

/** Handling staff: open the page, read every ticket, start and complete them. */
export const handlerPermissionSet: PermissionSet = definePermissionSet(
  'it-handler',
)
  .title(title('tickets.role.handler'))
  .grant(pageAccess)
  .grant(
    repairTickets.reference().grant({
      [TICKET_ACTIONS.view]: { [TICKET_SCOPE]: 'allRecords' },
      [TICKET_ACTIONS.start]: { [TICKET_SCOPE]: 'allRecords' },
      [TICKET_ACTIONS.complete]: { [TICKET_SCOPE]: 'allRecords' },
    }),
  )
  .build();
