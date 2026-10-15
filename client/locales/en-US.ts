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
    create: 'Create',
    refresh: 'Refresh',
    saving: 'Saving…',
    retry: 'Retry',
  },
  navigation: {
    ...systemEnUS.navigation,
    dashboard: 'Dashboard',
    tickets: 'Tickets',
  },
  dashboard: {
    title: 'Dashboard',
    description: 'Where the queue stands and what needs attention.',
    loading: 'Loading the dashboard',
    viewAll: 'View all',
    metric: {
      pendingAssignment: 'Waiting for assignment',
      processing: 'In progress',
      resolved: 'Resolved',
      overdue: 'Overdue',
    },
    workload: {
      title: 'Engineer workload',
      description: 'Open tickets each engineer is handling.',
      empty: 'No open work',
      emptyHint: 'Assign a ticket and the engineer appears here.',
      openCount: '{{count}} open ticket(s)',
    },
    pending: {
      title: 'Waiting for assignment',
      description: 'New tickets that have no engineer yet.',
      empty: 'Nothing waiting',
      emptyHint: 'New tickets appear here until someone assigns them.',
    },
    overdue: {
      title: 'Overdue',
      description: 'In progress for more than 24 hours without an update.',
      empty: 'Nothing overdue',
      emptyHint: 'Tickets untouched for 24 hours appear here.',
    },
    error: {
      title: 'Could not load the dashboard',
      description:
        'Something went wrong while loading the dashboard. Please try again.',
      forbidden: 'You do not have permission to view the dashboard.',
    },
  },
  tickets: {
    title: 'Tickets',
    description: 'Report an issue and follow its repair progress.',
    unassigned: 'Unassigned',
    search: {
      label: 'Search tickets',
      placeholder: 'Search by title or description',
    },
    filter: {
      status: 'Filter by status',
      urgency: 'Filter by urgency',
      allStatuses: 'All statuses',
      allUrgencies: 'All urgencies',
    },
    status: {
      pending: 'Pending',
      processing: 'In progress',
      resolved: 'Resolved',
      closed: 'Closed',
    },
    urgency: {
      low: 'Low',
      normal: 'Normal',
      high: 'High',
      urgent: 'Urgent',
    },
    column: {
      id: 'ID',
      title: 'Title',
      status: 'Status',
      urgency: 'Urgency',
      assignee: 'Assignee',
      requester: 'Requester',
      createdAt: 'Created',
      actions: 'Actions',
    },
    row: {
      openMenu: 'Open row menu',
      view: 'View ticket',
    },
    list: {
      count: '{{count}} ticket(s)',
      empty: 'No tickets yet',
      emptyHint: 'Reported issues will appear here.',
      emptyFiltered: 'No matching tickets',
      emptyFilteredHint: 'Try clearing the search or the filters.',
      error: {
        title: 'Could not load tickets',
        description:
          'Something went wrong while loading tickets. Please try again.',
        forbidden: 'You do not have permission to view tickets.',
      },
    },
    create: {
      action: 'Report issue',
      title: 'Report an issue',
      description:
        'Describe the problem and the service desk will assign it to an engineer.',
      success: 'Ticket #{{id}} was created.',
    },
    form: {
      title: 'Title',
      titleRequired: 'Enter a title.',
      titleTooLong: 'The title must be at most {{max}} characters.',
      description: 'Description',
      descriptionRequired: 'Describe the issue.',
      descriptionTooLong: 'The description must be at most {{max}} characters.',
      urgency: 'Urgency',
      attachments: 'Attachments',
      attachmentsHint: 'Up to 10 images, 5 MB each.',
      attachmentsPending: 'Wait for the uploads to finish before submitting.',
      forbidden: 'You do not have permission to create tickets.',
      submitFailed: 'Could not create the ticket. Please try again.',
    },
    detail: {
      title: 'Ticket',
      loading: 'Loading ticket',
      notFound: 'This ticket does not exist or was removed.',
      forbidden: 'You do not have permission to view this ticket.',
      error: 'Could not load the ticket. Please try again.',
    },
    fields: {
      status: 'Status',
      urgency: 'Urgency',
      requester: 'Requester',
      assignee: 'Assignee',
      createdAt: 'Created',
      statusChangedAt: 'Last updated',
      description: 'Description',
      resolution: 'Resolution',
      attachments: 'Attachments',
    },
    attachments: {
      empty: 'No attachments.',
      error: 'Could not load the attachments.',
    },
    timeline: {
      title: 'History',
      empty: 'No activity yet.',
      note: 'Comment',
      by: 'by {{name}}',
      action: {
        assign: 'Assigned',
        resolve: 'Resolved',
        confirm: 'Confirmed and closed',
        return: 'Returned for more work',
        comment: 'Commented',
      },
    },
    actions: {
      assign: 'Assign',
      assignTitle: 'Assign ticket',
      assignDescription: 'Choose the engineer who will work on this ticket.',
      assigneePlaceholder: 'Select an engineer',
      assigneeRequired: 'Select an engineer.',
      assigned: 'Ticket assigned.',
      resolve: 'Resolve',
      resolveTitle: 'Resolve ticket',
      resolveDescription: 'Describe what fixed the issue.',
      resolutionRequired: 'Enter the resolution.',
      resolved: 'Ticket resolved.',
      confirm: 'Confirm and close',
      confirmTitle: 'Confirm the fix',
      confirmDescription:
        'This closes the ticket. Do it only once the issue is really fixed.',
      confirmed: 'Ticket confirmed and closed.',
      return: 'Return',
      returnTitle: 'Return to the engineer',
      returnDescription:
        'Explain what still needs work; the ticket goes back to In progress.',
      reason: 'Reason',
      reasonRequired: 'Enter the reason.',
      returned: 'Ticket returned to the engineer.',
      comment: 'Comment',
      commentTitle: 'Add a comment',
      commentDescription:
        'The comment is visible to everyone involved in the ticket.',
      commentRequired: 'Enter a comment.',
      note: 'Note',
      forbidden: 'You do not have permission to do this.',
      conflict: 'The ticket changed since it was loaded. Reload and try again.',
      requestFailed: 'The request failed. Please try again.',
      engineersFailed: 'Could not load the list of engineers.',
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
