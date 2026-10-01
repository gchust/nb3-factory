import { definePermissionSet } from '@nocobase/authorization/permission-sets';
import type { PermissionGrant } from '@nocobase/authorization/core';
import { APP_NS } from '@nocobase/i18n';

import {
  ALL_RECORDS_SCOPE,
  OWN_SUBMITTED_SCOPE,
  REPAIR_TICKET_PAGE_ID,
  REPAIR_TICKET_SCOPE,
  repairTickets,
} from '../../server/it-repair/declarations.ts';

/**
 * The Permission Sets the IT repair workflow ships with.
 *
 * A set is data, not a code path: an administrator assigns one to any user, so
 * a new colleague receives the same work permissions as the demo accounts. The
 * grants name the composite resource and choose a record access per action.
 */

/** The page the workflow lives on, plus the actions the reporter may perform. */
export const itReporterSet = definePermissionSet('it-reporter')
  .title({ key: 'itRepair.permissionSet.reporter', ns: APP_NS })
  .grant(pageAccess())
  .grant(
    repairTickets.grant({
      view: { [REPAIR_TICKET_SCOPE]: OWN_SUBMITTED_SCOPE },
      create: { [REPAIR_TICKET_SCOPE]: ALL_RECORDS_SCOPE },
    }),
  )
  .build();

/** The page plus every processing action over every ticket. */
export const itHandlerSet = definePermissionSet('it-handler')
  .title({ key: 'itRepair.permissionSet.handler', ns: APP_NS })
  .grant(pageAccess())
  .grant(
    repairTickets.grant({
      view: { [REPAIR_TICKET_SCOPE]: ALL_RECORDS_SCOPE },
      create: { [REPAIR_TICKET_SCOPE]: ALL_RECORDS_SCOPE },
      start: { [REPAIR_TICKET_SCOPE]: ALL_RECORDS_SCOPE },
      complete: { [REPAIR_TICKET_SCOPE]: ALL_RECORDS_SCOPE },
    }),
  )
  .build();

export const itRepairPermissionSets = [itReporterSet, itHandlerSet] as const;

function pageAccess(): PermissionGrant {
  return {
    resource: { type: 'page', id: REPAIR_TICKET_PAGE_ID },
    actions: [{ action: 'access' }],
  };
}
