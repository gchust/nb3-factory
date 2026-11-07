import type { LocaleResource } from '@nocobase/i18n';

// The application's own server-side wording: permission titles, record-access descriptions and the text its document
// API returns. Use `overrides` to reword a plugin's namespaced strings instead of copying them here.
const enUS = {
  documents: {
    title: 'Documents',
    section: 'Documents',
    administration: {
      title: 'Document administration',
      section: 'Document administration',
    },
    actions: {
      view: 'View documents',
      create: 'Create documents',
      edit: 'Edit documents',
      delete: 'Delete documents',
    },
    permissions: {
      view: 'View documents',
      create: 'Create documents',
      update: 'Update documents',
      delete: 'Delete documents',
    },
    roles: {
      admin: 'Document administrator',
      maintainer: 'Document maintainer',
      reader: 'Document reader',
    },
    restriction: {
      nonConfidential: 'Non-confidential documents only',
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
  },
};

export type AppServerResource = LocaleResource<typeof enUS>;

export default enUS;
