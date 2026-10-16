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
    schedules: 'Schedules',
    settings: 'Settings',
  },
  todos: {
    title: 'Todos',
    description:
      'The application\u2019s todos. A todo whose due time has passed and that is not completed is marked expired by the scheduled task \u201cCheck expired todos\u201d.',
    refresh: 'Refresh',
    column: {
      title: 'Title',
      dueAt: 'Due time',
      completed: 'Completed',
      expired: 'Expired',
    },
    yes: 'Yes',
    no: 'No',
    empty: 'No todos',
    emptyDescription: 'Nothing has been added to the list yet.',
    loadFailed: 'Could not load the todos. Please try again.',
  },
  settings: {
    title: 'Settings',
    description: 'Configure how this application behaves.',
    scheduledTasks: {
      title: 'Scheduled tasks',
      description:
        'Turn a task on or off. A change takes effect immediately and is stored by the scheduler.',
      empty: 'No scheduled tasks.',
      loadFailed: 'Could not load the scheduled tasks. Please try again.',
    },
  },
  schedules: {
    title: 'Schedules',
    description:
      'The scheduled tasks this application runs, and a way into each one\u2019s execution records.',
    refresh: 'Refresh',
    column: {
      title: 'Schedule',
      status: 'Status',
      results: 'Executions',
    },
    enabled: 'Enabled',
    disabled: 'Disabled',
    toggle: 'Enable or disable {{title}}',
    enabledToast: 'Enabled "{{title}}"',
    disabledToast: 'Disabled "{{title}}"',
    disable: 'Disable',
    disableConfirmTitle: 'Disable "{{title}}"?',
    disableConfirmDescription:
      'The scheduled task stops running until you enable it again.',
    toggleFailed: 'Could not change the schedule. Please try again.',
    viewResults: 'View executions',
    empty: 'No schedules',
    emptyDescription: 'No scheduled task is registered.',
    loadFailed: 'Could not load the schedules. Please try again.',
    status: {
      pending: 'Pending',
      running: 'Running',
      waiting: 'Waiting',
      succeeded: 'Succeeded',
      failed: 'Failed',
      skipped: 'Skipped',
      cancelled: 'Cancelled',
      timed_out: 'Timed out',
      triggered: 'Triggered',
    },
    occurrences: {
      title: 'Execution records',
      description: 'The most recent executions of \u201c{{title}}\u201d.',
      column: {
        startedAt: 'Started at',
        status: 'Status',
        result: 'Result',
      },
      updatedCount: 'Marked {{count}} todo(s) expired',
      empty: 'No executions',
      emptyDescription: 'This schedule has not run yet.',
      loadFailed: 'Could not load the execution records. Please try again.',
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
