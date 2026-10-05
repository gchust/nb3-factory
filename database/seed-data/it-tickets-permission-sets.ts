import { definePermissionSet } from '@nocobase/authorization/permission-sets';
import {
  IT_TICKETS_PAGE,
  itTicketsReference,
} from '../../server/it-tickets/resources.ts';

/**
 * The grant that opens the repair-request page.
 *
 * A seed runs without the authorization service, so the page grant is written
 * as its stored shape rather than through `authz.pages.grant`.
 */
const itTicketsPageGrant = {
  resource: { type: 'page', id: IT_TICKETS_PAGE },
  actions: [{ action: 'access' }],
};

/**
 * An employee: files requests and follows their own.
 *
 * The `view` and `create` grants name no data scope, so they take each
 * action's default, "submitted by me". The set grants no handling action, so
 * its holder cannot start or complete anything.
 */
export const itEmployee = definePermissionSet('it-employee')
  .title('IT: employee')
  .grant(itTicketsPageGrant)
  .grant(itTicketsReference.grant('view', 'create'))
  .build();

/**
 * An IT handler: sees every request, handles them, and may also file one.
 *
 * `view`, `start` and `complete` select `allRecords`, because handling queues
 * cross the whole company. `create` stays scoped to the handler's own
 * requests, so a handler filing a request still sees it as its requester.
 */
export const itProcessor = definePermissionSet('it-processor')
  .title('IT: handler')
  .grant(itTicketsPageGrant)
  .grant(
    itTicketsReference.grant({
      view: { itTickets: 'allRecords' },
      create: { itTickets: 'it.submittedByMe' },
      start: { itTickets: 'allRecords' },
      complete: { itTickets: 'allRecords' },
    }),
  )
  .build();

/** The permission sets a fresh installation ships. */
export const itTicketsPermissionSets = [itEmployee, itProcessor] as const;
