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
    saving: 'Saving…',
    signInAgain: 'Sign in again',
  },
  navigation: {
    ...systemEnUS.navigation,
    devices: 'Devices',
  },
  'status.sessionExpired': 'Your session ended. Sign in again to continue.',
  devices: {
    title: 'Devices',
    description: 'Track the devices the team can borrow.',
    capNotice:
      'Showing the first {{count}} devices. Narrow the filters to see the rest.',
    fields: {
      reference: 'Reference',
      name: 'Name',
      status: 'Status',
      remark: 'Remark',
      updatedAt: 'Updated',
    },
    status: {
      available: 'Available',
      borrowed: 'Borrowed',
    },
    filters: {
      status: 'Status',
      allStatuses: 'All statuses',
      clear: 'Clear filters',
    },
    create: {
      action: 'New device',
      title: 'New device',
      success: 'Device "{{name}}" created.',
    },
    edit: {
      title: 'Edit device',
      success: 'Device "{{name}}" saved.',
    },
    form: {
      description:
        'A reference and a name are required. The status says whether the device can be borrowed.',
      referenceRequired: 'Enter a reference.',
      referenceTooLong: 'The reference must be at most {{max}} characters.',
      nameRequired: 'Enter a name.',
      nameTooLong: 'The name must be at most {{max}} characters.',
      remarkTooLong: 'The remark must be at most {{max}} characters.',
      referenceTaken: 'A device with this reference already exists.',
    },
    actions: {
      label: 'Actions',
      more: 'More actions for {{name}}',
      edit: 'Edit',
    },
    empty: {
      title: 'No devices yet',
      description:
        'Add the first device to start tracking what the team can borrow.',
      noResults: 'No device matches the current filters.',
    },
    error: {
      title: 'Unable to load devices',
      forbidden: 'You do not have permission to view devices.',
      requestFailed: 'Something went wrong. Please try again.',
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
