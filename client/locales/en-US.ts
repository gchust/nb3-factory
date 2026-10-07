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
    edit: 'Edit',
    delete: 'Delete',
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

  'navigation.documents': 'Documents',
  'navigation.documentCenter': 'Document center',
  'navigation.documentCenterDocuments': 'Documents',
  'navigation.documentCenterDepartments': 'Departments',
  'navigation.documentCenterBackups': 'Backups',
  'authorization.documentCenter.title': 'Document center',
  'authorization.documentCenter.section': 'Document center',
  'authorization.documentCenter.manage': 'Manage documents and departments',

  'documents.title': 'Document center',
  'documents.description':
    'Search the employee handbook, policies and templates you may read, preview or download them, and ask a question to be pointed at the paragraphs that answer it.',
  'documents.tab.browse': 'Browse',
  'documents.tab.ask': 'Ask a question',
  'documents.search.label': 'Search documents',
  'documents.search.placeholder': 'Search by title or content',
  'documents.filter.category': 'Category',
  'documents.filter.allCategories': 'All categories',
  'documents.capNotice':
    'Showing the first {{count}} matching documents. Narrow the search to see the rest.',
  'documents.versionValue': 'Version {{version}}',
  'documents.updatedAtValue': 'Updated {{date}}',
  'documents.column.title': 'Title',
  'documents.column.category': 'Category',
  'documents.column.version': 'Version',
  'documents.column.updatedAt': 'Updated',
  'documents.column.actions': 'Actions',
  'documents.action.preview': 'Preview',
  'documents.action.download': 'Download',
  'documents.action.retry': 'Retry',
  'documents.action.clearFilters': 'Clear filters',
  'documents.empty.title': 'No documents yet',
  'documents.empty.description':
    'Nothing has been published for you yet. Documents you may read appear here once they are published.',
  'documents.noResults.title': 'No matching documents',
  'documents.noResults.description':
    'No document matches the current search and filters.',
  'documents.category.handbook': 'Handbook',
  'documents.category.policy': 'Policy',
  'documents.category.template': 'Template',
  'documents.status.draft': 'Draft',
  'documents.status.published': 'Published',
  'documents.visibility.all': 'Everyone',
  'documents.visibility.departments': 'Selected departments',
  'documents.preview.title': 'Document',
  'documents.preview.description':
    'The current published content of this document.',
  'documents.preview.versionsTitle': 'Version history',
  'documents.preview.versionMeta': '{{modifier}} · {{date}}',
  'documents.ask.label': 'Your question',
  'documents.ask.placeholder': 'For example: how do I claim travel expenses?',
  'documents.ask.submit': 'Ask',
  'documents.ask.asking': 'Searching…',
  'documents.ask.hint':
    'The answer is looked up in the documents you may read. If no paragraph answers it, that is reported.',
  'documents.ask.empty.title': 'Ask about a policy',
  'documents.ask.empty.description':
    'Type a question and the matching paragraphs of the documents you may read are shown, with the document each one comes from.',
  'documents.ask.citationsTitle': 'Where this is answered',
  'documents.ask.citationsDescription':
    'Paragraphs matching “{{question}}”. Open a document to read it in full.',
  'documents.ask.citationMeta': '{{heading}} · version {{version}}',
  'documents.ask.citationMetaNoHeading': 'Version {{version}}',
  'documents.ask.noAnswer.title':
    'No basis found in the documents you may read',
  'documents.ask.noAnswer.description':
    'Try different words, or check with the department that owns the policy.',
  'documents.error.requestFailed': 'The request failed. Please try again.',
  'documents.error.unauthenticated':
    'Your session has expired. Please sign in again.',
  'documents.error.forbidden': 'You do not have access to this document.',
  'documents.error.notFound': 'This record no longer exists.',
  'documents.error.conflict': 'The record changed. Reload and try again.',
  'documents.error.versionConflict':
    'Someone else changed this document. Reload and try again.',
  'documents.error.codeTaken': 'That code is already in use.',
  'documents.error.memberExists':
    'That account already belongs to the department.',
  'documents.error.departmentsRequired':
    'Choose at least one department for a restricted document.',
  'documents.error.restoreConfirmationRequired':
    'Confirm the restore before it starts.',

  'documentsAdmin.documents.description':
    'Every document, its department visibility, its version history and its deleted state.',
  'documentsAdmin.restored': 'The document was restored.',
  'documentsAdmin.deleted': 'The document was deleted.',
  'documentsAdmin.capNotice':
    'Showing the first {{count}} documents. Narrow the search or filters to see the rest.',
  'documentsAdmin.action.newDocument': 'New document',
  'documentsAdmin.action.restore': 'Restore',
  'documentsAdmin.action.versions': 'Version history',
  'documentsAdmin.column.status': 'Status',
  'documentsAdmin.column.visibility': 'Visibility',
  'documentsAdmin.status.deleted': 'Deleted',
  'documentsAdmin.visibility.departmentsCount': '{{count}} department(s)',
  'documentsAdmin.filter.deleted': 'Deleted',
  'documentsAdmin.filter.deleted.exclude': 'Without deleted',
  'documentsAdmin.filter.deleted.include': 'With deleted',
  'documentsAdmin.filter.deleted.only': 'Deleted only',
  'documentsAdmin.empty.title': 'No documents',
  'documentsAdmin.empty.description':
    'Create the first document to get started.',
  'documentsAdmin.deleteConfirm.title': 'Delete this document?',
  'documentsAdmin.deleteConfirm.description':
    '“{{title}}” is hidden from employees but kept, so you can restore it later.',
  'documentsAdmin.form.createTitle': 'New document',
  'documentsAdmin.form.createDescription':
    'Publish a handbook, policy or template.',
  'documentsAdmin.form.editTitle': 'Edit document',
  'documentsAdmin.form.editDescription':
    'Saving keeps the previous content as a version.',
  'documentsAdmin.form.title': 'Title',
  'documentsAdmin.form.code': 'Code',
  'documentsAdmin.form.category': 'Category',
  'documentsAdmin.form.summary': 'Summary',
  'documentsAdmin.form.content': 'Content',
  'documentsAdmin.form.contentHint':
    'Plain text or Markdown. The question answering cites the paragraphs of this content.',
  'documentsAdmin.form.status': 'Status',
  'documentsAdmin.form.visibility': 'Who may read it',
  'documentsAdmin.form.departments': 'Departments',
  'documentsAdmin.form.departmentsHint':
    'Members of the selected departments may read this document.',
  'documentsAdmin.form.changeNote': 'Change note',
  'documentsAdmin.form.changeNotePlaceholder': 'What changed in this version',
  'documentsAdmin.form.create': 'Create',
  'documentsAdmin.form.created': 'The document was created.',
  'documentsAdmin.form.updated': 'The document was saved.',
  'documentsAdmin.versions.title': 'Version history',
  'documentsAdmin.versions.description':
    'Every saved version, with who changed it and when. Restoring keeps the current version and adds the restored content as a new one.',
  'documentsAdmin.versions.current': 'Current',
  'documentsAdmin.versions.meta': '{{category}} · {{modifier}} · {{date}}',
  'documentsAdmin.versions.restore': 'Restore',
  'documentsAdmin.versions.restored':
    'Version {{version}} was restored as a new version.',
  'documentsAdmin.versions.restoreConfirm.title': 'Restore this version?',
  'documentsAdmin.versions.restoreConfirm.description':
    'Version {{version}} becomes the current content as a new version. The versions after it stay in the history.',
  'documentsAdmin.departments.description':
    'The departments that decide which restricted documents a user may read.',
  'documentsAdmin.departments.new': 'New department',
  'documentsAdmin.departments.create': 'Create',
  'documentsAdmin.departments.members': 'Members',
  'documentsAdmin.departments.active': 'Active',
  'documentsAdmin.departments.inactive': 'Inactive',
  'documentsAdmin.departments.activeHint':
    'Active departments can be assigned to documents.',
  'documentsAdmin.departments.codeHint':
    'A short unique code; it cannot change later.',
  'documentsAdmin.departments.descriptionHint':
    'What this department is responsible for.',
  'documentsAdmin.departments.empty': 'No departments',
  'documentsAdmin.departments.emptyDescription':
    'Create a department before restricting a document to one.',
  'documentsAdmin.departments.createTitle': 'New department',
  'documentsAdmin.departments.createDescription':
    'Add a department documents can be assigned to.',
  'documentsAdmin.departments.editTitle': 'Edit department',
  'documentsAdmin.departments.editDescription':
    'Rename it or take it out of use.',
  'documentsAdmin.departments.created': 'The department was created.',
  'documentsAdmin.departments.updated': 'The department was saved.',
  'documentsAdmin.departments.column.title': 'Name',
  'documentsAdmin.departments.column.code': 'Code',
  'documentsAdmin.departments.column.description': 'Description',
  'documentsAdmin.departments.column.active': 'State',
  'documentsAdmin.departments.column.updatedAt': 'Updated',
  'documentsAdmin.members.title': 'Department members',
  'documentsAdmin.members.description':
    'Accounts in this department may read the documents restricted to it.',
  'documentsAdmin.members.select': 'Account',
  'documentsAdmin.members.selectPlaceholder': 'Choose an account',
  'documentsAdmin.members.add': 'Add',
  'documentsAdmin.members.remove': 'Remove from department',
  'documentsAdmin.members.empty': 'No members',
  'documentsAdmin.members.emptyDescription':
    'Nobody belongs to this department yet.',
  'documentsAdmin.backups.description':
    'Snapshots of every document and version. A restore shows what it would change first.',
  'documentsAdmin.backups.create': 'Back up now',
  'documentsAdmin.backups.created': 'The backup was created.',
  'documentsAdmin.backups.deleted': 'The backup was deleted.',
  'documentsAdmin.backups.restore': 'Review and restore',
  'documentsAdmin.backups.documentCount': '{{count}} document(s)',
  'documentsAdmin.backups.versionCount': '{{count}} version(s)',
  'documentsAdmin.backups.empty': 'No backups',
  'documentsAdmin.backups.emptyDescription':
    'Create a backup before making bulk changes.',
  'documentsAdmin.backups.deleteConfirm.title': 'Delete this backup?',
  'documentsAdmin.backups.deleteConfirm.description':
    '“{{title}}” is removed permanently. Documents are not affected.',
  'documentsAdmin.backups.column.title': 'Backup',
  'documentsAdmin.backups.column.documentCount': 'Documents',
  'documentsAdmin.backups.column.versionCount': 'Versions',
  'documentsAdmin.backups.column.createdAt': 'Created',
  'documentsAdmin.backupRestore.title': 'Restore from backup',
  'documentsAdmin.backupRestore.description':
    'What the restore would change. Nothing is written until you confirm.',
  'documentsAdmin.backupRestore.noChanges':
    'This backup matches the current documents; a restore would change nothing.',
  'documentsAdmin.backupRestore.confirm': 'Restore',
  'documentsAdmin.backupRestore.confirmTitle': 'Restore this backup?',
  'documentsAdmin.backupRestore.confirmDescription':
    '{{count}} document(s) change. The current documents and their versions are replaced by the backup.',
  'documentsAdmin.backupRestore.restored':
    'Restored {{count}} document(s) from the backup.',
  'documentsAdmin.backupRestore.column.document': 'Document',
  'documentsAdmin.backupRestore.column.action': 'Change',
  'documentsAdmin.backupAction.create': 'Created',
  'documentsAdmin.backupAction.update': 'Updated',
  'documentsAdmin.backupAction.restore': 'Restored',
  'documentsAdmin.backupAction.delete': 'Deleted',
  'documentsAdmin.backupAction.unchanged': 'Unchanged',
};

/**
 * The shape every locale of this application follows, derived from the English wording above.
 *
 * Anything a plugin does not translate falls back to this namespace, so a term defined here is reused everywhere
 * without each plugin repeating it.
 */
export type AppResource = LocaleResource<typeof enUS>;

export default enUS;
