import type { LocaleResource } from '@nocobase/i18n';

/**
 * The application's own server-side wording: the titles the authorization
 * workspace shows for the document resources, data scopes and permission sets
 * the migrations and seeds register.
 */
const enUS = {
  knowledge: {
    section: 'Internal knowledge',
    collection: { documents: 'Documents' },
    resource: { documents: 'Documents' },
    action: {
      documents: { read: 'Read', manage: 'Edit' },
    },
    data: {
      documents: { read: 'Read documents', manage: 'Edit documents' },
    },
    recordAccess: { publicDocuments: 'Documents anyone may read' },
    permissionSet: {
      supervisor: 'Document supervisor',
      colleague: 'Document reader',
    },
  },
};

export type AppServerResource = LocaleResource<typeof enUS>;

export default enUS;
