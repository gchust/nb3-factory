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
      'Each todo has a due time. A background schedule marks every todo whose due time has passed and that is not completed as expired; it never changes a future or a completed one.',
    refresh: 'Refresh',
    loading: 'Loading todos',
    dueAt: 'Due {{date}}',
    createAction: 'New todo',
    complete: 'Mark as done',
    reopen: 'Mark as not done',
    updateFailed: 'The todo could not be updated. Try again.',
    updateForbidden: 'You are not allowed to change this todo.',
    status: {
      completed: 'Completed',
      expired: 'Expired',
      open: 'Open',
    },
    empty: {
      title: 'No todos yet',
      description:
        'Add a todo and it appears here with its due time and status.',
    },
    error: {
      title: 'The todos could not be loaded',
      description: 'Check the connection to the server and try again.',
      forbidden: 'You do not have access to todos',
      forbiddenDescription:
        'Ask an administrator for access to this page, or sign in with an account that has it.',
      retry: 'Try again',
    },
    form: {
      title: 'Title',
      titlePlaceholder: 'For example: submit the monthly report',
      titleRequired: 'Enter a title.',
      titleTooLong: 'Use at most 200 characters.',
      dueDate: 'Due date',
      dueTime: 'Due time',
      dueDateRequired: 'Pick a due date.',
      dueTimeRequired: 'Pick a due time.',
      pickDate: 'Pick a date',
      dueHint:
        'A due time in the past is allowed: the schedule marks the todo as expired the next time it runs.',
    },
    create: {
      title: 'New todo',
      description: 'Give the todo a title and a due time.',
      submit: 'Create',
      submitting: 'Creating…',
      cancel: 'Cancel',
      success: '“{{title}}” was created.',
      forbidden: 'You are not allowed to create a todo.',
      failed: 'The todo could not be created. Try again.',
    },
  },
  schedules: {
    title: 'Schedules',
    description:
      'Scheduled tasks registered by the application. Each run is recorded, so its execution records show what it did and when.',
    refresh: 'Refresh',
    loading: 'Loading schedules',
    enabled: '“{{title}}” is switched on.',
    disabled: '“{{title}}” is switched off.',
    forbidden: 'You are not allowed to manage schedules.',
    toggleFailed: 'The schedule could not be changed. Try again.',
    status: {
      active: 'Running',
      paused: 'Paused',
    },
    targetState: {
      ready: 'Ready',
      disabled: 'Target disabled',
      missing: 'Target missing',
      invalid: 'Target invalid',
    },
    nextRun: 'Next run',
    noNextRun: 'None planned',
    lastRun: 'Last run',
    neverRun: 'Not yet run',
    runs: 'Runs',
    runCounts: '{{runs}} total, {{succeeded}} succeeded',
    enable: 'Switch on',
    disable: 'Switch off',
    empty: {
      title: 'No schedules registered',
      description:
        'Schedules are declared in the application code; a registered one appears here with its plan and its execution records.',
    },
    occurrences: {
      open: 'Execution records',
      title: 'Execution records',
      subtitle: 'The runs this schedule recorded',
      refresh: 'Refresh',
      loading: 'Loading execution records',
      loadMore: 'Load more',
      loadMoreFailed: 'The next page could not be loaded. Try again.',
      empty: {
        title: 'No runs yet',
        description:
          'A run appears here as soon as the scheduler dispatches the plan.',
      },
      error: {
        title: 'The execution records could not be loaded',
        description: 'Check the connection to the server and try again.',
        notFound: 'This schedule no longer exists',
        notFoundDescription:
          'The application no longer registers it, so its records cannot be shown.',
        retry: 'Try again',
      },
    },
    occurrence: {
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
      executionCount: 'Attempt {{count}}',
      startedAt: 'Started',
      finishedAt: 'Finished',
      running: 'Still running',
      result: 'Result',
      expiredCount_one: '{{count}} todo marked as expired',
      expiredCount_other: '{{count}} todos marked as expired',
      reason: 'Reason: {{reason}}',
    },
    disableConfirm: {
      title: 'Switch off “{{title}}”?',
      description:
        'It stops running until it is switched back on. Its plan and its execution records are kept.',
      cancel: 'Keep running',
      confirm: 'Switch off',
    },
    error: {
      title: 'The schedules could not be loaded',
      description: 'Check the connection to the server and try again.',
      forbidden: 'You do not have access to schedules',
      forbiddenDescription:
        'Ask an administrator for access to this page, or sign in with an account that has it.',
      retry: 'Try again',
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
