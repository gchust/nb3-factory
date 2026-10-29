import {
  defineDatabasePermission,
  recordAccess,
} from '@nocobase/app-plugin-authorization/server';
import {
  defineCompositeResource,
  defineRecordAccess,
  selection,
  type AuthorizationTitle,
} from '@nocobase/authorization/core';
import { defineDefaultAccessRule } from '@nocobase/authorization/default-access';
import { definePermissionSet } from '@nocobase/authorization/permission-sets';
import { buildFilter, type FilterAst } from '@nocobase/repository-input';

import {
  APP_NAMESPACE,
  DOCUMENTS_COLLECTION,
  DOCUMENTS_PAGE,
  DOCUMENTS_RESOURCE,
  DOCUMENTS_SCOPE,
} from './constants.ts';

export interface DocumentRow {
  readonly id: string;
  title: string;
  content: string;
  ownerId: string;
  published: boolean;
  confidential: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** A stable, localized title stored in authorization configuration. */
export function label(key: string): AuthorizationTitle {
  return { key, ns: APP_NAMESPACE };
}

function publicDocumentsFilter(): FilterAst {
  return buildFilter((filter) =>
    filter.and([
      filter.boolean('published').isTrue(),
      filter.boolean('confidential').isFalse(),
    ]),
  );
}

/** Published, non-confidential documents every holder of the reading action may see. */
export const publicDocuments = defineRecordAccess(
  'documents.public',
  (access) =>
    access
      .title(label('authorization.records.public'))
      .collections(DOCUMENTS_COLLECTION)
      .resolver(() => publicDocumentsFilter()),
);

/** The confidentiality boundary: confidential documents are never inside this selection. */
export const nonConfidentialDocuments = defineRecordAccess(
  'documents.nonConfidential',
  (access) =>
    access
      .title(label('authorization.records.nonConfidential'))
      .collections(DOCUMENTS_COLLECTION)
      .resolver(() =>
        buildFilter((filter) => filter.boolean('confidential').isFalse()),
      ),
);

const documentRead = defineDatabasePermission((permission) =>
  permission
    .collection<DocumentRow>(DOCUMENTS_COLLECTION)
    .title(label('authorization.permissions.documentRead'))
    .options(recordAccess.recordsIOwn, publicDocuments.reference())
    .read('*'),
);

const documentCreate = defineDatabasePermission((permission) =>
  permission
    .collection<DocumentRow>(DOCUMENTS_COLLECTION)
    .title(label('authorization.permissions.documentCreate'))
    .options(recordAccess.recordsIOwn)
    .read('*')
    .create('*'),
);

const documentEdit = defineDatabasePermission((permission) =>
  permission
    .collection<DocumentRow>(DOCUMENTS_COLLECTION)
    .title(label('authorization.permissions.documentEdit'))
    .options(recordAccess.recordsIOwn)
    .read('*')
    .update(['title', 'content', 'published', 'confidential', 'updatedAt']),
);

/** The business operation: reading, creating and editing library documents. */
export const documents = defineCompositeResource(
  DOCUMENTS_RESOURCE,
  (resource) =>
    resource
      .title(label('authorization.resources.documents'))
      .action('view', (action) =>
        action
          .title(label('authorization.actions.view'))
          .grant(DOCUMENTS_SCOPE, documentRead),
      )
      .action('create', (action) =>
        action
          .title(label('authorization.actions.create'))
          .grant(DOCUMENTS_SCOPE, documentCreate),
      )
      .action('edit', (action) =>
        action
          .title(label('authorization.actions.edit'))
          .grant(DOCUMENTS_SCOPE, documentEdit),
      ),
);

/** 资料员甲: maintains only the documents they own. */
export const documentsEditor = definePermissionSet('documents-editor')
  .title(label('authorization.permissionSets.editor'))
  .grant({
    resource: { type: 'page', id: DOCUMENTS_PAGE },
    actions: [{ action: 'access' }],
  })
  .grant(
    documents.reference().grant({
      view: { [DOCUMENTS_SCOPE]: recordAccess.recordsIOwn.key },
      create: { [DOCUMENTS_SCOPE]: recordAccess.recordsIOwn.key },
      edit: { [DOCUMENTS_SCOPE]: recordAccess.recordsIOwn.key },
    }),
  )
  .build();

/** 阅读者乙: reads, never edits. Public documents arrive through the default access rule. */
export const documentsReader = definePermissionSet('documents-reader')
  .title(label('authorization.permissionSets.reader'))
  .grant({
    resource: { type: 'page', id: DOCUMENTS_PAGE },
    actions: [{ action: 'access' }],
  })
  .grant(
    documents.reference().grant({
      view: { [DOCUMENTS_SCOPE]: recordAccess.recordsIOwn.key },
    }),
  )
  .build();

/** Adds published, non-confidential documents for everyone who holds the view action. */
export const publicDocumentsAccessRule = defineDefaultAccessRule(
  'documents-public-baseline',
  documents.reference(),
)
  .scope(
    'view',
    DOCUMENTS_SCOPE,
    selection.recordAccess(publicDocuments.reference().key),
  )
  .build();
