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
    description:
      'Register each expense with its reason, amount, date, and invoice attachments.',
    new: 'New expense claim',
    loading: 'Loading expense claims…',
    loadFailed: 'Could not load expense claims.',
    retry: 'Retry',
    empty: 'No expense claims yet.',
    notFound: 'Expense claim not found.',
    uploadFailed: 'Upload failed.',
    uploading: 'Uploading…',
    saving: 'Saving…',
    submitFailed: 'Could not save the expense claim.',
    reasonRequired: 'Please enter a reason.',
    amountInvalid: 'Please enter an amount greater than zero.',
    dateRequired: 'Please choose the date the expense happened.',
    attachmentsRequired: 'Attach at least one invoice.',
    backToList: 'Back to expense claims',
    fields: {
      amount: 'Amount',
      date: 'Date',
      attachments: 'Attachments',
    },
    table: {
      reason: 'Reason',
      amount: 'Amount',
      date: 'Date',
      attachments: 'Attachments',
    },
    form: {
      reason: 'Reason',
      reasonPlaceholder: 'What was this expense for?',
      amount: 'Amount',
      amountPlaceholder: '0.00',
      date: 'Date',
      attachments: 'Invoices',
      attachmentsHint:
        'Upload one or more images or PDF invoices. They are uploaded when selected.',
      removeAttachment: 'Remove {{name}}',
    },
    attachments: {
      title: 'Invoices',
      empty: 'This expense claim has no attachments.',
      download: 'Download',
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
