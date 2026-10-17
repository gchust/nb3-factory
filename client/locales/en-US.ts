import type { LocaleResource } from '@nocobase/i18n';

import systemEnUS from './system/en-US.js';

const enUS = {
  // The template's own copy: the shell, the sign-in pages, shared components and the homepage. Keep it in
  // `./system/` so a template upgrade can replace it without touching the application's copy below.
  ...systemEnUS,
  navigation: {
    ...systemEnUS.navigation,
    library: 'Document library',
    libraryManage: 'Manage documents',
    adminUsers: 'Users & permissions',
  },
  library: {
    title: 'Document library',
    description:
      'Published documents that are open to everyone. Drafts stay with their owners; confidential documents are only for their owner and the library administrators.',
    manageTitle: 'Manage documents',
    manageDescription:
      'Documents you own, including drafts and confidential files. Only you and the library administrators can read those. Confidential documents cannot be shared.',
    searchPlaceholder: 'Search title or content',
    searchLabel: 'Search documents',
    columns: {
      title: 'Title',
      owner: 'Owner',
      visibility: 'Visibility',
      updatedAt: 'Updated',
      actions: 'Actions',
    },
    visibility: {
      published: 'Published',
      draft: 'Draft',
      confidential: 'Confidential',
    },
    empty: {
      title: 'No documents yet',
      description:
        'When a document matches your access and the search, it appears here.',
      manageTitle: 'You have no documents',
      manageDescription: 'Create the first document you want to manage.',
    },
    actions: {
      new: 'New document',
      view: 'View',
      edit: 'Edit',
      share: 'Share',
      delete: 'Delete',
      cancel: 'Cancel',
      save: 'Save',
      saving: 'Saving…',
      create: 'Create',
      creating: 'Creating…',
      previous: 'Previous',
      next: 'Next',
      retry: 'Retry',
    },
    detail: {
      title: 'Document',
      description: 'Read-only view of the document.',
      body: 'Content',
      owner: 'Owner',
      updatedAt: 'Last updated',
      published: 'Published',
      confidential: 'Confidential',
      yes: 'Yes',
      no: 'No',
    },
    form: {
      createTitle: 'New document',
      createDescription:
        'Drafts stay with you. Publishing makes a non-confidential document visible to every reader.',
      editTitle: 'Edit document',
      editDescription: 'Update the content and who may read it.',
      title: 'Title',
      titlePlaceholder: 'Give the document a clear title',
      body: 'Content',
      bodyPlaceholder: 'Write the document here',
      published: 'Publish this document',
      publishedHint:
        'Published, non-confidential documents are visible to all readers.',
      confidential: 'Confidential',
      confidentialHint:
        'Confidential documents are visible only to you and the library administrators. They cannot be shared with anyone else.',
      error: 'The document could not be saved. Check the fields and try again.',
    },
    delete: {
      title: 'Delete this document?',
      description:
        'The document and its sharing list are removed. This cannot be undone.',
      confirm: 'Delete document',
      deleting: 'Deleting…',
    },
    share: {
      title: 'Share document',
      description:
        'Choose the people who may read this document in addition to its owner and the library administrators.',
      candidates: 'People',
      selected: 'Shared with',
      empty: 'This document is not shared with anyone else.',
      searchLabel: 'Search people',
      searchPlaceholder: 'Search by name or email',
      noCandidates: 'No people match the search.',
      confidentialTitle: 'Confidential documents cannot be shared',
      confidentialHint:
        'Only the owner and the library administrators can read a confidential document, even if someone tries to share it. Remove an existing entry here if an older rule named someone.',
      removeExisting: 'Existing entries to remove',
      error: 'The sharing list could not be updated. Try again.',
      save: 'Save sharing',
      saving: 'Saving…',
    },
    errors: {
      load: 'The documents could not be loaded.',
      notFound: 'The document does not exist or you cannot read it.',
    },
    permissionSets: {
      librarian: 'Librarian',
      reader: 'Reader',
    },
    recordAccess: {
      visible: 'Published documents and own documents',
      visibleDescription:
        'Published, non-confidential documents, plus every document the signed-in person owns.',
    },
    resources: {
      documents: 'Library documents',
      documentsDescription:
        'Documents in the library and their visibility settings.',
    },
    settings: {
      title: 'Document library settings',
      read: 'Read settings',
      update: 'Update settings',
    },
    sections: {
      library: 'Document library',
      documents: 'Documents',
      administration: 'Administration',
    },
    scopes: {
      documents: 'Documents',
    },
  },
  users: {
    title: 'Users and permissions',
    description:
      'Manage staff accounts, their permission sets, and whether they can sign in.',
    searchLabel: 'Search users',
    searchPlaceholder: 'Search by name or email',
    you: 'You',
    status: {
      label: 'Account status',
      all: 'All',
      enabled: 'Enabled',
      disabled: 'Disabled',
    },
    account: {
      enabled: 'Enabled',
      disabled: 'Disabled',
    },
    columns: {
      person: 'Person',
      permissions: 'Permission sets',
      status: 'Status',
      actions: 'Actions',
    },
    actions: {
      permissions: 'Manage permissions',
      enable: 'Enable account',
      disable: 'Disable account',
      revokeSessions: 'Sign out everywhere',
      cancel: 'Cancel',
      retry: 'Retry',
      previous: 'Previous',
      next: 'Next',
    },
    empty: {
      title: 'No users match',
      description: 'Try a different search or account status.',
    },
    errors: {
      load: 'The users could not be loaded.',
    },
    permissions: {
      title: 'Manage permissions',
      description: 'Choose what {{name}} may do.',
      none: 'No permission set',
      save: 'Save permissions',
      saving: 'Saving…',
      error: 'The permissions could not be saved.',
      protected: 'This assignment is managed outside user administration.',
      defaultAccess:
        'All signed-in people also receive default access that is configured separately.',
    },
    disable: {
      title: 'Disable this account?',
      description:
        'The person will be signed out immediately and cannot sign in again until the account is enabled.',
      confirm: 'Disable account',
      disabling: 'Disabling…',
      success: 'Account disabled. Its sessions were ended.',
    },
    enable: {
      success: 'Account enabled. The person can sign in again.',
      error: 'The account could not be enabled.',
    },
    revokeSessions: {
      success: 'The person was signed out everywhere.',
      error: 'The sessions could not be ended.',
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
