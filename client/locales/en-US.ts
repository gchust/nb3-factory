import type { LocaleResource } from '@nocobase/i18n';

import systemEnUS from './system/en-US.js';

const enUS = {
  // The template's own copy: the shell, the sign-in pages, shared components and the homepage. Keep it in
  // `./system/` so a template upgrade can replace it without touching the application's copy below.
  ...systemEnUS,
  // The application's copy goes here, one group per feature. A shared group such as `navigation` is extended by
  // spreading the system one first, `navigation: { ...systemEnUS.navigation, orders: 'Orders' }`, since a group
  // written here replaces the system group of the same name rather than merging with it.
  actions: {
    ...systemEnUS.actions,
    create: 'Create',
    edit: 'Edit',
    retry: 'Retry',
    saving: 'Saving…',
  },
  navigation: {
    ...systemEnUS.navigation,
    devices: 'Device ledger',
  },
  devices: {
    title: 'Device ledger',
    description:
      'Keep the devices the team can borrow, and see which ones are available.',
    total: 'Total: {{count}}',
    fields: {
      code: 'Device code',
      name: 'Device name',
      status: 'Status',
      notes: 'Notes',
    },
    status: {
      all: 'All statuses',
      available: 'Available',
      borrowed: 'Borrowed',
    },
    filter: {
      status: 'Filter by status',
      clear: 'Clear filter',
    },
    table: {
      actions: 'Actions',
    },
    create: {
      action: 'Add device',
      title: 'Add device',
      success: 'Added device “{{name}}”.',
    },
    edit: {
      title: 'Edit device',
      success: 'Saved device “{{name}}”.',
    },
    empty: {
      title: 'No devices yet',
      description: 'Add the first device to the ledger.',
      filteredTitle: 'No devices match this filter',
      filteredDescription: 'Choose another status, or clear the filter.',
    },
    error: {
      loadFailed: 'The device list could not be loaded.',
    },
    form: {
      description:
        'Enter the code and name printed on the device, and its current status.',
      codeRequired: 'Enter a device code.',
      codeTooLong: 'The device code must be at most {{max}} characters.',
      nameRequired: 'Enter a device name.',
      nameTooLong: 'The device name must be at most {{max}} characters.',
      notesTooLong: 'Notes must be at most {{max}} characters.',
      codeTaken: 'This device code is already in use.',
      notFound: 'This device no longer exists.',
      requestFailed: 'The device could not be saved. Please try again.',
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
