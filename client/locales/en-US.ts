import type { LocaleResource } from '@nocobase/i18n';

import systemEnUS from './system/en-US.js';

const enUS = {
  // The template's own copy: the shell, the sign-in pages, shared components and the homepage. Keep it in
  // `./system/` so a template upgrade can replace it without touching the application's copy below.
  ...systemEnUS,
  // The application's copy goes here, one group per feature. A shared group such as `navigation` or `actions` is
  // extended by spreading the system one first: a group written here replaces the system group of the same name.
  actions: {
    ...systemEnUS.actions,
    create: 'Create',
    saving: 'Saving…',
    signInAgain: 'Sign in again',
  },
  'status.sessionExpired': 'Your session has ended. Sign in again to continue.',
  navigation: {
    ...systemEnUS.navigation,
    equipment: 'Equipment ledger',
  },
  equipment: {
    title: 'Equipment ledger',
    description: 'The shared devices the office can borrow and return.',
    fields: {
      code: 'Code',
      name: 'Name',
      status: 'Status',
      notes: 'Notes',
    },
    status: {
      available: 'Available',
      borrowed: 'Borrowed',
    },
    filters: {
      status: 'Filter by status',
      allStatuses: 'All statuses',
      clear: 'Clear filters',
    },
    actions: {
      label: 'Actions',
      more: 'More actions for "{{name}}"',
      edit: 'Edit',
    },
    create: {
      action: 'Add device',
      title: 'Add device',
      success: 'Added device "{{name}}"',
    },
    edit: {
      title: 'Edit device',
      success: 'Saved device "{{name}}"',
    },
    form: {
      description: 'Enter the device code, name and status.',
      codeRequired: 'Enter the device code',
      nameRequired: 'Enter the device name',
      codeTooLong: 'Use at most {{max}} characters',
      nameTooLong: 'Use at most {{max}} characters',
      notesTooLong: 'Use at most {{max}} characters',
      codeTaken: 'This device code is already in use',
    },
    empty: {
      title: 'No devices yet',
      description: 'Add the first device to start the ledger.',
      noResults: 'No devices match your filters',
    },
    error: {
      title: 'Devices could not be loaded',
      forbidden: 'You do not have permission to use the equipment ledger.',
      requestFailed: 'The request failed. Please try again.',
      notFound: 'This device does not exist or has been deleted.',
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
