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
    documents: 'Documents',
    users: 'Users',
  },
  library: {
    title: 'Document library',
    description:
      'Published documents are open to every reader; a draft stays with its owner until an administrator shares one, and a confidential document is never shared.',
    create: 'New document',
    deleting: 'Deleting…',
    loadFailed: 'The documents could not be loaded.',
    retry: 'Try again',
    actionsFor: 'Actions for {{title}}',
    actions: {
      view: 'View',
      edit: 'Edit',
      share: 'Share',
      delete: 'Delete',
    },
    empty: {
      title: 'No documents yet',
      description: 'The documents you may read appear here.',
    },
    columns: {
      title: 'Title',
      owner: 'Owner',
      status: 'Status',
      actions: 'Actions',
    },
    status: {
      published: 'Published',
      draft: 'Draft',
      confidential: 'Confidential',
      shared: 'Shared with you',
    },
    detail: {
      title: 'Document',
      notFound: 'This document does not exist, or it is not available to you.',
      sharedTitle: 'Shared with you',
      sharedDescription:
        'An administrator opened this draft to you temporarily; it can be revoked at any time.',
      emptyBody: 'This document has no content yet.',
      owner: 'Owner',
      updatedAt: 'Last updated',
    },
    form: {
      createTitle: 'New document',
      createDescription: 'The document belongs to you; only you may change it.',
      editTitle: 'Edit document',
      title: 'Title',
      titleRequired: 'Enter a title.',
      titleTooLong: 'Use at most {{max}} characters.',
      body: 'Body',
      published: 'Published',
      publishedHint: 'A published document is open to every qualified reader.',
      confidential: 'Confidential',
      confidentialHint:
        'A confidential document is visible only to you and can never be shared.',
      yes: 'Yes',
      no: 'No',
      create: 'Create',
      save: 'Save',
      saving: 'Saving…',
      created: 'Created “{{title}}”.',
      updated: 'Saved “{{title}}”.',
      saveFailed: 'The document could not be saved.',
      forbidden: 'You may not change this document.',
      missing: 'This document no longer exists; it may have been deleted.',
    },
    discard: {
      title: 'Discard changes?',
      description: 'Your unsaved input will be lost.',
      keep: 'Keep editing',
      confirm: 'Discard',
    },
    delete: {
      title: 'Delete document',
      description:
        '“{{title}}” and its shares will be removed. This cannot be undone.',
      confirm: 'Delete',
      failed: 'The document could not be deleted.',
    },
    share: {
      title: 'Share document',
      description: 'Open a draft to one person temporarily.',
      person: 'Person',
      personPlaceholder: 'Choose a person',
      noCandidates:
        'Every enabled person already has access, or none is available.',
      current: 'Shared with',
      none: 'Not shared with anyone.',
      revoke: 'Revoke',
      share: 'Share',
      sharing: 'Sharing…',
      added: 'The document was shared.',
      revoked: 'The share was revoked.',
      confidential: 'A confidential document cannot be shared.',
      forbidden: 'You may not share this document.',
      failed: 'The share could not be changed.',
    },
    permissionSets: {
      manager: 'Document manager',
      reader: 'Reader',
    },
  },
  users: {
    title: 'People',
    description:
      'Assign each person a job and close an account when it is no longer needed. Closing an account revokes its sessions immediately.',
    loadFailed: 'The people could not be loaded.',
    retry: 'Try again',
    columns: {
      person: 'Person',
      status: 'Status',
      roles: 'Permission sets',
      actions: 'Actions',
    },
    status: {
      enabled: 'Enabled',
      disabled: 'Disabled',
    },
    roles: {
      save: 'Save',
      saved: 'The permission sets were saved.',
      saveFailed: 'The permission sets could not be saved.',
    },
    actionsFor: 'Actions for {{name}}',
    enable: {
      action: 'Enable',
      success: 'The account was enabled.',
      failed: 'The account could not be enabled.',
    },
    disable: {
      action: 'Disable',
      title: 'Disable account',
      description:
        '“{{name}}” will be signed out immediately and can no longer sign in.',
      confirm: 'Disable',
      success: 'The account was disabled.',
      failed: 'The account could not be disabled.',
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
