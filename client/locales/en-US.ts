import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  app: {
    title: 'NocoBase',
  },
  actions: {
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    language: 'Language',
  },
  account: {
    openMenu: 'Open account menu',
    fallback: 'Account',
    signOut: 'Sign out',
    signingOut: 'Signing out…',
  },
  navigation: {
    home: 'Home',
    itServiceDesk: 'IT Service Desk',
    open: 'Open navigation',
    close: 'Close navigation',
    expand: 'Expand navigation',
    collapse: 'Collapse navigation',
    label: 'Application navigation',
  },
  itServiceDesk: {
    title: 'IT Service Desk',
    subtitle: 'Report IT issues and track how they get resolved.',
    newTicket: 'New ticket',
    searchLabel: 'Search',
    searchPlaceholder: 'Search title or description…',
    filterStatus: 'Status',
    filterPriority: 'Priority',
    filterCategory: 'Category',
    filterAll: 'All',
    clearFilters: 'Clear filters',
    loadError: 'Unable to load tickets.',
    empty: 'No tickets match your search.',
    view: 'View',
    previous: 'Previous',
    next: 'Next',
    totalTickets: '{{total}} tickets',
    pageInfo: 'Page {{page}} of {{pages}}',
    columns: {
      id: 'ID',
      title: 'Title',
      category: 'Category',
      priority: 'Priority',
      status: 'Status',
      assignee: 'Assignee',
      createdAt: 'Created',
      actions: 'Actions',
    },
    categories: {
      hardware: 'Hardware',
      software: 'Software',
      network: 'Network',
      account: 'Account',
      other: 'Other',
    },
    priorities: {
      low: 'Low',
      normal: 'Normal',
      high: 'High',
      urgent: 'Urgent',
    },
    statuses: {
      pending: 'Pending',
      inProgress: 'In progress',
      resolved: 'Resolved',
      closed: 'Closed',
    },
    detail: {
      back: 'Back to tickets',
      loadError: 'Unable to load the ticket.',
      notFound: 'This ticket does not exist (or has been removed).',
      requester: 'Requester',
      assignee: 'Assignee',
      unassigned: 'Unassigned',
      assignTo: 'Assign to',
      assign: 'Assign',
      created: 'Created',
      updated: 'Updated',
      description: 'Description',
      resolution: 'Resolution notes',
      noResolution: 'No resolution notes yet.',
      edit: 'Edit ticket',
      actionsTitle: 'Ticket actions',
      actionFailed: 'The update failed.',
      actions: {
        start: 'Start working',
        markResolved: 'Mark as resolved',
        close: 'Close ticket',
        backToPending: 'Back to pending',
        reopen: 'Reopen',
      },
    },
    form: {
      createTitle: 'Report an IT issue',
      createDescription: 'Describe what is broken so the desk can pick it up.',
      editTitle: 'Edit ticket #{{id}}',
      editDescription: 'Update the details, assignee or resolution notes.',
      titleLabel: 'Title',
      titlePlaceholder: 'Short summary of the problem',
      descriptionLabel: 'Description',
      descriptionPlaceholder: 'Describe the issue in detail…',
      categoryLabel: 'Category',
      priorityLabel: 'Priority',
      assigneeLabel: 'Assignee',
      unassignedOption: '— None —',
      resolutionLabel: 'Resolution notes',
      resolutionPlaceholder: 'What was done to solve it…',
      create: 'Create ticket',
      update: 'Save changes',
      errors: {
        required: 'Please fill in the required fields.',
        failed: 'The request failed.',
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
