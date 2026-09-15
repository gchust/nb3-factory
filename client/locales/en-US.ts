import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  home: {
    title: 'Start building your application',
    description:
      'Describe what you need to your AI Agent, then build pages, data models, and business workflows.',
  },

  documents: {
    title: 'Engineering drawing & document library',
    subtitle:
      'Register drawings and technical documents, search by discipline, preview and download them.',
    filters: {
      title: 'Search documents',
      discipline: 'Discipline',
      all: 'All disciplines',
      drawingNumber: 'Drawing number',
      name: 'Name',
      reset: 'Reset',
    },
    upload: {
      title: 'Batch upload',
      discipline: 'Discipline',
      version: 'Version',
      files: 'Files',
      hint: 'Allowed types: {{extensions}}. Up to {{maxFiles}} files per upload, {{maxFileSize}} per file and {{maxBatchSize}} per batch.',
      selected: 'Selected files',
      submit: 'Upload and register',
      uploading: 'Uploading…',
      success: 'Registered {{count}} document(s).',
    },
    list: {
      title: 'Document ledger',
      total: '{{count}} document(s)',
      loading: 'Loading documents…',
      empty: 'No documents match the current filters.',
      fileName: 'File',
      type: 'Type',
      size: 'Size',
      drawingNumber: 'Drawing number',
      name: 'Name',
      discipline: 'Discipline',
      version: 'Version',
      status: 'Status',
      uploadedBy: 'Uploaded by',
      uploadedAt: 'Uploaded at',
      actions: 'Actions',
      preview: 'Preview',
      download: 'Download',
      edit: 'Edit',
      delete: 'Delete',
      confirmDelete: 'Confirm delete',
      save: 'Save',
      cancel: 'Cancel',
    },
    preview: {
      title: 'Preview',
      close: 'Close',
      loading: 'Loading preview…',
      unavailable:
        'This file type cannot be previewed in the page. Download it to open it.',
      failed: 'Unable to load the preview.',
    },
    stats: {
      title: 'Document statistics by discipline',
      subtitle: 'Document count and total file size for each discipline.',
      discipline: 'Discipline',
      count: 'Documents',
      totalSize: 'Total size',
      total: 'Total',
      empty: 'No documents yet.',
      loading: 'Loading statistics…',
    },
    discipline: {
      architecture: 'Architecture',
      structure: 'Structure',
      'mechanical-electrical': 'Mechanical & electrical',
      hvac: 'HVAC',
    },
    status: {
      active: 'Active',
      obsolete: 'Obsolete',
    },
    errors: {
      TOO_MANY_FILES: 'A single upload may contain at most {{maxFiles}} files.',
      UNSUPPORTED_TYPE: 'Only PDF, DWG, DOCX, XLSX and PNG files are allowed.',
      FILE_TOO_LARGE: 'A single file may not exceed {{maxFileSize}}.',
      BATCH_TOO_LARGE:
        'A single upload may not exceed {{maxBatchSize}} in total.',
      NO_FILES: 'Choose at least one file.',
      INVALID_DISCIPLINE: 'Choose a discipline.',
      INVALID_VERSION: 'The version must be 32 characters or fewer.',
      INVALID_STATUS: 'Choose a valid status.',
      FORBIDDEN: 'You do not have permission for this action.',
      NOT_FOUND: 'The document no longer exists.',
      generic: 'The request failed. Please try again.',
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
    documents: 'Document library',
    documentStats: 'Document statistics',
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
