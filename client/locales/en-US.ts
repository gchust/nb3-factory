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
    home: 'Overview',
    notifications: 'Notifications',
    tickets: 'Tickets',
    users: 'Users',
  },
  notifications: {
    title: 'Notifications',
    open: 'Open notifications',
    loading: 'Loading notifications…',
    error: 'Notifications could not be loaded.',
    empty: 'You have no notifications yet.',
    unread: '{{count}} unread',
    readAll: 'Mark all read',
    viewAll: 'View all notifications',
  },
  serviceDesk: {
    dashboard: {
      title: 'Service desk',
      description:
        'See what needs attention, what is in progress, and how quickly requests are resolved.',
      total: 'Total tickets',
      allTime: 'All requests',
      active: 'Active',
      activeHint: '{{open}} open · {{assigned}} in progress',
      unassigned: 'Awaiting assignment',
      unassignedHint: 'Tickets no engineer has taken yet',
      workload: 'Engineer workload',
      workloadDescription:
        'Active tickets assigned to each engineer, busiest first.',
      workloadEmpty: 'No service desk engineer has been granted the role yet.',
      engineerActive: '{{count}} active',
      engineerOverdue: '{{count}} overdue',
      resolutionRate: 'Resolution rate',
      resolvedHint: '{{count}} resolved or closed',
      overdue: 'Overdue',
      overdueHint: 'Past the SLA target',
      recent: 'Recent tickets',
      recentDescription: 'The latest requests from your team.',
      noRecent: 'No tickets yet.',
      byPriority: 'By priority',
      byPriorityDescription: 'Where the current workload sits.',
      deniedTitle: 'Service desk is not available',
      deniedDescription:
        'Your account does not have permission to use the service desk.',
    },
    tickets: {
      title: 'Tickets',
      description:
        'Track requests from submission through resolution and confirmation.',
      search: 'Search tickets…',
      count: '{{count}} ticket(s)',
      page: 'Page {{page}} of {{totalPages}}',
      emptyTitle: 'No tickets yet',
      emptyDescription: 'Tickets submitted by your team will appear here.',
      emptyFiltered: 'No tickets match these filters. Try clearing them.',
      deniedTitle: 'Tickets are not available',
      deniedDescription:
        'Your account does not have permission to view service desk tickets.',
    },
    new: {
      title: 'New ticket',
      description:
        'Describe what you need. Your team can follow up in the ticket.',
      titlePlaceholder: 'A short summary of the request',
      descriptionPlaceholder:
        'What happened, what you have tried, and what would help.',
      chooseFiles: 'Choose files',
      fileHint: 'Up to {{count}} files, 5 MB each',
      tooManyFiles: 'You can attach up to {{count}} files.',
      fileTooLarge: '{{name}} is larger than 5 MB.',
      submit: 'Create ticket',
      created: 'Ticket #{{id}} created.',
    },
    ticket: {
      new: 'New ticket',
      loading: 'Ticket',
      drawerTitle: '#{{id}} · {{title}}',
      requesterDescription: 'Requested by {{name}}',
      unknownUser: 'Unknown user',
      unassigned: 'Unassigned',
      assignedTo: 'Assigned to {{name}}',
      overdue: 'Overdue',
      status: 'Status',
      priority: 'Priority',
      titleLabel: 'Title',
      descriptionLabel: 'Description',
      description: 'Description',
      requester: 'Requester',
      assignee: 'Assignee',
      created: 'Created',
      resolved: 'Resolved',
      dueAt: 'SLA due',
      updatedAt: 'Updated {{date}}',
      resolution: 'Resolution',
      attachments: 'Attachments',
      attachmentsCount: '{{count}} attachment(s)',
      noAttachments: 'No attachments.',
      activity: 'Activity',
      noActivity: 'No activity yet.',
      comments: '{{count}} comment(s)',
      actions: 'Actions',
      noActions: 'No actions are available for this ticket.',
      assignTo: 'Assign to an engineer',
      resolveLabel: 'Resolution note',
      resolvePlaceholder: 'Explain what fixed the issue.',
      confirmHint:
        'If the resolution works for you, confirm it to close the ticket.',
      reopenLabel: 'Reopen with a reason',
      reopenPlaceholder: 'What still needs attention?',
      addComment: 'Add a comment or update',
      commentPlaceholder: 'Share progress or ask for details.',
      deniedTitle: 'Ticket not available',
      deniedDescription: 'You do not have permission to view this ticket.',
    },
    status: {
      open: 'Open',
      assigned: 'In progress',
      resolved: 'Resolved',
      closed: 'Closed',
    },
    priority: {
      urgent: 'Urgent',
      high: 'High',
      normal: 'Normal',
      low: 'Low',
    },
    activity: {
      created: 'created the ticket',
      comment: 'commented',
      assigned: 'assigned the ticket',
      resolved: 'resolved the ticket',
      confirmed: 'confirmed the resolution',
      reopened: 'reopened the ticket',
    },
    actions: {
      search: 'Search',
      previous: 'Previous',
      next: 'Next',
      cancel: 'Cancel',
      close: 'Close',
      remove: 'Remove',
      viewAll: 'View all',
      assign: 'Assign',
      resolve: 'Resolve ticket',
      confirm: 'Confirm resolution',
      reopen: 'Reopen ticket',
      comment: 'Post comment',
    },
    actionSuccess: {
      assign: 'Ticket assigned.',
      comment: 'Comment posted.',
      resolve: 'Ticket resolved.',
      confirm: 'Resolution confirmed and ticket closed.',
      reopen: 'Ticket reopened.',
    },
    filters: {
      allStatuses: 'All statuses',
      allPriorities: 'All priorities',
    },
    permissionSets: {
      employee: 'Service desk employee',
      engineer: 'Service desk engineer',
      manager: 'Service desk manager',
    },
    users: {
      title: 'Users',
      description:
        'Manage who can submit tickets, engineer assignments, and service desk administration.',
      search: 'Search by name, username or email…',
      listTitle: 'Accounts',
      count: '{{count}} account(s)',
      loading: 'Loading accounts…',
      emptyTitle: 'No accounts found',
      emptySearch:
        'No account matches this search. Try another name or email address.',
      emptyDescription: 'Registered accounts will appear here.',
      page: 'Page {{page}} of {{totalPages}}',
      previous: 'Previous',
      next: 'Next',
      defaultRoleHint:
        'Every signed-in account has the service desk employee role by default, so people can submit and follow their own tickets immediately.',
      manageRoles: 'Manage roles',
      noRoles: 'No service desk role',
      enabled: 'Enabled',
      disabled: 'Disabled',
      manageTitle: 'Manage roles',
      manageDescription:
        'Choose the service desk roles for {{name}}. Role changes apply immediately.',
      defaultRoleInDialog:
        '{{role}} is granted to every signed-in account and does not need to be assigned here.',
      noAssignableRoles: 'No roles can be assigned here.',
      protectedRole: 'This role is managed outside user management.',
      saveRoles: 'Save roles',
      saved: 'Roles updated.',
      deniedTitle: 'User management is not available',
      deniedDescription:
        'Your account does not have permission to manage users.',
    },
    errors: {
      forbidden: 'You do not have permission to do this.',
      generic: 'The request failed. Try again.',
      notFound: 'This item no longer exists.',
      unauthenticated: 'Your session has expired. Sign in again.',
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
