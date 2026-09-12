import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  home: {
    title: 'Start building your application',
    description:
      'Describe what you need to your AI Agent, then build pages, data models, and business workflows.',
  },

  appearance: {
    title: 'Appearance',
    mode: 'Color mode',
    preset: 'Theme',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
    themes: { default: 'Default', compact: 'Compact' },
  },
  app: {
    title: 'NocoBase',
  },
  actions: {
    close: 'Close',
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
    officeSupplies: 'Office Supplies',
  },

  officeSupplies: {
    title: 'Office Supplies',
    description: 'Inventory and requisition records for office supplies.',
    addSupply: 'Add Supply',
    editSupply: 'Edit Supply',
    cancel: 'Cancel',
    save: 'Save',
    create: 'Create',
    loading: 'Loading supplies…',
    loadFailed: 'Failed to load the supply list. Please try again.',
    retry: 'Retry',
    empty: 'No office supplies yet. Add the first one.',
    inventory: 'Inventory',
    inventoryHint: 'A badge marks supplies with 5 or fewer items left.',
    back: 'Back to list',
    notFound: 'This office supply does not exist or has been deleted.',
    requisition: 'Requisition',
    confirmRequisition: 'Confirm',
    requisitionSuccess:
      'Requisition recorded: {{quantity}} of {{name}}; {{remaining}} left in stock.',
    requisitionRecords: 'Requisition records ({{count}})',
    requisitionRecordsHint:
      'Every requisition deducts the quantity from stock.',
    noRequisitions: 'No requisition records for this supply yet.',
    info: 'Supply information',
    deleteTitle: 'Delete “{{name}}”',
    deleteDescription:
      'Deleting the supply also removes every requisition recorded against it. This cannot be undone.',
    columns: {
      code: 'Code',
      name: 'Name',
      category: 'Category',
      quantity: 'Quantity',
      remark: 'Remark',
      actions: 'Actions',
      time: 'Time',
      requisitioner: 'Requisitioner',
    },
    fields: {
      code: 'Code',
      name: 'Name',
      category: 'Category',
      quantity: 'Quantity',
      unit: 'Unit',
      remark: 'Remark',
      requisitioner: 'Requisitioner',
      requisitionedAt: 'Requisition time',
      createdAt: 'Created',
    },
    form: {
      instructions: 'Fields marked with * are required.',
      codePlaceholder: 'e.g. BG-001',
      namePlaceholder: 'e.g. Ballpoint pen',
      categoryPlaceholder: 'e.g. Stationery',
      unitPlaceholder: 'e.g. pc',
      remarkPlaceholder: 'Optional remarks…',
    },
    requisitionForm: {
      hint: 'Available stock: {{quantity}} {{unit}}. The quantity is deducted immediately.',
      requisitionerPlaceholder: 'e.g. Zhang Wei',
      remarkPlaceholder: 'Optional remarks…',
    },
    stock: {
      lowStock: 'Low stock',
      outOfStock: 'Out of stock',
      quantity: '{{quantity}} {{unit}}',
    },
    actions: { view: 'View', edit: 'Edit', delete: 'Delete' },
    errors: {
      INVALID_INPUT: 'The input is invalid. Please check and try again.',
      CODE_CONFLICT: 'A supply with this code already exists.',
      INSUFFICIENT_STOCK:
        'Insufficient stock: the requisitioned quantity cannot exceed the available stock.',
      SUPPLY_NOT_FOUND: 'The office supply does not exist.',
      UNKNOWN: 'Something went wrong. Please try again.',
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
