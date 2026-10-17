import type { LocaleResource } from '@nocobase/i18n';

// The application's own server-side wording. Authorization titles are descriptors that the authorization service may
// resolve on the server, so they live here as well as in the client locale.
const enUS = {
  library: {
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
    actions: {
      view: 'View',
      create: 'Create',
      edit: 'Edit',
      delete: 'Delete',
    },
  },
};

export type AppServerResource = LocaleResource<typeof enUS>;

export default enUS;
