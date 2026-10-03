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
    sales: 'Sales',
    customers: 'Customers',
    contacts: 'Contacts',
    opportunities: 'Opportunities',
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
  crm: {
    column: { actions: 'Actions' },
    action: {
      create: 'Create',
      edit: 'Edit',
      view: 'View',
      saving: 'Saving…',
      retry: 'Try again',
    },
    fields: {
      name: 'Name',
      industry: 'Industry',
      phone: 'Phone',
      email: 'Email',
      customer: 'Customer',
      amount: 'Expected amount',
      stage: 'Stage',
    },
    stage: {
      follow_up: 'Follow-up',
      won: 'Won',
      lost: 'Lost',
    },
    form: {
      nameRequired: 'Enter a name.',
      nameTooLong: 'Use at most {{max}} characters.',
      industryTooLong: 'Use at most {{max}} characters.',
      phoneTooLong: 'Use at most {{max}} characters.',
      emailTooLong: 'Use at most {{max}} characters.',
      customerRequired: 'Select a customer.',
      amountRequired: 'Enter an expected amount.',
      amountInvalid: 'Enter an amount of zero or more.',
      stageInvalid: 'Select a valid stage.',
      noCustomers:
        'Create a customer first, then this record can be linked to one.',
    },
    error: {
      forbidden: 'You do not have permission to do that.',
      requestFailed: 'The request failed. Please try again.',
      loadFailed: 'Unable to load this page',
      loadFailedDescription:
        'The data could not be loaded. Check your connection and try again.',
      customerNotFound: 'This customer no longer exists.',
      contactNotFound: 'This contact no longer exists.',
      opportunityNotFound: 'This opportunity no longer exists.',
    },
    customers: {
      title: 'Customers',
      description: 'The companies this sales team works with.',
      new: 'New customer',
      search: 'Search customers',
      empty: 'No customers yet.',
      column: {
        name: 'Name',
        industry: 'Industry',
      },
      create: {
        title: 'New customer',
        success: 'Customer “{{name}}” was created.',
      },
      edit: {
        title: 'Edit customer',
        success: 'Customer “{{name}}” was updated.',
      },
      form: {
        description: 'A customer needs a name; the industry is optional.',
      },
      detail: {
        title: 'Customer',
        total: 'Expected amount',
        totalHint: 'The sum of this customer’s opportunities only.',
        contacts: 'Contacts ({{count}})',
        opportunities: 'Opportunities ({{count}})',
        emptyContacts: 'No contacts for this customer yet.',
        emptyOpportunities: 'No opportunities for this customer yet.',
      },
    },
    contacts: {
      title: 'Contacts',
      description: 'The people at each customer this team deals with.',
      new: 'New contact',
      search: 'Search contacts',
      empty: 'No contacts yet.',
      column: {
        name: 'Name',
        customer: 'Customer',
        phone: 'Phone',
        email: 'Email',
      },
      create: {
        title: 'New contact',
        success: 'Contact “{{name}}” was created.',
      },
      edit: {
        title: 'Edit contact',
        success: 'Contact “{{name}}” was updated.',
      },
      form: {
        description: 'A contact needs a name and the customer it belongs to.',
      },
    },
    opportunities: {
      title: 'Opportunities',
      description: 'The deals this team is pursuing, by stage.',
      new: 'New opportunity',
      search: 'Search opportunities',
      empty: 'No opportunities yet.',
      allStages: 'All stages',
      filterStage: 'Filter by stage',
      column: {
        name: 'Name',
        customer: 'Customer',
        amount: 'Expected amount',
        stage: 'Stage',
      },
      create: {
        title: 'New opportunity',
        success: 'Opportunity “{{name}}” was created.',
      },
      edit: {
        title: 'Edit opportunity',
        success: 'Opportunity “{{name}}” was updated.',
      },
      form: {
        description:
          'An opportunity needs a name, a customer, an expected amount and a stage.',
      },
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
