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
  library: {
    title: 'Document library',
    description:
      'Published, non-confidential documents are open to every colleague with library access. Drafts and confidential documents stay with their owner, unless an administrator opens one specific document.',
    new: 'New document',
    empty: 'No documents to show.',
    owner: { none: '—' },
    status: { published: 'Published', draft: 'Draft' },
    confidential: { yes: 'Confidential', no: 'Internal' },
    table: {
      title: 'Title',
      owner: 'Owner',
      status: 'Status',
      confidential: 'Confidentiality',
      updatedAt: 'Updated',
    },
    error: {
      title: 'Unable to load documents',
      description: 'The request failed. Try again.',
    },
    submit: { error: 'Unable to save the document.' },
    create: {
      title: 'New document',
      description: 'Create a document you own. Only you can edit it.',
      success: 'Document created.',
    },
    edit: {
      title: 'Edit document',
      description:
        'Change the document. Only its owner and administrators can do this.',
      success: 'Document saved.',
    },
    delete: {
      title: 'Delete this document?',
      description:
        '“{{title}}” will be removed for everyone. This cannot be undone.',
      confirm: 'Delete',
      deleting: 'Deleting…',
      success: 'Document deleted.',
    },
    detail: {
      title: 'Document',
      description:
        'Reading does not grant editing: only the owner and administrators may change a document.',
      owner: 'Owner',
      createdAt: 'Created',
      updatedAt: 'Updated',
      bodyEmpty: 'This document has no body text.',
      edit: 'Edit',
      delete: 'Delete',
      back: 'Back to the list',
      notFound: {
        title: 'This document is not available',
        description:
          'It may be a draft, it may be confidential, or a temporary share may have ended.',
      },
    },
    form: {
      title: 'Title',
      titlePlaceholder: 'A short, recognizable title',
      body: 'Body',
      bodyPlaceholder: 'Write the document here.',
      published: 'Published',
      publishedHint:
        'Published, non-confidential documents are readable by every colleague with library access.',
      confidential: 'Confidential',
      confidentialHint:
        'Confidential documents stay with their owner and administrators, even when published or shared.',
      saving: 'Saving…',
    },
    shares: {
      title: 'Temporary access',
      description:
        'Open this specific document to one colleague. Revoking it takes effect on their next refresh.',
      empty: 'No temporary access yet.',
      account: 'Account',
      selectPlaceholder: 'Choose an account',
      grant: 'Open access',
      revoke: 'Revoke access',
      unknownAccount: 'Unknown account',
      error: 'Unable to update temporary access.',
      loadError: 'Unable to load temporary access.',
    },
    // Titles the authorization backend shows for this feature's grants, record
    // access and permission sets. They share the app namespace, so root's
    // management screens read them in whichever language is selected.
    collections: {
      documents: 'Documents',
      documentShares: 'Temporary access',
    },
    permissions: {
      documentRead: 'Read documents',
      documentCreate: 'Create documents',
      documentUpdate: 'Edit documents',
      documentDelete: 'Delete documents',
      documentShare: 'Manage temporary access',
    },
    composites: {
      documents: 'Documents',
      shares: 'Temporary access',
    },
    sections: { library: 'Document library' },
    recordAccess: { readerVisible: 'Published or temporarily shared' },
    permissionSets: {
      maintainer: 'Document maintainer',
      reader: 'Document reader',
    },
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
