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
    tickets: 'Support tickets',
    stats: 'Ticket statistics',
    open: 'Open navigation',
    close: 'Close navigation',
    expand: 'Expand navigation',
    collapse: 'Collapse navigation',
    label: 'Application navigation',
  },
  support: {
    common: {
      loading: 'Loading…',
    },
    tickets: {
      title: 'Support tickets',
      description:
        'Report a problem with screenshots or logs, and follow how support handles it.',
      newTitle: 'New ticket',
      listTitle: 'Tickets you can see',
      submit: 'Create ticket',
      submitting: 'Creating…',
      empty: 'No tickets to show yet.',
      backToList: 'Back to tickets',
    },
    fields: {
      number: 'Number',
      title: 'Title',
      description: 'What happened?',
      priority: 'Priority',
      status: 'Status',
      assignee: 'Assignee',
      unassigned: 'Unassigned',
      createdAt: 'Created',
      customer: 'Customer',
      attachmentCount: 'Attachments',
      attachments: 'Screenshots and logs',
    },
    priority: {
      high: 'High',
      medium: 'Medium',
      low: 'Low',
    },
    status: {
      new: 'New',
      in_progress: 'In progress',
      pending_customer: 'Waiting for customer',
      closed: 'Closed',
    },
    uploader: {
      customer: 'Uploaded by customer',
      agent: 'Uploaded by support',
    },
    attachments: {
      title: 'Attachments',
      uploadTitle: 'Add an attachment',
      empty: 'No attachments yet.',
      unknownUser: 'Unknown user',
      download: 'Download',
      downloading: 'Downloading…',
      choose: 'Choose files',
      hint: 'Upload one or more screenshots or log files from your computer.',
      upload: 'Upload',
      uploading: 'Uploading…',
    },
    actions: {
      start: 'Start working',
      'request-confirmation': 'Ask customer to confirm',
      confirm: 'Confirm and close',
      reopen: 'Reopen',
    },
    filters: {
      allStatuses: 'All statuses',
      status: 'Filter by status',
    },
    stats: {
      title: 'Ticket statistics',
      description: 'How many tickets are open, waiting, or closed.',
      total: 'Total tickets',
      byStatus: 'By status',
      byPriority: 'By priority',
      refresh: 'Refresh',
    },
    errors: {
      UNKNOWN: 'The request failed. Please try again.',
      FORBIDDEN: 'You do not have permission to do that.',
      NOT_FOUND: 'The ticket or attachment was not found.',
      INVALID_TRANSITION: 'That status change is not allowed right now.',
      INVALID_ACTION: 'Unknown status action.',
      INVALID_TITLE: 'Please enter a title.',
      INVALID_JSON: 'The request body was invalid.',
      INVALID_MULTIPART: 'The upload was malformed.',
      UNSUPPORTED_MEDIA_TYPE: 'Unsupported upload format.',
      INVALID_TICKET_ID: 'Invalid ticket.',
      INVALID_FILE: 'Please choose a valid file.',
      FILE_TOO_LARGE: 'The file is larger than the 10 MB single-file limit.',
      UNSUPPORTED_FILE_TYPE:
        'That file type is not allowed. Upload a screenshot, log, document, or zip file.',
      BODY_TOO_LARGE: 'The upload is too large.',
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
