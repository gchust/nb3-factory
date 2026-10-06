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
    create: 'Create',
    saving: 'Saving…',
    edit: 'Edit',
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
    crm: 'Sales',
    customers: 'Customers',
    customerDetail: 'Customer details',
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
    error: {
      title: 'Something went wrong',
      requestFailed: 'The request could not be completed. Please try again.',
      forbidden: 'You do not have permission to perform this action.',
    },
    filters: {
      clear: 'Clear filters',
      allCustomers: 'All customers',
      allStages: 'All stages',
    },
    actions: {
      edit: 'Edit',
    },
    record: {
      notFound: {
        title: 'Record not found',
        description:
          'This record no longer exists. It may have been removed by someone else.',
      },
    },
    stage: {
      following: 'In progress',
      won: 'Won',
      lost: 'Lost',
    },
    customers: {
      title: 'Customers',
      description: 'Companies your team sells to.',
      create: { action: 'New customer' },
      search: {
        placeholder: 'Search by name or industry',
        label: 'Search customers',
      },
      actions: {
        label: 'Actions',
        more: 'Actions for {{name}}',
      },
      empty: {
        title: 'No customers yet',
        description:
          'Add the first customer to start tracking contacts and deals.',
        noResults: 'No customers match your filters.',
      },
    },
    customer: {
      fields: {
        name: 'Customer name',
        industry: 'Industry',
        updatedAt: 'Updated',
      },
      create: {
        title: 'New customer',
        success: 'Customer "{{name}}" created.',
      },
      edit: {
        title: 'Edit customer',
        success: 'Customer "{{name}}" saved.',
      },
      form: {
        description: 'Name is required; industry is optional.',
        nameRequired: 'Enter a customer name.',
        nameTooLong: 'Keep the name within 128 characters.',
        nameTaken: 'A customer with this name already exists.',
        industryTooLong: 'Keep the industry within 128 characters.',
      },
      detail: {
        info: 'Customer information',
        totalAmount: 'Total expected amount',
        contacts: 'Contacts',
        opportunities: 'Opportunities',
        noContacts: 'This customer has no contacts yet.',
        noOpportunities: 'This customer has no opportunities yet.',
      },
    },
    contacts: {
      title: 'Contacts',
      description: 'People at your customers.',
      create: { action: 'New contact' },
      search: {
        placeholder: 'Search by name, phone or email',
        label: 'Search contacts',
      },
      filters: { customer: 'Filter by customer' },
      actions: {
        label: 'Actions',
        more: 'Actions for {{name}}',
      },
      empty: {
        title: 'No contacts yet',
        description: 'Add a contact to keep track of who you talk to.',
        noResults: 'No contacts match your filters.',
      },
    },
    contact: {
      fields: {
        name: 'Contact name',
        customer: 'Customer',
        customerPlaceholder: 'Select a customer',
        phone: 'Phone',
        email: 'Email',
        updatedAt: 'Updated',
      },
      create: {
        title: 'New contact',
        success: 'Contact "{{name}}" created.',
      },
      edit: {
        title: 'Edit contact',
        success: 'Contact "{{name}}" saved.',
      },
      form: {
        description: 'Name and customer are required.',
        nameRequired: 'Enter a contact name.',
        nameTooLong: 'Keep the name within 128 characters.',
        nameTaken: 'This customer already has a contact with that name.',
        customerRequired: 'Select a customer.',
        phoneTooLong: 'Keep the phone within 64 characters.',
        emailTooLong: 'Keep the email within 256 characters.',
        emailInvalid: 'Enter a valid email address.',
      },
    },
    opportunities: {
      title: 'Opportunities',
      description: 'Deals in progress with your customers.',
      create: { action: 'New opportunity' },
      search: {
        placeholder: 'Search by opportunity or customer',
        label: 'Search opportunities',
      },
      filters: { stage: 'Filter by stage' },
      actions: {
        label: 'Actions',
        more: 'Actions for {{name}}',
      },
      empty: {
        title: 'No opportunities yet',
        description: 'Track your first deal by creating an opportunity.',
        noResults: 'No opportunities match your filters.',
      },
    },
    opportunity: {
      fields: {
        name: 'Opportunity name',
        customer: 'Customer',
        amount: 'Expected amount',
        stage: 'Stage',
        updatedAt: 'Updated',
      },
      create: {
        title: 'New opportunity',
        success: 'Opportunity "{{name}}" created.',
      },
      edit: {
        title: 'Edit opportunity',
        success: 'Opportunity "{{name}}" saved.',
      },
      form: {
        description: 'Name, customer, amount and stage describe the deal.',
        nameRequired: 'Enter an opportunity name.',
        nameTooLong: 'Keep the name within 128 characters.',
        nameTaken: 'This customer already has an opportunity with that name.',
        customerRequired: 'Select a customer.',
        amountRequired: 'Enter an expected amount.',
        amountInvalid: 'Enter an amount of zero or more.',
        stageRequired: 'Select a valid stage.',
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
