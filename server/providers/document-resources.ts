import { defineCompositeResource } from '@nocobase/authorization/core';
import {
  defineDatabasePermission,
  recordAccess,
} from '@nocobase/app-plugin-authorization/server';

import { documentsReadable } from './document-access.js';
import type { DocumentRecord, DocumentShareRecord } from './document-types.js';

const NAMESPACE = 'nb3-factory';

const documentFields = [
  'id',
  'title',
  'body',
  'ownerId',
  'ownerName',
  'published',
  'confidential',
  'createdAt',
  'updatedAt',
] as const;

const shareFields = [
  'id',
  'documentId',
  'userId',
  'userName',
  'sharedById',
  'sharedByName',
  'expiresAt',
  'revokedAt',
  'createdAt',
  'updatedAt',
] as const;

const documentView = defineDatabasePermission((permission) =>
  permission
    .collection<DocumentRecord>('documents')
    .title({ key: 'documents.permissions.documents', ns: NAMESPACE })
    .read((read) => read.fields(...documentFields))
    .options(recordAccess.allRecords, documentsReadable)
    .default(documentsReadable),
);

const documentCreate = defineDatabasePermission((permission) =>
  permission
    .collection<DocumentRecord>('documents')
    .title({ key: 'documents.permissions.documents', ns: NAMESPACE })
    .create((create) => create.fields(...documentFields)),
);

const documentEdit = defineDatabasePermission((permission) =>
  permission
    .collection<DocumentRecord>('documents')
    .title({ key: 'documents.permissions.documents', ns: NAMESPACE })
    .read((read) => read.fields(...documentFields))
    .update((update) =>
      update.fields('title', 'body', 'published', 'confidential', 'updatedAt'),
    )
    .options(recordAccess.recordsIOwn)
    .default(recordAccess.recordsIOwn),
);

const documentShareRead = defineDatabasePermission((permission) =>
  permission
    .collection<DocumentRecord>('documents')
    .title({ key: 'documents.permissions.documents', ns: NAMESPACE })
    .read((read) => read.fields(...documentFields))
    .options(recordAccess.recordsIOwn)
    .default(recordAccess.recordsIOwn),
);

const shareManage = defineDatabasePermission((permission) =>
  permission
    .collection<DocumentShareRecord>('documentShares')
    .title({ key: 'documents.permissions.shares', ns: NAMESPACE })
    .read((read) => read.fields(...shareFields))
    .create((create) => create.fields(...shareFields))
    .update((update) => update.fields('expiresAt', 'revokedAt', 'updatedAt')),
);

/**
 * The library's business operations. A reader holds only `view`; a maintainer
 * can add and edit their own material and open one of their documents, while
 * the share action's second grant gives no access to the document body beyond
 * the first. Confidentiality is enforced inside the `documents.readable`
 * selection, not by hiding a button.
 */
export const documents = defineCompositeResource(
  'documents.library',
  (resource) =>
    resource
      .title({ key: 'documents.permissions.resource', ns: NAMESPACE })
      .action('view', (action) =>
        action
          .title({ key: 'documents.permissions.view', ns: NAMESPACE })
          .grant('documents', documentView),
      )
      .action('create', (action) =>
        action
          .title({ key: 'documents.permissions.create', ns: NAMESPACE })
          .grant('documents', documentCreate),
      )
      .action('edit', (action) =>
        action
          .title({ key: 'documents.permissions.edit', ns: NAMESPACE })
          .grant('documents', documentEdit),
      )
      .action('share', (action) =>
        action
          .title({ key: 'documents.permissions.share', ns: NAMESPACE })
          .grant('documents', documentShareRead)
          .grant('shares', shareManage),
      ),
);
