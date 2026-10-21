import { APP_NS } from '@nocobase/i18n';
import { definePermissionSet } from '@nocobase/authorization/permission-sets';
import { ticketsResource } from '../../../../server/tickets/resources.ts';

const title = (key: string) => ({ key, ns: APP_NS });
const page = {
  resource: { type: 'page', id: 'tickets' },
  actions: [{ action: 'access' }],
} as const;

const all = {
  tickets: 'allRecords',
  comments: 'allRecords',
  screenshots: 'allRecords',
} as const;

const own = {
  tickets: 'support.ownTickets',
  comments: 'support.ownComments',
  screenshots: 'support.ownScreenshots',
} as const;

const assigned = {
  tickets: 'support.assignedTickets',
  comments: 'support.assignedComments',
  screenshots: 'support.assignedScreenshots',
} as const;

/**
 * Full service-desk responsibility: every ticket, internal notes, and dispatch to any engineer. Closing and
 * reopening belong to the requester, who confirms the resolution; the service desk cannot close a ticket early.
 */
export const admin = definePermissionSet('tickets-admin')
  .title(title('tickets.permissionSets.admin'))
  .grant(page)
  .grant(
    ticketsResource.reference().grant({
      view: all,
      create: { tickets: 'allRecords' },
      comment: { tickets: 'allRecords', comments: 'allRecords' },
      commentInternal: { tickets: 'allRecords', comments: 'allRecords' },
      attach: { ...all },
      download: { tickets: 'allRecords', screenshots: 'allRecords' },
      assign: { tickets: 'allRecords' },
      resolve: { tickets: 'allRecords' },
    }),
  )
  .build();

/**
 * An engineer handles only the tickets assigned to them. They can record internal notes, reply publicly, attach
 * files and resolve; they cannot assign work to somebody else or close a ticket before the requester confirms it.
 */
export const maintainer = definePermissionSet('tickets-maintainer')
  .title(title('tickets.permissionSets.maintainer'))
  .grant(page)
  .grant(
    ticketsResource.reference().grant({
      view: assigned,
      create: { tickets: 'support.ownTickets' },
      comment: { tickets: 'support.assignedTickets', comments: 'support.assignedComments' },
      commentInternal: {
        tickets: 'support.assignedTickets',
        comments: 'support.assignedComments',
      },
      attach: { ...assigned },
      download: { tickets: 'support.assignedTickets', screenshots: 'support.assignedScreenshots' },
      resolve: { tickets: 'support.assignedTickets' },
    }),
  )
  .build();

/**
 * A requester sees and comments on their own tickets only, and is the only role that can confirm a resolution and
 * close the ticket, or reopen it when the problem is not solved.
 */
export const requester = definePermissionSet('tickets-requester')
  .title(title('tickets.permissionSets.requester'))
  .grant(page)
  .grant(
    ticketsResource.reference().grant({
      view: own,
      create: { tickets: 'support.ownTickets' },
      comment: { tickets: 'support.ownTickets', comments: 'support.ownComments' },
      attach: {
        tickets: 'support.ownTickets',
        comments: 'support.ownComments',
        screenshots: 'support.ownScreenshots',
      },
      download: {
        tickets: 'support.ownTickets',
        screenshots: 'support.ownScreenshots',
      },
      close: { tickets: 'support.ownTickets' },
      reopen: { tickets: 'support.ownTickets' },
    }),
  )
  .build();
