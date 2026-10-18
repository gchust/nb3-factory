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
    scheduler: 'Schedules',
  },
  todos: {
    title: 'Todos',
    description:
      'A small list whose rows are exactly what the overdue check reads: a title, a deadline, whether the todo is done, and whether it has expired.',
    new: 'New todo',
    rule: 'A scheduled task marks every todo that is not completed and whose deadline has passed as expired.',
    viewSchedules: 'View schedules',
    capNotice: 'Showing the first {{shown}} of {{total}} todos.',
    empty: {
      title: 'No todos yet',
      description:
        'Add one, and watch the scheduled overdue check mark it as expired.',
    },
    table: {
      title: 'Title',
      dueAt: 'Deadline',
      completed: 'Completed',
      expired: 'Expired',
      actions: 'Actions',
    },
    value: {
      completed: 'Completed',
      open: 'Not completed',
      expired: 'Expired',
      notExpired: 'Not expired',
    },
    actions: {
      complete: 'Mark as completed',
      reopen: 'Reopen',
    },
    form: {
      description:
        'A title and a deadline. The deadline is the end of the day you pick.',
      title: 'Title',
      titlePlaceholder: 'What needs doing?',
      dueAt: 'Deadline',
      titleRequired: 'Enter a title.',
      titleTooLong: 'Use at most {{max}} characters.',
      dueAtRequired: 'Pick a deadline.',
    },
    create: {
      title: 'New todo',
      submit: 'Create',
      submitting: 'Creating…',
      success: 'Added “{{title}}”.',
    },
    complete: {
      success: 'Completed “{{title}}”.',
    },
    reopen: {
      success: 'Reopened “{{title}}”.',
    },
    error: {
      title: 'Something went wrong',
      requestFailed: 'The request failed. Please try again.',
      forbidden: 'You do not have permission to do that.',
      sessionExpired: 'Your session has ended. Sign in again to continue.',
      notFound: 'This todo no longer exists.',
    },
  },
  scheduler: {
    title: 'Schedules',
    description:
      'The application’s scheduled tasks: when each one runs, and what its last runs produced.',
    refresh: 'Refresh',
    enabled: 'Enabled',
    disabled: 'Disabled',
    enable: 'Enable',
    disable: 'Disable',
    enableSuccess: 'Enabled “{{title}}”.',
    disableSuccess: 'Disabled “{{title}}”.',
    actions: 'Actions for {{title}}',
    viewRuns: 'View runs',
    runsCount: '{{runCount}} runs · {{completedCount}} succeeded',
    columnTitle: 'Schedule',
    columnSchedule: 'Cron',
    columnStatus: 'Status',
    columnNextRunAt: 'Next run',
    columnLastRunAt: 'Last run',
    columnRuns: 'Runs',
    columnActions: 'Actions',
    targetState: {
      ready: 'Target ready',
      disabled: 'Target disabled',
      missing: 'Target missing',
      invalid: 'Target invalid',
    },
    empty: {
      title: 'No schedules',
      description: 'The application defines no scheduled tasks.',
    },
    error: {
      title: 'Unable to load schedules',
      requestFailed: 'The request failed. Please try again.',
      forbidden: 'You do not have permission to view schedules.',
    },
    runs: {
      title: 'Runs of {{title}}',
      description:
        'The newest firings first, with each one’s status and recorded result.',
      loading: 'Loading runs',
      failed: 'Unable to load runs',
      empty: 'This schedule has not run yet.',
      more: 'Older runs are not shown.',
      unfinished: '—',
      noResult: 'No result recorded.',
      columnStatus: 'Status',
      columnStartedAt: 'Started',
      columnFinishedAt: 'Finished',
      columnResult: 'Result',
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
