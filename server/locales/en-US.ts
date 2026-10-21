import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  tickets: {
    authorization: {
      resource: 'Service tickets',
      section: 'Service desk',
      actions: {
        view: 'View tickets',
        create: 'Create tickets',
        comment: 'Comment on tickets',
        commentInternal: 'Write internal notes',
        attach: 'Attach files',
        download: 'Download attachments',
        accept: 'Accept and assign',
        assign: 'Assign to an engineer',
        resolve: 'Resolve',
        close: 'Confirm and close',
        reopen: 'Reopen',
      },
      scopes: {
        ownTickets: 'Own tickets',
        ownComments: 'Comments on own tickets',
        ownScreenshots: 'Attachments on own tickets',
        assignedTickets: 'Tickets assigned to me',
        assignedComments: 'Comments on my assigned tickets',
        assignedScreenshots: 'Attachments on my assigned tickets',
      },
      collections: {
        tickets: 'Tickets',
        comments: 'Ticket comments',
        screenshots: 'Ticket attachments',
      },
    },
    permissionSets: {
      admin: 'Service desk administrator',
      maintainer: 'Service desk maintainer',
      requester: 'Requester',
    },
  },
};

export type AppServerResource = LocaleResource<typeof enUS>;

export default enUS;
