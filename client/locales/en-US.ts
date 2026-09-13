import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  home: {
    title: 'Start building your application',
    description:
      'Describe what you need to your AI Agent, then build pages, data models, and business workflows.',
  },

  employees: {
    title: 'Employee records',
    description: 'Maintain employees and the certificates each one holds.',
    new: 'New employee',
    loading: 'Loading employees',
    empty: 'No employees yet. Add the first one.',
    retry: 'Retry',
    form: {
      name: 'Name',
      employeeNo: 'Employee number',
      department: 'Department',
      saving: 'Saving…',
    },
    errors: {
      employeeNoTaken: 'That employee number is already in use.',
      invalidInput: 'Some fields are missing or invalid.',
      notFound: 'The requested record could not be found.',
      generic: 'Something went wrong. Please try again.',
    },
  },
  employeeDetail: {
    back: 'Back to employees',
    loading: 'Loading employee',
    retry: 'Retry',
    meta: 'Employee number {{employeeNo}} · {{department}}',
  },
  certificates: {
    title: 'Certificates',
    add: 'Add certificate',
    empty: 'No certificates yet. Add the first one.',
    attachmentsEmpty: 'No attachments',
    expiresAt: 'Valid until {{date}}',
    noExpiry: 'No expiry date',
    delete: 'Delete certificate {{name}}',
    form: {
      name: 'Certificate name',
      expiresAt: 'Valid until',
      attachments: 'Attachments',
      saving: 'Uploading…',
    },
  },

  appearance: {
    title: 'Appearance',
    mode: 'Color mode',
    preset: 'Theme',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
    themes: { default: 'Default', compact: 'Compact' },
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
  account: {
    openMenu: 'Open account menu',
    fallback: 'Account',
    signOut: 'Sign out',
    signingOut: 'Signing out…',
  },
  navigation: {
    home: 'Home',
    employees: 'Employees',
    open: 'Open navigation',
    close: 'Close navigation',
    expand: 'Expand navigation',
    collapse: 'Collapse navigation',
    label: 'Application navigation',
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
