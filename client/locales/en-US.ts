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
      'The seeded todos the "Check overdue todos" schedule acts on. The schedule, not this page, sets the overdue mark.',
    empty: 'No todos.',
    dueAt: 'Due {{value}}',
    status: {
      completed: 'Completed',
      pending: 'Pending',
      expired: 'Overdue',
    },
    action: {
      markCompleted: 'Mark completed',
      markPending: 'Mark incomplete',
    },
    error: {
      failed: 'Unable to load or update todos. Please try again.',
    },
  },
  schedules: {
    title: 'Schedules',
    description:
      'The scheduled tasks this application defines, when each next runs, and what its earlier runs did.',
    empty: 'No schedules.',
    field: {
      cron: 'Schedule',
      key: 'Key',
      nextRunAt: 'Next run',
      lastRunAt: 'Last run',
      runCount: 'Runs',
      runCountValue: '{{runs}} total, {{succeeded}} succeeded',
    },
    status: {
      enabled: 'Enabled',
      disabled: 'Disabled',
    },
    targetState: {
      ready: 'Ready',
      disabled: 'Target disabled',
      missing: 'Target missing',
      invalid: 'Target invalid',
    },
    action: {
      enable: 'Enable',
      disable: 'Disable',
      showOccurrences: 'Execution results',
      hideOccurrences: 'Hide results',
    },
    occurrences: {
      title: 'Execution results',
      empty: 'This schedule has not run yet.',
      result: 'Marked {{value}} overdue',
      noResult: 'No result',
    },
    occurrenceStatus: {
      pending: 'Pending',
      running: 'Running',
      waiting: 'Waiting',
      triggered: 'Triggered',
      succeeded: 'Succeeded',
      skipped: 'Skipped',
      failed: 'Failed',
      cancelled: 'Cancelled',
      timed_out: 'Timed out',
    },
    error: {
      failed: 'Unable to load or update schedules. Please try again.',
      occurrencesFailed: 'Unable to load execution results. Please try again.',
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
