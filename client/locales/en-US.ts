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
    saving: 'Saving…',
    signInAgain: 'Sign in again',
  },
  'status.sessionExpired': 'Your session has ended. Sign in again to continue.',
  devices: {
    title: 'Devices',
    description:
      'The device ledger: every device has a code, a name and a borrowing status.',
    add: 'Add device',
    empty: {
      title: 'No devices yet',
      description: 'Add the first device to start the ledger.',
    },
    noResults: 'No devices match this filter.',
    fields: {
      code: 'Code',
      name: 'Name',
      status: 'Status',
    },
    status: {
      available: 'Available',
      borrowed: 'Borrowed',
    },
    filter: {
      label: 'Filter by status',
      all: 'All statuses',
      clear: 'Clear filter',
    },
    create: {
      title: 'Add device',
      description: 'Enter the device code, name and status.',
      success: 'Device {{name}} was added.',
    },
    edit: {
      title: 'Edit device',
      description: 'Update the device code, name or status.',
      success: 'Device {{name}} was updated.',
    },
    form: {
      codePlaceholder: 'For example DEV-LAP-0001',
      namePlaceholder: 'Device name',
      statusPlaceholder: 'Select a status',
      codeRequired: 'Enter the device code.',
      codeTooLong: 'The device code must be at most {{max}} characters.',
      nameRequired: 'Enter the device name.',
      nameTooLong: 'The device name must be at most {{max}} characters.',
    },
    errors: {
      title: 'The device could not be loaded',
      loadFailed: 'The device list could not be loaded. Try again.',
      requestFailed: 'The request could not be completed.',
      codeTaken: 'A device with this code already exists.',
      notFound: 'The device does not exist.',
      sessionExpired: 'Your session has ended. Sign in again to continue.',
    },
    actions: {
      label: 'Actions',
      edit: 'Edit',
      more: 'Open the menu for {{name}}',
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
