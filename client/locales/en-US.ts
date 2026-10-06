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
  'status.sessionExpired': 'Your session has ended. Sign in again to continue.',
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
    create: 'Create',
    saving: 'Saving…',
    edit: 'Edit',
    openMenu: 'Open menu',
    signInAgain: 'Sign in again',
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
    customers: 'Customers',
    contacts: 'Contacts',
    opportunities: 'Opportunities',
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
  crm: {
    customer: {
      placeholder: 'Choose a customer',
      loadFailed: 'Customers could not be loaded.',
      forbidden: 'You do not have permission to list customers.',
    },
    form: {
      customerRequired: 'Choose a customer',
      customerMissing: 'This customer no longer exists.',
    },
    error: {
      forbidden: 'You do not have permission to do this.',
      requestFailed: 'The request failed. Please try again.',
    },
  },
  customers: {
    title: 'Customers',
    description: 'The companies your team sells to.',
    fields: {
      name: 'Name',
      industry: 'Industry',
      createdAt: 'Created',
      updatedAt: 'Updated',
    },
    search: {
      label: 'Search customers',
      placeholder: 'Search by name or industry',
    },
    filters: { clear: 'Clear filters' },
    create: {
      action: 'New customer',
      title: 'New customer',
      success: 'Created customer "{{name}}"',
    },
    edit: { title: 'Edit customer', success: 'Saved customer "{{name}}"' },
    detail: {
      total: 'Total opportunity amount',
      contacts: 'Contacts',
      opportunities: 'Opportunities',
      emptyContacts: 'No contacts yet',
      emptyOpportunities: 'No opportunities yet',
    },
    empty: {
      title: 'No customers yet',
      description: 'Create your first customer to get started.',
      noResults: 'No customers match your search',
    },
    error: {
      title: 'Customers could not be loaded',
      notFound: 'This customer does not exist or has been deleted.',
      requestFailed: 'The request failed. Please try again.',
    },
    form: {
      description: 'Name the customer and record its industry.',
      nameRequired: 'Enter a customer name',
      nameTooLong: 'Use at most {{max}} characters',
      industryTooLong: 'Use at most {{max}} characters',
    },
  },
  contacts: {
    title: 'Contacts',
    description: 'The people you work with at each customer.',
    fields: {
      name: 'Name',
      contact: 'Contact',
      customer: 'Customer',
      createdAt: 'Created',
      updatedAt: 'Updated',
    },
    search: {
      label: 'Search contacts',
      placeholder: 'Search by name or contact',
    },
    filters: { clear: 'Clear filters' },
    create: {
      action: 'New contact',
      title: 'New contact',
      success: 'Created contact "{{name}}"',
    },
    edit: { title: 'Edit contact', success: 'Saved contact "{{name}}"' },
    empty: {
      title: 'No contacts yet',
      description: 'Add the people you work with at your customers.',
      noResults: 'No contacts match your search',
    },
    error: {
      title: 'Contacts could not be loaded',
      notFound: 'This contact does not exist or has been deleted.',
      requestFailed: 'The request failed. Please try again.',
    },
    form: {
      description: 'Name the contact and choose the customer it belongs to.',
      nameRequired: 'Enter a contact name',
      nameTooLong: 'Use at most {{max}} characters',
      contactTooLong: 'Use at most {{max}} characters',
    },
  },
  opportunities: {
    title: 'Opportunities',
    description: 'The deals your team is working on.',
    fields: {
      name: 'Name',
      customer: 'Customer',
      amount: 'Amount',
      stage: 'Stage',
      createdAt: 'Created',
      updatedAt: 'Updated',
    },
    stage: { following: 'Following up', won: 'Won', lost: 'Lost' },
    search: {
      label: 'Search opportunities',
      placeholder: 'Search by name',
    },
    filters: {
      stage: 'Filter by stage',
      allStages: 'All stages',
      clear: 'Clear filters',
    },
    create: {
      action: 'New opportunity',
      title: 'New opportunity',
      success: 'Created opportunity "{{name}}"',
    },
    edit: {
      title: 'Edit opportunity',
      success: 'Saved opportunity "{{name}}"',
    },
    empty: {
      title: 'No opportunities yet',
      description: 'Track the deals your team is working on.',
      noResults: 'No opportunities match your filters',
    },
    error: {
      title: 'Opportunities could not be loaded',
      notFound: 'This opportunity does not exist or has been deleted.',
      requestFailed: 'The request failed. Please try again.',
    },
    form: {
      description: 'Name the opportunity and record its amount and stage.',
      nameRequired: 'Enter an opportunity name',
      nameTooLong: 'Use at most {{max}} characters',
      amountRequired: 'Enter an amount',
      amountInvalid: 'Enter an amount of 0 or more',
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
