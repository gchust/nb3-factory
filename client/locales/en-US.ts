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
  crm: {
    actions: {
      create: 'Create',
      edit: 'Edit',
      save: 'Save',
      saving: 'Saving…',
      retry: 'Retry',
      clearFilters: 'Clear filters',
    },
    error: {
      title: 'Something went wrong',
      forbidden: 'You do not have permission to do this.',
      requestFailed: 'The request failed. Please try again.',
      notFoundTitle: 'Record not found',
      notFoundDescription: 'This record no longer exists.',
    },
    stages: {
      following: 'Following up',
      won: 'Won',
      lost: 'Lost',
    },
    customers: {
      title: 'Customers',
      description:
        'Manage customers and see their contacts and opportunities at a glance.',
      emptyTitle: 'No customers yet',
      emptyDescription: 'Create your first customer to get started.',
      fields: {
        name: 'Name',
        industry: 'Industry',
        contactCount: 'Contacts',
        opportunityCount: 'Opportunities',
        totalAmount: 'Total amount',
      },
      create: {
        title: 'New customer',
        description: 'Add a customer to the CRM.',
        success: 'Customer "{{name}}" created.',
      },
      edit: {
        title: 'Edit customer',
        success: 'Customer "{{name}}" updated.',
      },
      detail: {
        title: 'Customer details',
        contacts: 'Contacts',
        opportunities: 'Opportunities',
        noContacts: 'No contacts for this customer.',
        noOpportunities: 'No opportunities for this customer.',
        totalAmount: 'Total opportunity amount',
      },
      form: {
        nameRequired: 'Enter a customer name.',
        nameTooLong: 'The name may not be longer than {{max}} characters.',
        industryTooLong:
          'The industry may not be longer than {{max}} characters.',
        nameTaken: 'A customer with this name already exists.',
      },
    },
    contacts: {
      title: 'Contacts',
      description: 'Manage the people at each customer.',
      emptyTitle: 'No contacts yet',
      emptyDescription: 'Add the first contact for a customer.',
      fields: {
        name: 'Name',
        contactInfo: 'Contact info',
        customer: 'Customer',
      },
      create: {
        title: 'New contact',
        success: 'Contact "{{name}}" created.',
      },
      edit: {
        title: 'Edit contact',
        success: 'Contact "{{name}}" updated.',
      },
      form: {
        nameRequired: 'Enter a contact name.',
        nameTooLong: 'The name may not be longer than {{max}} characters.',
        contactInfoTooLong:
          'The contact info may not be longer than {{max}} characters.',
        customerRequired: 'Select a customer.',
        nameTaken: 'This customer already has a contact with this name.',
        noCustomers: 'Create a customer before adding a contact.',
      },
    },
    opportunities: {
      title: 'Opportunities',
      description: 'Track opportunities by customer and stage.',
      emptyTitle: 'No opportunities yet',
      emptyDescription: 'Add the first opportunity for a customer.',
      emptyFiltered: 'No opportunities match this stage.',
      fields: {
        name: 'Name',
        customer: 'Customer',
        amount: 'Estimated amount',
        stage: 'Stage',
      },
      filter: {
        allStages: 'All stages',
      },
      create: {
        title: 'New opportunity',
        success: 'Opportunity "{{name}}" created.',
      },
      edit: {
        title: 'Edit opportunity',
        success: 'Opportunity "{{name}}" updated.',
      },
      form: {
        nameRequired: 'Enter an opportunity name.',
        nameTooLong: 'The name may not be longer than {{max}} characters.',
        amountInvalid: 'Enter an amount of zero or greater.',
        customerRequired: 'Select a customer.',
        nameTaken: 'This customer already has an opportunity with this name.',
      },
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
