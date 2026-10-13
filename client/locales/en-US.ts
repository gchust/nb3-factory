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
    signInAgain: 'Sign in again',
  },
  // The system's own `status.*` copy is a set of flat dotted keys, not a group, so this one is flat too.
  'status.sessionExpired': 'Your session has expired. Sign in to continue.',
  navigation: {
    ...systemEnUS.navigation,
    serviceDesk: 'Service desk',
    tickets: 'Tickets',
    settings: 'Settings',
    serviceDeskSettings: 'Service desk staff',
  },
  serviceDesk: {
    state: {
      submitted: 'Awaiting assignment',
      assigned: 'Assigned',
      processing: 'In progress',
      resolved: 'Awaiting confirmation',
      returned: 'Returned for rework',
      closed: 'Closed',
      cancelled: 'Cancelled',
    },
    urgency: {
      low: 'Low',
      normal: 'Normal',
      high: 'High',
      urgent: 'Urgent',
    },
    scope: {
      mine: 'Raised by me',
      assigned: 'Assigned to me',
      all: 'All tickets',
    },
    error: {
      title: 'Something went wrong',
      requestFailed: 'The request could not be completed. Try again.',
      forbidden: 'You do not have permission to do that.',
      notFound: 'That ticket does not exist, or you cannot see it.',
      conflict:
        'Someone else changed this ticket while you were looking at it. Reload and try again.',
    },
    home: {
      title: 'Service desk',
      description:
        'Raise a repair request and follow it to the end: the service desk assigns an engineer, the engineer records the fix, and the requester confirms it.',
      summaryLabel: 'Service desk at a glance',
      pendingAssignment: 'Awaiting assignment',
      overdue: 'Open over 24 hours',
      open: 'Still open',
      resolved: 'Awaiting confirmation',
      byStatus: 'Tickets by state',
      byStatusDescription:
        'Every ticket the service desk can see, counted by the state it is in.',
      workload: 'Engineer workload',
      workloadDescription: 'What each engineer is carrying right now.',
      workloadMineDescription:
        'Your own open tickets, and how many of them are past 24 hours.',
      workloadOpen: '{{count}} open',
      workloadOverdue: '{{count}} overdue',
      noWorkload: 'No engineers at work',
      noWorkloadDescription:
        'Once the service desk assigns tickets, each engineer’s load shows here.',
      shortcuts: 'Go to',
      allTickets: 'All tickets',
      myTickets: 'My tickets',
      error: {
        title: 'The overview could not be loaded',
        requestFailed: 'The summary could not be loaded. Try again.',
      },
    },
    tickets: {
      title: 'Tickets',
      description: 'Repair requests you raised, and the ones you handle.',
      new: 'New ticket',
      empty: 'No tickets yet',
      emptyDescription:
        'Raise a ticket when something needs fixing, and it appears here.',
      noResults: 'No matching tickets',
      noResultsDescription: 'No ticket matches the current search and filters.',
      clearFilters: 'Clear filters',
      searchPlaceholder: 'Search by title, number or text',
      searchLabel: 'Search tickets',
      scopeLabel: 'Which tickets to show',
      statusLabel: 'Filter by state',
      anyStatus: 'Any state',
      overdueOnly: 'Open over 24 hours only',
      count: '{{count}} ticket(s)',
      number: 'No. {{id}}',
      overdue: 'Overdue',
      raisedBy: 'Raised by {{name}}',
      assignedTo: 'Assigned to {{name}}',
    },
    detail: {
      number: 'Ticket No. {{id}}',
      raisedBy: 'Raised by {{name}}',
      notFound: 'This ticket does not exist, or you cannot see it.',
      moreActions: 'More actions',
      state: 'State',
      urgency: 'Urgency',
      requester: 'Raised by',
      assignee: 'Assigned engineer',
      unassigned: 'Not assigned yet',
      category: 'Category',
      location: 'Location',
      notProvided: 'Not provided',
      summaryTitle: 'Summary',
      descriptionTitle: 'What is wrong',
      solutionTitle: 'How it was fixed',
      returnReasonTitle: 'Why it was returned',
      returnReasonDescription:
        'The requester says the issue is not resolved yet.',
      attachmentsTitle: 'Attachments',
      attachmentsFailed: 'The attachments could not be loaded',
      noAttachments: 'No attachments.',
      previewFile: 'Preview',
      downloadFile: 'Download',
      notesTitle: 'Handling notes',
      notesDescription:
        'What the engineer tried, and anything the requester adds.',
      notesFailed: 'The notes could not be loaded',
      addNote: 'Add note',
      notePlaceholder: 'Add a note about this ticket…',
      noNotes: 'No notes yet.',
      handlingNote: 'Handling note',
      historyTitle: 'History',
      historyDescription: 'Every state this ticket has passed through.',
      created: 'Ticket raised',
      noHistory: 'Nothing has happened yet.',
    },
    form: {
      createTitle: 'Raise a repair request',
      createDescription:
        'Describe what is wrong. The service desk reads this and assigns an engineer.',
      create: 'Submit ticket',
      creating: 'Submitting…',
      created: 'Ticket No. {{id}} was submitted',
      title: 'Title',
      titlePlaceholder: 'A short summary of the problem',
      titleRequired: 'Give the ticket a title.',
      titleTooLong: 'The title must be at most {{max}} characters.',
      description: 'What is wrong',
      descriptionPlaceholder:
        'What happened, what you expected, and anything you already tried.',
      descriptionRequired: 'Describe the problem.',
      descriptionTooLong: 'The description must be at most {{max}} characters.',
      urgency: 'Urgency',
      category: 'Category',
      categoryPlaceholder: 'For example: email, hardware, account',
      categoryTooLong: 'The category must be at most {{max}} characters.',
      location: 'Location',
      locationPlaceholder: 'Building, floor or room',
      locationTooLong: 'The location must be at most {{max}} characters.',
      attachments: 'Screenshots and files',
      attachmentsHint:
        'Up to {{count}} files, {{size}} MB each. Screenshots help the engineer.',
      chooseFiles: 'Choose files',
      noFiles: 'No files chosen.',
      previewFile: 'Preview',
      downloadFile: 'Download',
      removeFile: 'Remove',
      retryFile: 'Retry',
      uploadFailedTitle: 'That file was not added',
      attachmentContentMismatch:
        '{{filename}} does not look like a valid file of that type. Choose the original screenshot, PDF or document.',
      attachmentUnreadable:
        '{{filename}} could not be read. Try choosing it again.',
    },
    transition: {
      assign: {
        label: 'Assign',
        title: 'Assign this ticket',
        description: 'Choose the engineer who will handle it.',
      },
      reassign: {
        label: 'Assign again',
        title: 'Assign this ticket again',
        description: 'Choose the engineer who takes it over.',
      },
      start: {
        label: 'Start handling',
        title: 'Start handling this ticket',
        description: 'The ticket moves to in progress.',
      },
      rework: {
        label: 'Start rework',
        title: 'Start rework on this ticket',
        description:
          'Pick the ticket up again after the requester returned it.',
      },
      resolve: {
        label: 'Mark resolved',
        title: 'Record the solution',
        description:
          'Describe what fixed it. The requester then confirms or returns it.',
      },
      confirm: {
        label: 'Confirm and close',
        title: 'Confirm and close this ticket',
        description: 'The problem is fixed; the ticket closes.',
      },
      return: {
        label: 'Return for further work',
        title: 'Return this ticket',
        description: 'Say what is still wrong. It goes back to the engineer.',
      },
      cancel: {
        label: 'Cancel ticket',
        title: 'Cancel this ticket',
        description: 'The request is no longer needed; the ticket closes.',
      },
      done: 'Ticket No. {{id}} was updated',
      working: 'Working…',
      engineer: 'Engineer',
      engineerPlaceholder: 'Choose an engineer',
      noEngineers: 'No engineer is on the service desk yet.',
      solution: 'How it was fixed',
      solutionPlaceholder: 'What was wrong, and what you did about it.',
      reason: 'Reason',
      reasonPlaceholder: 'Say why, so the next person understands.',
      required: 'This is required.',
    },
    settings: {
      title: 'Service desk staff',
      description:
        'Who works the service desk. Engineers handle the tickets assigned to them; the service desk sees every ticket and decides who handles what.',
      membersTitle: 'People',
      membersDescription:
        'Search for a person and set their role. Everyone else is an ordinary employee who sees only their own tickets.',
      searchPlaceholder: 'Search by name or email',
      roleLabel: 'Role',
      role: {
        employee: 'Employee',
        engineer: 'Engineer',
        helpdesk: 'Service desk',
      },
      noResultsTitle: 'Nobody found',
      noResultsDescription: 'No person matches that search.',
      saved: 'The role was saved.',
      helpdeskOnly: 'Only the service desk may manage these roles.',
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
