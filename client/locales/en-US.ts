import type { LocaleResource } from '@nocobase/i18n';

import systemEnUS from './system/en-US.js';

const enUS = {
  // The template's own copy: the shell, the sign-in pages, shared components and the homepage. Keep it in
  // `./system/` so a template upgrade can replace it without touching the application's copy below.
  ...systemEnUS,
  // The application's copy goes here, one group per feature. A shared group such as `navigation` is extended by
  // spreading the system one first, `navigation: { ...systemEnUS.navigation, orders: 'Orders' }`, since a group
  // written here replaces the system group of the same name rather than merging with it.

  settings: {
    // The template owns the settings copy; extend it rather than redeclaring the
    // group, or every key added to the template copy disappears here.
    ...systemEnUS.settings,
    // Labels for this application's own `todos` fields in the record filter.
    permissionFields: {
      dueAt: 'Due at',
      completed: 'Completed',
      expired: 'Expired',
    },
  },
  todos: {
    collectionTitle: 'Todos',
    title: 'Todos',
    description:
      'The todo list behind the scheduled expiry check. The check runs every 30 seconds.',
    refresh: 'Refresh',
    retry: 'Try again',
    loading: 'Loading todos…',
    failed: 'The todo list could not be loaded.',
    denied: 'You do not have permission to view todos.',
    sessionEnded: 'Your session has ended. Refresh the page to sign in again.',
    total: '{{count}} todo(s)',
    expiredCount: '{{count}} overdue',
    completedCount: '{{count}} completed',
    dueAt: 'Due',
    completed: 'Completed',
    expired: 'Overdue',
    pending: 'Pending',
    expiryHint:
      'The scheduled task marks a todo overdue only when it is incomplete and its due time has passed. Running it again never adds a duplicate todo.',
    empty: 'No todos yet',
    emptyHint: 'The sample todos appear here once the seed has run.',
    schedules: {
      title: 'Scheduled tasks',
      description:
        'Schedules this application defines in code. Pause one here, or open its execution history.',
      definition: {
        title: 'Todo expiry marker',
        description:
          'Every 30 seconds, marks an unfinished todo overdue once its due time has passed. Repeating the check never adds a duplicate todo.',
      },
      target: {
        title: 'Todo expiry check',
      },
      detailTitle: 'Execution history',
      detailDescription:
        'Every firing of this schedule, newest first, with its result summary.',
      refresh: 'Refresh',
      back: 'Back to scheduled tasks',
      overview: 'Schedule',
      cron: 'Cron',
      timezone: 'Time zone',
      nextRun: 'Next run',
      lastRun: 'Last run',
      runCount: 'Firings',
      completedCount: 'Succeeded',
      enabled: 'Enabled',
      disabled: 'Paused',
      enable: 'Enable',
      disable: 'Pause',
      enabledToast: 'Schedule enabled.',
      disabledToast: 'Schedule paused.',
      saving: 'Saving…',
      never: 'Never',
      inactive: 'This schedule is no longer defined. Reason: {{reason}}',
      unknownReason: 'not recorded',
      empty: 'No schedules',
      emptyHint:
        'A schedule appears here after the application defines it and synchronization runs.',
      executions: 'Executions',
      noExecutions: 'No executions yet',
      noExecutionsHint:
        'The first execution appears after the schedule fires. Refresh to check again.',
      startedAt: 'Started',
      finishedAt: 'Finished',
      attempts: '{{count}} attempts',
      reason: 'Reason',
      result: 'Result',
      noResult: 'No result recorded',
      viewExecutions: 'Execution history',
      loadMore: 'Load more',
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
