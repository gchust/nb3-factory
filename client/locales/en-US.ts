import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  appearance: {
    title: 'Appearance',
    mode: 'Color mode',
    preset: 'Theme',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
    themes: { default: 'Default', compact: 'Compact' },
  },
  app: {
    title: 'NocoBase',
  },
  actions: {
    save: 'Save',
    saving: 'Saving…',
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
    teamTodos: 'Team Todos',
    open: 'Open navigation',
    close: 'Close navigation',
    expand: 'Expand navigation',
    collapse: 'Collapse navigation',
    label: 'Application navigation',
  },
  home: {
    title: 'Start building with your AI Agent',
    description:
      'Describe what you need, and your AI Agent will help you build it.',
    welcome: 'Welcome, {{name}}. ',
  },
  teamTodos: {
    title: 'Team Todos',
    newTodo: 'New Todo',
    editTodo: 'Edit Todo',
    deleteTodo: 'Delete Todo',
    searchPlaceholder: 'Search by title…',
    statusFilter: 'Status',
    allStatuses: 'All statuses',
    clearFilters: 'Clear',
    stats: {
      all: 'All',
      pending: 'Pending',
      inProgress: 'In Progress',
      completed: 'Completed',
    },
    status: {
      pending: 'Pending',
      inProgress: 'In Progress',
      completed: 'Completed',
    },
    priority: {
      normal: 'Normal',
      urgent: 'Urgent',
    },
    field: {
      title: 'Title',
      description: 'Description',
      status: 'Status',
      priority: 'Priority',
      dueDate: 'Due date',
      dueDatePlaceholder: 'YYYY-MM-DD',
    },
    titleRequired: 'Title is required',
    titleMaxLength: 'At most 100 characters',
    empty: 'No matching todos',
    emptyAll: 'No todos yet',
    deleteConfirm:
      'Are you sure you want to delete “{{title}}”? This cannot be undone.',
    delete: 'Delete',
    edit: 'Edit',
    loadFailed: 'Failed to load todos.',
    errors: {
      TITLE_REQUIRED: 'Title is required.',
      TITLE_TOO_LONG: 'Title must be at most 100 characters.',
      INVALID_STATUS: 'Invalid status.',
      INVALID_PRIORITY: 'Invalid priority.',
      INVALID_DUE_DATE: 'Invalid due date.',
      INVALID_BODY: 'Invalid request body.',
      INVALID_ID: 'Invalid todo id.',
      NOT_FOUND: 'Todo not found.',
      UNKNOWN: 'Something went wrong. Please try again.',
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
