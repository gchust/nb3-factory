import type { LocaleResource } from '@nocobase/i18n';

import systemEnUS from './system/en-US.js';

const enUS = {
  // The template's own copy: the shell, the sign-in pages, shared components and the homepage. Keep it in
  // `./system/` so a template upgrade can replace it without touching the application's copy below.
  ...systemEnUS,
  // The application's copy goes here, one group per feature. A shared group such as `navigation` is extended by
  // spreading the system one first, `navigation: { ...systemEnUS.navigation, orders: 'Orders' }`, since a group
  // written here replaces the system group of the same name rather than merging with it.

  // The session-ended alert (`client/components/session-expired-alert.tsx`).
  'status.sessionExpired': 'Your session has ended. Sign in again to continue.',
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
  // The device ledger: a list of devices with a create and an edit dialog. User-entered codes and names are never
  // translated; only the surrounding copy and the fixed statuses below are.
  devices: {
    title: 'Devices',
    description:
      'Every device in the ledger, with its code, name and whether it is available or borrowed.',
    create: {
      title: 'New device',
      action: 'New device',
      success: 'Device "{{name}}" was created.',
    },
    edit: {
      title: 'Edit device',
      success: 'Device "{{name}}" was saved.',
    },
    fields: {
      code: 'Code',
      name: 'Name',
      status: 'Status',
    },
    form: {
      description: 'A device has a unique code, a name and a status.',
      codeRequired: 'Enter a code.',
      codeTooLong: 'A code can be at most {{max}} characters.',
      codeTaken: 'Another device already uses this code.',
      nameRequired: 'Enter a name.',
      nameTooLong: 'A name can be at most {{max}} characters.',
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
    empty: {
      title: 'No devices yet',
      description: 'Add a device to start the ledger.',
      noResults: 'No devices match this filter.',
    },
    error: {
      title: 'Unable to load devices',
      requestFailed: 'Something went wrong. Try again.',
      forbidden: 'You do not have permission to view devices.',
      notFound: 'This device no longer exists.',
    },
    capNotice:
      'Only the first {{count}} devices are shown. Use the status filter to narrow the list.',
    actions: {
      label: 'Actions',
      more: 'Actions for {{name}}',
      edit: 'Edit',
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
