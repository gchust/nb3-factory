import type { LocaleResource } from '@nocobase/i18n';

import systemEnUS from './system/en-US.js';

const enUS = {
  // The template's own copy: the shell, the sign-in pages, shared components and the homepage. Keep it in
  // `./system/` so a template upgrade can replace it without touching the application's copy below.
  ...systemEnUS,
  // The application's copy goes here, one group per feature. A shared group such as `navigation` is extended by
  // spreading the system one first, `navigation: { ...systemEnUS.navigation, orders: 'Orders' }`, since a group
  // written here replaces the system group of the same name rather than merging with it.
  navigation: {
    ...systemEnUS.navigation,
    leave: 'Leave',
    documents: 'Documents',
  },
  leave: {
    page: {
      title: 'Leave',
      description:
        'Request time off, follow your requests and see when the team is away.',
    },
    actions: {
      new: 'New request',
      view: 'View',
    },
    tabs: {
      mine: 'My requests',
      approvals: 'Approvals',
      team: 'Team calendar',
    },
    stats: {
      pending: 'My pending requests',
      approved: 'My approved leave this year',
      yearTotal: 'My requests this year',
      teamPending: 'Awaiting a decision',
    },
    table: {
      employee: 'Employee',
      type: 'Type',
      dates: 'Dates',
      days: 'Days',
      reason: 'Reason',
      submitted: 'Submitted',
      status: 'Status',
      actions: 'Actions',
    },
    filter: {
      allStatuses: 'All statuses',
      allTypes: 'All types',
    },
    list: {
      empty: 'No leave requests match these filters.',
    },
    type: {
      annual: 'Annual leave',
      sick: 'Sick leave',
      personal: 'Personal leave',
      unpaid: 'Unpaid leave',
    },
    status: {
      pending: 'Pending',
      approved: 'Approved',
      rejected: 'Rejected',
    },
    loading: 'Loading leave…',
    loadError: 'Leave could not be loaded. Try again.',
    calendar: {
      description:
        'Approved leave only. Use the list to submit or review a request.',
      hint: 'Approved team leave, by day',
      previous: 'Previous month',
      next: 'Next month',
      today: 'This month',
      more_one: '{{count}} more',
      more_other: '{{count}} more',
    },
    form: {
      title: 'New leave request',
      description:
        'Choose the first and last day. Weekends are not counted and only working days are submitted.',
      cancel: 'Cancel',
      submit: 'Submit request',
      submitting: 'Submitting…',
      created: 'Leave request submitted.',
      type: 'Type of leave',
      startDate: 'First day',
      endDate: 'Last day',
      pickDate: 'Pick a date',
      daysCount_one: '{{count}} working day',
      daysCount_other: '{{count}} working days',
      reason: 'Reason',
      reasonPlaceholder: 'Add a short reason for the request',
      startRequired: 'Choose the first day.',
      endRequired: 'Choose the last day.',
      endBeforeStart: 'The last day cannot be before the first day.',
      noWorkingDays: 'Choose at least one working day.',
      reasonRequired: 'Add a reason of at least 3 characters.',
      overlap: 'These dates overlap leave that is already pending or approved.',
      invalidDates: 'Choose valid leave dates.',
      failed: 'The leave request could not be submitted. Try again.',
    },
    detail: {
      title: 'Leave request',
      days_one: '{{count}} working day',
      days_other: '{{count}} working days',
      employee: 'Employee',
      dates: 'Dates',
      submitted: 'Submitted',
      decided: 'Decided',
      notDecided: 'Not decided yet',
      reason: 'Reason',
      reviewedBy: 'Reviewed by {{name}}',
      decision: 'Decision',
      approve: 'Approve',
      reject: 'Reject',
      comment: 'Comment',
      commentPlaceholder: 'Explain the decision (optional)',
      confirmReject: 'Reject request',
      deciding: 'Saving…',
      approvedToast: 'Leave request approved.',
      rejectedToast: 'Leave request rejected.',
      alreadyDecided: 'This request has already been decided.',
      missing: 'This leave request is no longer available.',
      decisionFailed: 'The decision could not be saved. Try again.',
      approveTitle: 'Approve this leave request?',
      approveDescription:
        'This approves {{name}}’s request and adds it to the team calendar.',
    },
    permissions: {
      approvals: 'Leave approvals',
      decide: 'Approve or reject leave requests',
      approverSet: 'Leave approver',
    },
  },
  documents: {
    page: {
      title: 'Document library',
      description:
        'Read published material, keep your own documents, and open a draft to one person temporarily.',
    },
    actions: {
      new: 'New document',
      edit: 'Edit',
    },
    badges: {
      published: 'Published',
      draft: 'Draft',
      confidential: 'Confidential',
      shared: 'Shared with you',
    },
    list: {
      emptyTitle: 'No documents to show',
      emptyOwner:
        'Create the first document, then publish it or share a draft with one person.',
      emptyReader:
        'Nothing has been published or shared with you yet. Check again later.',
    },
    errors: {
      missing: 'This document is not available to you any more.',
      confidential: 'A confidential document cannot be shared.',
      targetUnavailable: 'The selected person is not available for sharing.',
      selfShare: 'You already have access to this document.',
      denied: 'You do not have permission to do that with documents.',
      failed: 'The request could not be completed. Try again.',
      signInAgain: 'Sign in again',
      backToList: 'Back to documents',
      retry: 'Retry',
    },
    form: {
      title: 'Title',
      titlePlaceholder: 'A short, recognisable title',
      body: 'Document body',
      bodyPlaceholder: 'Write the document here…',
      titleRequired: 'Enter a title.',
      bodyRequired: 'Enter the document body.',
      published: 'Published',
      publishedHint:
        'Published non-confidential documents are readable by every qualified reader.',
      confidential: 'Confidential',
      confidentialHint:
        'Only the owner can read a confidential document. It cannot be shared.',
      privateDraftNotice:
        'This is a confidential draft. Nobody else can open it, and it cannot be shared.',
      cancel: 'Cancel',
      saving: 'Saving…',
      create: 'Create document',
      created: 'Document created.',
      newTitle: 'New document',
      newDescription:
        'Start with a draft, or publish it now if it is ready for readers.',
      editTitle: 'Edit document',
      editDescription:
        'Change the wording, publish it, or mark it confidential. These changes apply the next time a reader opens it.',
      save: 'Save changes',
    },
    detail: {
      saved: 'Document saved.',
      meta: 'Maintained by {{owner}} · Updated {{date}}',
      confidentialNotice:
        'This document is confidential. Only its owner can read it, and it cannot be shared.',
    },
    share: {
      title: 'Temporary access',
      description:
        'Opening a draft gives one person read access to this document only. They still cannot edit it or see your other drafts. Revoking removes access the next time they refresh or reopen it.',
      ownerHint:
        'The document stays private unless you open it to someone here.',
      publishedHint:
        'Every qualified reader can already open this published document. Temporary access you opened earlier can still be revoked here.',
      active: 'Active',
      revoked: 'Revoked',
      expired: 'Expired',
      until: 'Until {{date}}',
      noExpiry: 'No expiry',
      by: 'Opened by {{name}}',
      revoke: 'Revoke',
      empty: 'Nobody has temporary access to this document.',
      openTitle: 'Open this document to someone',
      person: 'Person',
      personPlaceholder: 'Choose a person',
      expiry: 'Ends at (optional)',
      expiryHint:
        'Leave empty for access without an expiry date. You can revoke it at any time.',
      opening: 'Opening…',
      open: 'Open access',
      openedToast: 'The document is now open to that person.',
      revokedToast: 'Access revoked.',
      personRequired: 'Choose a person.',
      expiryFuture: 'Choose an end time in the future.',
      revokeTitle: 'Revoke this access?',
      revokeDescription:
        '{{name}} will no longer see this document after refreshing or reopening it.',
      confidentialBlocked:
        'This document is confidential, so it cannot be opened to another person.',
    },
    permissions: {
      resource: 'Document library',
      view: 'Read documents',
      create: 'Create documents',
      edit: 'Edit own documents',
      share: 'Share own documents',
      documents: 'Documents',
      shares: 'Document shares',
      maintainerSet: 'Document maintainer',
      readerSet: 'Document reader',
    },
    recordAccess: {
      readable: 'Own, published or temporarily shared documents',
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
