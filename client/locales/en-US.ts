import type { LocaleResource } from '@nocobase/i18n';

import systemEnUS from './system/en-US.js';

const enUS = {
  // The template's own copy: the shell, the sign-in pages, shared components and the homepage. Keep it in
  // `./system/` so a template upgrade can replace it without touching the application's copy below.
  ...systemEnUS,
  navigation: {
    ...systemEnUS.navigation,
    documents: 'Documents',
    documentAdministration: 'Document administration',
  },
  documents: {
    title: 'Documents',
    description:
      'Write, publish and share documents with the people who need them.',
    new: 'New document',
    search: 'Search documents',
    loading: 'Loading documents…',
    loadFailed: 'Documents could not be loaded',
    retry: 'Try again',
    noResults: 'No documents match your search.',
    columns: {
      title: 'Title',
      visibility: 'Visibility',
      updatedAt: 'Updated',
      actions: 'Actions',
    },
    actions: { view: 'View', edit: 'Edit', delete: 'Delete' },
    visibility: {
      published: 'Published',
      draft: 'Draft',
      confidential: 'Confidential',
    },
    empty: {
      title: 'No documents yet',
      description: 'Create the first document to start writing.',
    },
    form: {
      createTitle: 'New document',
      editTitle: 'Edit document',
      viewTitle: 'Document',
      description:
        'Give the document a title and body, then choose who can see it.',
      viewDescription: 'Read the document and its visibility settings.',
      title: 'Title',
      body: 'Body',
      published: 'Published',
      confidential: 'Confidential',
      owner: 'Owner',
      updatedAt: 'Last updated',
      create: 'Create document',
    },
    delete: {
      title: 'Delete this document?',
      description:
        '“{{title}}” will be permanently deleted. This cannot be undone.',
    },
    toast: {
      created: 'Document created',
      updated: 'Document updated',
      deleted: 'Document deleted',
      saveFailed: 'The document could not be saved',
      deleteFailed: 'The document could not be deleted',
    },
    errors: {
      denied: 'You do not have permission to do that.',
      notFound: 'The document no longer exists.',
      generic: 'Something went wrong. Please try again.',
    },
    permissions: { view: 'View', edit: 'Edit' },
    roles: {
      admin: 'Document administrator',
      maintainer: 'Document maintainer',
      reader: 'Document reader',
    },
    roleDescriptions: {
      admin: 'Manage every document, role assignment and sharing rule.',
      maintainer: 'Create documents and manage the ones they own.',
      reader: 'Read published documents that are not confidential.',
    },
    recordAccess: {
      ownOrPublished: 'Own documents or published public documents',
      ownOrPublishedDescription:
        'Documents the person owns, plus published documents that are not confidential.',
      publishedPublic: 'Published public documents',
      publishedPublicDescription:
        'Documents that are published and not confidential.',
      nonConfidential: 'Non-confidential documents',
      nonConfidentialDescription:
        'Every document that is not marked confidential.',
    },
    administration: {
      title: 'Document administration',
      description:
        'Assign document roles and share individual documents with people.',
      usersTab: 'People and roles',
      sharingTab: 'Sharing rules',
      users: 'People',
      user: 'Person',
      roles: 'Document roles',
      manageRoles: 'Manage roles',
      manageRolesTitle: 'Document roles',
      noRole: 'No document role',
      noUsers: 'No people match this search.',
      searchUsers: 'Search people',
      userCount: '{{total}} people',
      pageOf: 'Page {{page}} of {{total}}',
      previous: 'Previous',
      next: 'Next',
      rolesSaved: 'Document roles updated',
      rolesSaveFailed: 'Document roles could not be updated',
      status: 'Account',
      active: 'Active',
      disabled: 'Disabled',
      disableAccount: 'Disable account',
      enableAccount: 'Enable account',
      disableAccountTitle: 'Disable this account?',
      disableAccountDescription:
        '{{name}} will be signed out on every device and cannot sign in until you enable the account again.',
      accountDisabled: 'Account disabled',
      accountEnabled: 'Account enabled',
      accountDisableFailed: 'The account could not be disabled',
      accountEnableFailed: 'The account could not be enabled',
      statusChangeBlocked:
        'This account cannot be changed. It may be the last administrator or your own account.',
      userNotFound: 'The account no longer exists.',
      sharingDescription:
        'A sharing rule gives one person access to one document without changing their document role. Sharing adds access; it never takes it away.',
      newSharing: 'Share a document',
      newSharingTitle: 'Share a document',
      newSharingDescription:
        'Choose the document, the person and the permission to add.',
      sharingRule: 'Rule',
      sharedWith: 'Shared with',
      document: 'Document',
      permission: 'Permission',
      selectDocument: 'Choose a document',
      selectUser: 'Choose a person',
      sharingLabel: 'Rule name (optional)',
      sharingLabelPlaceholder: 'For example, Handover notes',
      createSharing: 'Create sharing rule',
      sharingCreated: 'Sharing rule created',
      sharingCreateFailed: 'The sharing rule could not be created',
      sharingOptionsFailed: 'Documents and people could not be loaded',
      sharingEmptyTitle: 'No sharing rules yet',
      sharingEmptyDescription:
        'Share a document with someone when a role does not cover it.',
      deleteSharing: 'Delete sharing rule',
      deleteSharingTitle: 'Delete this sharing rule?',
      deleteSharingDescription:
        'The person will immediately lose the access this rule adds.',
      sharingDeleted: 'Sharing rule deleted',
      sharingDeleteFailed: 'The sharing rule could not be deleted',
      sharingActions: { view: 'Can view', edit: 'Can edit' },
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
