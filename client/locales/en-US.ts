import type { LocaleResource } from '@nocobase/i18n';

import systemEnUS from './system/en-US.js';

const enUS = {
  // The template's own copy: the shell, the sign-in pages, shared components and the homepage. Keep it in
  // `./system/` so a template upgrade can replace it without touching the application's copy below.
  ...systemEnUS,
  // The application's copy goes here, one group per feature. A shared group such as `navigation` is extended by
  // spreading the system one first, `navigation: { ...systemEnUS.navigation, orders: 'Orders' }`, since a group
  // written here replaces the system group of the same name rather than merging with it.
  'auth.realtimeUnavailable': 'Realtime updates are unavailable',
  'auth.realtimeUnavailableDescription':
    'The application is still usable, but pages may not reflect changes until the connection returns.',
  navigation: { ...systemEnUS.navigation, library: 'Document library' },
  library: {
    navigation: 'Document library',
    title: 'Document library',
    description:
      'Published documents are open to readers. Maintainers keep their own drafts here, and an administrator can open one draft to one reader for a limited time.',
    count: '{{count}} documents',
    byOwner: 'By {{name}}',
    noBody: 'No content yet.',
    updatedAt: 'Updated {{date}}',
    deleted: 'The document was deleted.',
    documentBreadcrumb: 'Document',
    status: {
      published: 'Published',
      draft: 'Draft',
      confidential: 'Confidential',
    },
    actions: {
      create: 'New document',
      edit: 'Edit',
      delete: 'Delete',
      save: 'Save',
      saving: 'Saving…',
      cancel: 'Cancel',
      back: 'Back to the library',
    },
    empty: {
      title: 'No documents here yet',
      description:
        'A maintainer can create the first document. Readers see published documents here.',
    },
    form: {
      createTitle: 'New document',
      createDescription:
        'Write the document. A draft stays private until it is published or shared.',
      editTitle: 'Edit document',
      editDescription:
        'Only the person who created this document can change it.',
      title: 'Title',
      titlePlaceholder: 'A clear title for the document',
      body: 'Content',
      bodyPlaceholder: 'Write the document…',
      published: 'Published',
      publishedHint: 'Readers can see a published, non-confidential document.',
      confidential: 'Confidential',
      confidentialHint:
        'Readers can never see a confidential document, even when it is shared.',
    },
    errors: {
      loadFailed: 'The document library could not be loaded.',
      saveFailed: 'The document could not be saved.',
      deleteFailed: 'The document could not be deleted.',
      denied: 'You do not have permission to change this document.',
    },
    missing: {
      title: 'Document not available',
      description:
        'It may have been deleted, or you may not have permission to read it.',
    },
    delete: {
      title: 'Delete this document?',
      description:
        '“{{title}}” and every temporary share of it will be removed. This cannot be undone.',
    },
    admin: {
      navigation: 'Document sharing',
      title: 'Document sharing',
      description:
        'Give one person temporary access to one draft, and revoke it immediately when it is no longer needed. Published and confidential documents are controlled by their own visibility.',
      grantTitle: 'Share a draft',
      grantHint:
        'The reader keeps access until the share is revoked. Confidential documents cannot be shared.',
      document: 'Document',
      chooseDocument: 'Choose a document',
      person: 'Reader',
      choosePerson: 'Choose an enabled person',
      confidentialWarning:
        'This document is confidential and cannot be shared with a reader.',
      share: 'Share',
      saving: 'Sharing…',
      shared: 'The draft is now shared.',
      shareFailed: 'The draft could not be shared.',
      noShares: 'No one has temporary access to this document.',
      revoke: 'Revoke',
      revoked: 'Access was revoked.',
      revokeFailed: 'Access could not be revoked.',
      read: 'Read document shares',
      update: 'Change document shares',
    },
    roles: {
      maintainer: 'Library maintainer',
      reader: 'Library reader',
    },
    permissions: {
      resource: 'Document library',
      documents: 'Documents',
      view: 'View documents',
      create: 'Create documents',
      edit: 'Edit own documents',
      delete: 'Delete own documents',
      readable: 'Readable documents',
      readableDescription:
        'Published non-confidential documents, plus drafts shared with me.',
      visible: 'Visible documents',
      visibleDescription:
        'My own documents and published, non-confidential documents.',
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
