import type { LocaleResource } from '@nocobase/i18n';

// The AI chat extension under `client/extensions/nocobase-ai` is application-owned UI, so its wording is part of the
// application's locale rather than a plugin namespace the app falls back to. The extension ships its own dictionaries
// and the `useAITranslate` hook reads them, but the copy still has to exist here: the locale-coverage test scans the
// extension's components for `t()` keys and requires each one in this resource. Import the dictionary instead of
// copying it so the two cannot drift.
import nocobaseAIEnUS from '../extensions/nocobase-ai/locales/en-US.js';

const enUS = {
  ...nocobaseAIEnUS,
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

  'materials.navigation': 'Materials',
  'materials.title': 'Materials',
  'materials.description':
    'The materials the assistant answers from. Open one to read it.',
  'materials.create': 'New material',
  'materials.create.title': 'New material',
  'materials.create.description':
    'A title and a body. The assistant answers from what you write here.',
  'materials.create.submit': 'Create',
  'materials.create.submitting': 'Creating…',
  'materials.create.success': 'Created “{{title}}”.',
  'materials.edit': 'Edit',
  'materials.edit.title': 'Edit material',
  'materials.edit.description':
    'Update the title and body. The assistant answers from the new content right away.',
  'materials.edit.submit': 'Save',
  'materials.edit.submitting': 'Saving…',
  'materials.edit.success': 'Saved “{{title}}”.',
  'materials.field.title': 'Title',
  'materials.field.body': 'Body',
  'materials.field.bodyHint':
    'The assistant answers only from what this body states.',
  'materials.form.required': 'Enter both a title and a body.',
  'materials.form.invalid':
    'The server rejected this material. Check the title and body and try again.',
  'materials.form.forbidden':
    'You do not have permission to maintain materials.',
  'materials.restricted': 'Restricted',
  'materials.restrictedDescription':
    'Only a supervisor can read this material.',
  'materials.updatedAt': 'Last updated',
  'materials.empty.title': 'No materials yet',
  'materials.empty.description': 'A supervisor can add the first material.',
  'materials.detail.title': 'Material',
  'materials.error.title': 'Unable to load materials',
  'materials.error.unauthenticated':
    'Your session has expired. Sign in again to continue.',
  'materials.error.forbidden': 'You do not have permission to read materials.',
  'materials.error.notFound':
    'This material does not exist, or you do not have permission to read it.',
  'materials.error.requestFailed': 'Something went wrong. Please try again.',
  'materials.error.retry': 'Retry',
  'materials.permission.section': 'Materials',
  'materials.permission.collection': 'Materials',
  'materials.permission.visible': 'Visible materials',
  'materials.permission.visibleDescription':
    'Materials that are not restricted.',
  'materials.permission.read': 'Read materials',
  'materials.permission.write': 'Maintain materials',
  'materials.permission.view': 'Read',
  'materials.permission.manage': 'Maintain',
  'materials.permission.supervisorSet': 'Materials supervisor',
  'materials.permission.colleagueSet': 'Materials reader',
  'assistant.navigation': 'Materials assistant',
  'assistant.title': 'Materials assistant',
  'assistant.description':
    'Ask about the materials you can read. Every answer cites the material it came from.',
  'assistant.openMaterials': 'Open materials',
  'assistant.placeholder': 'Ask about the materials…',
  'assistant.disclaimer':
    'Answers come only from the materials you are allowed to read. If the materials do not cover it, the assistant says so.',
  'assistant.retry': 'Retry',
  'assistant.unavailable.title': 'The materials assistant is unavailable',
  'assistant.unavailable.noModel':
    'No AI model is configured for this application, so the assistant cannot answer.',
  'assistant.unavailable.noEmployee':
    'The materials assistant is not registered for this application.',
  'assistant.unavailable.manualHint':
    'You can still read the materials yourself in the materials library.',

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
};

/**
 * The shape every locale of this application follows, derived from the English wording above.
 *
 * Anything a plugin does not translate falls back to this namespace, so a term defined here is reused everywhere
 * without each plugin repeating it.
 */
export type AppResource = LocaleResource<typeof enUS>;

export default enUS;
