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
  tickets: {
    title: 'IT repair tickets',
    description: 'Report an IT problem and follow how it is handled.',
    loading: 'Loading tickets…',
    empty: 'No tickets yet.',
    error: {
      title: 'Tickets could not be loaded',
      reload: 'Refresh the page to try again.',
    },
    filter: {
      label: 'Filter by status',
      all: 'All statuses',
    },
    create: {
      action: 'New ticket',
      title: 'Report an IT problem',
      description: 'Describe the problem so an IT handler can pick it up.',
      submit: 'Submit ticket',
      submitting: 'Submitting…',
      titleRequired: 'Enter a title for the ticket.',
      created: 'Ticket submitted.',
      failed: 'The ticket could not be submitted. Please try again.',
      field: {
        title: 'Title',
        titlePlaceholder: 'What is the problem?',
        category: 'Category',
        description: 'Description',
        descriptionPlaceholder:
          'Add any detail that helps the handler (optional).',
      },
    },
    columns: {
      title: 'Title',
      category: 'Category',
      status: 'Status',
      submitter: 'Submitter',
      handler: 'Handler',
      createdAt: 'Submitted',
    },
    category: {
      computer: 'Computer',
      account: 'Account',
      other: 'Other',
    },
    status: {
      pending: 'Pending',
      in_progress: 'In progress',
      completed: 'Completed',
    },
    detail: {
      overview: 'Overview',
      overviewDescription: 'Who raised the ticket and how it has progressed.',
      submittedAt: 'Submitted at',
      startedAt: 'Started at',
      completedAt: 'Completed at',
      description: 'Description',
      noDescription: 'No description was provided.',
      resolution: 'Resolution',
      resolutionDescription: 'What the IT handler did to resolve the ticket.',
      notFoundTitle: 'Ticket unavailable',
      notFound: 'This ticket does not exist or you do not have access to it.',
      start: 'Start handling',
      started: 'Handling started.',
      startFailed: 'The ticket could not be started. Please try again.',
      complete: 'Complete',
      completed: 'Ticket completed.',
      completeFailed: 'The ticket could not be completed. Please try again.',
      inProgressTitle: 'Being handled',
      inProgress: 'An IT handler is working on this ticket.',
    },
    complete: {
      title: 'Complete ticket',
      description: 'Record what was done before closing the ticket.',
      field: 'Resolution',
      submit: 'Complete ticket',
      required: 'Enter a resolution before completing the ticket.',
    },
  },
  resource: 'IT repair ticket',
  resourceDescription:
    'Employee IT repair tickets and their handling workflow.',
  recordAccess: {
    own: 'Own tickets',
    ownDescription: 'Only the tickets the person submitted.',
  },
  scopes: {
    tickets: 'Tickets',
  },
  sections: {
    support: 'IT support',
  },
  permissionSets: {
    employee: 'IT employee',
    handler: 'IT handler',
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
    view: 'View tickets',
    create: 'Submit tickets',
    start: 'Start handling',
    complete: 'Complete handling',
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
    tickets: 'IT tickets',
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
