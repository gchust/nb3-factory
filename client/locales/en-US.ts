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
  library: {
    title: 'Document library',
    description: 'Browse published documents, and maintain the drafts you own.',
    create: {
      action: 'New document',
      title: 'New document',
      description: 'Drafts are visible only to you until you publish them.',
    },
    edit: {
      title: 'Edit document',
      description: 'Update this document. Saving publishes the change at once.',
    },
    detail: {
      title: 'Document',
      emptyContent: 'No content.',
    },
    fields: {
      title: 'Title',
      content: 'Content',
      owner: 'Owner',
      status: 'Status',
      updatedAt: 'Updated at',
      published: 'Published',
      publishedHint:
        'Published, non-confidential documents are open to every reader.',
      confidential: 'Confidential',
      confidentialHint:
        'Confidential documents stay closed to readers, even when someone shares one.',
    },
    status: {
      published: 'Published',
      draft: 'Draft',
      confidential: 'Confidential',
    },
    actions: {
      label: 'Actions',
      more: 'Actions for {{name}}',
      edit: 'Edit',
      delete: 'Delete',
    },
    delete: {
      title: 'Delete “{{name}}”?',
      description:
        'This permanently deletes the document. It cannot be undone.',
      confirm: 'Delete document',
      success: '“{{name}}” was deleted.',
      notFound: '“{{name}}” was already deleted.',
    },
    form: {
      titleRequired: 'Enter a title.',
      errorTitle: 'The document was not saved',
      forbidden: 'You cannot change this document.',
      requestFailed: 'The request failed. Please try again.',
    },
    error: {
      title: 'Unable to load documents',
      notFound:
        'This document does not exist or is no longer available to you.',
      forbidden: 'You do not have permission to view this document.',
      requestFailed: 'The request failed. Please try again.',
      sessionExpired: 'Your session has ended. Sign in again.',
    },
    empty: {
      title: 'No documents yet',
      description:
        'Create the first document, or wait for an editor to publish one.',
      noResults: 'No documents match.',
    },
    recordAccess: {
      owned: 'Own documents',
      visible: 'Published documents and own documents',
      nonConfidential: 'Non-confidential documents',
    },
    collection: {
      documents: 'Document',
      'documents.description':
        'Documents in the internal library. Editors keep their own drafts; published, non-confidential documents are open to every reader.',
    },
    section: {
      documents: 'Document library',
    },
    resource: { documents: 'Document' },
    action: {
      view: 'View',
      create: 'Create',
      edit: 'Edit',
      delete: 'Delete',
    },
    scope: {
      view: 'View scope',
      create: 'Create scope',
      edit: 'Edit scope',
      delete: 'Delete scope',
    },
    permissionSet: {
      editor: 'Document editor',
      reader: 'Document reader',
    },
    restriction: {
      nonConfidential: 'Hide confidential documents',
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
    saving: 'Saving…',
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
