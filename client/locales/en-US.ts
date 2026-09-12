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
    expenseClaims: 'Expense claims',
    open: 'Open navigation',
    close: 'Close navigation',
    expand: 'Expand navigation',
    collapse: 'Collapse navigation',
    label: 'Application navigation',
  },

  expenseClaims: {
    title: 'Expense claims',
    create: 'New claim',
    backToClaims: 'Back to claims',
    claimNumber: 'Claim number',
    applicant: 'Applicant',
    expenseType: 'Expense type',
    expenseDate: 'Expense date',
    totalAmount: 'Total amount',
    description: 'Description',
    status: 'Status',
    itemCount: 'Items',
    createdAt: 'Created at',
    reviewer: 'Reviewer',
    reviewedAt: 'Reviewed at',
    rejectReason: 'Reject reason',
    view: 'View',
    empty: 'No expense claims yet.',
    loadFailed: 'Failed to load expense claims.',
    notFound: 'Claim not found, or you are not allowed to view it.',
    createFailed: 'Failed to save the claim.',
    uploadFailed: 'Failed to upload attachment.',
    deleteFailed: 'Failed to delete attachment.',
    reviewFailed: 'Failed to submit the review.',
    statuses: {
      pending: 'Pending review',
      approved: 'Approved',
      rejected: 'Returned',
    },
    types: {
      travel: 'Travel',
      office: 'Office supplies',
      entertainment: 'Entertainment',
      transport: 'Transport',
      other: 'Other',
    },
    items: 'Claim items',
    itemName: 'Item name',
    amount: 'Amount',
    note: 'Note',
    addItem: 'Add item',
    removeItem: 'Remove item',
    sumOfItems: 'Sum of items',
    attachments: 'Attachments',
    chooseFiles: 'Choose files',
    noAttachments: 'No attachments.',
    removeAttachment: 'Remove',
    download: 'Download',
    approve: 'Approve',
    reject: 'Reject',
    rejectHint: 'Reason is required when returning a claim.',
    confirmReject: 'Confirm return',
    reviewSuccess: 'Review submitted.',
    deletedSuccess: 'Attachment deleted.',
    fieldRequired: 'This field is required.',
    dateFormatInvalid: 'Date must be in YYYY-MM-DD format.',
    dateHint: 'Format: YYYY-MM-DD',
    amountMismatch:
      'The sum of item amounts does not match the total amount. Please check your entries.',
    mustBeNumber: 'Please enter a number.',
    saveSuccess: 'Claim saved.',
    uploadHint: 'You can select multiple files at once.',
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
