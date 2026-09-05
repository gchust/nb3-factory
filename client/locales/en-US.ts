import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  app: {
    title: 'NocoBase',
  },
  actions: {
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    language: 'Language',
  },
  account: {
    openMenu: 'Open account menu',
    fallback: 'Account',
    signOut: 'Sign out',
    signingOut: 'Signing out…',
  },
  navigation: {
    home: 'Home',
    open: 'Open navigation',
    close: 'Close navigation',
    expand: 'Expand navigation',
    collapse: 'Collapse navigation',
    label: 'Application navigation',
  },
  equipment: {
    navigation: {
      equipment: 'Equipment',
      borrowRecords: 'Borrow records',
    },
    home: {
      title: 'Equipment dashboard',
      description: 'Borrow and return office equipment',
      stats: {
        total: 'Total equipment',
        available: 'Available',
        borrowed: 'In use',
        repairing: 'In repair',
        activeBorrows: 'Active borrows',
      },
      browseEquipment: 'Browse equipment',
      viewBorrowRecords: 'View borrow records',
    },
    list: {
      title: 'Equipment',
      subtitle: 'Office equipment ledger',
      create: 'Add equipment',
      empty: 'No equipment has been registered yet.',
      searchPlaceholder: 'Search by name or asset number…',
    },
    records: {
      title: 'Borrow records',
      subtitle: 'Borrow and return history',
      empty: 'No borrow records yet.',
    },
    fields: {
      name: 'Name',
      assetNumber: 'Asset number',
      category: 'Category',
      status: 'Status',
      description: 'Description',
      borrower: 'Borrower',
      borrowedAt: 'Borrowed at',
      returnedAt: 'Returned at',
      note: 'Note',
      state: 'State',
      actions: 'Actions',
    },
    status: {
      available: 'Available',
      borrowed: 'Borrowed',
      repairing: 'In repair',
    },
    recordState: {
      open: 'Borrowed',
      returned: 'Returned',
    },
    actions: {
      edit: 'Edit',
      delete: 'Delete',
      borrow: 'Borrow',
      return: 'Return',
      confirmDelete: 'Delete this equipment?',
      confirmDeleteHint: 'Equipment with borrow history cannot be deleted.',
    },
    dialog: {
      createTitle: 'Add equipment',
      editTitle: 'Edit equipment',
      borrowTitle: 'Borrow equipment',
      borrowEquipmentLabel: 'Equipment',
      borrowNotePlaceholder: 'Purpose or note (optional)',
      statusHint: 'Status changes as equipment is borrowed and returned.',
    },
    errors: {
      loadFailed: 'Failed to load equipment.',
      loadRecordsFailed: 'Failed to load borrow records.',
      createFailed: 'Failed to add equipment.',
      updateFailed: 'Failed to save equipment.',
      deleteFailed: 'Failed to delete equipment.',
      borrowFailed: 'Failed to register the borrow.',
      returnFailed: 'Failed to register the return.',
      unavailable: 'This equipment is not available for borrowing.',
      unexpected: 'Something went wrong.',
    },
    toasts: {
      created: 'Equipment added.',
      updated: 'Equipment saved.',
      deleted: 'Equipment deleted.',
      borrowed: 'Borrow registered.',
      returned: 'Return registered.',
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
