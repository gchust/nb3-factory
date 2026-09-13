import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
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
    contracts: 'Contracts',
    open: 'Open navigation',
    close: 'Close navigation',
    expand: 'Expand navigation',
    collapse: 'Collapse navigation',
    label: 'Application navigation',
  },
  contracts: {
    title: 'Contract archive',
    description:
      'Manage contracts and their attachments, and filter by category.',
    newContract: 'New contract',
    newTitle: 'New contract',
    editTitle: 'Edit contract',
    edit: 'Edit',
    saving: 'Saving…',
    empty: 'No contracts yet',
    actions: 'Actions',
    filter: { label: 'Category', all: 'All categories' },
    categories: {
      procurement: 'Procurement',
      sales: 'Sales',
      service: 'Service',
    },
    fields: {
      name: 'Contract name',
      counterparty: 'Counterparty',
      category: 'Category',
      attachment: 'Attachment',
    },
    attachment: {
      none: 'No attachment',
      view: 'View',
      download: 'Download',
      remove: 'Remove attachment',
      uploading: 'Uploading…',
      hint: 'PDF, image or text file, up to 5 MiB.',
    },
    errors: {
      CONTRACT_NAME_REQUIRED: 'Contract name is required.',
      CONTRACT_NAME_TOO_LONG: 'Contract name must be at most 255 characters.',
      CONTRACT_COUNTERPARTY_REQUIRED: 'Counterparty is required.',
      CONTRACT_COUNTERPARTY_TOO_LONG:
        'Counterparty must be at most 255 characters.',
      CONTRACT_CATEGORY_INVALID: 'Invalid contract category.',
      CONTRACT_ATTACHMENT_REQUIRED:
        'Please upload a contract attachment first.',
      CONTRACT_ATTACHMENT_NOT_FOUND:
        'The attachment no longer exists. Please upload it again.',
      CONTRACT_ATTACHMENT_IN_USE:
        'This attachment already belongs to another contract.',
      CONTRACT_ATTACHMENT_TYPE_NOT_ALLOWED:
        'The attachment must be a PDF, image or text file.',
      CONTRACT_ATTACHMENT_TOO_LARGE: 'The attachment must be at most 5 MiB.',
      CONTRACT_ATTACHMENT_FILE_REQUIRED: 'Please choose an attachment file.',
      CONTRACT_NOT_FOUND: 'The contract does not exist.',
      CONTRACT_ID_INVALID: 'Invalid contract id.',
      CONTRACT_BODY_INVALID: 'Invalid request body.',
      INTERNAL_ERROR: 'Something went wrong. Please try again.',
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
