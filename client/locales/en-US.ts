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
    expenseReceipts: 'Receipts',
    expenseStatistics: 'Statistics',
    expenseDepartments: 'Departments',
    open: 'Open navigation',
    close: 'Close navigation',
    expand: 'Expand navigation',
    collapse: 'Collapse navigation',
    label: 'Application navigation',
  },

  expense: {
    common: {
      loading: 'Loading…',
      actions: 'Actions',
      view: 'View',
      delete: 'Delete',
    },
    fields: {
      number: 'Claim no.',
      applicant: 'Applicant',
      department: 'Department',
      manager: 'Manager',
      type: 'Type',
      reason: 'Reason',
      appliedAt: 'Applied on',
      status: 'Status',
      amount: 'Amount',
      receiptCount: 'Receipts',
      receiptType: 'Receipt type',
      invoiceDate: 'Invoice date',
      file: 'File',
      rejectReason: 'Rejection reason',
    },
    status: {
      draft: 'Draft',
      pending: 'Pending approval',
      approved: 'Approved',
      rejected: 'Rejected',
      paid: 'Paid',
    },
    type: {
      travel: 'Travel',
      hospitality: 'Hospitality',
      office: 'Office',
    },
    receiptType: {
      vatInvoice: 'VAT invoice',
      electronicInvoice: 'Electronic invoice',
      receipt: 'Receipt',
      other: 'Other',
    },
    claims: {
      title: 'Expense claims',
      description:
        'Create a claim, attach its receipts, then submit it for approval.',
      create: 'New claim',
      createSubmit: 'Create',
      creating: 'Creating…',
      createTitle: 'New expense claim',
      createDescription:
        'Choose a department and describe the expense. The amount is added up from the receipts.',
      empty: 'No expense claims yet.',
      submit: 'Submit for approval',
      cancel: 'Cancel claim',
      approve: 'Approve',
      reject: 'Reject',
      rejectTitle: 'Reject claim',
      markPaid: 'Mark as paid',
      info: 'Claim details',
      summary: 'Amount summary',
      notFound: 'This expense claim was not found.',
      backToList: 'Back to claims',
      departmentRequired: 'Choose a department.',
      reasonRequired: 'A reason is required.',
      departmentPlaceholder: 'Choose a department',
      amountIsDerived:
        'The amount is calculated from the receipts and cannot be entered by hand.',
    },
    receipts: {
      title: 'Receipts',
      description:
        'Receipts you may see. A claim keeps them inside its own record.',
      empty: 'No receipts yet.',
      addTitle: 'Add a receipt',
      add: 'Add receipt',
      adding: 'Adding…',
      chooseFile: 'Choose a file',
      preview: 'Preview',
      download: 'Download',
      remove: 'Remove',
      retry: 'Retry',
      fileRequired: 'Choose a file first.',
      amountInvalid: 'Enter an amount greater than 0.',
      typeRejected: 'Only images or PDF scans are allowed.',
      sizeRejected: 'The file is larger than the 5 MB limit.',
      tooManyFiles: 'Add one file at a time.',
      acceptedHint:
        'Images or PDF scans only, up to 5 MB each. A link cannot be entered instead of a file.',
    },
    statistics: {
      title: 'Reimbursement statistics',
      description:
        'Claim amounts and receipt counts grouped by department and by type.',
      byDepartment: 'By department',
      byType: 'By type',
      dimension: 'Group',
      claimCount: 'Claims',
      totalAmount: 'Total amount',
      total: 'Total',
      empty: 'No data yet.',
    },
    departments: {
      title: 'Departments',
      description:
        'Departments and the manager who approves their claims. A manager without a department approves every claim.',
      add: 'Add a department',
      addButton: 'Add',
      namePlaceholder: 'Department name',
      noManager: 'No manager',
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
