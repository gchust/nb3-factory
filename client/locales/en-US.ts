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
  },
  documents: {
    title: 'Document library',
    description:
      'Read internal documents shared with you. Published, non-confidential documents are open to everyone with reading permission; drafts and confidential documents stay restricted.',
    new: 'New document',
    published: 'Published',
    draft: 'Draft',
    confidential: 'Confidential',
    owner: 'Owner',
    updatedAt: 'Updated',
    readOnlyHint:
      'Reading permission never includes editing. Ask an administrator to change your work permissions.',
    emptyTitle: 'No documents to read',
    emptyDescription:
      'Published internal documents will appear here once they are available.',
    detail: {
      title: 'Document',
      notFoundTitle: 'This document is not available',
      notFoundDescription:
        'It may have moved, or it may no longer be shared with you.',
    },
    edit: 'Edit document',
    editTitle: 'Edit document',
    editDescription:
      'Update “{{title}}”. Only the owner can edit this document.',
    create: {
      title: 'New document',
      description:
        'Write a document you own. Drafts stay private until published; confidential documents stay restricted.',
    },
    form: {
      title: 'Title',
      content: 'Content',
      published: 'Published',
      publishedHint:
        'Published, non-confidential documents can be read by colleagues with document-reading permission.',
      confidential: 'Confidential',
      confidentialHint:
        'Confidential documents are never opened through temporary sharing.',
      cancel: 'Cancel',
      save: 'Save changes',
      create: 'Create document',
      saving: 'Saving…',
    },
    errors: {
      accessDenied: 'You do not have document-reading permission.',
      accessDeniedDescription:
        'Ask an administrator to grant reading access. Reading access never includes editing.',
      notFound: 'This document is not available.',
      recipientNotFound: 'The selected person was not found.',
      recipientDisabled:
        'The selected account is disabled and cannot receive temporary access.',
      confidentialDocument:
        'A confidential document cannot be shared temporarily.',
      invalidInput: 'Check the form and try again.',
      unknown: 'Something went wrong. Try again.',
    },
    sharing: {
      ruleTitle: 'Temporary document share',
    },
    restriction: {
      confidentialTitle: 'Confidential documents stay hidden',
    },
  },
  settings: {
    ...systemEnUS.settings,
    documentsSharing: 'Document sharing',
    documentsSharingDescription:
      'Temporarily open a draft to one person, and revoke access when it is no longer needed.',
    temporarySharing: 'Temporary sharing',
    temporarySharingDescription:
      'Choose one document and one person. Only that person receives reading access, and only for that document.',
    selectDocument: 'Document',
    selectDocumentHint: 'Select a document',
    selectRecipient: 'Person',
    selectRecipientHint: 'Select a person',
    share: 'Grant reading access',
    shareCreated: 'Temporary access granted',
    shareRevoked: 'Temporary access revoked',
    shareRecipientHint:
      'Granting reading access does not grant editing permission.',
    activeShares: 'Current access',
    activeSharesDescription:
      'Review and revoke temporary reading access for each document.',
    noShares: 'No one has temporary access to this document.',
    noDocuments: 'No documents yet',
    noDocumentsDescription:
      'Documents appear here once they have been created.',
    confidentialLocked:
      'Confidential documents cannot be opened through temporary sharing.',
    revokeShare: 'Revoke access',
    revokeShareTitle: 'Revoke temporary access?',
    revokeShareDescription:
      '{{name}} will no longer see “{{title}}”. A refreshed or reopened link will not show the document.',
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
