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
    saving: 'Saving…',
    create: 'Create',
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
    equipment: 'Equipment',
    equipmentLoans: 'Loan records',
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
  equipment: {
    title: 'Equipment ledger',
    description:
      'Every device, who holds it and when it is due back. Add, edit, borrow and return from here.',
    stats: {
      total: 'Total devices',
      borrowed: 'Currently borrowed',
      overdue: 'Overdue, not returned',
    },
    search: {
      placeholder: 'Search by asset number or name',
      label: 'Search equipment by asset number or name',
      borrowerPlaceholder: 'Search by borrower',
      borrowerLabel: 'Search loan records by borrower',
    },
    filters: {
      status: 'Availability',
      allStatuses: 'All availability',
      loanStatus: 'Return status',
      allLoanStatuses: 'All return statuses',
      clear: 'Clear filters',
    },
    status: {
      available: 'Available',
      borrowed: 'Borrowed',
    },
    loanStatus: {
      active: 'Not returned',
      returned: 'Returned',
    },
    overdue: 'Overdue',
    fields: {
      assetNo: 'Asset number',
      name: 'Equipment name',
      category: 'Category',
      notes: 'Notes',
      status: 'Availability',
      currentBorrower: 'Current borrower',
      borrower: 'Borrower',
      purpose: 'Purpose',
      borrowedAt: 'Borrowed at',
      expectedReturnAt: 'Expected return',
      returnedAt: 'Returned at',
      loanStatus: 'Return status',
    },
    actions: {
      label: 'Actions',
      edit: 'Edit',
      borrow: 'Borrow',
      return: 'Return',
    },
    create: {
      action: 'New equipment',
      title: 'New equipment',
      description: 'Register a device in the ledger.',
    },
    edit: {
      title: 'Edit equipment',
      description: 'Update this device’s details.',
      missingTitle: 'Equipment not found',
      missingDescription:
        'This device no longer exists. It may have been removed on another screen.',
    },
    borrow: {
      title: 'Borrow equipment',
      description: 'Record who is taking the device and when it is due back.',
      submitting: 'Borrowing…',
      success: 'Borrowed',
      missingTitle: 'Equipment not found',
      missingDescription:
        'This device no longer exists, so it cannot be borrowed.',
      unavailableTitle: 'Already borrowed',
      unavailableDescription:
        'This device has not been returned yet. Return it before lending it again.',
    },
    return: {
      title: 'Return equipment',
      confirm: 'Confirm return',
      description: 'Return {{name}} borrowed by {{borrower}}?',
      success: 'Returned',
    },
    form: {
      assetNoRequired: 'Enter an asset number.',
      nameRequired: 'Enter an equipment name.',
      borrowerRequired: 'Enter the borrower.',
      expectedReturnRequired: 'Choose the expected return date.',
      expectedReturnPlaceholder: 'Pick an expected return date',
      tooLong: 'Use at most {{max}} characters.',
      assetNoTaken: 'This asset number is already in use.',
      created: 'Added {{name}}.',
      saved: 'Saved {{name}}.',
    },
    empty: {
      title: 'No equipment yet',
      description:
        'Add the first device and it will appear here with its availability.',
      noResults: 'No equipment matches your search.',
    },
    loans: {
      title: 'Loan records',
      description:
        'Every borrow, who has the device and whether it has come back.',
      empty: {
        title: 'No loan records yet',
        description:
          'Borrow a device from the equipment ledger to start a record.',
        action: 'Go to equipment',
        noResults: 'No loan records match your search.',
      },
    },
    error: {
      title: 'Something went wrong',
      forbidden: 'You do not have permission to do that.',
      requestFailed: 'The request failed. Please try again.',
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
