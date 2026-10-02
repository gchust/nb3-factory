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

  crm: {
    actions: {
      actions: 'Actions',
      forRecord: 'Actions for {{name}}',
      create: 'Create',
      save: 'Save',
      cancel: 'Cancel',
      close: 'Close',
      edit: 'Edit',
      retry: 'Retry',
      saving: 'Saving…',
    },
    status: {
      loading: 'Loading records',
      refreshing: 'Refreshing…',
    },
    error: {
      forbidden: 'You do not have permission to do that.',
      requestFailed: 'Something went wrong. Please try again.',
      validation: 'The value was rejected. Please check it.',
      optionsFailed: 'Unable to load customers for the customer field.',
    },
    form: {
      nameRequired: 'Name is required.',
      nameTooLong: 'Name must be at most {{max}} characters.',
      industryTooLong: 'Industry must be at most {{max}} characters.',
      contactTooLong: 'Contact information must be at most {{max}} characters.',
      customerRequired: 'Choose the customer this record belongs to.',
      amountRequired: 'Enter an expected amount.',
      amountInvalid: 'Enter a number.',
      amountNegative: 'The expected amount cannot be negative.',
    },
    stage: {
      following: 'Following',
      won: 'Won',
      lost: 'Lost',
    },
    customer: {
      title: 'Customers',
      description: 'Companies you sell to.',
      detail: { title: 'Customer details' },
      fields: {
        name: 'Customer name',
        industry: 'Industry',
        single: 'Owning customer',
        amountTotal: 'Expected amount total',
      },
      create: { action: 'Add customer', title: 'Add customer' },
      edit: { action: 'Edit customer', title: 'Edit customer' },
      form: {
        description: 'A customer needs a name; the industry is optional.',
      },
      createSuccess: 'Customer "{{name}}" created.',
      editSuccess: 'Customer "{{name}}" saved.',
      error: { notFound: 'This customer no longer exists.' },
      empty: {
        title: 'No customers yet',
        description:
          'Add the first customer to start tracking contacts and opportunities.',
      },
      contacts: {
        title: 'Contacts',
        empty: 'This customer has no contacts yet.',
      },
      opportunities: {
        title: 'Opportunities',
        empty: 'This customer has no opportunities yet.',
      },
    },
    contact: {
      title: 'Contacts',
      description: 'People at your customers.',
      fields: {
        name: 'Contact name',
        contact: 'Contact information',
        contactHint: 'Phone, email, or another way to reach this person.',
        customer: 'Customer',
      },
      create: { action: 'Add contact', title: 'Add contact' },
      edit: { title: 'Edit contact' },
      form: { description: 'A contact needs a name and an owning customer.' },
      createSuccess: 'Contact "{{name}}" created.',
      editSuccess: 'Contact "{{name}}" saved.',
      error: { notFound: 'This contact no longer exists.' },
      empty: {
        title: 'No contacts yet',
        description: 'Add a contact for one of your customers.',
      },
    },
    opportunity: {
      title: 'Opportunities',
      description: 'Deals you are working on.',
      fields: {
        name: 'Opportunity name',
        customer: 'Customer',
        amount: 'Expected amount',
        amountHint:
          'A number that is zero or greater, in the application currency.',
        stage: 'Stage',
      },
      create: { action: 'Add opportunity', title: 'Add opportunity' },
      edit: { title: 'Edit opportunity' },
      form: {
        description:
          'An opportunity needs a name, a customer, an amount and a stage.',
      },
      createSuccess: 'Opportunity "{{name}}" created.',
      editSuccess: 'Opportunity "{{name}}" saved.',
      error: { notFound: 'This opportunity no longer exists.' },
      filter: { allStages: 'All stages', stageAria: 'Filter by stage' },
      empty: {
        title: 'No opportunities yet',
        description: 'Add the first opportunity for one of your customers.',
        filteredTitle: 'No opportunities in this stage',
        filteredDescription: 'Choose another stage or show all stages.',
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
