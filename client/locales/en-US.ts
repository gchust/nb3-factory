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
      'Every todo, and whether the “Mark overdue todos” schedule has flagged it as past its due time.',
    refresh: 'Refresh',
    columns: {
      title: 'Title',
      dueAt: 'Due time',
      completed: 'Completed',
      overdue: 'Overdue',
    },
    completed: 'Completed',
    pending: 'Open',
    overdue: 'Overdue',
    onTime: 'On time',
    empty: 'No todos yet',
    emptyDescription:
      'Sample todos load with the database; whatever the table holds appears here.',
    errorTitle: 'Could not load todos',
    errorDescription: 'The request failed. Refresh to try again.',
  },
  schedules: {
    title: 'Schedules',
    description:
      'The scheduled tasks this application runs, and what each of their runs did.',
    refresh: 'Refresh',
    columns: {
      name: 'Name',
      schedule: 'Schedule',
      status: 'Status',
      nextRun: 'Next run',
      runs: 'Runs',
      actions: 'Actions',
    },
    status: {
      enabled: 'Enabled',
      disabled: 'Disabled',
      missing: 'Unavailable',
      invalid: 'Invalid',
    },
    never: 'Not planned',
    runs: '{{completed}} / {{total}}',
    enable: 'Enable',
    disable: 'Disable',
    executionResults: 'Execution results',
    noExecutions: 'This schedule has not run yet.',
    actionFailed: 'The schedule could not be changed.',
    empty: 'No schedules',
    emptyDescription: 'This application defines no scheduled tasks.',
    errorTitle: 'Could not load schedules',
    errorDescription: 'The request failed. Refresh to try again.',
    actionsFor: 'Actions for {{title}}',
    definitions: {
      markOverdueTodos: 'Mark overdue todos',
    },
    targets: {
      markOverdueTodos: 'Mark overdue todos',
    },
    occurrences: {
      status: 'Status',
      startedAt: 'Started at',
      detail: 'Detail',
      noDetail: 'No detail',
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
