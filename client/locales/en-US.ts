import type { LocaleResource } from '@nocobase/i18n';

import systemEnUS from './system/en-US.js';

const enUS = {
  // The template's own copy: the shell, the sign-in pages, shared components and the homepage. Keep it in
  // `./system/` so a template upgrade can replace it without touching the application's copy below.
  ...systemEnUS,
  // The application's copy goes here, one group per feature. A shared group such as `navigation` is extended by
  // spreading the system one first, `navigation: { ...systemEnUS.navigation, orders: 'Orders' }`, since a group
  // written here replaces the system group of the same name rather than merging with it.
  todos: {
    title: 'Todos',
    description: 'Plan your work and let the application flag what is overdue.',
    createTitle: 'Add a todo',
    createDescription: 'A title and a due time are enough to start.',
    titleLabel: 'Title',
    titlePlaceholder: 'What needs to be done?',
    dueLabel: 'Due',
    add: 'Add todo',
    adding: 'Adding…',
    saveFailed: 'The todo could not be saved. Try again.',
    listTitle: 'Your todos',
    listDescription:
      'The overdue schedule checks every five minutes and marks unfinished, past-due todos as expired.',
    total: '{{total}} todos',
    loadFailed: 'The todos could not be loaded.',
    retry: 'Try again',
    done: 'Done',
    status: 'Status',
    actions: 'Actions',
    empty: 'No todos yet. Add the first one above.',
    markComplete: 'Mark {{title}} complete',
    markIncomplete: 'Reopen {{title}}',
    editNamed: 'Edit {{title}}',
    deleteNamed: 'Delete {{title}}',
    statuses: {
      completed: 'Completed',
      pending: 'Pending',
      overdue: 'Overdue',
      expired: 'Expired',
    },
    pageOf: 'Page {{page}} of {{pages}}',
    previous: 'Previous',
    next: 'Next',
    editTitle: 'Edit todo',
    editDescription: 'Change the title or give the todo a new due time.',
    cancel: 'Cancel',
    saving: 'Saving…',
    save: 'Save',
    deleteTitle: 'Delete this todo?',
    deleteDescription:
      '“{{title}}” will be removed permanently. This cannot be undone.',
    delete: 'Delete',
    deleteFailed: 'The todo could not be deleted. Try again.',
  },
  schedulerAdmin: {
    title: 'Schedules',
    description:
      'Review the tasks this application runs on a schedule, and pause or resume them.',
    hint: 'Execution history is kept by the Scheduler plugin. Open a schedule to inspect its runs, or enable and disable it here.',
    updateFailed: 'The schedule could not be changed. Try again.',
    empty: 'No schedules are defined for this application.',
    statusActive: 'Active',
    statusPaused: 'Paused',
    statusInactive: 'Definition removed',
    updating: 'Updating…',
    enable: 'Enable',
    disable: 'Disable',
    cron: 'Cron',
    nextRun: 'Next run',
    lastRun: 'Last run',
    never: 'Never',
    runs: '{{count}} runs',
    completedRuns: '{{count}} completed',
    target: 'Target',
    targetStates: {
      ready: 'Ready',
      disabled: 'Disabled',
      missing: 'Missing',
      invalid: 'Invalid',
    },
    history: 'Execution history',
    historyTitle: '{{title}} — execution history',
    historyDescription:
      'Every firing of this schedule, newest first. A firing records whether the target accepted it and what it returned.',
    historyEmpty: 'This schedule has not run yet.',
    historyStatus: 'Status',
    historyStarted: 'Started',
    historyFinished: 'Finished',
    historyResult: 'Result',
    historyFirst: 'First page',
    historyClose: 'Close',
    occurrenceStatuses: {
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
    key: 'Key: {{key}}',
    pageOf: 'Page {{page}} of {{pages}}',
    previous: 'Previous',
    next: 'Next',
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
