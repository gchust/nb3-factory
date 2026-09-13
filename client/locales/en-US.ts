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
    expense: 'Expenses',
    expenseClaims: 'Expense claims',
    expenseLoans: 'Loans',
    expenseApprovals: 'Claim approvals',
    expensePayments: 'Review & payment',
    expenseStats: 'Expense statistics',
    open: 'Open navigation',
    close: 'Close navigation',
    expand: 'Expand navigation',
    collapse: 'Collapse navigation',
    label: 'Application navigation',
  },

  expense: {
    unassignedDepartment: 'Unassigned department',
    error: {
      load: 'Failed to load data.',
      action: 'The operation was not completed.',
    },
    status: {
      pending: 'Pending approval',
      approved: 'Approved',
      pending_payment: 'Awaiting payment',
      paid: 'Paid',
      rejected: 'Rejected',
    },
    category: {
      travel: 'Travel',
      transport: 'Transport',
      meal: 'Meals',
      office: 'Office supplies',
    },
    action: {
      approve: 'Approve',
      reject: 'Reject',
      review: 'Finance review',
      pay: 'Register payment',
    },
    table: {
      number: 'Claim no.',
      applicant: 'Applicant',
      department: 'Department',
      date: 'Date',
      amount: 'Amount',
      status: 'Status',
      actions: 'Actions',
      borrower: 'Borrower',
    },
    field: {
      department: 'Department',
      expenseDate: 'Date incurred',
      reason: 'Reason',
      category: 'Category',
      amount: 'Amount',
      remark: 'Remark',
      loan: 'Offset loan',
      noLoan: 'No loan',
      loanDate: 'Loan date',
      purpose: 'Purpose',
      attachments: 'Invoice attachments',
    },
    form: {
      basic: 'Claim information',
      items: 'Expense items',
      loanAndAttachments: 'Loan and attachments',
      addItem: 'Add item',
      removeItem: 'Remove',
      total: 'Total',
      reasonRequired: 'Please enter a reason.',
      itemsRequired: 'At least one expense item is required.',
      amountInvalid: 'Each item needs a positive amount.',
      saveFailed: 'The claim could not be saved.',
      lockedNotice:
        'Approved or paid claims cannot change their amounts or items; saving will be rejected.',
    },
    claims: {
      title: 'Expense claims',
      subtitle: 'Submit and track reimbursement claims.',
      new: 'New claim',
      edit: 'Edit claim',
      empty: 'No expense claims yet.',
    },
    detail: {
      back: 'Back to claims',
      edit: 'Edit',
      delete: 'Delete',
      deleteConfirm: 'Delete this claim?',
      rejectReason: 'Rejection reason',
      paymentDate: 'Payment date',
      settledLoan: 'Offset loan',
      noAttachments: 'No attachments.',
    },
    loans: {
      title: 'Loans',
      subtitle: 'Register borrowings and track their write-off.',
      new: 'New loan',
      empty: 'No loans yet.',
      settled: 'Settled',
      unsettled: 'Outstanding',
      settledLabel: 'Write-off status',
    },
    approvals: {
      title: 'Claim approvals',
      subtitle: 'Approve or reject claims from your department.',
      empty: 'Nothing awaiting approval.',
    },
    payments: {
      title: 'Finance review and payment',
      subtitle: 'Review approved claims and register payments.',
      empty: 'Nothing awaiting payment.',
    },
    stats: {
      title: 'Expense statistics',
      subtitle: 'Totals by department, category and month.',
      total: 'Total claimed',
      pending: 'Pending approval',
      count: 'Claims',
      byDepartment: 'By department',
      byCategory: 'By category',
      byMonth: 'By month',
      key: 'Name',
      empty: 'No data yet.',
    },
    attachments: {
      uploading: 'Uploading…',
      uploadFailed: 'Upload failed.',
      remove: 'Remove',
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
