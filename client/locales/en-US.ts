import type { LocaleResource } from '@nocobase/i18n';

import systemEnUS from './system/en-US.js';

const enUS = {
  // The template's own copy: the shell, the sign-in pages, shared components and the homepage. Keep it in
  // `./system/` so a template upgrade can replace it without touching the application's copy below.
  ...systemEnUS,
  // The application's copy goes here, one group per feature. A shared group such as `navigation` is extended by
  // spreading the system one first, `navigation: { ...systemEnUS.navigation, devices: 'Devices' }`, since a group
  // written here replaces the system group of the same name rather than merging with it.
  navigation: {
    ...systemEnUS.navigation,
    // The device ledger's menu entry (issue #701).
    devices: 'Device ledger',
  },
  actions: {
    ...systemEnUS.actions,
    create: 'Create',
    saving: 'Saving…',
    discard: 'Discard changes',
    signInAgain: 'Sign in again',
  },
  // A flat key, alongside the template's other `status.*` keys.
  'status.sessionExpired': 'Your session has ended. Sign in again to continue.',
  devices: {
    title: 'Device ledger',
    description:
      'Track the code, name and status of the devices the team shares.',
    search: {
      label: 'Search devices',
      placeholder: 'Search by code or name',
    },
    filters: {
      status: 'Filter by status',
      allStatuses: 'All statuses',
      clear: 'Clear filters',
    },
    fields: {
      code: 'Code',
      name: 'Name',
      status: 'Status',
    },
    status: {
      available: 'Available',
      borrowed: 'Borrowed',
    },
    actions: {
      label: 'Actions',
      more: 'More actions for "{{name}}"',
      edit: 'Edit',
    },
    create: {
      action: 'New device',
      title: 'New device',
      success: 'Added device "{{name}}"',
    },
    edit: {
      title: 'Edit device',
      success: 'Saved device "{{name}}"',
    },
    form: {
      description: 'Enter the device code, name and status.',
      codeRequired: 'Enter a device code',
      codeTooLong: 'Use at most {{max}} characters',
      nameRequired: 'Enter a device name',
      nameTooLong: 'Use at most {{max}} characters',
      codeTaken: 'This code is already used by another device',
    },
    empty: {
      title: 'No devices yet',
      description: 'Add the first device to start the ledger.',
      noResults: 'No devices match your filters',
    },
    error: {
      title: 'Devices could not be loaded',
      notFound: 'This device does not exist or has been deleted.',
      forbidden:
        'You do not have permission to view devices. Ask an administrator for access.',
      requestFailed: 'The request failed. Please try again.',
    },
    capNotice:
      'Only the first {{count}} devices are shown. Use search or filters to narrow the results.',
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
