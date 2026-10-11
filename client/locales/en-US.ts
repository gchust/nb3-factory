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
    documents: 'Document library',
    settings: 'Library settings',
  },
  actions: {
    ...systemEnUS.actions,
    create: 'Create',
    saving: 'Saving…',
    signInAgain: 'Sign in again',
  },
  'status.sessionExpired': 'Your session has ended. Sign in again to continue.',

  // The document library. The keys under `documents.title`, `documents.actions`, `documents.permissions`,
  // `documents.recordAccess` and `documents.admin` are also the titles the authorization pages show, which is why
  // they live in this namespace.
  documents: {
    title: 'Documents',
    description:
      'Published documents are open to colleagues with document access; drafts stay with their owner.',
    collection: 'Documents',
    actions: {
      view: 'View documents',
      create: 'Create documents',
      edit: 'Edit documents',
      delete: 'Delete documents',
    },
    permissions: {
      view: 'View documents',
      create: 'Create documents',
      edit: 'Edit documents',
      delete: 'Delete documents',
    },
    permissionSets: {
      editor: 'Document editor',
      reader: 'Document reader',
    },
    recordAccess: {
      readable: 'Owned, published, or shared with me',
    },
    create: {
      title: 'New document',
      action: 'New document',
      success: 'Created “{{name}}”.',
    },
    edit: {
      title: 'Edit document',
      success: 'Saved “{{name}}”.',
    },
    form: {
      description:
        'A published, non-confidential document is readable by everyone with document access.',
      title: 'Title',
      titlePlaceholder: 'Give the document a clear title',
      body: 'Body',
      bodyPlaceholder: 'Write the document here',
      published: 'Published',
      publishedHint:
        'Colleagues with document access can read it once published.',
      confidential: 'Confidential',
      confidentialHint:
        'A confidential document is readable only by its owner, even when it is shared.',
      titleRequired: 'Enter a title.',
      titleTooLong: 'The title is at most {{max}} characters.',
    },
    discard: {
      title: 'Discard changes?',
      description: 'Your changes will not be saved.',
      cancel: 'Keep editing',
      confirm: 'Discard',
    },
    fields: {
      title: 'Title',
      body: 'Body',
      owner: 'Owner',
      status: 'Status',
      published: 'Published',
      confidential: 'Confidential',
      updatedAt: 'Updated',
    },
    status: {
      published: 'Published',
      draft: 'Draft',
      confidential: 'Confidential',
      normal: 'Not confidential',
    },
    search: {
      label: 'Search documents by title',
      placeholder: 'Search by title',
    },
    filters: {
      clear: 'Clear search',
    },
    sort: {
      by: 'Sort by {{field}}',
      toggle: 'Change the sort of {{field}}',
    },
    empty: {
      title: 'No documents yet',
      description: 'The library is empty. Its first document starts here.',
      noResults: 'No documents match your search',
      noResultsDescription: 'Try a different title, or clear the search.',
    },
    pagination: {
      summary: '{{total}} document(s) · page {{page}} of {{pageCount}}',
      previous: 'Previous',
      next: 'Next',
    },
    rowActions: {
      label: 'Actions',
      more: 'Actions for {{name}}',
      edit: 'Edit',
      delete: 'Delete',
    },
    detail: {
      title: 'Document',
      description: 'What this document is and who may read it.',
      unknownOwner: 'Unknown',
      emptyBody: 'This document has no body yet.',
      missing: {
        description:
          'This document does not exist, or you no longer have access to it.',
      },
    },
    delete: {
      title: 'Delete “{{name}}”?',
      description:
        'The document is removed for everyone. This cannot be undone.',
      confirm: 'Delete',
      success: 'Deleted “{{name}}”.',
      notFound: '“{{name}}” was already deleted.',
    },
    error: {
      notFound:
        'This document does not exist, or you no longer have access to it.',
      forbidden: 'You do not have permission to do this.',
      requestFailed: 'Something went wrong. Please try again.',
    },
    admin: {
      title: 'Document library',
      actions: {
        read: 'Open library settings',
        manage: 'Manage temporary shares',
      },
    },
  },

  settings: {
    title: 'Library settings',
    description:
      'Who may sign in to the library, and which documents are open to whom.',
    tabs: {
      users: 'Staff permissions',
      shares: 'Temporary sharing',
    },
    users: {
      title: 'Staff permissions',
      description:
        'Open or close an account, and choose the permission set it holds.',
      search: {
        label: 'Search staff',
        placeholder: 'Search by name, username or email',
      },
      saving: 'Saving…',
      status: {
        enabled: 'Active',
        disabled: 'Deactivated',
      },
      roles: {
        label: 'Permission sets for {{name}}',
        none: 'No permission sets to assign.',
        success: 'Updated the permission sets of {{name}}.',
      },
      empty: {
        description: 'No staff accounts yet.',
        noResults: 'No staff match your search.',
      },
      disable: {
        action: 'Deactivate',
        title: 'Deactivate {{name}}?',
        description:
          'The account can no longer sign in, and any session it already has stops working. Its documents and shares stay.',
        confirm: 'Deactivate',
        success: 'Deactivated {{name}}.',
      },
      enable: {
        action: 'Activate',
        title: 'Activate {{name}}?',
        description: 'The account can sign in again.',
        confirm: 'Activate',
        success: 'Activated {{name}}.',
      },
    },
    shares: {
      title: 'Temporary sharing',
      description:
        'Open one document to one person. A share never opens a confidential document.',
      document: 'Document',
      documentPlaceholder: 'Choose a document',
      user: 'Share with',
      userPlaceholder: 'Choose a person',
      share: {
        action: 'Share',
        success: 'Shared the document.',
      },
      revoke: {
        action: 'Revoke',
        success: 'Revoked the share.',
      },
      confidentialHint:
        'This document is confidential, so the share does not grant reading it; the owner keeps access.',
      selectDocument: 'Choose a document to see and manage its shares.',
      empty: 'This document is not shared with anyone.',
      since: 'Shared on {{date}}',
      readOnly: 'You may view these shares but not change them.',
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
