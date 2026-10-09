import type { LocaleResource } from '@nocobase/i18n';

// The AI extension ships its own translation bundle because it can be installed
// as a standalone registry item. The application owns the source, so its keys
// join the application locale as well: the application's fallback namespace is
// what the source coverage check reads, and a string it renders belongs here.
import aiEnUS from '../extensions/nocobase-ai/locales/en-US.js';

const enUS = {
  ...aiEnUS,
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
  materials: {
    title: 'Materials assistant',
    description:
      'Ask the assistant about the internal materials you may read, and open a material to check it yourself.',
    assistant: {
      title: 'Ask the assistant',
      description:
        'The assistant answers only from the materials you may read and cites the material title. It cannot create, change or delete anything.',
      loading: 'Loading the assistant…',
      unavailable: {
        title: 'The assistant is unavailable',
        description:
          'The AI configuration could not be loaded, so nothing was answered from a guess.',
      },
      noEmployee: 'No AI employee is available for this account.',
      noModel: {
        title: 'No AI model is configured',
        description:
          'No enabled AI model is available, so the assistant cannot answer yet. Ask an administrator to configure and enable a model, then reload this page.',
      },
      manualFallback:
        'You can still read every material you are allowed to see in the list beside this chat.',
    },
    list: {
      title: 'Materials',
      description: 'Only the materials you are allowed to read appear here.',
      empty: 'No materials are available to you yet.',
      confidential: 'Confidential',
    },
    detail: {
      title: 'Material',
      confidential: 'Confidential material',
    },
    create: {
      action: 'New material',
      title: 'New material',
      description:
        'Add a title and a body. Confidentiality is set by the application, not here.',
      success: 'The material was created.',
    },
    edit: {
      action: 'Edit',
      title: 'Edit material',
      description:
        'Update the title and the body. The assistant reflects the new content on the next question.',
      success: 'The material was saved.',
    },
    delete: {
      action: 'Delete',
      title: 'Delete this material?',
      description:
        '“{{name}}” will be removed for everyone. This cannot be undone.',
      success: '“{{name}}” was deleted.',
      alreadyGone: 'The material had already been deleted.',
    },
    form: {
      title: 'Title',
      titleRequired: 'Enter a title.',
      titleTooLong: 'The title must be at most 200 characters.',
      titleHint:
        'The assistant cites this title, so keep it short and specific.',
      body: 'Body',
      bodyRequired: 'Enter the material content.',
      bodyTooLong: 'The body must be at most 20000 characters.',
      bodyHint:
        'Write the complete answer, including numbers, names and phone numbers.',
    },
    error: {
      title: 'Something went wrong',
      requestFailed: 'The request failed. Please try again.',
      forbidden: 'You do not have permission to do that.',
      sessionExpired: 'Your session has ended. Sign in again to continue.',
      notFound:
        'This material does not exist or you are not allowed to read it.',
      notFoundTitle: 'Material not available',
    },
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
