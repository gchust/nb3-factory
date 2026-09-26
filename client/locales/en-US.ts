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
    title: 'Equipment',
    description:
      'The office equipment ledger: search a device, see who has it, and borrow or return it.',
    actions: {
      create: 'New equipment',
      borrow: 'Borrow',
      clearFilters: 'Clear filters',
    },
    columns: {
      assetCode: 'Asset code',
      name: 'Name',
      category: 'Category',
      status: 'Status',
      currentLoan: 'Current loan',
      notes: 'Notes',
      createdAt: 'Added',
    },
    currentLoan: { due: 'Due {{date}}' },
    stats: {
      total: 'Devices',
      borrowed: 'Borrowed',
      overdue: 'Overdue',
    },
    search: {
      placeholder: 'Search by code, name or category',
      label: 'Search equipment',
    },
    filter: {
      label: 'Filter by status',
      all: 'All',
      available: 'Available',
      borrowed: 'Borrowed',
      overdue: 'Overdue',
    },
    status: {
      available: 'Available',
      borrowed: 'Borrowed',
      overdue: 'Overdue',
    },
    empty: {
      title: 'No equipment yet',
      description: 'Add the first device to start the ledger.',
      filtered: 'No device matches the current search and filter.',
    },
    error: {
      forbidden: 'You do not have permission to view equipment.',
      requestFailed: 'Unable to load the equipment. Please try again.',
      notFound: 'This equipment no longer exists.',
      validation: 'The server rejected the submitted values.',
    },
    create: {
      title: 'New equipment',
      success: 'Equipment created.',
    },
    edit: { title: 'Edit equipment' },
    update: { success: 'Equipment updated.' },
    fields: {
      assetCode: 'Asset code',
      name: 'Name',
      category: 'Category',
      notes: 'Notes',
    },
    form: {
      description: 'Fields marked with * are required.',
      assetCodeRequired: 'Asset code is required.',
      assetCodeTooLong: 'Asset code must be at most {{max}} characters.',
      assetCodeTaken: 'That asset code is already in use.',
      assetCodePlaceholder: 'e.g. EQ-2024-001',
      nameRequired: 'Name is required.',
      nameTooLong: 'Name must be at most {{max}} characters.',
      namePlaceholder: 'e.g. Projector',
      categoryTooLong: 'Category must be at most {{max}} characters.',
      categoryPlaceholder: 'e.g. Display',
      notesTooLong: 'Notes must be at most {{max}} characters.',
      notesPlaceholder: 'Optional notes',
    },
  },

  borrow: {
    create: {
      title: 'Borrow equipment',
      description: 'The borrow time is recorded automatically.',
      success: '{{name}} borrowed.',
    },
    error: {
      requestFailed: 'Unable to load the equipment list. Please try again.',
      validation: 'The server rejected the submitted values.',
    },
    fields: {
      equipment: 'Equipment',
      borrower: 'Borrower',
      purpose: 'Purpose',
      expectedReturnAt: 'Expected return date',
    },
    form: {
      equipmentRequired: 'Select an available device.',
      equipmentPlaceholder: 'Select a device',
      equipmentUnavailable:
        'This device is no longer available; pick another one.',
      fixedUnavailable:
        'This device is currently borrowed. You can still pick another available device.',
      noEquipmentAvailable: 'No device is available to borrow right now.',
      borrowerRequired: 'Borrower is required.',
      borrowerTooLong: 'Borrower must be at most {{max}} characters.',
      borrowerPlaceholder: 'Who is borrowing it?',
      purposeTooLong: 'Purpose must be at most {{max}} characters.',
      purposePlaceholder: 'What will it be used for?',
      expectedReturnRequired: 'Select the expected return date.',
      expectedReturnPlaceholder: 'Pick a return date',
      expectedReturnHint:
        'The equipment should be returned by the end of that day.',
      recordedAutomatically: 'Borrow time is recorded automatically.',
    },
  },

  borrowRecords: {
    title: 'Borrow records',
    description:
      'Every borrow and return, searchable by borrower and filterable by return state.',
    actions: {
      new: 'Borrow equipment',
      return: 'Return',
      returned: 'Returned',
    },
    columns: {
      equipment: 'Equipment',
      borrower: 'Borrower',
      purpose: 'Purpose',
      borrowedAt: 'Borrowed at',
      expectedReturnAt: 'Expected return',
      returnedAt: 'Returned at',
      status: 'Status',
    },
    stats: {
      total: 'Records',
      active: 'Not returned',
      overdue: 'Overdue',
    },
    search: {
      placeholder: 'Search by borrower or device',
      label: 'Search borrow records',
    },
    filter: {
      label: 'Filter by return state',
      all: 'All',
      active: 'Not returned',
      returned: 'Returned',
      overdue: 'Overdue',
    },
    status: {
      borrowed: 'Borrowed',
      returned: 'Returned',
      overdue: 'Overdue',
    },
    empty: {
      title: 'No borrow records yet',
      description: 'Borrow a device to create the first record.',
      filtered: 'No record matches the current search and filter.',
    },
    error: {
      forbidden: 'You do not have permission to view borrow records.',
      requestFailed: 'Unable to load the borrow records. Please try again.',
    },
    return: {
      title: 'Return {{name}}?',
      description:
        'The record for {{borrower}} keeps its original borrow details and gets a return time.',
      confirm: 'Confirm return',
      success: '{{name}} returned.',
      failed: 'Unable to record the return. Please try again.',
      notFound: 'This record was already returned.',
      aria: 'Return {{name}}',
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
    create: 'Create',
    edit: 'Edit',
    saving: 'Saving…',
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
    open: 'Open navigation',
    close: 'Close navigation',
    expand: 'Expand navigation',
    collapse: 'Collapse navigation',
    label: 'Application navigation',
    breadcrumb: 'Breadcrumb',
    equipment: 'Equipment',
    borrowRecords: 'Borrow records',
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
