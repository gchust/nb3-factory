/**
 * Initial permission configuration for the IT repair ticket feature.
 *
 * These are ordinary editable Permission Sets, not code-owned protection. An
 * administrator can rename them, change their grants or assign them to other
 * colleagues in the authorization workspace; the seed only supplies a working
 * starting point for a fresh installation. The declarations they select come
 * from `server/it-tickets-resources.ts`, so the stored grants always match the
 * registered composite and its data scopes.
 *
 * The `.ts` extension is deliberate. A source checkout loads a seed through
 * Node's own loader — not through Vite or the CLI's `tsx` — and Node resolves a
 * relative `...js` specifier literally, while a `...ts` one names the file that
 * exists. `rewriteRelativeImportExtensions` turns it back into `.js` in the
 * compiled output.
 */
import { definePermissionSet } from '@nocobase/authorization/permission-sets';
import { recordAccess } from '@nocobase/app-plugin-authorization/server';
import {
  IT_TICKETS_EMPLOYEE_SET,
  IT_TICKETS_HANDLER_SET,
  IT_TICKETS_NAMESPACE,
  IT_TICKETS_PAGE,
  itTickets,
} from '../../server/it-tickets-resources.ts';

const title = (key: string) => ({ key, ns: IT_TICKETS_NAMESPACE });

const pageAccess = {
  resource: { type: 'page', id: IT_TICKETS_PAGE },
  actions: [{ action: 'access' }],
};

/** Submitters: reach the page, read only their own tickets, create new ones. */
export const employeePermissionSet = definePermissionSet(
  IT_TICKETS_EMPLOYEE_SET,
)
  .title(title('permissionSets.employee'))
  .grant(pageAccess)
  .grant(
    itTickets.reference().grant({
      view: { tickets: 'it.own' },
      create: { tickets: recordAccess.allRecords.key },
    }),
  )
  .build();

/** Handlers: reach the page and work every ticket through its transitions. */
export const handlerPermissionSet = definePermissionSet(IT_TICKETS_HANDLER_SET)
  .title(title('permissionSets.handler'))
  .grant(pageAccess)
  .grant(
    itTickets.reference().grant({
      view: { tickets: recordAccess.allRecords.key },
      create: { tickets: recordAccess.allRecords.key },
      start: { tickets: recordAccess.allRecords.key },
      complete: { tickets: recordAccess.allRecords.key },
    }),
  )
  .build();

export const itTicketPermissionSets = [
  employeePermissionSet,
  handlerPermissionSet,
];
