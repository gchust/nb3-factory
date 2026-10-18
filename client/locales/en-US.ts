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
    devices: 'Devices',
  },
  actions: {
    ...systemEnUS.actions,
    create: 'Create',
    edit: 'Edit',
    saving: 'Saving…',
    signInAgain: 'Sign in again',
  },
  'status.sessionExpired': 'Your session has ended. Sign in again to continue.',
  devices: {
    title: 'Devices',
    description:
      'The equipment ledger: what the team has, whether it is available, and where it is kept.',
    create: {
      action: 'New device',
      title: 'New device',
      success: 'Device “{{name}}” created.',
    },
    edit: {
      title: 'Edit device',
      success: 'Changes to “{{name}}” saved.',
    },
    fields: {
      code: 'Code',
      name: 'Name',
      status: 'Status',
      notes: 'Notes',
      actions: 'Actions',
    },
    status: {
      available: 'Available',
      borrowed: 'Borrowed',
    },
    form: {
      description:
        'The code must be unique. The status is stored as a value and shown in the current language.',
      codeRequired: 'Enter a code.',
      codeTooLong: 'The code must be at most {{max}} characters.',
      codeTaken: 'Another device already uses this code.',
      nameRequired: 'Enter a name.',
      nameTooLong: 'The name must be at most {{max}} characters.',
      notesTooLong: 'Notes must be at most {{max}} characters.',
    },
    filters: {
      status: 'Filter by status',
      allStatuses: 'All statuses',
      clear: 'Clear filter',
    },
    list: {
      total: 'Total: {{total}}',
      range: 'Showing {{first}}–{{last}} of {{total}}',
      page: 'Page {{page}} of {{totalPages}}',
      previous: 'Previous page',
      next: 'Next page',
      noNotes: 'No notes',
    },
    empty: {
      title: 'No devices yet',
      description: 'Add the first device so the team knows what is available.',
      filteredTitle: 'No devices match this filter',
      filteredDescription: 'Try another status, or clear the filter.',
    },
    actionsFor: 'Actions for {{name}}',
    error: {
      requestFailed: 'The request could not be completed. Please try again.',
      forbidden: 'You do not have permission to do that.',
      notFound: 'This device no longer exists.',
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
