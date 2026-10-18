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
    todos: 'Todos',
    scheduler: 'Scheduled tasks',
  },
  todos: {
    title: 'Todos',
    description: 'Keep track of what needs doing, ordered by due time.',
    showing: 'Showing {{count}}',
    loading: 'Loading todos…',
    refreshFailed: 'The list could not be refreshed.',
    toggleFailed: 'Could not update the todo. Please try again.',
    search: {
      placeholder: 'Search todos',
      clear: 'Clear search',
    },
    columns: {
      completed: 'Completed',
      title: 'Todo',
      dueAt: 'Due',
      status: 'Status',
    },
    create: {
      action: 'New todo',
      title: 'New todo',
      description: 'Give it a title and a due time.',
    },
    edit: {
      title: 'Edit todo',
      description: 'Update the title or move the due time.',
    },
    form: {
      titleLabel: 'Title',
      titlePlaceholder: 'What needs to be done?',
      dueAtLabel: 'Due',
      dueAtPlaceholder: 'Choose a date',
      timeLabel: 'Time',
      titleRequired: 'Enter a title.',
      titleTooLong: 'Keep the title to 200 characters or fewer.',
      dueAtRequired: 'Choose a due date.',
      timeInvalid: 'Enter a valid time.',
      saveFailed: 'Could not save the todo. Please try again.',
      saving: 'Saving…',
    },
    calendar: {
      previousMonth: 'Previous month',
      nextMonth: 'Next month',
    },
    status: {
      pending: 'Pending',
      completed: 'Completed',
      expired: 'Overdue',
    },
    actions: {
      menu: 'Todo actions',
      edit: 'Edit',
      delete: 'Delete',
      markComplete: 'Mark as completed',
      markIncomplete: 'Mark as pending',
    },
    delete: {
      title: 'Delete todo?',
      description:
        '“{{title}}” will be permanently deleted. This cannot be undone.',
      action: 'Delete',
      deleting: 'Deleting…',
      failed: 'Could not delete the todo. Please try again.',
    },
    empty: {
      title: 'No todos yet',
      description: 'Create the first todo and give it a due time.',
    },
    noResults: {
      title: 'No matching todos',
      description: 'Try a different search term.',
      action: 'Clear search',
    },
    loadError: {
      title: 'Could not load todos',
      description: 'Check your connection and try again.',
    },
    notFound: {
      title: 'Todo not found',
      description:
        'It may have been deleted. Close this dialog to see the current list.',
    },
    toast: {
      created: 'Todo created.',
      updated: 'Todo updated.',
      deleted: 'Todo deleted.',
    },
  },
  scheduler: {
    title: 'Scheduled tasks',
    description:
      'Schedules registered by the application and the result of each run.',
    refresh: 'Refresh',
    loading: 'Loading schedules…',
    loadError: {
      title: 'Could not load schedules',
      description: 'Check your connection and try again.',
    },
    toggleFailed: 'Could not change the schedule. Please try again.',
    empty: {
      title: 'No schedules',
      description: 'No scheduled task is registered in this application.',
    },
    columns: {
      title: 'Task',
      schedule: 'Schedule',
      status: 'Status',
      nextRun: 'Next run',
      actions: 'Actions',
    },
    status: {
      enabled: 'Enabled',
      disabled: 'Disabled',
    },
    runCount: '{{count}} runs · {{completed}} succeeded',
    actions: {
      enable: 'Enable',
      disable: 'Disable',
    },
    records: {
      action: 'Execution records',
      title: 'Execution records',
      description: 'Newest runs of “{{title}}”.',
      loading: 'Loading execution records…',
      empty: 'This schedule has not run yet.',
      error: {
        title: 'Could not load execution records',
        description: 'Check your connection and try again.',
      },
      columns: {
        started: 'Started',
        status: 'Status',
        finished: 'Finished',
        result: 'Result',
      },
    },
    occurrenceStatus: {
      pending: 'Pending',
      waiting: 'Waiting',
      running: 'Running',
      succeeded: 'Succeeded',
      failed: 'Failed',
      skipped: 'Skipped',
      cancelled: 'Cancelled',
      timed_out: 'Timed out',
      triggered: 'Triggered',
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
