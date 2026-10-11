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
    schedules: 'Scheduler',
  },
  todos: {
    title: 'Todos',
    description:
      'A todo is marked expired when its due time has passed and it is still incomplete. The scheduled “check expired todos” task performs that transition; this page only reads the result and lets you complete or reopen a todo.',
    refresh: 'Refresh',
    loading: 'Loading todos',
    columns: {
      title: 'Title',
      dueAt: 'Due at',
      status: 'Status',
      actions: 'Actions',
    },
    status: {
      pending: 'Pending',
      completed: 'Completed',
      expired: 'Expired',
    },
    action: {
      complete: 'Mark complete',
      reopen: 'Reopen',
    },
    toast: {
      completed: 'Marked “{{title}}” complete.',
      reopened: 'Reopened “{{title}}”.',
      failed: 'The change was not saved.',
    },
    error: {
      title: 'Unable to load todos',
      deniedTitle: 'Access denied',
      deniedDescription: 'You do not have permission to view todos.',
      unknown: 'An unknown error occurred.',
      retry: 'Retry',
    },
    empty: {
      title: 'No todos yet',
      description:
        'Todos appear here once the application database has been installed.',
    },
  },
  schedules: {
    title: 'Scheduler',
    description:
      'The schedules this application defines, and the record of each firing. A firing is planned by the built-in Scheduler; this page switches a schedule on or off and reads its history.',
    refresh: 'Refresh',
    loading: 'Loading schedules',
    columns: {
      title: 'Schedule',
      schedule: 'Cron',
      status: 'Status',
      nextRunAt: 'Next run',
      runs: 'Runs',
      actions: 'Actions',
    },
    status: {
      enabled: 'Enabled',
      disabled: 'Disabled',
    },
    runs: {
      value: '{{runCount}} runs · {{completedCount}} succeeded',
    },
    action: {
      viewRuns: 'History',
      enable: 'Enable',
      disable: 'Disable',
    },
    toast: {
      enabled: 'Enabled “{{title}}”.',
      disabled: 'Disabled “{{title}}”.',
      failed: 'The change was not saved.',
    },
    occurrences: {
      title: 'Execution history',
      description: 'Every firing of “{{title}}”, newest first.',
      loading: 'Loading history',
      columns: {
        status: 'Status',
        startedAt: 'Started',
        finishedAt: 'Finished',
        result: 'Result',
      },
      empty: {
        title: 'No firings yet',
        description: 'The next firing appears here after the schedule runs.',
      },
      expiredCount: 'Marked {{count}} todo(s) expired',
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
    error: {
      title: 'Unable to load schedules',
      deniedTitle: 'Scheduler access required',
      deniedDescription:
        'Your account has no access to the Scheduler. Ask an administrator for the Scheduler permission.',
      unknown: 'An unknown error occurred.',
      retry: 'Retry',
    },
    empty: {
      title: 'No schedules',
      description: 'No schedule is defined in this application.',
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
