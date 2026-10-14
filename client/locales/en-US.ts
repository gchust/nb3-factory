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
    description:
      'A minimal read-only list. The “检查过期待办” scheduled task marks past-due, unfinished rows as overdue.',
    capNotice: 'Showing the first {{count}} matching todos.',
    fields: {
      title: 'Title',
      dueAt: 'Due',
      completed: 'Completed',
      overdue: 'Overdue',
    },
    status: {
      completed: 'Completed',
      open: 'Open',
      overdue: 'Overdue',
      onTime: 'On time',
    },
    empty: {
      title: 'No todos yet',
      description: 'No todos have been recorded yet.',
    },
    error: {
      title: 'Could not load todos',
      requestFailed: 'The request failed. Try again.',
      sessionExpired: 'Your session has ended. Sign in again to continue.',
    },
  },
  scheduler: {
    title: 'Scheduled tasks',
    description:
      'The schedules this application defines, and the history of every time they ran.',
    enabled: 'Enabled',
    disabled: 'Disabled',
    targetState: {
      ready: 'Ready',
      disabled: 'Disabled',
      missing: 'Missing',
      invalid: 'Invalid',
    },
    fields: {
      title: 'Plan',
      cron: 'Cron',
      timezone: 'Time zone',
      enabled: 'Enabled',
      targetState: 'Target',
      targetType: 'Target type',
      nextRunAt: 'Next run',
      lastRunAt: 'Last run',
      runCount: 'Runs',
      completedCount: 'Succeeded',
    },
    actions: {
      label: 'Actions',
      viewOccurrences: 'Execution records',
      enable: 'Enable',
      disable: 'Disable',
      rowLabel: 'Actions for {{title}}',
      enableSuccess: 'Enabled “{{title}}”',
      disableSuccess: 'Disabled “{{title}}”',
      toggleFailed: 'The plan could not be changed. Try again.',
      disableConfirmTitle: 'Disable “{{title}}”?',
      disableConfirmDescription:
        'The plan stops running on its schedule. Its execution history is kept, and it can be enabled again later.',
    },
    empty: {
      title: 'No scheduled tasks',
      description: 'This application defines no schedule.',
    },
    error: {
      title: 'Could not load scheduled tasks',
      requestFailed: 'The request failed. Try again.',
    },
    detail: {
      breadcrumb: 'Execution records',
      title: 'Scheduled task',
      description: 'The plan and the history of its firings.',
      notFound: 'This schedule no longer exists.',
    },
    occurrences: {
      title: 'Execution records',
      empty:
        'This schedule has not run yet. Its first firing adds a record here.',
      error: 'The execution history could not be loaded.',
      loadMore: 'Load more',
      updatedCount: 'Marked {{count}} overdue',
      fields: {
        status: 'Status',
        startedAt: 'Started',
        finishedAt: 'Finished',
        executionCount: 'Attempts',
        result: 'Result',
      },
    },
    occurrenceStatus: {
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
