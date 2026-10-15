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
  },
  navigation: {
    ...systemEnUS.navigation,
    devices: 'Devices',
  },
  devices: {
    title: 'Device ledger',
    description: 'The equipment this office lends out, and who has it.',
    fields: {
      code: 'Code',
      name: 'Name',
      status: 'Status',
      notes: 'Notes',
    },
    // The two values of a device's status. They are translated wherever they appear in the interface, while the code
    // and the name of a device are ordinary text that is stored and shown exactly as it was typed.
    status: {
      available: 'Available',
      borrowed: 'Borrowed',
    },
    filters: {
      status: 'Filter by status',
      allStatuses: 'All statuses',
      clear: 'Clear filter',
    },
    actions: {
      label: 'Actions',
      editNamed: 'Edit {{name}}',
    },
    create: {
      action: 'Add device',
      title: 'Add device',
      success: '“{{name}}” was added.',
    },
    edit: {
      title: 'Edit device',
      success: '“{{name}}” was saved.',
    },
    form: {
      description:
        'A code to identify the device and the name people know it by. Both are required, and the code cannot be used twice.',
      codeHint: 'Unique, such as DEV-003.',
      codeRequired: 'Enter a code.',
      codeTooLong: 'Use at most {{max}} characters.',
      codeTaken: 'Another device already uses this code.',
      nameRequired: 'Enter a name.',
      nameTooLong: 'Use at most {{max}} characters.',
      notesHint:
        'Free text, in whichever language you prefer. It is saved and shown as written.',
      notesTooLong: 'Use at most {{max}} characters.',
    },
    empty: {
      title: 'No devices yet',
      description: 'Add the first device this office lends out.',
      noResults: 'No device has this status.',
    },
    error: {
      title: 'Could not load the device ledger',
      requestFailed: 'Something went wrong. Please try again.',
      sessionExpired:
        'Your session has ended. Sign in again to see the ledger.',
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
