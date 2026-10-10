import {
  condition,
  defineDatabasePermission,
  recordAccess,
} from '@nocobase/app-plugin-authorization/server';
import {
  defineCompositeResource,
  defineRecordAccess,
} from '@nocobase/authorization/core';

/** The Collection that stores the readable documents. */
export const KNOWLEDGE_DOCUMENTS_COLLECTION = 'knowledgeDocuments';

/** The composite resource the document endpoints and the assistant tool both check. */
export const KNOWLEDGE_DOCUMENTS_RESOURCE = 'knowledge.documents';

/** The record access that selects documents any reader may see. */
export const PUBLIC_DOCUMENTS_ACCESS = 'knowledge.publicDocuments';

/** Visibility values stored on a document. */
export const DOCUMENT_VISIBILITY = {
  public: 'public',
  restricted: 'restricted',
} as const;

export type DocumentVisibility =
  (typeof DOCUMENT_VISIBILITY)[keyof typeof DOCUMENT_VISIBILITY];

/** Page ids, which are also the permission identifiers of the two App pages. */
export const KNOWLEDGE_PAGES = {
  assistant: 'knowledgeAssistant',
  documents: 'knowledgeDocuments',
} as const;

/** The row shape the permission builders and the service are typed against. */
export interface KnowledgeDocument {
  id: number;
  title: string;
  body: string;
  visibility: DocumentVisibility;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/**
 * Documents a reader may see: everything marked `public`. A restricted document
 * is invisible to any policy built on this access, which is also what keeps it
 * out of the assistant's retrieval — the filter is applied before scoring.
 */
export const publicDocuments = defineRecordAccess(
  PUBLIC_DOCUMENTS_ACCESS,
  (access) =>
    access
      .title({
        key: 'knowledge.recordAccess.publicDocuments',
        ns: 'nb3-factory',
      })
      .collections(KNOWLEDGE_DOCUMENTS_COLLECTION)
      .resolver(() =>
        condition('visibility', '$eq', DOCUMENT_VISIBILITY.public),
      ),
);

/**
 * Read access to a document. `allRecords` and the public-only access are both
 * offered, so the colleague set can bind the public one while the supervisor
 * set binds `allRecords`.
 */
export const documentReadData = defineDatabasePermission<
  KnowledgeDocument,
  'allRecords' | typeof PUBLIC_DOCUMENTS_ACCESS
>((permission) =>
  permission
    .collection<KnowledgeDocument>(KNOWLEDGE_DOCUMENTS_COLLECTION)
    .title({ key: 'knowledge.data.documents.read', ns: 'nb3-factory' })
    .read(['id', 'title', 'body', 'visibility', 'createdAt', 'updatedAt'])
    .options(recordAccess.allRecords, publicDocuments.reference())
    .default(recordAccess.allRecords),
);

/**
 * Manage access to a document. A supervisor may update the two user-authored
 * fields; `visibility` and the timestamps stay under the server's control, and
 * no action can create or delete a document through the API.
 */
export const documentManageData = defineDatabasePermission<
  KnowledgeDocument,
  'allRecords'
>((permission) =>
  permission
    .collection<KnowledgeDocument>(KNOWLEDGE_DOCUMENTS_COLLECTION)
    .title({ key: 'knowledge.data.documents.manage', ns: 'nb3-factory' })
    .read(['id', 'title', 'body', 'visibility', 'createdAt', 'updatedAt'])
    .update(['title', 'body', 'updatedAt'])
    .options(recordAccess.allRecords)
    .default(recordAccess.allRecords),
);

/**
 * The composite the document endpoints authorize against, and the assistant
 * tool reuses the same grant through its own authorization context. Declared
 * after the record access it references, so registration validates cleanly.
 */
export const knowledgeDocuments = defineCompositeResource(
  KNOWLEDGE_DOCUMENTS_RESOURCE,
  (resource) =>
    resource
      .title({ key: 'knowledge.resource.documents', ns: 'nb3-factory' })
      .action('read', (action) =>
        action
          .title({ key: 'knowledge.action.documents.read', ns: 'nb3-factory' })
          .grant('documents', documentReadData, {
            title: { key: 'knowledge.data.documents.read', ns: 'nb3-factory' },
          }),
      )
      .action('manage', (action) =>
        action
          .title({
            key: 'knowledge.action.documents.manage',
            ns: 'nb3-factory',
          })
          .grant('documents', documentManageData, {
            title: {
              key: 'knowledge.data.documents.manage',
              ns: 'nb3-factory',
            },
          }),
      ),
);
