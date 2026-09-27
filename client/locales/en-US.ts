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
  navigation: {
    home: 'Home',
    library: 'Document library',
    open: 'Open navigation',
    close: 'Close navigation',
    expand: 'Expand navigation',
    collapse: 'Collapse navigation',
    label: 'Application navigation',
    breadcrumb: 'Breadcrumb',
  },
  library: {
    title: 'Document library',
    description:
      'Publish internal documents and share a single one temporarily.',
    new: 'New document',
    newDescription: 'Create a document. It stays a draft until you publish it.',
    edit: 'Edit document',
    editDescription: 'Update the document.',
    search: 'Search documents',
    error: {
      title: 'Something went wrong',
      forbidden: 'You do not have permission to see these documents.',
      loadFailed: 'The library could not be loaded.',
      tryAgain: 'Please try again.',
      retry: 'Retry',
    },
    status: {
      published: 'Published',
      draft: 'Draft',
      confidential: 'Confidential',
    },
    column: {
      title: 'Title',
      status: 'Status',
      owner: 'Owner',
      updatedAt: 'Updated',
      actions: 'Actions',
    },
    action: {
      view: 'View',
      create: 'Create',
      share: 'Temporary access',
      edit: 'Edit',
      delete: 'Delete',
    },
    field: {
      title: 'Title',
      body: 'Content',
      published: 'Published',
      confidential: 'Confidential',
    },
    form: {
      saved: 'Document updated',
      created: 'Document created',
      saveFailed: 'Could not save the document',
      forbidden: 'You do not have permission to change this document.',
      retry: 'Please try again.',
      cancel: 'Cancel',
      save: 'Save',
      saving: 'Saving…',
    },
    delete: {
      title: 'Delete this document?',
      description: '“{{title}}” will be removed for everyone.',
      deleted: 'Document deleted',
      failed: 'Could not delete the document',
    },
    detail: {
      title: 'Document',
      emptyBody: 'This document has no content yet.',
      unavailable: {
        title: 'Not available',
        description:
          'This document does not exist, or you no longer have permission to read it.',
      },
    },
    share: {
      title: 'Temporary access',
      description: 'Choose who may read “{{title}}”.',
      recipient: 'Reader',
      recipientPlaceholder: 'Select a user',
      grant: 'Grant',
      granted: 'Access granted',
      grantFailed: 'Could not grant access',
      current: 'Temporary access',
      none: 'No one has temporary access.',
      revoke: 'Revoke',
      revoked: 'Access revoked',
      revokeFailed: 'Could not revoke access',
      loadFailed: 'Could not load temporary access',
    },
    empty: {
      title: 'No documents yet',
      description: 'Create the first document to get started.',
      noMatch: 'No matching documents',
      noMatchDescription: 'Try a different search term.',
    },
    permissionSet: {
      manager: 'Document library manager',
      reader: 'Document library reader',
    },
    section: 'Document library',
    resource: {
      title: 'Document library',
    },
    scope: {
      documents: 'Documents',
    },
    database: {
      documents: 'Documents',
    },
    recordAccess: {
      own: 'Documents I own',
      published: 'Published non-confidential documents',
      nonConfidential: 'Non-confidential documents',
    },
    restrictionRule: {
      nonConfidential: 'Confidential documents stay confidential',
    },
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
