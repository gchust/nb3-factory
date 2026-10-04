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
    salesCustomers: 'Customers',
    salesContacts: 'Contacts',
    salesOpportunities: 'Opportunities',
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
  sales: {
    loading: 'Loading…',
    error: {
      title: 'Something went wrong',
      requestFailed: 'The request could not be completed. Please try again.',
      forbidden: 'You do not have permission to do this.',
      retry: 'Retry',
    },
    actions: {
      create: 'Create',
      save: 'Save',
      saving: 'Saving…',
      cancel: 'Cancel',
      close: 'Close',
    },
    customers: {
      title: 'Customers',
      description:
        'The companies this team sells to, with their industry and contacts.',
      new: 'New customer',
      empty: {
        title: 'No customers yet',
        description: 'Add the first customer to start recording sales.',
      },
      columns: {
        name: 'Name',
        industry: 'Industry',
        createdAt: 'Created',
      },
      create: {
        title: 'New customer',
        success: 'Customer "{{name}}" created.',
      },
      edit: {
        title: 'Edit customer',
        success: 'Customer "{{name}}" saved.',
      },
      detail: {
        title: 'Customer details',
        edit: 'Edit',
        total: 'Total opportunity amount',
        contacts: 'Contacts',
        opportunities: 'Opportunities',
        noContacts: 'No contacts for this customer yet.',
        noOpportunities: 'No opportunities for this customer yet.',
        notFound: 'This customer no longer exists.',
      },
      form: {
        name: 'Name',
        nameRequired: 'Enter a name.',
        nameTooLong: 'Use at most 128 characters.',
        industry: 'Industry',
        industryTooLong: 'Use at most 64 characters.',
      },
    },
    contacts: {
      title: 'Contacts',
      description: 'The people you work with at each customer.',
      new: 'New contact',
      empty: {
        title: 'No contacts yet',
        description: 'Add a contact and choose the customer they belong to.',
      },
      columns: {
        name: 'Name',
        customer: 'Customer',
        phone: 'Phone',
        email: 'Email',
      },
      create: {
        title: 'New contact',
        success: 'Contact "{{name}}" created.',
      },
      edit: {
        title: 'Edit contact',
        success: 'Contact "{{name}}" saved.',
        notFound: 'This contact no longer exists.',
      },
      form: {
        name: 'Name',
        nameRequired: 'Enter a name.',
        nameTooLong: 'Use at most 128 characters.',
        customer: 'Customer',
        customerRequired: 'Choose a customer.',
        phone: 'Phone',
        phoneTooLong: 'Use at most 32 characters.',
        email: 'Email',
        emailTooLong: 'Use at most 128 characters.',
        noCustomers: 'Add a customer first: every contact belongs to one.',
      },
    },
    opportunities: {
      title: 'Opportunities',
      description:
        'Deals in progress, their expected amount and the stage they reached.',
      new: 'New opportunity',
      empty: {
        title: 'No opportunities yet',
        description: 'Add the first deal to start tracking its amount.',
        filtered: 'No opportunities match this stage.',
      },
      columns: {
        name: 'Name',
        customer: 'Customer',
        amount: 'Expected amount',
        stage: 'Stage',
      },
      create: {
        title: 'New opportunity',
        success: 'Opportunity "{{name}}" created.',
      },
      edit: {
        title: 'Edit opportunity',
        success: 'Opportunity "{{name}}" saved.',
        notFound: 'This opportunity no longer exists.',
      },
      filter: {
        all: 'All stages',
        label: 'Filter by stage',
      },
      stage: {
        following: 'In progress',
        won: 'Won',
        lost: 'Lost',
      },
      form: {
        name: 'Name',
        nameRequired: 'Enter a name.',
        nameTooLong: 'Use at most 128 characters.',
        customer: 'Customer',
        customerRequired: 'Choose a customer.',
        amount: 'Expected amount',
        amountRequired: 'Enter an amount.',
        amountInvalid: 'Enter a number.',
        amountNegative: 'The amount cannot be negative.',
        stage: 'Stage',
        noCustomers: 'Add a customer first: every opportunity belongs to one.',
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
