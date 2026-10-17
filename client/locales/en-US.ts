import type { LocaleResource } from '@nocobase/i18n';

import systemEnUS from './system/en-US.js';

const enUS = {
  // The template's own copy: the shell, the sign-in pages, shared components and the homepage. Keep it in
  // `./system/` so a template upgrade can replace it without touching the application's copy below.
  ...systemEnUS,
  // The application's copy goes here, one group per feature. A shared group such as `navigation` is extended by
  // spreading the system one first, `navigation: { ...systemEnUS.navigation, orders: 'Orders' }`, since a group
  // written here replaces the system group of the same name rather than merging with it.
  actions: {
    ...systemEnUS.actions,
    refresh: 'Refresh',
    retry: 'Retry',
    saving: 'Saving…',
  },
  navigation: {
    ...systemEnUS.navigation,
    dashboard: 'Dashboard',
    serviceDesk: 'Service desk',
    tickets: 'Tickets',
    team: 'Service team',
  },
  dashboard: {
    title: 'Service desk',
    description:
      'What needs attention today: unassigned tickets, overdue work, and how much each engineer is carrying.',
    error: {
      title: 'Unable to load the service desk',
      description: 'The dashboard could not be loaded. Please try again.',
    },
    roles: {
      employee: 'Employee',
      engineer: 'Engineer',
      'service-desk': 'Service desk',
    },
    metrics: {
      pending: {
        title: 'Waiting to be assigned',
        description: 'Tickets no engineer has picked up yet.',
      },
      overdue: {
        title: 'Overdue',
        description: 'Unresolved for more than 24 hours.',
      },
      role: {
        title: 'Your role',
        description: 'What the service desk lets you see and do.',
      },
    },
    workload: {
      title: 'Engineer workload',
      description: 'Active and resolved tickets per engineer.',
      empty: 'No engineers yet',
      emptyDescription:
        'Assign the engineer role to someone and they will appear here.',
      active: '{{count}} active',
      resolved: '{{count}} resolved',
    },
    pending: {
      title: 'Waiting to be assigned',
      description: 'Tickets that arrived and have no engineer yet.',
      empty: 'Nothing waiting',
      emptyDescription: 'Every ticket has an engineer assigned.',
      viewAll: 'View all unassigned tickets',
    },
    overdue: {
      title: 'Overdue',
      description: 'Tickets unresolved for more than 24 hours.',
      empty: 'Nothing overdue',
      emptyDescription: 'Every open ticket is inside its reminder window.',
      viewAll: 'View all tickets',
    },
  },
  tickets: {
    title: 'Tickets',
    description:
      'Report a problem, or follow the ones you raised or were assigned.',
    unassigned: 'Unassigned',
    overdue: 'Overdue',
    status: {
      pending: 'Pending',
      processing: 'Processing',
      resolved: 'Resolved',
      closed: 'Closed',
    },
    urgency: {
      low: 'Low',
      medium: 'Medium',
      high: 'High',
      urgent: 'Urgent',
    },
    columns: {
      title: 'Problem',
      status: 'Status',
      urgency: 'Urgency',
      requester: 'Requested by',
      assignee: 'Engineer',
      submitted: 'Submitted',
    },
    search: {
      label: 'Search tickets',
      placeholder: 'Search by title or description…',
    },
    filters: {
      allStatuses: 'All statuses',
      statusLabel: 'Filter by status',
      allUrgencies: 'All urgencies',
      urgencyLabel: 'Filter by urgency',
      clear: 'Clear filters',
    },
    empty: {
      title: 'No tickets yet',
      description:
        'When someone reports a problem it shows up here with its engineer and progress.',
    },
    noResults: {
      title: 'No matching tickets',
      description: 'No ticket matches the search and filters you set.',
    },
    error: {
      title: 'Unable to load tickets',
      description: 'The ticket list could not be loaded. Please try again.',
    },
    pagination: {
      summary: '{{first}}–{{last}} of {{total}}',
      previous: 'Previous',
      next: 'Next',
    },
    create: {
      action: 'New ticket',
      title: 'Report a problem',
      description:
        'Describe what went wrong and how urgent it is. The service desk assigns an engineer.',
      submit: 'Submit ticket',
      success: 'Ticket submitted.',
      fields: {
        title: 'Summary',
        titlePlaceholder: 'A short name for the problem',
        description: 'What happened',
        descriptionPlaceholder:
          'What you were doing, what went wrong, and any message you saw.',
        urgency: 'Urgency',
        screenshots: 'Screenshots',
        screenshotsHelp:
          'Attach up to 20 images that show the problem. Optional.',
        addScreenshots: 'Add screenshots',
        removeScreenshot: 'Remove {{name}}',
      },
      errors: {
        required: 'Add a summary and a description.',
        failed: 'The ticket could not be submitted. Please try again.',
      },
    },
    detail: {
      title: 'Ticket',
      description: 'The problem, its progress, and what you can do about it.',
      error: {
        title: 'Unable to load the ticket',
        description: 'This ticket could not be loaded. Please try again.',
      },
      fields: {
        description: 'What happened',
        resolution: 'Resolution',
        screenshots: 'Screenshots',
        submitted: 'Submitted',
        updated: 'Updated',
        returnCount: 'Times returned',
      },
      assign: {
        label: 'Assign to an engineer',
        placeholder: 'Choose an engineer',
        submit: 'Assign',
        success: 'Engineer assigned.',
        failed: 'The engineer could not be assigned. Please try again.',
        noEngineers: 'No engineer is available to assign.',
      },
      process: {
        label: 'Record progress',
        placeholder: 'What you checked, found, or changed.',
        submit: 'Add note',
        success: 'Progress recorded.',
      },
      resolve: {
        label: 'Mark as resolved',
        placeholder: 'How the problem was fixed.',
        submit: 'Resolve',
        success: 'Ticket resolved.',
      },
      confirm: {
        action: 'Confirm and close',
        success: 'Ticket closed. Thank you.',
      },
      return: {
        label: 'Still not fixed',
        placeholder: 'What is still wrong, so the engineer can continue.',
        submit: 'Return for more work',
        success: 'Returned to the engineer.',
      },
      comment: {
        label: 'Add a comment',
        placeholder: 'Anything the service desk and engineer should know.',
        submit: 'Comment',
        success: 'Comment added.',
      },
      errors: {
        failed: 'The action could not be completed. Please try again.',
      },
      logs: {
        title: 'History',
        empty: 'Nothing has been recorded yet.',
        system: 'System',
        kinds: {
          submit: 'submitted',
          assign: 'assigned',
          process: 'progress',
          resolve: 'resolved',
          confirm: 'confirmed',
          return: 'returned',
          comment: 'commented',
        },
      },
    },
  },
  team: {
    title: 'Service team',
    description:
      'The engineers who can be assigned tickets, and their workload.',
    empty: {
      title: 'No engineers yet',
      description:
        'Give someone the engineer role and they will be listed here for assignment.',
    },
    error: {
      title: 'Unable to load the team',
      description: 'The engineer list could not be loaded. Please try again.',
    },
    columns: {
      name: 'Engineer',
      email: 'Email',
      active: 'Active',
      resolved: 'Resolved',
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
