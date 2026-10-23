import type { LocaleResource } from '@nocobase/i18n';

import systemEnUS from './system/en-US.js';

const enUS = {
  // The template's own copy: the shell, the sign-in pages, shared components and the homepage. Keep it in
  // `./system/` so a template upgrade can replace it without touching the application's copy below.
  ...systemEnUS,
  // The application's copy goes here, one group per feature. A shared group such as `navigation` is extended by
  // spreading the system one first, `navigation: { ...systemEnUS.navigation, orders: 'Orders' }`, since a group
  // written here replaces the system group of the same name rather than merging with it.
  tickets: {
    title: 'Service desk',
    description:
      'Report a repair request, follow how it is handled, and confirm the result.',
    new: 'New ticket',
    newDescription:
      'Describe what is broken and how urgent it is, with a screenshot if that helps.',
    search: 'Search tickets',
    statusLabel: 'Status',
    urgencyLabel: 'Urgency',
    categoryLabel: 'Category',
    assignee: 'Engineer',
    reporter: 'Reporter',
    createdAt: 'Reported',
    statusChangedAt: 'Last state change',
    resolvedAt: 'Resolved',
    closedAt: 'Closed',
    unassigned: 'Unassigned',
    allStatuses: 'All statuses',
    allUrgencies: 'All urgencies',
    clearOverdue: 'Show all tickets',
    clear: 'Clear filters',
    clearHint: 'Clear the filters to see every ticket you can access.',
    noResults: 'No tickets match these filters',
    noTickets: 'No tickets yet',
    total: '{{count}} tickets',
    loading: 'Loading tickets',
    status: {
      submitted: 'Pending assignment',
      assigned: 'Assigned',
      inProgress: 'Being handled',
      resolved: 'Waiting for confirmation',
      closed: 'Closed',
    },
    urgency: {
      low: 'Low',
      normal: 'Normal',
      high: 'High',
      urgent: 'Urgent',
    },
    category: {
      hardware: 'Hardware',
      software: 'Software',
      network: 'Network',
      account: 'Account and access',
      other: 'Other',
    },
    transition: {
      assign: 'Assign',
      reassign: 'Reassign',
      start: 'Start handling',
      resolve: 'Record resolution',
      confirm: 'Confirm and close',
      returnForRework: 'Return for further handling',
      reopen: 'Reopen',
    },
    commentKind: {
      comment: 'Comment',
      resolution: 'Resolution',
      system: 'System',
    },
    effectStatus: {
      queued: 'Queued',
      running: 'Sending',
      succeeded: 'Sent',
      failed: 'Failed',
      dead: 'Gave up',
      cancelled: 'Cancelled',
    },
    error: {
      sessionEnded: 'Your session has ended. Sign in again to continue.',
      denied: 'You do not have permission to view this ticket.',
      missing: 'This ticket does not exist or is no longer visible to you.',
      conflict:
        'Someone else changed this ticket first. Reload it and try again.',
      failed: 'The request could not be completed.',
      retry: 'Try again',
    },
    form: {
      title: 'Summary',
      titlePlaceholder: 'For example: the laptop will not power on',
      titleRequired: 'Describe the problem in a few words.',
      issue: 'What is the problem?',
      issuePlaceholder:
        'What happened, what you already tried, and anything the engineer should know.',
      issueHint:
        'The more precisely you describe the problem, the faster it can be handled.',
      category: 'Category',
      urgency: 'Urgency',
      screenshot: 'Screenshot',
      screenshotHint:
        'One image, up to 5 MB. It is visible only to you, the engineer and the service desk.',
      chooseScreenshot: 'Choose an image',
      removeScreenshot: 'Remove',
      submit: 'Submit ticket',
      submitting: 'Submitting…',
      cancel: 'Cancel',
    },
    detail: {
      title: 'Ticket details',
      request: 'Request',
      noDescription: 'No further description was given.',
      screenshot: 'Screenshot',
      preview: 'Preview',
      resolution: 'Resolution',
      reopenCount: 'Times reopened',
      actions: 'What you can do',
      noActions: 'There is nothing for you to do on this ticket right now.',
      blocked: 'Not available to you at this moment.',
      confirmAction: 'Confirm',
      transitionDone: '{{name}} — done.',
      transitionHint: {
        default: 'This change is recorded in the ticket history.',
        assign: 'Choose the engineer who should handle this ticket.',
        reassign: 'Choose the engineer who should take over.',
        start: 'Mark that handling has begun.',
        resolve:
          'Describe how the problem was solved. The reporter is asked to confirm.',
        confirm: 'Confirm the problem is solved. This closes the ticket.',
        returnForRework:
          'Explain what is still wrong. The ticket returns to the engineer.',
        reopen:
          'Explain why the ticket must be reopened. The service desk is notified.',
      },
      chooseEngineer: 'Choose an engineer',
      noEngineers: 'No engineer is available to assign yet.',
      resolutionPlaceholder: 'What was wrong, and what did you do?',
      reason: 'Reason',
      reasonPlaceholder: 'Why is the ticket not finished?',
      discussion: 'Discussion',
      noComments: 'No comments yet.',
      addComment: 'Add a comment',
      commentPlaceholder: 'Ask a question or add what you found.',
      post: 'Post',
      lastChange: 'Last change {{at}}',
      history: 'History',
      noHistory: 'Nothing has happened yet.',
      effect: '{{name}}: {{status}}',
    },
    dashboard: {
      title: 'Service desk at a glance',
      description: 'What needs attention right now.',
      pendingAssignment: 'Pending assignment',
      pendingAssignmentHint: 'Reported, no engineer yet',
      overdue: 'Overdue (over {{hours}} h)',
      overdueHint: 'Open longer than the service target',
      inProgress: 'Being handled',
      inProgressHint: 'An engineer is working on them',
      waitingConfirmation: 'Waiting for confirmation',
      waitingConfirmationHint: 'Handled, not yet confirmed',
      workload: 'Engineer workload',
      workloadActive: '{{count}} being handled',
      workloadWaiting: '{{count}} waiting for confirmation',
      noWorkload: 'No engineer is currently carrying a ticket.',
    },
    serviceDesk: {
      navigation: 'Service desk process',
      title: 'Repair handling process',
      description:
        'The states a ticket moves through, the parameters the process reads, and every recorded transition.',
      definitions: 'Definitions',
      executions: 'Executions',
      diagram: 'Process',
      end: 'Done',
      parameters: 'Parameters',
      parametersHint:
        'These values belong to the process definition in the application source and are shown here for reference.',
      overdueHours: 'Overdue after (hours)',
      maxReopenCount: 'Reopens allowed before service desk review',
      unavailable: 'The process definition is not available.',
      refresh: 'Refresh',
      workflow: 'Process',
      workflowName: 'Repair handling',
      ranAt: 'Recorded at',
      previous: 'Previous',
      next: 'Next',
      pageOf: 'Page {{page}} · {{total}} recorded transitions',
      noExecutions: 'No transition has been recorded yet.',
      history: 'History',
      historyHint:
        'Select a step to see the state the ticket stood in at that moment.',
      step: 'Step',
      transition: 'Transition',
      from: 'From',
      to: 'To',
      actor: 'By',
      time: 'Time',
      effects: 'Notices',
      effect: 'Notice',
      state: 'State',
      attempts: 'Attempts',
      error: 'Error',
      noEffects: 'This transition queued no notice.',
      executionParameters: 'Recorded parameters',
      snapshotHint:
        'Values as they were when this transition ran, not the current configuration.',
      showStep: 'Show step {{step}}',
      backToList: 'Back to executions',
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
