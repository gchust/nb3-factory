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
    leaveRequests: 'Leave requests',
    open: 'Open navigation',
    close: 'Close navigation',
    expand: 'Expand navigation',
    collapse: 'Collapse navigation',
    label: 'Application navigation',
  },

  leaveRequests: {
    title: 'Leave requests',
    list: {
      title: 'All requests',
      description: 'Browse and manage all leave requests.',
      loading: 'Loading requests…',
      empty: 'No leave requests yet.',
    },
    create: {
      title: 'New leave request',
      description: 'Fill in the details of your leave request.',
      formTitle: 'Request details',
      daysHint:
        'Fill in automatically from the dates; the value must be between 0.5 and 3650 days.',
      reasonPlaceholder: 'Why are you taking leave?',
      submitting: 'Submitting…',
      submitError: 'Submission failed. Please check the input and try again.',
      validation: {
        startAtRequired: 'Start time is required.',
        endAtRequired: 'End time is required.',
        endBeforeStart: 'End time must not be before start time.',
        daysRange: 'Days must be between 0.5 and 3650.',
        reasonRequired: 'Reason is required.',
        reasonTooLong: 'Reason must be at most 2000 characters.',
      },
    },
    detail: {
      title: 'Leave request #{{id}}',
      loading: 'Loading request…',
      notFound: 'Leave request not found.',
      info: 'Request information',
      decision: 'Approval result',
      decisionBy: 'Decided by {{name}}',
    },
    fields: {
      applicant: 'Applicant',
      type: 'Type',
      startAt: 'Start time',
      endAt: 'End time',
      days: 'Days',
      reason: 'Reason',
      status: 'Status',
      evidence: 'Files',
      createdAt: 'Submitted at',
      comment: 'Comment',
    },
    types: {
      personal: 'Personal leave',
      sick: 'Sick leave',
      annual: 'Annual leave',
      compensatory: 'Compensatory leave',
    },
    statuses: {
      pending: 'Pending',
      approved: 'Approved',
      rejected: 'Rejected',
    },
    actions: {
      create: 'New request',
      submit: 'Submit',
      backToList: 'Back to list',
      approve: 'Approve',
      reject: 'Reject',
      confirmApprove: 'Confirm approval',
      confirmReject: 'Confirm rejection',
    },
    process: {
      approveTitle: 'Approve leave request',
      rejectTitle: 'Reject leave request',
      commentHint: 'Add a comment (optional).',
      commentRequiredHint: 'A comment is required.',
      submitting: 'Processing…',
      alreadyProcessed: 'This request has already been processed.',
      commentRequired: 'A comment is required for this action.',
    },
    evidence: {
      title: 'Evidence files',
      description: 'Supporting documents attached to this request.',
      upload: 'Upload',
      empty:
        'No files yet. Upload evidence such as medical certificates or approval documents.',
      uploadError: 'Upload failed. Please try again.',
      delete: 'Delete {{name}}',
      deleteTitle: 'Delete file',
      deleteConfirm: 'Delete “{{name}}”? This cannot be undone.',
      confirmDelete: 'Delete',
      deleting: 'Deleting…',
      deleteError: 'Failed to delete the file. Please try again.',
      download: 'Download {{name}}',
    },
    error: {
      unexpected: 'Something went wrong. Please try again.',
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
