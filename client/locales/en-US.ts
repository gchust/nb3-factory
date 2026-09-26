import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  'auth.welcome': 'Welcome back',
  'auth.loginDescription': 'Sign in with your username or email and password.',
  'auth.registerTitle': 'Create an account',
  'auth.registerDescription': 'Create an account to get started.',
  'auth.forgotTitle': 'Forgot password',
  'auth.forgotDescription':
    'Enter your email and we will send a reset link if the account exists.',
  'auth.resetTitle': 'Reset password',
  'auth.resetDescription': 'Choose a new password for your account.',
  'auth.identifier': 'Username or email',
  'auth.password': 'Password',
  'auth.signIn': 'Sign in',
  'auth.signInLink': 'sign in',
  'auth.signingIn': 'Signing in…',
  'auth.hidePassword': 'Hide password',
  'auth.showPassword': 'Show password',
  'auth.forgotLink': 'Forgot password?',
  'auth.signUp': 'Sign up',
  'auth.createAccount': 'Create account',
  'auth.creatingAccount': 'Creating account…',
  'auth.name': 'Name',
  'auth.username': 'Username',
  'auth.email': 'Email',
  'auth.confirmPassword': 'Confirm password',
  'auth.existingAccount': 'Already have an account?',
  'auth.resetting': 'Resetting…',
  'auth.newPassword': 'New password',
  'auth.confirmNewPassword': 'Confirm new password',
  'auth.invalidResetLink':
    'This password reset link is invalid or has expired.',
  'auth.returnTo': 'Return to',
  'auth.sendResetLink': 'Send reset link',
  'auth.sending': 'Sending…',
  'auth.resetSent': 'If the account exists, a reset link has been sent.',
  'auth.rememberPassword': 'Remember your password?',
  'auth.methods': 'Authentication methods',
  'auth.continueWith': 'Or continue with',
  'auth.about': 'About this application',
  'auth.marketingDescription':
    'Give AI a flexible frontend framework to shape each experience, while NocoBase secures the data, permissions, workflows and governance underneath.',
  'auth.platform': 'AI-native application platform',
  'auth.frontendDescription':
    'Compose interfaces freely on a flexible framework.',
  'auth.frontend': 'AI-native frontend',
  'auth.foundationDescription':
    'Reliable data, access control, workflows and governance.',
  'auth.foundation': 'NocoBase foundation',
  'auth.marketingFooter': 'Freedom above. Confidence below.',
  'auth.marketingTitleFirst': 'Let AI build freely.',
  'auth.marketingTitleSecond': 'NocoBase keeps it',
  'auth.marketingTitleThird': 'reliable.',
  'status.loading': 'Loading',
  'status.loadingPage': 'Loading page',
  'status.loadingSettings': 'Loading settings',
  'status.loadingDev': 'Loading dev tools',
  'status.denied': 'Access denied',
  'status.pageFailed': 'Unable to load page',
  'status.retry': 'Retry',
  'navigation.brandHome': 'NocoBase home',
  'navigation.brandApps': 'NocoBase applications',
  'auth.passwordMismatch': "Passwords don't match.",
  'routeOverlay.close': 'Close',
  'status.deniedDescription': 'You do not have permission to access {{label}}.',
  'status.routeFailedDescription':
    'Route {{label}} from {{packageName}} could not be loaded.',
  shell: {
    workspace: 'AI application workspace',
    buildFreely: 'AI builds freely.',
    reliability: '<brand>NocoBase</brand> keeps it reliable.',
  },
  surface: {
    backToApp: 'Back to app',
    loading: 'Loading {{title}}',
    navigation: '{{title}} navigation',
    page: '{{title}} page',
  },
  settings: {
    title: 'Settings',
    emptyTitle: 'No settings available',
    emptyDescription:
      'No enabled plugin contributes a settings page you have access to.',
  },
  dev: {
    componentExamples: 'Component examples',
    title: 'Dev tools',
    emptyTitle: 'No dev tools available',
    emptyDescription:
      'No enabled plugin contributes a dev page you have access to.',
  },
  home: {
    title: 'Start building your application',
    description:
      'Describe what you need to your AI Agent, then build pages, data models, and business workflows.',
  },

  equipment: {
    loading: 'Loading…',
    fields: {
      assetNo: 'Asset number',
      name: 'Equipment name',
      category: 'Category',
      notes: 'Notes',
      status: 'Status',
      currentBorrower: 'Current borrower',
      equipment: 'Equipment',
      borrower: 'Borrower',
      purpose: 'Purpose',
      dueAt: 'Expected return date',
      borrowedAt: 'Borrowed at',
      returnedAt: 'Returned at',
      state: 'State',
      actions: 'Actions',
    },
    status: {
      available: 'Available',
      borrowed: 'On loan',
      overdue: 'Overdue',
    },
    columns: {
      assetNo: 'Asset number',
      equipment: 'Equipment name',
      status: 'Status',
      activeLoan: 'Current borrower',
      notes: 'Notes',
      actions: 'Actions',
    },
    loanColumns: {
      assetNo: 'Asset number',
      borrower: 'Borrower',
      purpose: 'Purpose',
      borrowedAt: 'Borrowed at',
      dueAt: 'Expected return date',
      returnedAt: 'Returned at',
      state: 'State',
      actions: 'Actions',
    },
    ledger: {
      title: 'Equipment ledger',
      description:
        'Manage devices, see who is holding one and when it is due back.',
      searchPlaceholder: 'Search by asset number or name',
      empty: 'No equipment matches the current filters.',
      dueOn: 'Due {{date}}',
    },
    loans: {
      title: 'Borrow records',
      description:
        'Every loan and return; overdue unreturned records are marked.',
      searchPlaceholder: 'Search by borrower, asset number or equipment name',
      empty: 'No borrow record matches the current filters.',
    },
    loan: {
      unreturned: 'Not returned',
      returned: 'Returned',
    },
    tab: {
      all: 'All',
      available: 'Available',
      borrowed: 'On loan',
    },
    loanTab: {
      all: 'All',
      unreturned: 'Not returned',
      returned: 'Returned',
    },
    stats: {
      total: 'Total equipment',
      borrowed: 'Currently on loan',
      overdue: 'Overdue unreturned',
    },
    action: {
      create: 'Add equipment',
      edit: 'Edit',
      borrow: 'Lend out',
      borrowDevice: 'Lend out equipment',
      return: 'Return',
    },
    create: {
      title: 'Add equipment',
      description: 'Register a device in the ledger.',
      action: 'Add',
      success: 'Added "{{name}}".',
    },
    edit: {
      title: 'Edit equipment',
      description: 'Change the asset number, name, category or notes.',
      success: 'Saved "{{name}}".',
    },
    borrow: {
      title: 'Lend out equipment',
      description: 'The borrow time is recorded automatically.',
      action: 'Confirm lending',
      success: 'Lent out to {{name}}.',
      alreadyBorrowed:
        'This equipment is already lent out and has not been returned.',
    },
    return: {
      title: 'Return equipment',
      description: 'Confirm that {{borrower}} has returned {{name}}.',
      action: 'Confirm return',
      success: 'Returned "{{name}}".',
    },
    form: {
      assetNoRequired: 'Enter the asset number.',
      assetNoTooLong: 'The asset number must be at most {{max}} characters.',
      assetNoTaken: 'This asset number is already in use.',
      nameRequired: 'Enter the equipment name.',
      nameTooLong: 'The name must be at most {{max}} characters.',
      categoryRequired: 'Enter the category.',
      categoryTooLong: 'The category must be at most {{max}} characters.',
      notesTooLong: 'The notes must be at most {{max}} characters.',
      equipmentRequired: 'Select the equipment to lend out.',
      selectEquipment: 'Select equipment',
      borrowerRequired: 'Enter the borrower.',
      borrowerTooLong: 'The borrower must be at most {{max}} characters.',
      purposeTooLong: 'The purpose must be at most {{max}} characters.',
      dueAtRequired: 'Choose the expected return date.',
      dueAtPlaceholder: 'Choose a return date',
    },
    error: {
      validation: 'Please check the highlighted field.',
      forbidden: 'You do not have permission for this action.',
      requestFailed: 'The request failed. Please try again.',
      notFound: 'This record no longer exists and may have been deleted.',
    },
  },

  appearance: {
    title: 'Appearance',
    mode: 'Color mode',
    preset: 'Theme',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
    themes: { default: 'Spacious', compact: 'Compact' },
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
  notices: {
    serverLocaleFallback:
      'The server does not support this language, so server messages will use English.',
    languageChangeFailed:
      'Unable to complete the language change. Please try again.',
  },
  account: {
    signOutFailed: 'Unable to sign out. Please try again.',
    openMenu: 'Open account menu',
    fallback: 'Account',
    signOut: 'Sign out',
    signingOut: 'Signing out…',
  },
  navigation: {
    home: 'Home',
    equipment: 'Equipment ledger',
    loans: 'Borrow records',
    open: 'Open navigation',
    close: 'Close navigation',
    expand: 'Expand navigation',
    collapse: 'Collapse navigation',
    label: 'Application navigation',
    breadcrumb: 'Breadcrumb',
  },
  dataTable: {
    noResults: 'No results.',
    sortAscending: 'Asc',
    sortDescending: 'Desc',
    hideColumn: 'Hide',
    view: 'View',
    toggleColumns: 'Toggle columns',
    selectedCount: '{{selected}} of {{total}} row(s) selected.',
    rowsPerPage: 'Rows per page',
    pageOf: 'Page {{page}} of {{pageCount}}',
    firstPage: 'Go to first page',
    previousPage: 'Go to previous page',
    nextPage: 'Go to next page',
    lastPage: 'Go to last page',
  },
  datePicker: {
    placeholder: 'Pick a date',
    rangePlaceholder: 'Pick a date range',
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
