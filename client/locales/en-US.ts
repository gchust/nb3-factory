import type { LocaleResource } from '@nocobase/i18n';

import systemEnUS from './system/en-US.js';

const enUS = {
  // The template's own copy: the shell, the sign-in pages, shared components and the homepage. Keep it in
  // `./system/` so a template upgrade can replace it without touching the application's copy below.
  ...systemEnUS,
  // The application's copy goes here, one group per feature. A shared group such as `navigation` is extended by
  // spreading the system one first, `navigation: { ...systemEnUS.navigation, orders: 'Orders' }`, since a group
  // written here replaces the system group of the same name rather than merging with it.
  // Kept minimal: only the words this application's own pages add.
  actions: {
    ...systemEnUS.actions,
    create: 'Create',
    retry: 'Retry',
    saving: 'Saving…',
  },
  navigation: {
    ...systemEnUS.navigation,
    library: 'Document library',
    members: 'Staff',
  },
  library: {
    title: 'Document library',
    description:
      'Read what has been published to you, and look after the documents you own.',
    search: {
      label: 'Search documents',
      placeholder: 'Search by title or body',
    },
    filter: {
      visibility: 'Filter by visibility',
      allVisibilities: 'Any visibility',
    },
    visibility: {
      published: 'Published',
      draft: 'Draft',
      confidential: 'Confidential',
    },
    column: {
      title: 'Title',
      owner: 'Owner',
      visibility: 'Visibility',
      updatedAt: 'Updated',
      actions: 'Actions',
    },
    list: {
      count: '{{count}} document(s)',
      empty: 'No documents yet',
      emptyHint:
        'Documents you own, and documents published to you, appear here.',
      emptyFiltered: 'No matching documents',
      emptyFilteredHint:
        'Nothing matches this search and filter. Try a different term.',
    },
    clearFilters: 'Clear filters',
    row: {
      actions: 'Actions for {{title}}',
      view: 'View',
      edit: 'Edit',
    },
    create: {
      action: 'New document',
      title: 'New document',
      description:
        'Write a document. Until you publish it, only you can see it.',
    },
    edit: {
      action: 'Edit',
      title: 'Edit document',
      description: 'Change the wording, or whether readers can see it.',
      forbidden:
        'You can read this document but not change it. Ask the person who owns it, or an administrator.',
    },
    form: {
      title: 'Title',
      body: 'Body',
      published: 'Published',
      publishedHint:
        'Readers may open this document. Leave it off while it is still a draft.',
      confidential: 'Confidential',
      confidentialHint:
        'Confidential documents stay hidden from readers, even when one is shared with them individually.',
      titleRequired: 'Enter a title.',
      titleTooLong: 'A title may be at most {{max}} characters.',
      bodyTooLong: 'The body may be at most {{max}} characters.',
      submitFailed: 'The document could not be saved. Please try again.',
      forbidden: 'You do not have permission to change this document.',
    },
    detail: {
      title: 'Document',
      loading: 'Loading the document',
      notFound:
        'This document is not available. It may have been unpublished, or access to it may have been withdrawn.',
      forbidden: 'You do not have permission to read this document.',
      error: 'The document could not be loaded. Please try again.',
      owner: 'Owner {{name}}',
      updatedAt: 'Updated {{date}}',
      emptyBody: 'This document has no body yet.',
    },
    shares: {
      title: 'Temporary access',
      description:
        'Let a colleague read this document without publishing it. Permission to read is not permission to change it.',
      confidentialNotice:
        'This document is confidential, so a share here opens nothing for a reader.',
      person: 'Colleague to share with',
      pickPerson: 'Choose a colleague',
      add: 'Share',
      revoke: 'Revoke',
      empty: 'Not shared with anyone yet.',
      failed: 'The change could not be saved. Please try again.',
      forbidden: 'You do not have permission to manage temporary access.',
    },
    error: {
      title: 'Could not load the library',
      description:
        'Something went wrong while loading these documents. Please try again.',
      forbidden: 'You do not have permission to read the library.',
    },
  },
  members: {
    title: 'Staff',
    description:
      'Who may sign in, which permission sets each account holds, and whether it is active.',
    search: {
      label: 'Search staff',
      placeholder: 'Search by name or email',
    },
    filter: {
      status: 'Filter by status',
      allStatuses: 'Any status',
    },
    status: {
      enabled: 'Active',
      disabled: 'Deactivated',
    },
    noPermissionSets: 'No permission sets',
    column: {
      name: 'Name',
      email: 'Email',
      permissionSets: 'Permission sets',
      status: 'Status',
      createdAt: 'Added',
      actions: 'Actions',
    },
    row: {
      actions: 'Actions for {{name}}',
      permissionSets: 'Permission sets',
      permissionSetsHint: 'What this account may do.',
      disable: 'Deactivate',
      enable: 'Reactivate',
    },
    list: {
      count: '{{count}} account(s)',
      empty: 'No accounts yet',
      emptyHint: 'Accounts appear here as they are created.',
      emptyFiltered: 'No matching accounts',
    },
    clearFilters: 'Clear filters',
    saved: 'Saved.',
    saveFailed: 'The change could not be saved. Please try again.',
    error: {
      title: 'Could not load staff',
      description:
        'Something went wrong while loading the staff list. Please try again.',
      forbidden: 'Only the root administrator may manage staff.',
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
