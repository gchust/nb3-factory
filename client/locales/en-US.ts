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
    resources: 'Resource Center',
    files: 'Files',
    open: 'Open navigation',
    close: 'Close navigation',
    expand: 'Expand navigation',
    collapse: 'Collapse navigation',
    label: 'Application navigation',
  },
  resources: {
    title: 'Resource Center',
    description: 'Documents and files, each with a cover image.',
    new: 'New resource',
    createTitle: 'New resource',
    createDescription:
      'Upload a cover image and a document, then save the resource.',
    loading: 'Loading resources',
    empty: 'No resources yet.',
    loadError: 'Unable to load resources.',
    notFound: 'This resource does not exist.',
    noCover: 'No cover',
    noDocument: 'No document attached.',
    save: 'Save',
    saving: 'Saving…',
    cancel: 'Cancel',
    backToList: 'Back to resource center',
    download: 'Download',
    fields: {
      title: 'Title',
      category: 'Category',
      cover: 'Cover image',
      coverHint: 'A small image shown in the resource list.',
      document: 'Document',
      documentHint: 'A document or PDF available for download.',
    },
    placeholders: {
      title: 'Enter a title',
      category: 'Enter a category',
    },
    upload: {
      chooseCover: 'Choose cover image',
      chooseDocument: 'Choose document',
      uploading: 'Uploading…',
      remove: 'Remove',
      failed: 'Upload failed. Please try again.',
    },
    errors: {
      title: 'Enter a title of at most 200 characters.',
      category: 'Enter a category of at most 100 characters.',
      file: 'An attachment is missing. Please upload it again.',
      save: 'Unable to save the resource.',
    },
  },
  files: {
    title: 'Files',
    description: 'Every file uploaded to the resource center.',
    loading: 'Loading files',
    empty: 'No files uploaded yet.',
    loadError: 'Unable to load files.',
    download: 'Download',
    units: {
      b: 'B',
      kb: 'KB',
      mb: 'MB',
      gb: 'GB',
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
