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
    title: 'Contract Archive',
    description: 'Manage contract records, their body PDFs and attachments.',
    newContract: 'New contract',
    empty: 'No contracts yet. Create the first one.',
    actions: 'Actions',
    view: 'View',
    edit: 'Edit',
    delete: 'Delete',
    deleting: 'Deleting…',
    save: 'Save contract',
    backToList: 'Back to contracts',
    deleteTitle: 'Delete contract',
    deleteBody:
      'Delete “{{name}}”? Its body and all attachments will be removed as well.',
    attachmentDeleteTitle: 'Delete attachment',
    attachmentDeleteBody:
      'Delete attachment “{{name}}”? Only this file is removed; the contract and its other attachments stay unchanged.',
    pages: {
      newTitle: 'New contract',
      editTitle: 'Edit contract',
    },
    fields: {
      contractNo: 'Contract No.',
      name: 'Contract name',
      party: 'Counterparty',
      signedAt: 'Signed on',
      amount: 'Amount',
      status: 'Status',
      remark: 'Remark',
      body: 'Contract body',
      attachments: 'Attachments',
    },
    statuses: {
      draft: 'Draft',
      active: 'Active',
      expired: 'Expired',
      terminated: 'Terminated',
    },
    sections: {
      basic: 'Basic information',
      body: 'Contract body',
      attachments: 'Attachments',
    },
    form: {
      bodyHint: 'One PDF only. Re-uploading replaces the current file.',
      attachmentsHint:
        'PDF, images and common office documents; 5 MiB per file at most.',
      chooseBody: 'Choose body PDF',
      chooseAttachments: 'Choose attachments',
    },
    files: {
      choose: 'Choose files',
      empty: 'No files.',
      preview: 'Preview',
      download: 'Download',
      remove: 'Remove',
      retry: 'Retry',
      done: 'Uploaded',
      uploading: 'Uploading…',
      pending: 'Pending',
      failed: 'Failed',
      cancel: 'Cancel upload',
      previous: 'Previous file',
      next: 'Next file',
      tooMany: 'The maximum number of files has been reached.',
      typeNotAllowed: 'File type is not allowed.',
      urlNotAllowed: 'File URL is not allowed.',
      removeFailed: 'File removal failed.',
      uploadFailed: 'File upload failed.',
      loading: 'Loading preview…',
      loadFailed: 'The file failed to load.',
      downloadFile: 'Download file',
      previewUnavailable: 'Preview is unavailable for this file.',
      officeFailed: 'Could not preview this office document.',
      officeRequiresUrl:
        'Office document preview requires an internet-accessible URL.',
      bodyEmpty: 'No body uploaded for this contract yet.',
      attachmentsEmpty: 'No attachments for this contract yet.',
    },
    errors: {
      INTERNAL_ERROR: 'Something went wrong. Please try again later.',
      CONTRACT_NOT_FOUND: 'Contract not found.',
      CONTRACT_NO_REQUIRED: 'Contract number is required.',
      CONTRACT_NAME_REQUIRED: 'Contract name is required.',
      CONTRACT_PARTY_REQUIRED: 'Counterparty is required.',
      CONTRACT_STATUS_INVALID: 'Contract status is not valid.',
      CONTRACT_SIGNED_AT_INVALID:
        'Signed-on date must be in YYYY-MM-DD format.',
      CONTRACT_AMOUNT_INVALID:
        'Amount format is not valid (at most two decimals).',
      CONTRACT_NO_TAKEN: 'This contract number is already in use.',
      CONTRACT_BODY_IN_USE:
        'That PDF already belongs to another contract as its body.',
      CONTRACT_ATTACHMENT_IN_USE:
        'One or more attachments already belong to another contract.',
      CONTRACT_FILE_NOT_FOUND:
        'A selected file no longer exists and cannot be saved.',
      CONTRACT_ATTACHMENT_NOT_FOUND:
        'This attachment does not belong to this contract.',
      CONTRACT_ATTACHMENTS_EMPTY: 'Choose at least one attachment file.',
      CONTRACT_FILES_NOT_ALLOWED:
        'Some files are not allowed; review the message before retrying.',
      CONTRACT_UPLOAD_FILE_REQUIRED: 'Choose the body PDF to upload.',
      CONTRACT_BODY_INVALID: 'Request data is not well-formed.',
      CONTRACT_ID_INVALID: 'The contract parameter is invalid.',
      CONTRACT_FILE_ID_INVALID: 'The attachment parameter is invalid.',
      CONTRACT_FILE_TOO_LARGE: 'A single file may not exceed 5 MiB.',
      BODY_FILE_TYPE_NOT_ALLOWED:
        'The contract body accepts PDF files (.pdf) only.',
      ATTACHMENT_FILE_TYPE_NOT_ALLOWED:
        'Attachments accept PDF, images and common office documents only.',
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
