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
    saving: 'Saving…',
  },
  navigation: {
    ...systemEnUS.navigation,
    tickets: 'Repair tickets',
    inbox: 'Inbox',
    team: 'Team',
  },
  dashboard: {
    title: 'IT service desk',
    description:
      'What is waiting for assignment, what is overdue, and how much each engineer is carrying.',
    counts: 'Ticket counts',
    viewAll: 'View all tickets',
    error: {
      load: 'Unable to load the dashboard. Please try again.',
    },
    pendingAssignment: {
      title: 'Waiting for assignment',
      description: 'Tickets nobody is handling yet.',
      empty: 'Nothing is waiting for assignment.',
    },
    overdue: {
      title: 'Unresolved for over 24 hours',
      description: 'Tickets that have not moved in more than a day.',
      empty: 'Nothing is overdue.',
    },
    workload: {
      title: 'Engineer workload',
      description: 'Open tickets assigned to each engineer.',
      empty: 'No engineer has an open ticket.',
      open: '{{count}} open',
    },
  },
  tickets: {
    title: 'Repair tickets',
    description:
      'Report a problem and follow how it is handled. What you see depends on your role.',
    report: 'Report a ticket',
    filter: {
      status: 'Status',
      urgency: 'Urgency',
      search: 'Search title or description',
      apply: 'Search',
      allStatuses: 'All statuses',
      allUrgencies: 'All urgencies',
    },
    status: {
      pending: 'Pending assignment',
      processing: 'In progress',
      resolved: 'Awaiting confirmation',
      closed: 'Closed',
    },
    urgency: {
      normal: 'Normal',
      urgent: 'Urgent',
      critical: 'Critical',
    },
    empty: {
      title: 'No tickets',
      description: 'Nothing matches the current filters.',
    },
    pagination: {
      summary: 'Page {{page}} of {{total}} · {{count}} tickets',
      previous: 'Previous',
      next: 'Next',
    },
    field: {
      title: 'Title',
      description: 'Description',
      urgency: 'Urgency',
      screenshots: 'Screenshots',
      chooseScreenshots: 'Add screenshots',
      noScreenshots: 'No screenshots yet',
      screenshotsHint: 'Up to 10 images, 10 MB each.',
      reporter: 'Reporter',
      assignee: 'Engineer',
      unassigned: 'Unassigned',
      chooseEngineer: 'Choose an engineer',
      createdAt: 'Reported at',
      statusChangedAt: 'Last status change',
      handling: 'Handling',
      handlingNote: 'Handling process',
      solution: 'Solution',
      lastReturnReason: 'Return reason',
      history: 'History',
      empty: 'Not recorded yet.',
    },
    create: {
      title: 'Report a ticket',
      description:
        'Describe the problem and attach a screenshot. The service desk dispatches it to an engineer.',
      required: 'A title and a description are required.',
      success: 'Ticket #{{id}} was created.',
      failed: 'Unable to create the ticket. Please try again.',
      submitting: 'Creating…',
    },
    action: {
      success: 'Done.',
      failed: 'Unable to complete the action. Please try again.',
      wrongState: 'Not available in the current state.',
    },
    transition: {
      assign: 'Assign',
      reassign: 'Reassign',
      progress: 'Record progress',
      resolve: 'Resolve',
      confirm: 'Confirm and close',
      return: 'Return for further handling',
      remind: 'Remind the service desk',
    },
    dialog: {
      description: 'This action is recorded on the ticket.',
      required: 'Fill in this field before continuing.',
      assign: {
        title: 'Assign an engineer',
        description: 'The engineer is notified and can start handling.',
      },
      reassign: {
        title: 'Reassign the ticket',
        description: 'The new engineer is notified.',
      },
      progress: {
        title: 'Record the handling process',
        description: 'What has been done so far.',
      },
      resolve: {
        title: 'Record the solution',
        description:
          'The reporter is notified and confirms the fix or returns the ticket.',
      },
      return: {
        title: 'Return for further handling',
        description: 'Tell the engineer why it is not resolved yet.',
      },
    },
    detail: {
      notFound: 'Ticket not found',
      backToList: 'Back to tickets',
    },
    error: {
      load: 'Unable to load tickets. Please try again.',
    },
    team: {
      title: 'Team',
      description:
        'Create accounts and give people the service-desk or engineer role.',
      members: 'Members',
      field: {
        name: 'Name',
        username: 'Username (optional)',
        email: 'Email',
        password: 'Password',
        roles: 'Roles',
      },
      create: {
        title: 'Add a member',
        submit: 'Create account',
        required: 'Name, email and password are required.',
        failed: 'Unable to create the account. Please try again.',
        success: 'The account was created.',
      },
      roles: {
        success: 'Roles updated.',
        failed: 'Unable to update roles. Please try again.',
      },
      error: {
        load: 'Unable to load the team. Please try again.',
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
