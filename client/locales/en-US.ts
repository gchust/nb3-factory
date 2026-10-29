import type { LocaleResource } from '@nocobase/i18n';

import systemEnUS from './system/en-US.js';

const enUS = {
  // The template's own copy: the shell, the sign-in pages, shared components and the homepage. Keep it in
  // `./system/` so a template upgrade can replace it without touching the application's copy below.
  ...systemEnUS,
  navigation: {
    ...systemEnUS.navigation,
    devices: 'Devices',
  },
  devices: {
    title: 'Device inventory',
    description:
      'Track the devices that can be borrowed and those already on loan, and filter the inventory by status.',
    loading: 'Loading devices…',
    fields: {
      code: 'Code',
      name: 'Name',
      status: 'Status',
      actions: 'Actions',
    },
    status: {
      available: 'Available',
      borrowed: 'Borrowed',
    },
    filters: {
      status: 'Filter by status',
      allStatuses: 'All statuses',
      clear: 'Clear filter',
    },
    empty: {
      title: 'No devices yet',
      description: 'Add the first device to start the inventory.',
      filtered: 'No devices have this status.',
    },
    create: {
      action: 'Add device',
      title: 'Add device',
      description: 'Add a device to the inventory. Its code must be unique.',
      submit: 'Add device',
      success: 'Device “{{name}}” was added.',
    },
    edit: {
      actionFor: 'Edit {{name}}',
      title: 'Edit device',
      description: "Update the device's name or availability.",
      submit: 'Save changes',
      success: 'Device “{{name}}” was updated.',
    },
    actions: {
      cancel: 'Cancel',
      saving: 'Saving…',
    },
    form: {
      codeRequired: 'Enter a device code.',
      codeTooLong: 'The device code must be at most 64 characters.',
      nameRequired: 'Enter a device name.',
      nameTooLong: 'The device name must be at most 100 characters.',
      codeTaken: 'This device code is already in use.',
    },
    error: {
      conflict: 'This device code is already in use.',
      validation: 'Check the highlighted fields and try again.',
      sessionExpired: 'Your session has ended. Sign in again.',
      forbidden: 'You do not have permission to manage devices.',
      notFound: 'This device no longer exists.',
      requestFailed: 'The device request could not be completed. Try again.',
      signIn: 'Sign in again',
      retry: 'Retry',
    },
  },
  // The application's copy goes here, one group per feature. A shared group such as `navigation` is extended by
  // spreading the system one first, `navigation: { ...systemEnUS.navigation, orders: 'Orders' }`, since a group
  // written here replaces the system group of the same name rather than merging with it.
};

/**
 * The shape every locale of this application follows, derived from the English wording above.
 *
 * Anything a plugin does not translate falls back to this namespace, so a term defined here is reused everywhere
 * without each plugin repeating it.
 */
export type AppResource = LocaleResource<typeof enUS>;

export default enUS;
