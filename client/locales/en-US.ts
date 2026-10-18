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
    equipments: 'Equipment',
  },
  equipment: {
    title: 'Equipment ledger',
    description:
      'One shared ledger of equipment the team can borrow. Codes and names stay exactly as entered.',
    filter: {
      label: 'Status',
      all: 'All statuses',
      available: 'Available',
      borrowed: 'Borrowed',
    },
    status: {
      available: 'Available',
      borrowed: 'Borrowed',
    },
    fields: {
      code: 'Code',
      name: 'Name',
      status: 'Status',
      notes: 'Notes',
      actions: 'Actions',
      notesEmpty: '—',
    },
    actions: {
      add: 'Add equipment',
      edit: 'Edit',
      save: 'Save',
      saving: 'Saving…',
      cancel: 'Cancel',
      close: 'Close',
      retry: 'Retry',
      clearFilters: 'Clear filters',
    },
    create: {
      title: 'Add equipment',
      description: 'Create a device in the shared ledger.',
    },
    edit: {
      title: 'Edit equipment',
      description: 'Update this device. Its code must stay unique.',
    },
    form: {
      codePlaceholder: 'For example, EQ-003',
      namePlaceholder: 'For example, Field camera',
      notesPlaceholder: 'Optional details about this device',
    },
    empty: {
      title: 'No equipment yet',
      description: 'Add the first device to start the shared ledger.',
      filteredTitle: 'No equipment matches this filter',
      filteredDescription: 'Choose another status or show all equipment.',
    },
    toast: {
      created: 'Equipment created.',
      updated: 'Equipment updated.',
    },
    validation: {
      codeRequired: 'Enter an equipment code.',
      codeTooLong: 'Use 64 characters or fewer for the code.',
      nameRequired: 'Enter an equipment name.',
      nameTooLong: 'Use 191 characters or fewer for the name.',
      notesTooLong: 'Use 2,000 characters or fewer for the notes.',
    },
    errors: {
      generic: 'Something went wrong. Please try again.',
      loadFailed: 'Unable to load equipment. Please try again.',
      saveFailed: 'Unable to save changes. Please try again.',
      sessionExpired: 'Your session has expired. Sign in again.',
      invalidInput: 'Check the highlighted fields and try again.',
      notFound: 'That equipment record no longer exists.',
      codeTaken: 'A device with this code already exists.',
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
