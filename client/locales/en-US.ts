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
    itTickets: 'IT service desk',
    itTeam: 'Team & settings',
  },
  itTickets: {
    title: 'IT service desk',
    description:
      'Report a problem, follow its progress, and keep every conversation and screenshot with the ticket.',
    statuses: {
      pending: 'Pending assignment',
      in_progress: 'In progress',
      resolved: 'Resolved',
      closed: 'Closed',
    },
    urgencies: {
      low: 'Low',
      medium: 'Medium',
      high: 'High',
      critical: 'Critical',
    },
    actions: {
      newTicket: 'New ticket',
      viewTickets: 'View all tickets',
      retry: 'Retry',
      comment: 'Add comment',
      progress: 'Record progress',
      return: 'Reopen',
      assign: 'Assign',
      reassign: 'Reassign',
      resolve: 'Resolve',
      close: 'Close ticket',
      updated: 'Ticket updated',
      signInAgain: 'Sign in again',
    },
    dashboard: {
      title: 'Service desk overview',
      description: 'What is waiting, moving, and overdue right now.',
      pendingAssignment: 'Waiting for assignment',
      inProgress: 'In progress',
      resolvedAwaiting: 'Awaiting confirmation',
      overdue: 'Overdue (older than {{hours}}h)',
      myOpen: '{{count}} open ticket for you',
      myOpen_other: '{{count}} open tickets for you',
      workload: 'Engineer workload',
      workloadDescription: 'Open and overdue tickets per engineer.',
      workloadEmpty: 'No engineer has received a ticket yet.',
      engineerLoad: '{{open}} open · {{overdue}} overdue',
      loadFailed: 'Unable to load the overview',
      setupTitle: 'Finish setting up the service desk',
      setupDescription:
        'Add an engineer account, then assign the first ticket. Demo accounts and an overdue ticket are available in team settings.',
      setupAction: 'Open team settings',
    },
    list: {
      title: 'Tickets',
      description: 'Search and filter the tickets you are allowed to see.',
      loadFailed: 'Unable to load tickets',
      noMatches: 'No tickets match',
      noMatchesDescription: 'Try a different search term or clear the filters.',
      emptyTitle: 'No tickets yet',
      emptyDescription:
        'When someone reports a problem, it appears here with its whole history.',
    },
    filters: {
      search: 'Search tickets',
      status: 'Status',
      allStatuses: 'All statuses',
      openStatuses: 'Open tickets',
      urgency: 'Urgency',
      allUrgencies: 'All urgencies',
      clear: 'Clear filters',
    },
    columns: {
      number: 'Number',
      title: 'Title',
      status: 'Status',
      urgency: 'Urgency',
      requester: 'Requester',
      assignee: 'Assignee',
      createdAt: 'Created',
      updatedAt: 'Updated',
    },
    pagination: {
      summary: '{{total}} tickets · page {{page}} of {{pages}}',
      previous: 'Previous',
      next: 'Next',
    },
    unassigned: 'Unassigned',
    create: {
      title: 'New IT ticket',
      description:
        'Describe what is wrong. Screenshots help the engineer understand the problem faster.',
      notAllowedTitle: 'You cannot submit tickets',
      notAllowedDescription:
        'Your current permissions do not include creating an IT ticket.',
      titlePlaceholder: 'Short summary, for example “Laptop will not start”',
      titleHint: '{{count}}/120 characters',
      descriptionPlaceholder:
        'What happened, what you expected, and anything you already tried.',
      descriptionHint:
        'Include error messages, device names, or steps that reproduce the problem.',
      urgencyHint:
        'Choose Critical only when work is completely blocked for several people.',
      screenshotHint:
        'PNG, JPEG, GIF or WebP. Up to {{count}} images, {{size}} each.',
      chooseFiles: 'Choose screenshots',
      addMoreFiles: 'Add more screenshots',
      unsupportedFile:
        '“{{name}}” is not a supported image. Choose a PNG, JPEG, GIF or WebP file.',
      corruptFile:
        '“{{name}}” is not a valid image. Choose another screenshot.',
      submit: 'Submit ticket',
      submitting: 'Submitting…',
      created: 'Ticket submitted',
      failed: 'The ticket could not be submitted. Try again.',
      titleRequired: 'Enter a title.',
      titleTooLong: 'Keep the title to 120 characters or fewer.',
      descriptionRequired: 'Describe the problem.',
      tooManyFiles: 'Attach at most {{count}} screenshots.',
      fileTooLarge: '“{{name}}” is larger than {{size}}.',
      removeFile: 'Remove {{name}}',
      noFiles: 'No screenshots attached',
    },
    fields: {
      title: 'Title',
      description: 'Description',
      urgency: 'Urgency',
      screenshots: 'Screenshots',
      assignee: 'Engineer',
      note: 'Progress note',
      resolution: 'Resolution',
      reason: 'Reason',
      comment: 'Comment',
    },
    errors: {
      sessionExpired: 'Your session has ended. Sign in again to continue.',
      requestFailed: 'The request failed. Try again.',
      forbidden: 'You are not allowed to do this.',
      permissionCheckFailed: 'Unable to check your permissions.',
      invalidState:
        'This ticket has already moved on. Refresh the page and try again.',
    },
    detail: {
      title: 'Ticket details',
      description: 'The problem, its history, and the people handling it.',
      summary: 'Details',
      opened: 'Opened',
      lastUpdated: 'Last updated',
      resolved: 'Resolved',
      closed: 'Closed',
      resolution: 'Resolution',
      attachments: 'Screenshots',
      noAttachments: 'No screenshots were attached to this ticket.',
      timeline: 'Activity',
      noActivity: 'No activity yet.',
      openAttachment: 'Open attachment',
      notFoundTitle: 'Ticket unavailable',
      notFoundDescription:
        'This ticket does not exist, or you do not have permission to view it.',
      loadFailed: 'Unable to load the ticket',
    },
    activity: {
      created: 'Ticket submitted',
      assigned: 'Assigned',
      progress: 'Progress recorded',
      comment: 'Comment',
      resolved: 'Resolved',
      returned: 'Reopened',
      closed: 'Closed',
    },
    actionDialog: {
      assignTitle: 'Assign an engineer',
      assignDescription: 'The engineer starts handling the ticket immediately.',
      assigneeRequired: 'Choose an engineer.',
      loadingEngineers: 'Loading engineers…',
      engineersFailed: 'Unable to load the engineer list.',
      chooseEngineer: 'Choose an engineer',
      assignHint:
        'Only engineers and service-desk members appear here. The chosen person can process the ticket immediately.',
      progressTitle: 'Record progress',
      progressDescription:
        'Add a note to the timeline. The ticket stays in progress.',
      progressPlaceholder: 'What did you check or change?',
      resolveTitle: 'Resolve the ticket',
      resolveDescription:
        'Explain what fixed the problem. The requester confirms the result.',
      resolvePlaceholder: 'What was the cause, and what fixed it?',
      returnTitle: 'Reopen the ticket',
      returnDescription:
        'Send the ticket back to the engineer when the problem is not solved.',
      returnPlaceholder: 'What is still wrong?',
      commentTitle: 'Add a comment',
      commentDescription: 'Everyone who can see the ticket can read this note.',
      commentPlaceholder: 'Add an update or ask a question.',
      closeTitle: 'Close the ticket',
      closeDescription:
        'Confirm that the problem is solved. The ticket becomes read-only in the list.',
      closeHint: 'This records the confirmation in the activity timeline.',
      contentRequired: 'Enter a note.',
      contentHint: 'This text is added to the activity timeline.',
    },
  },
  serviceDesk: {
    title: 'Service desk settings',
    description:
      'Manage who handles tickets, assign the IT roles, and load demonstration data.',
    actions: {
      addMember: 'Add team member',
    },
    team: {
      title: 'Team',
      description:
        'Everyone with an IT role. Changing a role applies the new access immediately.',
      loading: 'Loading team',
      loadFailed: 'Unable to load the team',
      emptyTitle: 'No team members yet',
      emptyDescription:
        'Add the first employee, engineer, or service desk member.',
      roleUpdated: 'Role updated',
    },
    columns: {
      member: 'Member',
      role: 'Role',
      added: 'Added',
    },
    roles: {
      default: 'Employee (default access)',
      'it-engineer': 'Engineer',
      'it-service-desk': 'Service desk',
    },
    fields: {
      name: 'Name',
      email: 'Email',
      password: 'Initial password',
      role: 'Role',
    },
    create: {
      title: 'Add a team member',
      description: 'Create an account and choose the IT role it starts with.',
      submit: 'Create account',
      submitting: 'Creating…',
      created: 'Account created',
      nameRequired: 'Enter a name.',
      emailRequired: 'Enter an email address.',
      emailInvalid: 'Enter a valid email address.',
      passwordTooShort: 'Use at least 8 characters.',
      emailHint:
        'The person signs in with this address. Use a real address if they need password reset email.',
      passwordHint:
        'At least 8 characters. Share it securely and ask them to change it.',
      roleHint:
        'Engineers process assigned tickets. Service desk members can assign, manage the team, and see every ticket.',
      emailTaken: 'An account with this email already exists.',
    },
    demo: {
      title: 'Demonstration data',
      description:
        'Four demo accounts and four tickets, including one older than 24 hours. Loading is safe to repeat.',
      engineerAccount: 'Engineer account',
      employeeAccount: 'Employee account',
      password: 'Password',
      load: 'Load demo data',
      loading: 'Loading demo data…',
      loaded: 'Demo data loaded',
      loadFailed: 'Could not load demo data',
      accountHint:
        'Sign in with these usernames, or with the matching @it-demo.example.com email address.',
      note: 'After loading, sign in as the demo engineer to verify that an engineer sees only assigned tickets. The overdue ticket sends a reminder to the service desk.',
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
