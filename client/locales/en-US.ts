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
  crm: {
    error: {
      forbidden: 'You do not have permission to do that.',
      requestFailed: 'Something went wrong. Please try again.',
    },
    stage: {
      following: 'Following up',
      won: 'Won',
      lost: 'Lost',
    },
    customers: {
      title: 'Customers',
      description:
        'The companies you work with, with their contacts and opportunities.',
      new: 'New customer',
      empty: 'No customers yet.',
      searchPlaceholder: 'Search customers',
      fields: {
        name: 'Name',
        industry: 'Industry',
        updatedAt: 'Updated',
        opportunityTotal: 'Opportunity total',
      },
      detail: {
        title: 'Customer',
        contactsTitle: 'Contacts ({{count}})',
        opportunitiesTitle: 'Opportunities ({{count}})',
        totalLabel: 'Total',
      },
      create: {
        title: 'New customer',
        description: 'Add a company to the CRM.',
        success: 'Customer "{{name}}" created.',
      },
      edit: {
        title: 'Edit customer',
        description: 'Update this customer.',
        success: 'Customer "{{name}}" updated.',
      },
      error: {
        notFound: 'This customer no longer exists.',
      },
      form: {
        nameRequired: 'Please enter a name.',
        nameTooLong: 'Name must be at most {{max}} characters.',
        industryTooLong: 'Industry must be at most {{max}} characters.',
      },
    },
    contacts: {
      title: 'Contacts',
      description: 'People at your customer companies.',
      new: 'New contact',
      empty: 'No contacts yet.',
      searchPlaceholder: 'Search contacts',
      detail: { title: 'Contact' },
      fields: {
        name: 'Name',
        customer: 'Customer',
        phone: 'Phone',
        email: 'Email',
        updatedAt: 'Updated',
      },
      create: {
        title: 'New contact',
        description: 'Add a contact to a customer.',
        success: 'Contact "{{name}}" created.',
      },
      edit: {
        title: 'Edit contact',
        description: 'Update this contact.',
        success: 'Contact "{{name}}" updated.',
      },
      error: {
        notFound: 'This contact no longer exists.',
      },
      form: {
        nameRequired: 'Please enter a name.',
        nameTooLong: 'Name must be at most {{max}} characters.',
        customerRequired: 'Please choose a customer.',
        customerPlaceholder: 'Choose a customer',
        noCustomers: 'Create a customer first, then add contacts to it.',
        phoneTooLong: 'Phone must be at most {{max}} characters.',
        emailTooLong: 'Email must be at most {{max}} characters.',
        emailInvalid: 'Please enter a valid email address.',
      },
    },
    opportunities: {
      title: 'Opportunities',
      description: 'Deals in progress and the value expected from them.',
      new: 'New opportunity',
      empty: 'No opportunities yet.',
      searchPlaceholder: 'Search opportunities',
      allStages: 'All stages',
      detail: { title: 'Opportunity' },
      fields: {
        name: 'Name',
        customer: 'Customer',
        amount: 'Expected amount',
        stage: 'Stage',
        updatedAt: 'Updated',
      },
      create: {
        title: 'New opportunity',
        description: 'Track a deal with a customer.',
        success: 'Opportunity "{{name}}" created.',
      },
      edit: {
        title: 'Edit opportunity',
        description: 'Update this opportunity.',
        success: 'Opportunity "{{name}}" updated.',
      },
      error: {
        notFound: 'This opportunity no longer exists.',
      },
      form: {
        nameRequired: 'Please enter a name.',
        nameTooLong: 'Name must be at most {{max}} characters.',
        customerRequired: 'Please choose a customer.',
        customerPlaceholder: 'Choose a customer',
        noCustomers: 'Create a customer first, then add opportunities to it.',
        amountRequired: 'Please enter an expected amount.',
        amountInvalid: 'Expected amount must be a number.',
        amountNegative: 'Expected amount cannot be negative.',
        amountHint: 'A non-negative amount.',
      },
    },
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
    edit: 'Edit',
    saving: 'Saving…',
    retry: 'Retry',
    search: 'Search',
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
