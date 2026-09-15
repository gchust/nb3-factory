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
  },

  contracts: {
    nav: {
      ledger: 'Contract ledger',
      stats: 'Contract statistics',
    },
    title: 'Contract ledger',
    description: 'Track every contract, its versions and its scanned files.',
    loading: 'Loading contracts',
    empty: 'No contracts found.',
    actions: {
      create: 'New contract',
      view: 'View',
      edit: 'Edit',
      save: 'Save',
      cancel: 'Cancel',
      back: 'Back to list',
      search: 'Search',
      download: 'Download',
    },
    filter: {
      type: 'Filter by type',
      status: 'Filter by status',
      allTypes: 'All types',
      allStatuses: 'All statuses',
      expiring: 'Expiring within 30 days',
      search: 'Search contracts',
      searchPlaceholder: 'Name, number or counterparty',
      reset: 'Reset filters',
    },
    type: {
      sale: 'Sale',
      purchase: 'Purchase',
      service: 'Service',
      lease: 'Lease',
    },
    status: {
      draft: 'Draft',
      active: 'Active',
      expired: 'Expired',
      terminated: 'Terminated',
    },
    fields: {
      contractNo: 'Contract no.',
      name: 'Contract name',
      counterparty: 'Counterparty',
      type: 'Type',
      signedDate: 'Signed date',
      effectiveDate: 'Effective date',
      expiryDate: 'Expiry date',
      amount: 'Amount',
      owner: 'Owner',
      status: 'Status',
      remainingDays: 'Days left',
      actions: 'Actions',
      uploadedAt: 'Uploaded',
    },
    remaining: {
      days: '{{count}} days',
      expired: 'Expired',
    },
    detail: {
      notFound: 'Contract not found.',
      versions: 'Versions and scans',
      noVersions: 'No versions yet.',
      unassigned: 'Scans without a version',
      noAttachments: 'No scans in this version.',
      versionLabel: 'Version {{version}}',
      createVersion: 'Add a version',
      remaining: 'Days to expiry',
      noDownloadPermission:
        'You may view this contract, but not download its scans.',
    },
    versionForm: {
      versionNo: 'Version number',
      description: 'Version notes',
      submit: 'Save version',
    },
    form: {
      createTitle: 'New contract',
      editTitle: 'Edit contract',
      requiredError: 'Please fill in every required field.',
      amountError: 'Amount must be a non-negative number.',
      processing: 'Saving…',
      placeholderContractNo: 'e.g. HT-2026-0006',
      placeholderName: 'Contract name',
      placeholderCounterparty: 'Counterparty',
      placeholderAmount: '0.00',
    },
    errors: {
      loadFailed: 'Something went wrong while loading.',
      saveFailed: 'Could not save the contract.',
      CONTRACT_NO_CONFLICT: 'A contract with this number already exists.',
      FORBIDDEN: 'You do not have permission for this action.',
    },
    stats: {
      title: 'Contract statistics',
      byType: 'By type',
      byStatus: 'By status',
      key: 'Category',
      count: 'Contracts',
      amount: 'Total amount',
      total: 'Total',
      empty: 'No data to summarize.',
    },
    upload: {
      action: 'Choose file',
      uploading: 'Uploading…',
      hint: 'Allowed: {{types}} · up to {{limit}} per file',
      errors: {
        UNSUPPORTED_FILE_TYPE: 'File type ".{{extension}}" is not allowed.',
        FILE_TOO_LARGE: 'The file exceeds the {{limit}} limit.',
        BODY_TOO_LARGE: 'The file is too large to upload.',
        INVALID_FILE: 'Please choose a file.',
        INVALID_VERSION: 'The selected version is invalid.',
        INTERNAL_ERROR: 'The upload failed. Please try again.',
      },
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
