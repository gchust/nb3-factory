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
      label: 'Actions',
      edit: 'Edit',
      create: 'Create',
      save: 'Save',
      cancel: 'Cancel',
      saving: 'Saving…',
    },
    filters: {
      clear: 'Clear filters',
    },
    stages: {
      following: 'In progress',
      won: 'Won',
      lost: 'Lost',
    },
    error: {
      title: 'Something went wrong',
      forbidden: 'You do not have permission to do that.',
      requestFailed: 'The request failed. Please try again.',
    },
    form: {
      nameRequired: 'Name is required.',
      nameTooLong: 'Name must be {{max}} characters or fewer.',
      industryTooLong: 'Industry must be {{max}} characters or fewer.',
      contactInfoTooLong:
        'Contact information must be {{max}} characters or fewer.',
      customerRequired: 'Select a customer.',
      amountInvalid: 'Enter an amount of 0 or more.',
      amountTooLarge: 'Enter an amount no greater than {{max}}.',
      customersEmpty:
        'Create a customer before adding a contact or an opportunity.',
      invalid: 'This value is not valid.',
    },
    customers: {
      title: 'Customers',
      description: 'The companies you work with.',
      fields: {
        name: 'Name',
        industry: 'Industry',
      },
      search: {
        placeholder: 'Search customers',
        label: 'Search customers',
      },
      actions: {
        more: 'Actions for {{name}}',
      },
      create: {
        action: 'New customer',
        title: 'New customer',
        success: 'Customer "{{name}}" created.',
      },
      edit: {
        title: 'Edit customer',
        success: 'Customer "{{name}}" updated.',
      },
      empty: {
        title: 'No customers yet',
        description:
          'Add your first customer to start tracking contacts and opportunities.',
        noResults: 'No customers match your search.',
      },
      detail: {
        title: 'Customer',
        contacts: 'Contacts',
        opportunities: 'Opportunities',
        totalAmount: 'Total estimated amount',
        noContacts: 'This customer has no contacts yet.',
        noOpportunities: 'This customer has no opportunities yet.',
        notFound: 'This customer no longer exists.',
      },
    },
    contacts: {
      title: 'Contacts',
      description: 'People at your customer companies.',
      fields: {
        name: 'Name',
        contactInfo: 'Contact information',
        customer: 'Customer',
      },
      search: {
        placeholder: 'Search contacts',
        label: 'Search contacts',
      },
      actions: {
        more: 'Actions for {{name}}',
      },
      create: {
        action: 'New contact',
        title: 'New contact',
        success: 'Contact "{{name}}" created.',
      },
      edit: {
        title: 'Edit contact',
        success: 'Contact "{{name}}" updated.',
      },
      empty: {
        title: 'No contacts yet',
        description:
          'Add a contact to record how to reach someone at a customer.',
        noResults: 'No contacts match your search.',
      },
    },
    opportunities: {
      title: 'Opportunities',
      description: 'The deals you are working on.',
      fields: {
        name: 'Name',
        customer: 'Customer',
        amount: 'Estimated amount',
        stage: 'Stage',
      },
      search: {
        placeholder: 'Search opportunities',
        label: 'Search opportunities',
      },
      filters: {
        stage: 'Stage',
        allStages: 'All stages',
      },
      actions: {
        more: 'Actions for {{name}}',
      },
      create: {
        action: 'New opportunity',
        title: 'New opportunity',
        success: 'Opportunity "{{name}}" created.',
      },
      edit: {
        title: 'Edit opportunity',
        success: 'Opportunity "{{name}}" updated.',
      },
      empty: {
        title: 'No opportunities yet',
        description:
          'Add an opportunity to track a deal and its estimated amount.',
        noResults: 'No opportunities match your filters.',
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
