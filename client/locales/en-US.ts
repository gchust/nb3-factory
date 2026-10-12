import type { LocaleResource } from '@nocobase/i18n';

import systemEnUS from './system/en-US.js';

const enUS = {
  // The template's own copy: the shell, the sign-in pages, shared components and the homepage. Keep it in
  // `./system/` so a template upgrade can replace it without touching the application's copy below.
  ...systemEnUS,
  // The application's copy goes here, one group per feature. A shared group such as `navigation` is extended by
  // spreading the system one first, `navigation: { ...systemEnUS.navigation, orders: 'Orders' }`, since a group
  // written here replaces the system group of the same name rather than merging with it.
  navigation: {
    ...systemEnUS.navigation,
    tickets: 'Help desk',
  },
  helpdesk: {
    unassigned: 'Unassigned',
    workspace: {
      section: 'Help desk',
    },
    collections: {
      tickets: 'Tickets',
      ticketComments: 'Ticket comments',
      ticketAttachments: 'Ticket attachments',
    },
    status: {
      submitted: 'Submitted',
      assigned: 'Assigned',
      processing: 'In progress',
      resolved: 'Resolved',
      closed: 'Closed',
    },
    priority: {
      low: 'Low',
      medium: 'Medium',
      high: 'High',
      urgent: 'Urgent',
    },
    fields: {
      title: 'Title',
      description: 'Description',
      category: 'Category',
      priority: 'Priority',
      status: 'Status',
      reporter: 'Reporter',
      assignee: 'Assignee',
      screenshots: 'Screenshots',
      resolution: 'Resolution',
      serviceDeskNote: 'Service desk note',
      reopenReason: 'Reason for reopening',
      createdAt: 'Created',
      updatedAt: 'Updated',
    },
    filters: {
      status: 'Filter by status',
      allStatuses: 'All statuses',
    },
    dashboard: {
      title: 'Help desk',
      description:
        'What the service desk is holding, what is overdue and how the engineers are loaded.',
      stats: {
        pending: 'Awaiting assignment',
        overdue: 'Overdue',
        open: 'Open',
        resolved: 'Resolved',
        total: 'Total',
      },
      workload: {
        title: 'Engineer workload',
        description: 'Open tickets assigned to each engineer.',
        empty: 'No open tickets are assigned right now.',
        count: '{{tickets}} open',
      },
      recent: {
        title: 'Recent tickets',
        description: 'The tickets you can see, most recently updated first.',
      },
      error: {
        title: 'Unable to load the help desk',
        unauthorized: 'Your session has ended. Sign in again to continue.',
        forbidden: 'You do not have access to the help desk.',
        requestFailed: 'The help desk could not be loaded. Please try again.',
      },
    },
    tickets: {
      title: 'Tickets',
      description: 'Report a problem, follow its progress and confirm a fix.',
      new: 'New ticket',
      search: 'Search tickets',
      empty: {
        title: 'No tickets',
        description:
          'Nothing matches yet. A new problem can be reported from “New ticket”.',
      },
      error: {
        title: 'Unable to load tickets',
        unauthorized: 'Your session has ended. Sign in again to continue.',
        forbidden: 'You do not have access to these tickets.',
        requestFailed: 'The tickets could not be loaded. Please try again.',
      },
    },
    form: {
      create: {
        title: 'New ticket',
        description: 'Describe the problem and how urgent it is.',
      },
      categoryPlaceholder: 'For example, hardware, account, network',
      screenshots: {
        choose: 'Add screenshots',
        remove: 'Remove',
        hint: 'Attach a screenshot so the service desk can see the problem.',
        invalidImage:
          'That file is not a valid image. Attach a PNG, JPG, GIF, WebP or BMP screenshot.',
      },
      submit: 'Submit ticket',
      submitting: 'Submitting…',
      error: {
        unauthorized: 'Your session has ended. Sign in again to continue.',
        requestFailed: 'The ticket could not be created. Please try again.',
      },
    },
    detail: {
      description: 'Problem',
      actions: 'Actions',
      actionsHint: 'The steps available to you on this ticket.',
      comments: 'Comments',
      noComments: 'No comments yet.',
      addComment: 'Add comment',
      conflict:
        'Someone else changed this ticket. Reload the page and try again.',
      transitionFailed: 'The action could not be completed. Please try again.',
      commentFailed: 'The comment could not be added. Please try again.',
      notFound: {
        title: 'Ticket not found',
        description:
          'This ticket does not exist, or it is not visible to your role.',
      },
      error: {
        title: 'Unable to load the ticket',
        unauthorized: 'Your session has ended. Sign in again to continue.',
        requestFailed: 'The ticket could not be loaded. Please try again.',
      },
    },
    transition: {
      assign: {
        title: 'Assign ticket',
        description: 'Choose the engineer who will handle this ticket.',
        choose: 'Choose an engineer',
      },
      start: {
        title: 'Start work',
        description: 'Tell the reporter that you have started handling it.',
      },
      resolve: {
        title: 'Resolve ticket',
        description: 'Record the solution and ask the reporter to confirm it.',
      },
      confirm: {
        title: 'Confirm resolution',
        description: 'Close the ticket because the problem is solved.',
      },
      reopen: {
        title: 'Reopen ticket',
        description: 'Send the ticket back to the engineer for more work.',
      },
    },
    notifications: {
      assignedToEngineer: {
        title: 'Ticket assigned to you',
        body: '“{{title}}” ({{priority}} priority) is now yours.',
      },
      assignedToReporter: {
        title: 'Your ticket was assigned',
        body: '“{{title}}” was assigned to {{assignee}}.',
      },
      processingStarted: {
        title: 'Your ticket is being handled',
        body: '{{assignee}} started work on “{{title}}”.',
      },
      resolved: {
        title: 'Your ticket was resolved',
        body: '“{{title}}” was resolved. Please confirm the result.',
      },
      reopened: {
        title: 'Ticket reopened',
        body: '“{{title}}” was sent back: {{reason}}',
      },
      confirmed: {
        title: 'Ticket confirmed',
        body: '“{{title}}” was confirmed and closed.',
      },
      overdue: {
        title: 'Ticket waiting too long',
        body: '“{{title}}” ({{priority}} priority) has been unresolved for over 24 hours.',
      },
    },
  },
};

/**
 * The shape every locale of this application follows, derived from the English wording above.
 *
 * Anything a plugin does not translate falls back to this namespace, so a term defined here is reused everywhere
 * without each plugin repeating it.
 */
export type AppResource = LocaleResource<typeof enUS>;

export default enUS;
