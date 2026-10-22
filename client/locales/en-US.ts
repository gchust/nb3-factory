import type { LocaleResource } from '@nocobase/i18n';

import systemEnUS from './system/en-US.js';

const enUS = {
  // The template's own copy: the shell, the sign-in pages, shared components and the homepage. Keep it in
  // `./system/` so a template upgrade can replace it without touching the application's copy below.
  ...systemEnUS,
  'auth.realtimeUnavailable': 'Live updates are unavailable',
  'auth.realtimeUnavailableDescription':
    'The application is using regular requests. Retry live updates to try the realtime connection again.',
  // The application's copy goes here, one group per feature. A shared group such as `navigation` is extended by
  // spreading the system one first, `navigation: { ...systemEnUS.navigation, orders: 'Orders' }`, since a group
  // written here replaces the system group of the same name rather than merging with it.

  helpdesk: {
    nav: {
      dashboard: 'Service desk dashboard',
      tickets: 'Tickets',
    },
    loading: 'Loading…',
    status: {
      open: 'Open',
      processing: 'Processing',
      resolved: 'Resolved',
      closed: 'Closed',
    },
    priority: {
      low: 'Low',
      medium: 'Medium',
      high: 'High',
      urgent: 'Urgent',
    },
    category: {
      hardware: 'Hardware',
      software: 'Software',
      network: 'Network',
      access: 'Accounts and access',
      other: 'Other',
    },
    transition: {
      assign: 'Assign',
      reassign: 'Reassign',
      progress: 'Record progress',
      resolve: 'Resolve',
      confirm: 'Confirm resolution',
      return: 'Return to processing',
      remind: 'Send overdue reminder',
    },
    actions: {
      cancel: 'Cancel',
      clear: 'Clear',
      clearFilters: 'Clear filters',
      close: 'Close',
      confirm: 'Confirm',
      next: 'Next',
      previous: 'Previous',
      refresh: 'Refresh',
      reset: 'Reset',
      retry: 'Retry',
      save: 'Save',
      saving: 'Saving…',
      viewAll: 'View all',
    },
    filters: {
      allStatuses: 'All statuses',
      allPriorities: 'All priorities',
      overdue: 'Overdue only',
    },
    errors: {
      loadFailed: 'The request could not be completed.',
      required: 'This field is required.',
    },
    fields: {
      assignee: 'Assignee',
      assigneeId: 'Assignee user ID',
      category: 'Category',
      created: 'Created',
      description: 'Description',
      priority: 'Priority',
      reporter: 'Reporter',
      resolution: 'Resolution',
      status: 'Status',
      ticket: 'Ticket',
      title: 'Title',
      unassigned: 'Unassigned',
      updated: 'Updated',
      version: 'Version',
    },
    metrics: {
      all: 'All tickets',
      closed: 'Closed',
      overdue: 'Overdue',
      unassigned: 'Unassigned',
    },
    dashboard: {
      title: 'Service desk dashboard',
      description:
        'Ticket volume, urgency, categories and the latest activity in one view.',
      totals: 'Ticket totals',
      recent: 'Recent tickets',
      byPriority: 'Open work by priority',
      byCategory: 'Tickets by category',
      workload: 'Engineer workload',
      workloadHint: 'Assigned tickets by engineer and status.',
      engineer: 'Engineer',
      assignedTotal: 'Assigned',
      noEngineers: 'No engineers are available yet.',
      noTickets: 'No tickets yet.',
      noData: 'No data yet.',
      emptyTitle: 'Nothing to report yet',
      emptyDescription: 'Open the first ticket to start the service desk.',
    },
    tickets: {
      title: 'Tickets',
      description:
        'Every ticket you may see. Open one to work its lifecycle, comment or add an attachment.',
      search: 'Search tickets',
      create: 'New ticket',
      createDescription:
        'Describe the problem. The service desk will assign it to an engineer.',
      submit: 'Open ticket',
      submitting: 'Opening…',
      created: 'Ticket opened.',
      backToList: 'Back to tickets',
      noCreatePermission: 'Your role cannot open a ticket.',
      emptyTitle: 'No tickets yet',
      emptyDescription: 'Open a ticket when you need help.',
      noResults: 'No matching tickets',
      noResultsHint: 'Change the search or filters to find a ticket.',
    },
    detail: {
      opened: 'Opened {{date}}',
      notFound: 'This ticket was not found or you cannot view it.',
      information: 'Ticket information',
      actions: 'Available actions',
      actionsHint:
        'Only actions allowed by this ticket’s state and your role are shown.',
      noActions: 'No action is available to you in this state.',
      actionDescription:
        'This updates {{ticket}} and records the change in its lifecycle history.',
      actionDone: '{{action}} recorded.',
      conflictHint:
        'The ticket changed or the action was refused. Reload the ticket and try again.',
      permissionHint:
        'Some lifecycle actions are hidden because your role does not grant them.',
      field: {
        progressNote: 'Progress note',
        resolution: 'Resolution',
        reason: 'Reason for returning the ticket',
      },
    },
    comments: {
      title: 'Conversation',
      empty: 'No comments yet.',
      system: 'System',
      person: 'User {{id}}',
      add: 'Add a comment',
      placeholder: 'Share an update with the reporter and the engineer…',
      send: 'Send comment',
      sending: 'Sending…',
      added: 'Comment added.',
    },
    attachments: {
      title: 'Attachments',
      empty: 'No attachments.',
      upload: 'Upload a file',
      uploading: 'Uploading…',
      uploaded: 'Attachment uploaded.',
      download: 'Download',
      limit:
        'Up to 10 MB per file. Attachments are private to people who can view the ticket.',
    },
    history: {
      title: 'Lifecycle history',
      empty: 'No lifecycle transitions recorded yet.',
      you: 'You',
      system: 'System',
      person: 'User {{id}}',
    },
    reminders: {
      title: 'Overdue reminders',
      description:
        'Administrator-owned policy for reminders on tickets waiting too long in processing.',
      policy: 'Reminder policy',
      current: 'Current effective value: {{hours}} hour(s).',
      invalid: 'Enter a whole number between 1 and 720.',
      saved: 'Reminder policy saved.',
      readOnly: 'Your role can view this policy but cannot change it.',
      viewExecutions: 'View workflow executions',
      howItWorks: 'How reminders work',
      howItWorksBody:
        'A background job checks processing tickets every few minutes. When a ticket has not changed for {{hours}} hour(s), the system sends an in-app reminder to the service desk and adds a system comment. A later reminder waits for the next reminder interval.',
      liveHint:
        'The value is read when a reminder runs, so a change applies to the next check without restarting the application.',
      updated: 'Last saved {{date}}',
    },
    workflow: {
      title: 'Helpdesk workflow',
      description:
        'The ticket lifecycle owned by the application, its administrator-owned reminder policy and its authorized execution history.',
      workflow: 'Workflow',
      search: 'Search workflows',
      executionCount: 'Execution count',
      executionActivity: 'Executions',
      noDefinitions: 'No workflow definitions are registered.',
      ticketProcess: 'Ticket service process',
      definitionDescription:
        'Declared states and transitions, the live reminder policy and the connection between them. The process structure is owned by the application source.',
      definitionMissing: 'This workflow definition is not registered.',
      backToDefinitions: 'Back to workflow definitions',
      diagram: 'Process diagram',
      parameters: 'Business parameters',
      configure: 'Configure',
      livePolicy: 'Live reminder policy',
      reminderPolicy: 'Overdue reminder policy',
      reminderPolicyHint:
        'This value is stored by the application and read by the lifecycle on every reminder check.',
      reminderHours: 'Remind after (hours)',
      reminderHoursHint:
        'A whole number from 1 to 720 hours. The clock starts when the ticket last changed state.',
      triggerSummary:
        'The system-only “{{transition}}” transition fires for tickets in “{{state}}” after the configured interval.',
      tabs: {
        definitions: 'Definitions',
        executions: 'Executions',
      },
      ticketSearch: 'Filter by ticket ID',
      record: 'Ticket',
      transition: 'Transition',
      toState: 'To state',
      fromState: 'From state',
      time: 'Time',
      executionDetail: 'Execution detail',
      executionDetailDescription:
        'The recorded transition, input, diagram position and effect attempts.',
      executionMissing: 'This execution was not found.',
      openTicket: 'Open ticket',
      backToExecutions: 'Back to executions',
      noExecutions: 'No lifecycle executions have been recorded.',
      pageOf: 'Page {{page}} of {{pageCount}} · {{total}} execution(s)',
      executionId: 'Execution ID',
      ticket: 'Ticket',
      actor: 'Actor',
      recordedInput: 'Recorded input',
      noRecordedInput: 'This transition recorded no input.',
      viewCurrentPolicy: 'View current workflow policy',
      history: 'Lifecycle history',
      historyHint:
        'Select a step to view the diagram at that point. The latest step remains the current position.',
      step: 'Step',
      noHistory: 'No history was recorded.',
      effects: 'Effect runs',
      effect: 'Effect',
      effectState: 'State',
      attempts: 'Attempts',
      error: 'Error',
      noEffects: 'No effects ran for this transition.',
      executionParameters: 'Execution parameters',
      snapshotHint:
        'This shows what the execution recorded. Current policy is shown separately on the workflow definition.',
      showStep: 'Show step {{step}}',
      effectStatus: {
        success: 'Succeeded',
        failed: 'Failed',
        running: 'Running',
        pending: 'Pending',
        skipped: 'Skipped',
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
