import { definePermissionSet } from '@nocobase/authorization/permission-sets';

import { tickets } from '../../server/tickets-resources';

/** The page every ticket user opens. Declared in `client/routes.ts`. */
const ticketsPage = {
  resource: { type: 'page' as const, id: 'tickets' },
  actions: [{ action: 'access' }],
};

/**
 * An employee submits tickets and sees only the tickets they submitted. The
 * `tickets.submitted` record access narrows the `view` action to the caller's
 * own rows; a denied read of someone else's ticket looks like a missing one.
 */
export const ticketEmployee = definePermissionSet('ticket-employee')
  .title('Ticket employee')
  .grant(ticketsPage)
  .grant(
    tickets.reference().grant({
      view: { tickets: 'tickets.submitted' },
      create: { tickets: 'allRecords' },
    }),
  )
  .build();

/**
 * A handler sees every ticket and is the only job that may start or complete
 * one. Neither grant writes a completed ticket, so completion is final.
 */
export const ticketHandler = definePermissionSet('ticket-handler')
  .title('Ticket handler')
  .grant(ticketsPage)
  .grant(
    tickets.reference().grant({
      view: { tickets: 'allRecords' },
      start: { tickets: 'allRecords' },
      complete: { tickets: 'allRecords' },
    }),
  )
  .build();
