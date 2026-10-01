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
    title: 'Service team materials',
    description:
      'Read the reference materials you are permitted to see, or ask the assistant a question and check the material it cites.',
    materialsTitle: 'Materials',
    materialsDescription:
      'Every material the team keeps, with the ones outside your scope hidden.',
    openMaterials: 'Open the materials',
    assistantTitle: 'Material assistant',
    assistantDescription:
      'Answer from the materials you may read, always citing the material used.',
    openAssistant: 'Ask the assistant',
  },

  materials: {
    title: 'Material library',
    description:
      'Reference materials for the service team. You see the materials you are permitted to read.',
    open: 'Open',
    detailTitle: 'Material',
    detailDescription: 'Read the full text. A supervisor can edit it.',
    notFoundTitle: 'Material unavailable',
    notFound: 'This material is not available to you.',
    empty: 'No materials are available to you.',
    loadFailedTitle: 'Unable to load materials',
    loadFailed: 'The materials could not be loaded. Please try again.',
    supervisorOnly: 'Supervisor only',
    fieldTitle: 'Title',
    fieldBody: 'Content',
    fieldVisibility: 'Visibility',
    edit: 'Edit',
    saved: 'Material saved',
    saveFailed: 'Unable to save the material',
    saving: 'Saving…',
  },
  assistant: {
    title: 'Material assistant',
    description:
      'Ask about the service team materials. Every answer cites the material it came from, and you can open it to check.',
    threadLabel: 'Assistant conversation',
    clear: 'Clear conversation',
    cleared: 'Conversation cleared',
    clearFailed: 'Unable to clear the conversation',
    clearConfirmTitle: 'Clear this conversation?',
    clearConfirmDescription:
      'The saved question and answer history for your account will be deleted. This cannot be undone.',
    noticeTitle: 'Answering straight from the materials',
    noticeNotConfigured:
      'No model service is configured, so the assistant is answering directly from the materials. You can always read them on the Materials page.',
    noticeUnavailable:
      'The model service is unavailable, so answers come straight from the materials. Reading the materials on the Materials page still works.',
    emptyTitle: 'Ask your first question',
    emptyDescription:
      'For example: what is the repair phone number for the equipment?',
    citations: 'Source',
    insufficient:
      'The materials do not cover that. Please read the materials on the Materials page, or ask a supervisor.',
    denied:
      'You do not have access to any materials, so the assistant cannot answer.',
    thinking: 'Searching the materials…',
    composerLabel: 'Your question',
    composerPlaceholder: 'Ask a question about the materials…',
    ask: 'Ask',
    asking: 'Asking…',
    askFailed: 'Unable to get an answer. Please try again.',
    loadFailed: 'Unable to load the conversation.',
    scrollToLatest: 'Scroll to latest',
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
    materials: 'Materials',
    assistant: 'Material assistant',
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
