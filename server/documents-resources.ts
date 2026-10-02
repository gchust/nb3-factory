import { defineCompositeResource } from '@nocobase/authorization/core';
import { defineDatabasePermission } from '@nocobase/app-plugin-authorization/server';

/**
 * A knowledge document. Only a title and a body are maintained; the id is a
 * stable key that seeds, record selections and citations can name.
 */
export interface DocumentRecord {
  id: string;
  title: string;
  content: string;
}

/**
 * Which fields one document action may read or write. The record range is not
 * declared here: each permission grant chooses it with a record selection, so
 * the same model serves a reader limited to two documents and a maintainer who
 * manages all of them.
 */
const documentData = defineDatabasePermission<DocumentRecord, string>(
  (permission) =>
    permission
      .collection<DocumentRecord>('documents')
      .title('Documents')
      .read(['id', 'title', 'content']),
);

const documentWriteData = documentData
  .create(['id', 'title', 'content'])
  .update(['title', 'content'])
  .delete();

/**
 * The business operations over documents:
 * - `view`   reads documents inside the collection scope the caller's grant names.
 * - `manage` reads, creates, edits and deletes documents.
 *
 * Each action binds exactly one data scope on one collection, which is what the
 * generated Repository routes require.
 */
export const materialsResource = defineCompositeResource(
  'documents.materials',
  (resource) =>
    resource
      .title('Documents')
      .action('view', (action) =>
        action.title('View documents').grant('materials', documentData),
      )
      .action('manage', (action) =>
        action.title('Manage documents').grant('materials', documentWriteData),
      ),
);

/** Stable ids the seed and the initial record selections name. */
export const documentIds = {
  repairPhone: 'doc-a',
  inspectionInterval: 'doc-b',
  confidentialProject: 'doc-c',
} as const;
