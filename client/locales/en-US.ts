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
    documents: 'Library',
    users: 'Users & permissions',
  },
  documents: {
    title: 'Document library',
    description:
      'Internal documents live here. A draft is visible to its owner alone, a published document to every colleague, and a confidential document to its owner however it is shared.',
    demoHint:
      'Demo accounts: 资料员甲 (editor) and 阅读者乙 (reader), both with the password admin123.',
    create: 'New document',
    createTitle: 'New document',
    createDescription: 'The new document belongs to you.',
    editTitle: 'Edit document',
    edit: 'Edit document',
    delete: 'Delete',
    deleting: 'Deleting…',
    deleteTitle: 'Delete this document?',
    deleteDescription:
      'It and its shares are deleted permanently; a colleague it was shared with loses access at once. This cannot be undone.',
    save: 'Save',
    saving: 'Saving…',
    cancel: 'Cancel',
    saved: 'Saved',
    back: 'Back to the library',
    loading: 'Loading…',
    owner: 'Owner',
    updatedAt: 'Updated',
    published: 'Published',
    draft: 'Draft',
    confidential: 'Confidential',
    yes: 'Yes',
    no: 'No',
    field: {
      title: 'Title',
      body: 'Body',
      published: 'Publish',
      confidential: 'Confidential',
    },
    visibility: {
      published: 'Published — every colleague may read it.',
      draft: 'Draft — only you may read it.',
      confidential: 'Confidential — only you may read it, even when shared.',
    },
    empty: {
      title: 'No documents yet',
      description:
        'Documents you create, or that colleagues publish, appear here.',
    },
    notFound: {
      title: 'Document not found',
      description:
        'It may have been deleted, or you may not have access to it.',
    },
    error: {
      load: 'The document could not be loaded.',
      save: 'The document could not be saved.',
      request: 'Something went wrong. Try again.',
      forbidden: 'You do not have permission to do that.',
      titleRequired: 'Enter a title.',
    },
    readOnly: 'You can read this document but not change it.',
    shares: {
      title: 'Temporary sharing',
      description:
        'Share a draft with one colleague. Revoking it removes their access at once. A confidential document stays hidden however it is shared.',
      select: 'Colleague',
      placeholder: 'Choose a colleague',
      add: 'Share',
      sharing: 'Sharing…',
      revoke: 'Revoke',
      empty: 'Not shared with anyone.',
      sharedWith: 'Shared with {{name}}',
      confidential:
        'This document is confidential, so sharing it shows nothing.',
      addFailed: 'The document could not be shared.',
      revokeFailed: 'The share could not be revoked.',
    },
  },
  users: {
    title: 'Users & permissions',
    description:
      'Create accounts, adjust who may maintain documents, and disable an account whose access must stop at once.',
    permission: 'Library permission',
    permissionNone: 'None',
    permissionEditor: 'Document editor',
    permissionReader: 'Document reader',
    permissionHint:
      '“Document editor” may create and maintain their own documents. “Document reader” may read but not change them.',
    demoHint:
      'The demo accounts 资料员甲 (editor) and 阅读者乙 (reader) both use the password admin123.',
    search: 'Search name, username or email',
    statusEnabled: 'Enabled',
    statusDisabled: 'Disabled',
    disable: 'Disable',
    enable: 'Enable',
    disableHint: 'Disabling ends the account’s existing sessions at once.',
    emptyTitle: 'No users matched',
    emptyDescription: 'Try a different search term.',
    error: {
      load: 'Users could not be loaded.',
      save: 'The permission could not be saved.',
      disable: 'The account could not be disabled.',
      enable: 'The account could not be enabled.',
    },
    saved: 'Permission saved',
    disabled: 'Account disabled',
    enabled: 'Account enabled',
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
