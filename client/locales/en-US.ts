import type { LocaleResource } from '@nocobase/i18n';

import systemEnUS from './system/en-US.js';

const enUS = {
  // The template's own copy: the shell, the sign-in pages, shared components and the homepage. Keep it in
  // `./system/` so a template upgrade can replace it without touching the application's copy below.
  ...systemEnUS,
  // The application's copy goes here, one group per feature. A shared group such as `navigation` is extended by
  // spreading the system one first, `navigation: { ...systemEnUS.navigation, orders: 'Orders' }`, since a group
  // written here replaces the system group of the same name rather than merging with it.
  navigation: { ...systemEnUS.navigation, devices: 'Devices' },
  devices: {
    title: 'Device ledger',
    description: 'Record the devices and whether each one can be borrowed.',
    loading: 'Loading devices',
    capNotice: 'Showing the first {{count}} devices.',
    created: 'Device "{{name}}" was created.',
    saved: 'Device "{{name}}" was saved.',
    fields: {
      code: 'Code',
      name: 'Name',
      status: 'Status',
      notes: 'Notes',
    },
    // System values, so they are always translated; the device's own name and notes never are.
    status: {
      available: 'Available',
      borrowed: 'Borrowed',
    },
    filters: {
      all: 'All statuses',
      status: 'Filter by status',
      clear: 'Clear filter',
    },
    actions: {
      label: 'Actions',
      create: 'New device',
      edit: 'Edit {{name}}',
      save: 'Save',
      saving: 'Saving…',
      cancel: 'Cancel',
      retry: 'Retry',
      signIn: 'Sign in again',
    },
    empty: {
      title: 'No devices yet',
      description: 'Add the first device to start the ledger.',
      noResults: 'No device matches the selected status.',
    },
    create: {
      title: 'New device',
      description: 'Record a device and its availability.',
    },
    edit: {
      title: 'Edit device',
      description: 'Update the device details.',
    },
    form: {
      codePlaceholder: 'For example DEV-1001',
      namePlaceholder: 'For example ThinkPad T14',
      notesPlaceholder: 'Optional notes',
      codeRequired: 'Enter a device code.',
      nameRequired: 'Enter a device name.',
    },
    errors: {
      title: 'Could not load devices',
      requestFailed: 'The request failed. Try again.',
      forbidden: 'You do not have permission to view devices.',
      sessionExpired: 'Your session has ended. Sign in again.',
      codeTaken: 'This code is already used by another device.',
      notFound: 'This device no longer exists. Refresh the list and try again.',
      invalid: 'Check the entered values and try again.',
      unknown: 'The request failed. Try again.',
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
