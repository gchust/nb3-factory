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
  tickets: {
    title: 'IT repair tickets',
    description:
      'Report an IT problem and follow it from filing to resolution.',
    refresh: 'Refresh',
    newTicket: 'New ticket',
    handlerUnassigned: 'Unassigned',
    noDescription: 'No description provided.',
    created: 'Ticket {{reference}} submitted.',
    createFailed: 'Unable to submit the ticket.',
    createTitle: 'Report an IT problem',
    createDescription:
      'Describe the problem; an IT handler will pick it up from here.',
    loadFailed: 'Unable to load tickets',
    loadFailedHint: 'The ticket list could not be loaded. Please try again.',
    retry: 'Retry',
    empty: 'No tickets yet. Submit one to get started.',
    emptyFiltered: 'No tickets with this status.',
    status: {
      pending: 'Pending',
      processing: 'In progress',
      completed: 'Completed',
    },
    category: {
      computer: 'Computer',
      account: 'Account',
      other: 'Other',
    },
    fields: {
      reference: 'Reference',
      title: 'Title',
      category: 'Category',
      status: 'Status',
      submitter: 'Submitted by',
      handler: 'Handled by',
      createdAt: 'Submitted at',
      completedAt: 'Completed at',
      description: 'Description',
      resolution: 'Resolution',
      actions: 'Actions',
    },
    action: {
      open: 'Handle',
      view: 'View',
      openFull: 'Open full page',
    },
    form: {
      titlePlaceholder: 'e.g. Cannot connect to the office VPN',
      titleRequired: 'A title is required.',
      descriptionPlaceholder: 'What happened, and what did you already try?',
      submit: 'Submit',
    },
    detail: {
      back: 'Back to tickets',
      backToList: 'Back to ticket list',
      employeeTitle: 'Your ticket',
      employeeHint:
        'Only IT handlers can start or complete a ticket. You can follow its progress here.',
      noResolution: 'Not resolved yet.',
      completedTitle: 'This ticket is completed',
      completedHint:
        'A completed ticket is read-only; its resolution and handler can no longer be changed.',
      start: 'Start handling',
      complete: 'Mark completed',
      updatedAt: 'Last updated {{value}}',
      completeTitle: 'Mark this ticket completed',
      completeDescription:
        'Describe how the problem was resolved. A resolution note is required.',
      resolutionPlaceholder: 'What was the root cause, and how was it fixed?',
      resolutionRequired: 'A resolution note is required before completing.',
      completeConfirm: 'Complete',
      started: 'Ticket is now in progress.',
      startFailed: 'Unable to start this ticket.',
      completed: 'Ticket completed.',
      completeFailed: 'Unable to complete this ticket.',
      forbiddenTitle: 'Not allowed',
      notFoundTitle: 'Ticket unavailable',
      notFoundHint: 'This ticket does not exist, or it is not yours to view.',
    },
  },
  navigation: {
    home: 'Home',
    tickets: 'IT repair',
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
