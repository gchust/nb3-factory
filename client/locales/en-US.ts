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
  'status.deniedDescription': 'You do not have permission to access {{label}}.',
  'status.settingFailedDescription':
    'Setting {{label}} from {{packageName}} could not be loaded.',
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
    title: 'Material library',
    description:
      'Search the team handbooks, read them online, or borrow a printed copy.',
    searchPlaceholder: 'Search by title, summary or owner',
    search: 'Search',
    allCategories: 'All categories',
    create: 'New material',
    empty: 'No materials match your search.',
    ownerLabel: 'Owner: {{name}}',
    availabilityLabel: 'Availability',
    availability: '{{available}} of {{total}} available',
    notBorrowable: 'Not borrowable',
    noCover: 'No cover',
    summary: 'Introduction',
    summaryEmpty: 'No introduction yet.',
    files: 'Attachments',
    fileCount: '{{count}} file(s)',
    filesEmpty: 'No attachments yet.',
    updatedAt: 'Updated',
    backToList: 'Back to the library',
    visibility: {
      all: 'All members',
      restricted: 'Selected members',
    },
    cover: 'Cover',
    unknownUploader: 'Unknown',
    preview: 'Preview',
    download: 'Download',
    previewLoading: 'Loading preview…',
    previewFailed: 'Unable to load the preview.',
    previewUnsupported: 'This format cannot be previewed',
    previewUnsupportedHint:
      'Download the file to open it in an application on your computer.',
    pdfPreviousPage: 'Previous page',
    pdfNextPage: 'Next page',
    pdfPageOf: 'Page {{page}} of {{total}}',
    upload: 'Upload',
    uploadRole: 'Upload as',
    roleAttachment: 'Attachment',
    roleCover: 'Cover',
    uploadHint: 'Up to {{max}} files at a time, each no larger than 5 MB.',
    uploadSuccess: 'Uploaded {{count}} file(s).',
    uploadFailed: 'The upload failed. Please try again.',
    noFileSelected: 'Choose at least one file first.',
    fileTooLarge: '“{{name}}” is larger than {{max}} and was not uploaded.',
    fileTooLargeServer: 'A file is larger than 5 MB and was not uploaded.',
    tooManyFiles:
      'At most {{max}} files may be uploaded at once ({{count}} selected).',
    tooManyFilesServer: 'At most 3 files may be uploaded at once.',
    setCover: 'Set as cover',
    coverFailed: 'Could not set the cover.',
    removeFile: 'Remove',
    removeFileConfirm: 'Remove this file?',
    removeFailed: 'Could not remove the file.',
    edit: 'Edit',
    createTitle: 'New material',
    editTitle: 'Edit material',
    delete: 'Delete',
    deleteTitle: 'Delete this material?',
    deleteConfirm: '“{{title}}” and all of its attachments will be removed.',
    borrowSection: 'Borrowing',
    borrowApply: 'Request to borrow',
    cancelRequest: 'Cancel request',
    noStockHint:
      'No printed copy is available right now. You may still send a request, but confirming it will fail unless a copy has been returned first.',
    adminBorrowHint:
      'Confirm borrow and return requests on the “Borrowing requests” page.',
    requestedAt: 'Requested {{time}}',
    borrowedAt: 'Borrowed {{time}}',
    returnedAt: 'Returned {{time}}',
    noPermission: 'You do not have permission to read this material.',
    notFound: 'This material does not exist or you cannot read it.',
    form: {
      description:
        'Maintain the material information, visibility and printed copies.',
      title: 'Title',
      titleRequired: 'Please enter a title.',
      category: 'Category',
      owner: 'Owner',
      summary: 'Introduction',
      totalCopies: 'Printed copies',
      borrowable: 'Printed copies can be borrowed',
      visibility: 'Who can read',
      readers: 'Allowed members',
      readersHint:
        'Only the selected members can open or download this material.',
      readersEmpty: 'No members available.',
      saving: 'Saving…',
    },
    status: {
      pending: 'Pending',
      borrowed: 'Borrowed',
      returned: 'Returned',
      cancelled: 'Cancelled',
    },
    error: {
      generic: 'The action could not be completed. Please try again.',
      forbidden: 'You do not have permission to perform this action.',
      notBorrowable: 'This material cannot be borrowed.',
      outOfStock: 'No copy is available to borrow.',
      invalidStatus: 'This request has already been processed.',
    },
    admin: {
      title: 'Borrowing requests',
      description:
        'Confirm borrow and return of printed copies. Repeated clicks never change the stock twice.',
      required: 'Only an administrator can manage borrowing requests.',
      empty: 'No borrowing records in this state.',
      filterAll: 'All',
      borrower: 'Borrower: {{name}}',
      confirmBorrow: 'Confirm borrow',
      confirmReturn: 'Confirm return',
      actionDone: 'The record has been updated.',
      actionNoop:
        'This request was already processed; the stock was not changed again.',
    },
    myBorrowings: 'My borrowings',
    myBorrowingsDescription: 'The materials you have requested or borrowed.',
    myBorrowingsEmpty: 'You have no borrowing records yet.',
    trial: {
      title: 'Demo accounts and how to try each role',
      admin:
        'Administrator — username nocobase / password admin123. Maintains materials, uploads attachments, and confirms borrow and return.',
      member:
        'Members — limei / member123 (Li Mei) and wangqiang / member123 (Wang Qiang). Search, read, preview and request to borrow.',
      hint: '“Quarterly financial report template” and “Internal audit working papers” are restricted; only the members listed on each one can open them.',
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
    library: 'Material library',
    libraryDetail: 'Material detail',
    myBorrowings: 'My borrowings',
    borrowingsAdmin: 'Borrowing requests',
    open: 'Open navigation',
    close: 'Close navigation',
    expand: 'Expand navigation',
    collapse: 'Collapse navigation',
    label: 'Application navigation',
    breadcrumb: 'Breadcrumb',
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
