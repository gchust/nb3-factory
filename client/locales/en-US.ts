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
  },
  todos: {
    title: 'Todos',
    description:
      'Every todo, and whether it is completed or has been marked expired by the schedule.',
    refresh: 'Refresh',
    loading: 'Loading todos',
    loadErrorTitle: 'Could not load todos',
    loadErrorDescription:
      'Something went wrong while loading the todo list. Try again.',
    retry: 'Retry',
    emptyTitle: 'No todos yet',
    emptyDescription: 'Todos appear here once they exist.',
    columns: {
      title: 'Title',
      dueAt: 'Due time',
      completed: 'Completed',
      expired: 'Expired',
    },
    completed: { yes: 'Completed', no: 'Open' },
    expired: { yes: 'Expired', no: 'Not expired' },
  },
  schedules: {
    title: 'Schedules',
    description:
      'Every scheduled task in this application, whether it is enabled, and what its recent runs did.',
    refresh: 'Refresh',
    loading: 'Loading schedules',
    loadErrorTitle: 'Could not load schedules',
    loadErrorDescription:
      'Something went wrong while loading the schedule list. Try again.',
    retry: 'Retry',
    enabled: 'Enabled',
    disabled: 'Disabled',
    inactive: 'No longer defined',
    enable: 'Enable',
    disable: 'Disable',
    never: 'Never',
    // The Scheduler API stores schedule titles as plain text. The application's own schedule is translated here by
    // its stable key, so the page reads correctly in every locale without editing the plugin.
    definitions: {
      todosCheckExpired: {
        title: 'Check expired todos',
        description:
          'Marks every open todo whose due time has passed as expired. Completed and future-dated todos are left alone.',
      },
    },
    targets: {
      todosMarkExpired: 'Check expired todos',
    },
    fields: {
      cron: 'Cron',
      timezone: 'Time zone',
      nextRunAt: 'Next run',
      lastRunAt: 'Last run',
      runCount: 'Runs',
      target: 'Task',
    },
    executions: {
      title: 'Recent executions',
      empty: 'This schedule has not run yet.',
      status: 'Status',
      startedAt: 'Started',
      finishedAt: 'Finished',
      result: 'Result',
    },
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
