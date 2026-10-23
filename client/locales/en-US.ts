import type { LocaleResource } from '@nocobase/i18n';

import systemEnUS from './system/en-US.js';

const enUS = {
  // The template's own copy: the shell, the sign-in pages, shared components and the homepage. Keep it in
  // `./system/` so a template upgrade can replace it without touching the application's copy below.
  ...systemEnUS,
  'navigation.todos': 'Todos',
  todos: {
    title: 'Todos',
    description:
      'Track due work. The scheduled task marks past-due, incomplete todos as expired.',
    refresh: 'Refresh',
    retry: 'Retry',
    empty: 'No todos yet.',
    loadFailed: 'Unable to load todos',
    loadFailedHint: 'The todo list could not be loaded. Try again.',
    yes: 'Yes',
    no: 'No',
    columns: {
      title: 'Title',
      dueAt: 'Due time',
      completed: 'Completed',
      expired: 'Expired',
      status: 'Status',
    },
    status: {
      completed: 'Completed',
      expired: 'Expired',
      overdue: 'Overdue',
      pending: 'Pending',
    },
  },
  scheduler: {
    title: 'Scheduler',
    description:
      'Review scheduled tasks, switch them on or off, and inspect each execution.',
    detailTitle: 'Schedule details',
    detailHint: 'The task definition and its recent execution history.',
    back: 'Back to schedules',
    refresh: 'Refresh',
    retry: 'Retry',
    empty: 'No scheduled tasks are defined.',
    loadFailed: 'Unable to load the scheduler',
    loadFailedHint:
      'The schedule or its history could not be loaded. Try again.',
    enabled: 'Enabled',
    disabled: 'Disabled',
    enableNamed: 'Enable {{name}}',
    disableNamed: 'Disable {{name}}',
    executionCounts: '{{completed}} of {{total}} succeeded',
    viewHistory: 'View history',
    history: 'Execution history',
    historyHint: 'Each firing of this schedule, newest first.',
    noHistory: 'This schedule has not run yet.',
    unknownSchedule: 'Unknown schedule',
    unknownTarget: 'Unknown task',
    noDescription: 'No description.',
    checkOverdueTodos: {
      title: 'Check overdue todos',
      description:
        'Marks past-due todos as expired without changing completed todos.',
      target: 'Mark overdue todos',
    },
    columns: {
      schedule: 'Schedule',
      enabled: 'Enabled',
      status: 'Status',
      nextRun: 'Next run',
      lastRun: 'Last run',
      executions: 'Successes',
      actions: 'History',
    },
    scheduleStatus: {
      active: 'Active',
      paused: 'Paused',
    },
    occurrenceColumns: {
      status: 'Result',
      startedAt: 'Started',
      finishedAt: 'Finished',
      executions: 'Attempts',
      result: 'Details',
      reason: 'Reason',
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
    fields: {
      key: 'Key',
      cron: 'Cron',
      timezone: 'Time zone',
      enabled: 'Enabled',
      status: 'Status',
      target: 'Task',
      nextRun: 'Next run',
      lastRun: 'Last run',
      runs: 'Executions',
    },
  },
  // The application's copy goes here, one group per feature. A shared group such as `navigation` is extended by
  // spreading the system one first, `navigation: { ...systemEnUS.navigation, orders: 'Orders' }`, since a group
  // written here replaces the system group of the same name rather than merging with it.
};

/**
 * The shape every locale of this application follows, derived from the English wording above.
 *
 * Anything a plugin does not translate falls back to this namespace, so a term defined here is reused everywhere
 * without each plugin repeating it.
 */
export type AppResource = LocaleResource<typeof enUS>;

export default enUS;
