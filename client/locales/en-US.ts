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
  devices: {
    title: 'Device ledger',
    description:
      'The shared record of devices your team lends out. Every signed-in teammate sees the same list.',
    add: 'Add device',
    addTitle: 'Add a device',
    editTitle: 'Edit device',
    formDescription:
      'The code and name are kept exactly as entered, in either language.',
    code: 'Device code',
    name: 'Device name',
    status: 'Status',
    actions: 'Actions',
    editDevice: 'Edit {{name}}',
    filterStatus: 'Filter by status',
    allStatuses: 'All statuses',
    available: 'Available',
    borrowed: 'Borrowed',
    empty: 'No devices yet.',
    emptyFiltered: 'No devices have this status.',
    loading: 'Loading devices…',
    codeRequired: 'Enter a device code.',
    nameRequired: 'Enter a device name.',
    duplicateCode: 'This device code is already in use. Choose another code.',
    invalidInput: 'Check the device code and name, then try again.',
    notFound: 'This device no longer exists. Refresh the list.',
    loadFailed: 'The device list could not be loaded. Please try again.',
    retry: 'Retry',
    saveFailed: 'The device could not be saved. Please try again.',
    created: 'Device {{name}} was added.',
    saved: 'Device {{name}} was saved.',
    save: 'Save',
    saving: 'Saving…',
    cancel: 'Cancel',
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
