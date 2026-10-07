import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  'auth.welcome': 'Welcome back',
  'auth.loginDescription': 'Sign in with your username or email and password.',
  'auth.registerTitle': 'Create an account',
  'auth.registerDescription': 'Create an account to get started.',
  'auth.forgotTitle': 'Forgot password',
  'auth.forgotDescription':
    'Enter your email and we will send a reset link if the account exists.',
  'auth.resetDescription': 'Choose a new password for your account.',
  'auth.resetTitle': 'Reset password',
  'auth.identifier': 'Username or email',
  'auth.password': 'Password',
  'auth.signIn': 'Sign in',
  'auth.signingIn': 'Signing in…',
  'auth.hidePassword': 'Hide password',
  'auth.showPassword': 'Show password',
  'auth.forgotLink': 'Forgot password?',
  'auth.noAccount': "Don't have an account?",
  'auth.signUp': 'Sign up',
  'auth.createAccount': 'Create account',
  'auth.creatingAccount': 'Creating account…',
  'auth.name': 'Name',
  'auth.username': 'Username',
  'auth.email': 'Email',
  'auth.confirmPassword': 'Confirm password',
  'auth.existingAccount': 'Already have an account?',
  'auth.passwordMismatch': "Passwords don't match.",
  'auth.resetting': 'Resetting…',
  'auth.newPassword': 'New password',
  'auth.confirmNewPassword': 'Confirm new password',
  'auth.invalidResetLink':
    'This password reset link is invalid or has expired.',
  'auth.backToSignIn': 'Back to sign in',
  'auth.sendResetLink': 'Send reset link',
  'auth.sending': 'Sending…',
  'auth.resetSent': 'If the account exists, a reset link has been sent.',
  'auth.rememberPassword': 'Remember your password?',
  'auth.methods': 'Sign-in methods',
  'auth.or': 'Or continue with',
  'auth.continueWith': 'Continue with {provider}',
  'auth.about': 'About this application',
  'auth.platform': 'AI-native application platform',
  'auth.marketingTitleFirst': 'Let AI build freely.',
  'auth.marketingTitleSecond': 'NocoBase keeps it',
  'auth.marketingTitleThird': 'reliable.',
  'auth.marketingDescription':
    'Give AI a flexible frontend framework to shape each experience, while NocoBase secures the data, permissions, workflows and governance underneath.',
  'auth.frontend': 'AI-native frontend',
  'auth.frontendDescription':
    'Compose interfaces freely on a flexible framework.',
  'auth.foundation': 'NocoBase foundation',
  'auth.foundationDescription':
    'Reliable data, access control, workflows and governance.',
  'auth.marketingFooter': 'Freedom above. Confidence below.',
  'status.loading': 'Loading',
  'status.loadingPage': 'Loading page',
  'status.loadingSettings': 'Loading settings',
  'status.loadingDev': 'Loading dev tools',
  'status.denied': 'Access denied',
  'status.pageFailed': 'Unable to load page',
  'status.retry': 'Retry',
  'navigation.brandHome': 'NocoBase home',
  'navigation.brandApps': 'NocoBase applications',
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

  // The IT repair ticketing feature. The `authz` and `permissionSet` entries
  // are not shown on its pages: the authorization plugin renders them in the
  // permission workspace, through these same locale files.
  itTickets: {
    title: 'IT repair tickets',
    description:
      'Report a computer, account or other problem and follow how it is handled.',
    capNotice:
      'Showing the {{shown}} most recent of {{total}} matching tickets. Use the status filter to narrow the list.',
    create: {
      action: 'Submit a ticket',
      title: 'Submit a repair ticket',
      success: 'Ticket "{{title}}" was submitted.',
    },
    form: {
      description:
        'Describe the problem. The ticket is recorded against you automatically.',
      descriptionHint:
        'What is wrong, and what you have already tried. Optional.',
      titleRequired: 'Enter a title.',
      titleTooLong: 'Use at most {{max}} characters.',
      descriptionTooLong: 'Use at most {{max}} characters.',
    },
    filters: {
      status: 'Filter by status',
      allStatuses: 'All statuses',
      clear: 'Clear filter',
    },
    fields: {
      title: 'Title',
      category: 'Category',
      status: 'Status',
      description: 'Description',
      submitter: 'Submitted by',
      handler: 'Handled by',
      resolutionNote: 'Resolution',
      createdAt: 'Submitted at',
      startedAt: 'Started at',
      completedAt: 'Completed at',
    },
    status: {
      pending: 'Pending',
      processing: 'Processing',
      completed: 'Completed',
    },
    category: {
      computer: 'Computer',
      account: 'Account',
      other: 'Other',
    },
    empty: {
      title: 'No tickets yet',
      description: 'Submit a ticket when something needs repairing.',
      noResults: 'No ticket matches this filter.',
    },
    error: {
      title: 'Tickets could not be loaded',
      requestFailed: 'Something went wrong. Please try again in a moment.',
      forbidden: 'Your account is not allowed to do this.',
      notFound: 'This ticket does not exist, or is not yours to see.',
      sessionExpired: 'Your session has ended. Sign in to continue.',
      signInAgain: 'Sign in again',
    },
    // What the server reports when a transition is refused.
    state: {
      IT_TICKET_NOT_PENDING: 'This ticket is no longer waiting to be handled.',
      IT_TICKET_NOT_PROCESSING:
        'This ticket is not being handled, so it cannot be completed.',
      IT_TICKET_ALREADY_COMPLETED: 'This ticket is already completed.',
      IT_TICKET_RESOLUTION_REQUIRED:
        'Describe the resolution before completing the ticket.',
    },
    start: {
      action: 'Start handling',
    },
    complete: {
      action: 'Complete',
      title: 'Complete the ticket',
      description:
        'Record what was done. The resolution is what the reporter reads.',
      hint: 'Required: the resolution note.',
      noteRequired: 'Describe the resolution.',
      noteTooLong: 'Use at most {{max}} characters.',
      success: 'Ticket "{{title}}" was completed.',
    },
    detail: { title: 'Ticket' },
    authz: {
      section: { title: 'IT repair tickets' },
      resource: { title: 'IT repair tickets' },
      recordAccess: {
        title: 'Tickets I submitted',
        description: 'Only the tickets this account submitted itself.',
      },
      action: {
        view: 'View tickets',
        create: 'Submit a ticket',
        start: 'Start handling',
        complete: 'Complete a ticket',
      },
    },
    permissionSet: {
      employee: 'IT repair - employee',
      handler: 'IT repair - handler',
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
    itTickets: 'IT repair tickets',
    open: 'Open navigation',
    close: 'Close navigation',
    expand: 'Expand navigation',
    collapse: 'Collapse navigation',
    toggle: 'Expand or collapse navigation',
    label: 'Application navigation',
    description: 'Go to a page of this application.',
    breadcrumb: 'Breadcrumb',
    back: 'Back',
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
