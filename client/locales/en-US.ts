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
    tickets: 'Service tickets',
    ticketNew: 'New ticket',
    ticketDetail: 'Ticket',
    inbox: 'Notifications',
  },
  home: {
    title: 'Service desk',
    description: 'Tickets that need attention, at a glance.',
    descriptionDesk:
      'Dispatch unassigned work, watch the 24-hour service level, and balance the team.',
    descriptionMine:
      'Follow your requests, confirm a fix, or reopen a ticket that is not solved yet.',
    allTickets: 'All tickets',
    metrics: {
      active: 'Active tickets',
      activeHint: 'Open or being worked on',
      awaiting: 'Awaiting confirmation',
      awaitingHint: 'Resolved, waiting for the requester',
      overdue: 'Overdue',
      overdueHint: 'Active for more than 24 hours',
      unassigned: 'Unassigned',
      unassignedHint: 'No engineer assigned yet',
    },
    unassigned: {
      title: 'Waiting for an engineer',
      description: 'Assign these to the right person.',
      empty: 'Every active ticket has an engineer.',
    },
    overdue: {
      title: 'Past the 24-hour target',
      description: 'These need a status update or a resolution now.',
      empty: 'No active ticket is overdue.',
    },
    workload: {
      title: 'Engineer workload',
      description: 'Active assignments and overdue tickets per engineer.',
      empty: 'No engineer accounts are configured yet.',
      activeCount: '{{count}} active',
      overdueCount: '{{count}} overdue',
      onTrack: 'On track',
    },
    myOpen: {
      title: 'My open requests',
      description: 'Tickets you reported that are still being handled.',
      empty: 'You have no open requests.',
    },
    awaiting: {
      title: 'Waiting for your confirmation',
      description:
        'The engineer marked these resolved. Confirm the fix or reopen them.',
      empty: 'Nothing is waiting for your confirmation.',
    },
    recent: {
      title: 'Recent tickets',
      description: 'The latest activity you can see.',
      empty: 'No tickets yet.',
    },
    notificationsHint:
      'Assignment, reply and resolution notices arrive in the inbox in the navigation.',
    noAccess:
      'Your account has no ticket access yet. Ask the service desk to assign you a role.',
    loadFailed: 'The service desk overview could not be loaded.',
  },
  tickets: {
    title: 'Service tickets',
    description:
      'Report an issue, follow its progress, and keep every answer in one place.',
    new: 'New ticket',
    newDescription:
      'Describe what happened and how urgent it is. A maintainer will pick it up from here.',
    create: 'Create ticket',
    creating: 'Creating…',
    cancel: 'Cancel',
    search: 'Search tickets',
    searchPlaceholder: 'Search by title or number',
    clear: 'Clear filters',
    allStatuses: 'All statuses',
    allPriorities: 'All priorities',
    allCategories: 'All categories',
    columns: {
      ticketNo: 'Number',
      ticket: 'Ticket',
      status: 'Status',
      priority: 'Priority',
      category: 'Category',
      requester: 'Requester',
      assignee: 'Assignee',
      updated: 'Updated',
    },
    status: {
      open: 'Open',
      in_progress: 'In progress',
      resolved: 'Awaiting confirmation',
      closed: 'Closed',
    },
    priority: {
      low: 'Low',
      medium: 'Medium',
      high: 'High',
      urgent: 'Urgent',
    },
    category: {
      incident: 'Incident',
      access: 'Access request',
      hardware: 'Hardware',
      software: 'Software',
      other: 'Other',
    },
    actions: {
      accept: 'Accept and assign to me',
      assign: 'Assign engineer',
      reassign: 'Reassign',
      resolve: 'Resolve',
      close: 'Confirm resolution',
      reopen: 'Reopen',
    },
    confirm: {
      accept: {
        title: 'Accept this ticket?',
        description:
          'The ticket “{{title}}” will be assigned to you and marked in progress.',
      },
      resolve: {
        title: 'Resolve this ticket?',
        description:
          'The ticket “{{title}}” will be marked resolved. The requester can still see the answer.',
      },
      close: {
        title: 'Confirm the resolution?',
        description:
          'The ticket “{{title}}” will be closed. Reopen it later if the problem returns.',
      },
      reopen: {
        title: 'Reopen this ticket?',
        description:
          'The ticket “{{title}}” goes back to the engineer for further work.',
      },
    },
    actionDone: {
      accept: 'Ticket accepted',
      assign: 'Engineer assigned',
      resolve: 'Ticket resolved',
      close: 'Ticket closed',
      reopen: 'Ticket reopened',
    },
    actionFailed: 'The ticket could not be updated.',
    transitionConflict:
      'Someone else changed this ticket first. Reload it and try again.',
    working: 'Updating…',
    overdue: 'Overdue',
    slaDeadline: '24-hour target',
    assign: {
      title: 'Assign this ticket',
      description: 'Choose the engineer who will handle “{{title}}”.',
      placeholder: 'Choose an engineer',
      loading: 'Loading engineers…',
      noEngineers: 'No engineer account is available yet.',
      failed: 'The ticket could not be assigned.',
    },
    fields: {
      title: 'Title',
      titlePlaceholder: 'A short summary of the issue',
      description: 'What happened?',
      descriptionPlaceholder:
        'What were you trying to do, what went wrong, and what have you tried?',
      category: 'Category',
      priority: 'Priority',
      screenshot: 'Screenshot',
      screenshotHint:
        'Optional. A screenshot helps the service desk reproduce the problem.',
    },
    attachScreenshot: 'Attach a screenshot',
    removeScreenshot: 'Remove screenshot',
    details: 'Details',
    descriptionLabel: 'Description',
    activity: 'Conversation',
    noComments: 'No replies yet.',
    addComment: 'Reply',
    commentPlaceholder: 'Add an answer or an update…',
    internalNote: 'Internal note',
    attachFile: 'Attach a file',
    addAttachment: 'Add an attachment',
    uploading: 'Uploading…',
    attachments: 'Attachments',
    noAttachments: 'No attachments yet.',
    send: 'Send',
    sending: 'Sending…',
    commentAdded: 'Reply added',
    commentFailed: 'The reply could not be added.',
    commentAttachmentFailed:
      'The reply was saved, but its attachment could not be uploaded.',
    attachmentAdded: 'Attachment uploaded',
    uploadFailed: 'The file could not be uploaded.',
    downloadFailed: 'The file could not be downloaded.',
    downloadFile: 'Download {{name}}',
    openedBy: 'Opened by {{name}} on {{date}}',
    unknownRequester: 'Unknown requester',
    unassigned: 'Unassigned',
    updated: 'Last updated',
    resolved: 'Resolved',
    closed: 'Closed',
    denied: 'You do not have permission to do that.',
    notFound: 'This ticket does not exist or you cannot see it.',
    loadFailed: 'The tickets could not be loaded.',
    saveFailed: 'The ticket could not be created.',
    retry: 'Try again',
    noTickets: 'No tickets yet',
    noTicketsHint: 'Create the first ticket to start the conversation.',
    noResults: 'No tickets match these filters',
    noResultsHint: 'Try a different search or clear the filters.',
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
