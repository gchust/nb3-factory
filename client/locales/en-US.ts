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

  library: {
    title: 'Internal document library',
    description:
      'Maintain your own documents, publish what colleagues may read, and open a single draft temporarily when needed.',
    collection: { title: 'Document' },
    recordAccess: {
      readable: 'Published and not confidential',
      nonConfidential: 'Not confidential',
      visible: 'My documents and readable documents',
      sharedDocument: 'A single temporarily shared document',
    },
    permissionSets: {
      editor: 'Library editor',
      reader: 'Library reader',
    },
    restrictionRules: {
      readerConfidential: 'Confidential documents stay closed to readers',
    },
    sharingRules: {
      temporary: 'Temporary document access',
    },
    status: {
      published: 'Published',
      draft: 'Draft',
      confidential: 'Confidential',
    },
    columns: {
      title: 'Title',
      owner: 'Owner',
      status: 'Status',
      updatedAt: 'Updated',
      actions: 'Actions',
      actionsFor: 'Actions for {{title}}',
    },
    actions: {
      new: 'New document',
      edit: 'Edit',
      delete: 'Delete',
      share: 'Temporary access',
      cancel: 'Cancel',
      save: 'Save',
      saving: 'Saving…',
    },
    loadFailed: 'Unable to load documents',
    loadFailedDescription: 'Please refresh the page and try again.',
    actionFailed: 'Unable to complete that action',
    forbidden: 'You do not have permission to do that',
    notFound: 'That document no longer exists',
    titleRequired: 'A title is required',
    noReadAccess: 'No documents to read',
    noReadAccessDescription: 'This account is not allowed to read the library.',
    empty: {
      title: 'No documents yet',
      description: 'Documents you can read will appear here.',
    },
    view: {
      title: 'Document',
      description: 'The full body of this document and who may see it.',
      readOnly: 'Read-only',
      created: 'Created',
      updated: 'Updated',
      body: 'Body',
      emptyBody: 'This document has no body yet.',
    },
    form: {
      createTitle: 'New document',
      editTitle: 'Edit document',
      description:
        'Published, non-confidential documents are open to readers; keep a draft private until it is ready.',
      title: 'Title',
      titlePlaceholder: 'Document title',
      content: 'Body',
      contentPlaceholder: 'Write the document…',
      published: 'Published',
      publishedHint:
        'Readers may open a published document unless it is confidential.',
      confidential: 'Confidential',
      confidentialHint: 'Confidential documents stay closed to readers.',
    },
    detail: {
      unavailableTitle: 'No longer available',
      unavailableDescription:
        'This document is not readable with your account, or the temporary access was withdrawn.',
    },
    delete: {
      title: 'Delete this document?',
      description: '“{{title}}” will be removed permanently.',
      confirm: 'Delete',
      done: 'Document deleted',
    },
    share: {
      title: 'Temporary access',
      description:
        'Open one document to one colleague. Revoking removes access the next time the document is loaded.',
      document: 'Document',
      recipient: 'Colleague',
      chooseRecipient: 'Choose a colleague',
      chooseBoth: 'Choose a document and a colleague first',
      grant: 'Open temporarily',
      granted: 'Document opened temporarily',
      revoked: 'Access revoked',
      current: 'Currently open',
      empty: 'Nothing is open temporarily.',
      revoke: 'Revoke',
      invalidRecipient: 'That colleague is not available',
      invalidDocument: 'Choose a valid document',
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
