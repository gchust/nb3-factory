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
    // Used by `SessionExpiredAlert`: it is offered when a request failed with 401.
    signInAgain: 'Sign in again',
  },
  'status.sessionExpired': 'Your session has ended. Sign in again to continue.',
  devices: {
    title: 'Devices',
    description:
      'Every device in the ledger, with the code that identifies it and whether it is available.',
    fields: {
      code: 'Code',
      name: 'Name',
      status: 'Status',
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
    create: {
      action: 'New device',
      title: 'New device',
      success: 'Added device “{{name}}”.',
    },
    edit: {
      title: 'Edit device',
      success: 'Saved device “{{name}}”.',
    },
    actions: {
      label: 'Actions',
      edit: 'Edit {{name}}',
    },
    form: {
      description: 'A device records its code, name and status.',
      codeRequired: 'Enter a device code.',
      codeTooLong: 'A code is at most {{max}} characters.',
      codeTaken: 'Another device already uses this code.',
      nameRequired: 'Enter a device name.',
      nameTooLong: 'A name is at most {{max}} characters.',
    },
    empty: {
      title: 'No devices yet',
      description: 'Add the first device to start the ledger.',
      noResults: 'No devices match this filter.',
    },
    error: {
      title: 'Unable to load devices',
      forbidden: 'You do not have permission to view devices.',
      requestFailed: 'The request failed. Please try again.',
      notFound: 'This device does not exist or has been deleted.',
    },
    capNotice:
      'Only the first {{count}} devices are shown. Filter by status to narrow the list.',
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
