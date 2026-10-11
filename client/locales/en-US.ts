import type { LocaleResource } from '@nocobase/i18n';

import systemEnUS from './system/en-US.js';

const enUS = {
  // The template's own copy: the shell, the sign-in pages, shared components and the homepage. Keep it in
  // `./system/` so a template upgrade can replace it without touching the application's copy below.
  ...systemEnUS,
  // This application's own feature copy. A shared group is extended by spreading the system one first, since a group
  // written here replaces the system group of the same name rather than merging with it.
  'status.sessionExpired': 'Your session has expired. Please sign in again.',
  actions: {
    ...systemEnUS.actions,
    create: 'Create',
    saving: 'Saving…',
    signInAgain: 'Sign in again',
  },
  navigation: {
    ...systemEnUS.navigation,
    tickets: 'Tickets',
    team: 'Team',
  },
  dashboard: {
    title: 'Service desk overview',
    description:
      'What needs attention: the pending-assignment queue, overdue tickets and each engineer’s workload.',
    metrics: {
      pending: 'Pending assignment',
      processing: 'In progress',
      resolved: 'Awaiting confirmation',
      overdue: 'Overdue',
      mine: 'Mine',
      closed: 'Closed',
    },
    pending: {
      title: 'Pending assignment',
      empty: 'Every ticket has been assigned.',
    },
    overdue: {
      title: 'Overdue (over 24 hours)',
      empty: 'No ticket is overdue.',
    },
    workload: {
      title: 'Engineer workload',
      empty: 'No engineer has been added yet.',
      engineer: 'Engineer',
      role: 'Role',
      open: 'Open',
      total: 'Total handled',
    },
    error: {
      title: 'Unable to load the dashboard',
      requestFailed: 'The dashboard could not be loaded. Please try again.',
    },
  },
  tickets: {
    title: 'Tickets',
    description:
      'Submit a repair request and follow it until the reporter confirms it is closed.',
    overdue: 'Overdue',
    capNotice:
      'Showing the first {{count}} matching tickets. Narrow the filters to see more.',
    create: {
      action: 'New ticket',
      title: 'New ticket',
      description: 'Describe the problem; screenshots help the engineer.',
      success: 'Ticket #{{id}} was submitted.',
    },
    search: {
      placeholder: 'Search title or description…',
      label: 'Search tickets',
    },
    filters: {
      status: {
        label: 'Status',
        open: 'Open',
        pending: 'Pending assignment',
        processing: 'In progress',
        resolved: 'Awaiting confirmation',
        closed: 'Closed',
      },
      urgency: 'Urgency',
      scope: 'Scope',
      allStatuses: 'All statuses',
      allUrgencies: 'All urgencies',
      clear: 'Clear filters',
    },
    scope: {
      all: 'All tickets',
      mine: 'Submitted by me',
      assigned: 'Assigned to me',
    },
    fields: {
      number: 'No.',
      title: 'Title',
      description: 'Description',
      status: 'Status',
      urgency: 'Urgency',
      reporter: 'Reporter',
      assignee: 'Assignee',
      attachments: 'Screenshots',
      updatedAt: 'Updated',
    },
    status: {
      pending: 'Pending assignment',
      processing: 'In progress',
      resolved: 'Awaiting confirmation',
      closed: 'Closed',
    },
    urgency: {
      low: 'Low',
      normal: 'Normal',
      high: 'High',
      urgent: 'Urgent',
    },
    roles: {
      engineer: 'Engineer',
      serviceDesk: 'Service desk',
    },
    empty: {
      title: 'No tickets yet',
      description: 'Submit a ticket and the service desk will assign it.',
      noResults: 'No ticket matches the current filters.',
    },
    error: {
      title: 'Unable to load tickets',
      requestFailed: 'The request failed. Please try again.',
      forbidden: 'You do not have permission to do that.',
      invalidAssignee: 'Choose an engineer from the list.',
      invalidInput: 'Check the form and try again.',
      invalidAttachment:
        'One of the screenshots is no longer available. Remove it and upload again.',
      invalidState:
        'The ticket has changed since the page was loaded. Reload and try again.',
    },
    form: {
      titleRequired: 'Enter a title.',
      titleTooLong: 'Keep the title within {{max}} characters.',
      descriptionRequired: 'Describe the problem.',
      descriptionTooLong: 'Keep the description within {{max}} characters.',
      actionRequired: 'This field is required.',
      attachmentsHint:
        'Up to {{count}} PNG, JPEG, GIF, WebP or BMP screenshots, {{size}} MB each.',
      chooseAttachments: 'Add screenshots',
      removeAttachment: 'Remove',
      retryAttachment: 'Retry',
      uploadFailed:
        'A screenshot could not be uploaded. Remove it and try again.',
    },
    actions: {
      assign: {
        action: 'Assign',
        title: 'Assign ticket #{{id}}',
        description: 'Choose the engineer who will handle it.',
        label: 'Engineer',
        confirm: 'Assign',
        success: 'Ticket #{{id}} was assigned.',
        placeholder: 'Select an engineer',
        noEngineers: 'No engineer is available. Add one from the Team page.',
      },
      process: {
        action: 'Record progress',
        title: 'Record progress on #{{id}}',
        description: 'What has been done so far.',
        label: 'Progress',
        confirm: 'Save',
        success: 'Progress on #{{id}} was recorded.',
      },
      resolve: {
        action: 'Mark resolved',
        title: 'Resolve ticket #{{id}}',
        description:
          'Describe the solution; the reporter confirms before it closes.',
        label: 'Solution',
        confirm: 'Mark resolved',
        success: 'Ticket #{{id}} is awaiting confirmation.',
      },
      return: {
        action: 'Return',
        title: 'Return ticket #{{id}}',
        description: 'Send the ticket back for more work.',
        label: 'Reason',
        confirm: 'Return',
        success: 'Ticket #{{id}} was returned for more work.',
      },
      close: {
        action: 'Confirm and close',
        title: 'Close ticket #{{id}}',
        description: 'Confirm the problem is solved.',
        label: 'Comment (optional)',
        confirm: 'Confirm and close',
        success: 'Ticket #{{id}} was closed.',
      },
      comment: {
        action: 'Add comment',
        title: 'Comment on ticket #{{id}}',
        description: 'Add a note for everyone involved.',
        label: 'Comment',
        confirm: 'Add comment',
        success: 'Comment added to #{{id}}.',
      },
    },
    detail: {
      description: 'Description',
      resolution: 'Solution',
      attachments: 'Screenshots',
      noAttachments: 'No screenshots.',
      history: 'History',
      system: 'System',
      notFoundTitle: 'Ticket not found',
      notFoundDescription:
        'This ticket does not exist or you cannot access it.',
    },
    record: {
      created: 'Ticket submitted',
      assigned: 'Assigned',
      processing: 'Progress recorded',
      resolved: 'Marked resolved',
      returned: 'Returned for more work',
      closed: 'Confirmed and closed',
      commented: 'Comment',
    },
  },
  team: {
    title: 'Team',
    description:
      'Give an account the engineer or service desk role. Everyone else can submit and follow their own tickets.',
    fields: { name: 'Name', email: 'Email', role: 'Role' },
    roles: { none: 'Employee' },
    actions: { label: 'Actions', more: 'Change the role of {{name}}' },
    update: { success: 'The role was updated.' },
    error: {
      title: 'Unable to load the team',
      requestFailed: 'The request failed. Please try again.',
      forbidden: 'Only an administrator can change team roles.',
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
