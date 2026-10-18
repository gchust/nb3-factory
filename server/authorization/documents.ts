import { APP_NS } from '@nocobase/i18n';
import {
  defineDatabasePermission,
  recordAccess,
} from '@nocobase/app-plugin-authorization/server';
import {
  defineCompositeResource,
  defineRecordAccess,
} from '@nocobase/authorization/core';
import {
  definePermissionSet,
  type PermissionSet,
} from '@nocobase/authorization/permission-sets';
import { buildFilter } from '@nocobase/repository-input';

export interface DocumentRecord {
  id: string;
  title: string;
  body: string;
  ownerId: string;
  published: boolean;
  confidential: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const title = (key: string): { key: string; ns: string } => ({
  key,
  ns: APP_NS,
});

export const DOCUMENT_ADMIN_PERMISSION_SET = 'documents.admin';
export const DOCUMENT_MAINTAINER_PERMISSION_SET = 'documents.maintainer';
export const DOCUMENT_READER_PERMISSION_SET = 'documents.reader';
export const DOCUMENT_READER_RESTRICTION_PREFIX =
  'documents.reader-non-confidential:';

const documentFields = [
  'id',
  'title',
  'body',
  'ownerId',
  'published',
  'confidential',
  'createdAt',
  'updatedAt',
] as const;

export const ownOrPublishedAccess = defineRecordAccess(
  'documents.ownOrPublished',
  (access) =>
    access
      .title(title('documents.recordAccess.ownOrPublished'))
      .description(title('documents.recordAccess.ownOrPublishedDescription'))
      .collections('documents')
      .resolver(({ principal }) =>
        buildFilter((filter) =>
          filter.or([
            filter.string('ownerId').eq(String(principal.id)),
            filter.and([
              filter.boolean('published').isTrue(),
              filter.boolean('confidential').isFalse(),
            ]),
          ]),
        ),
      ),
);

export const publishedPublicAccess = defineRecordAccess(
  'documents.publishedPublic',
  (access) =>
    access
      .title(title('documents.recordAccess.publishedPublic'))
      .description(title('documents.recordAccess.publishedPublicDescription'))
      .collections('documents')
      .resolver(() =>
        buildFilter((filter) =>
          filter.and([
            filter.boolean('published').isTrue(),
            filter.boolean('confidential').isFalse(),
          ]),
        ),
      ),
);

export const nonConfidentialAccess = defineRecordAccess(
  'documents.nonConfidential',
  (access) =>
    access
      .title(title('documents.recordAccess.nonConfidential'))
      .description(title('documents.recordAccess.nonConfidentialDescription'))
      .collections('documents')
      .resolver(() =>
        buildFilter((filter) => filter.boolean('confidential').isFalse()),
      ),
);

const documentView = defineDatabasePermission((permission) =>
  permission
    .collection<DocumentRecord>('documents')
    .title(title('documents.permissions.view'))
    .read(documentFields)
    .options(
      recordAccess.allRecords,
      ownOrPublishedAccess.reference(),
      publishedPublicAccess.reference(),
      nonConfidentialAccess.reference(),
    ),
);

const documentCreate = defineDatabasePermission((permission) =>
  permission
    .collection<DocumentRecord>('documents')
    .title(title('documents.permissions.create'))
    .create([
      'id',
      'title',
      'body',
      'ownerId',
      'published',
      'confidential',
      'createdAt',
      'updatedAt',
    ]),
);

const documentUpdate = defineDatabasePermission((permission) =>
  permission
    .collection<DocumentRecord>('documents')
    .title(title('documents.permissions.update'))
    .read(documentFields)
    .update(['title', 'body', 'published', 'confidential', 'updatedAt'])
    .options(recordAccess.allRecords, recordAccess.recordsIOwn),
);

const documentDelete = defineDatabasePermission((permission) =>
  permission
    .collection<DocumentRecord>('documents')
    .title(title('documents.permissions.delete'))
    .read(['id'])
    .delete()
    .options(recordAccess.allRecords, recordAccess.recordsIOwn),
);

export const documentResource = defineCompositeResource(
  'documents',
  (resource) =>
    resource
      .title(title('documents.title'))
      .action('view', (action) =>
        action
          .title(title('documents.actions.view'))
          .grant('documents', documentView),
      )
      .action('create', (action) =>
        action
          .title(title('documents.actions.create'))
          .grant('documents', documentCreate),
      )
      .action('edit', (action) =>
        action
          .title(title('documents.actions.edit'))
          .grant('documents', documentUpdate),
      )
      .action('delete', (action) =>
        action
          .title(title('documents.actions.delete'))
          .grant('documents', documentDelete),
      ),
);

const roleSet = (
  key: string,
  titleKey: string,
  grants: PermissionSet['grants'],
): PermissionSet =>
  definePermissionSet(key)
    .title(title(titleKey))
    .grant(...grants)
    .build();

const pageDocuments = {
  resource: { type: 'page', id: 'documents' },
  actions: [{ action: 'access' }],
};

const documentAdministration = {
  resource: { type: 'settings', id: 'documents.administration' },
  actions: [{ action: 'read' }, { action: 'manage' }],
};

// Account state belongs to the Users plugin. The document administrator may
// disable or enable accounts from People and roles, but never read or rewrite
// the plugin's records directly.
const userAccountStatus = {
  resource: { type: 'user', id: '*' },
  actions: [{ action: 'disable' }, { action: 'enable' }],
};

const sharingRulesSettings = {
  resource: { type: 'settings', id: 'authorization.sharing-rules' },
  actions: [
    { action: 'read' },
    { action: 'create' },
    { action: 'update' },
    { action: 'delete' },
  ],
};

const documentGrant = documentResource.reference();

export const documentPermissionSetDefinitions: readonly PermissionSet[] = [
  roleSet(DOCUMENT_ADMIN_PERMISSION_SET, 'documents.roles.admin', [
    pageDocuments,
    documentAdministration,
    sharingRulesSettings,
    userAccountStatus,
    documentGrant.grant({
      view: { documents: 'allRecords' },
      create: { documents: 'allRecords' },
      edit: { documents: 'allRecords' },
      delete: { documents: 'allRecords' },
    }),
  ]),
  roleSet(DOCUMENT_MAINTAINER_PERMISSION_SET, 'documents.roles.maintainer', [
    pageDocuments,
    documentGrant.grant({
      view: { documents: 'documents.ownOrPublished' },
      create: { documents: 'allRecords' },
      edit: { documents: 'recordsIOwn' },
      delete: { documents: 'recordsIOwn' },
    }),
  ]),
  roleSet(DOCUMENT_READER_PERMISSION_SET, 'documents.roles.reader', [
    pageDocuments,
    documentGrant.grant({
      view: { documents: 'documents.publishedPublic' },
    }),
  ]),
];
