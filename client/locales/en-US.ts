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
    creating: 'Creating…',
    saving: 'Saving…',
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
  crm: {
    error: {
      title: 'Something went wrong',
      forbidden: 'You do not have permission to view this data.',
      requestFailed: 'The request failed. Please try again.',
    },
    filters: {
      clear: 'Clear filters',
    },
    form: {
      customersFailed:
        'The customer list could not be loaded. Reload the page and try again.',
    },
    stage: {
      follow_up: 'In progress',
      won: 'Won',
      lost: 'Lost',
    },
    customer: {
      title: 'Customers',
      description: 'Companies you sell to and their details.',
      fields: {
        name: 'Name',
        industry: 'Industry',
        updatedAt: 'Last updated',
      },
      form: {
        description: 'Name is required; industry is optional.',
        nameRequired: 'Enter a customer name.',
        nameTooLong: 'Keep the name at 100 characters or fewer.',
        industryTooLong: 'Keep the industry at 100 characters or fewer.',
      },
      create: {
        action: 'New customer',
        title: 'New customer',
        success: 'Customer created.',
      },
      edit: {
        title: 'Edit customer',
        success: 'Customer updated.',
      },
      detail: {
        title: 'Customer details',
        totalExpectedAmount: 'Total expected amount',
        contactsTab: 'Contacts ({{count}})',
        opportunitiesTab: 'Opportunities ({{count}})',
        noContacts: 'This customer has no contacts yet.',
        noOpportunities: 'This customer has no opportunities yet.',
      },
      empty: {
        title: 'No customers yet',
        description: 'Create your first customer to start tracking sales.',
        noResults: 'No customers match your search.',
      },
      error: {
        notFound: 'This customer no longer exists.',
        requestFailed: 'The customer list could not be loaded.',
      },
      actions: {
        label: 'Customer actions',
        more: 'Actions for {{name}}',
        edit: 'Edit customer',
      },
      search: {
        placeholder: 'Search by customer name or industry',
        label: 'Search customers',
      },
    },
    contact: {
      title: 'Contacts',
      description: 'People at your customer companies.',
      fields: {
        name: 'Name',
        customer: 'Customer',
        phone: 'Phone',
        email: 'Email',
        createdAt: 'Created',
        updatedAt: 'Last updated',
      },
      form: {
        description: 'Name and customer are required.',
        nameRequired: 'Enter a contact name.',
        nameTooLong: 'Keep the name at 100 characters or fewer.',
        customerRequired: 'Select a customer.',
        phoneTooLong: 'Keep the phone number at 50 characters or fewer.',
        emailTooLong: 'Keep the email at 100 characters or fewer.',
      },
      create: {
        action: 'New contact',
        title: 'New contact',
        success: 'Contact created.',
      },
      edit: {
        title: 'Edit contact',
        success: 'Contact updated.',
      },
      detail: {
        title: 'Contact details',
      },
      empty: {
        title: 'No contacts yet',
        description: 'Add a contact to the customer companies you track.',
        noResults: 'No contacts match your search.',
      },
      error: {
        notFound: 'This contact no longer exists.',
        requestFailed: 'The contact list could not be loaded.',
      },
      actions: {
        label: 'Contact actions',
        more: 'Actions for {{name}}',
        edit: 'Edit contact',
      },
      search: {
        placeholder: 'Search by contact name, phone or email',
        label: 'Search contacts',
      },
    },
    opportunity: {
      title: 'Opportunities',
      description: 'Deals in your pipeline and where they stand.',
      fields: {
        name: 'Name',
        customer: 'Customer',
        amount: 'Expected amount',
        stage: 'Stage',
        createdAt: 'Created',
        updatedAt: 'Last updated',
      },
      form: {
        description: 'Name, customer and stage are required.',
        nameRequired: 'Enter an opportunity name.',
        nameTooLong: 'Keep the name at 120 characters or fewer.',
        customerRequired: 'Select a customer.',
        amountRequired: 'Enter an expected amount.',
        amountInvalid: 'Enter a valid non-negative amount.',
        amountTooLarge: 'Keep the expected amount below 1,000,000,000,000.',
        stageInvalid: 'Select a valid stage.',
      },
      create: {
        action: 'New opportunity',
        title: 'New opportunity',
        success: 'Opportunity created.',
      },
      edit: {
        title: 'Edit opportunity',
        success: 'Opportunity updated.',
      },
      detail: {
        title: 'Opportunity details',
      },
      empty: {
        title: 'No opportunities yet',
        description: 'Create an opportunity to start tracking a deal.',
        noResults: 'No opportunities match your filters.',
      },
      error: {
        notFound: 'This opportunity no longer exists.',
        requestFailed: 'The opportunity list could not be loaded.',
      },
      actions: {
        label: 'Opportunity actions',
        more: 'Actions for {{name}}',
        edit: 'Edit opportunity',
      },
      search: {
        placeholder: 'Search by opportunity name or customer',
        label: 'Search opportunities',
      },
      filters: {
        stage: 'Filter by stage',
        allStages: 'All stages',
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
