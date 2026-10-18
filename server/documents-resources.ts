import {
  defineCompositeResource,
  type RecordAccessReference,
} from '@nocobase/authorization/core';
import {
  defineDatabasePermission,
  recordAccess,
} from '@nocobase/app-plugin-authorization/server';

/**
 * The translation namespace the application's own locales are registered under. It is the package name in
 * `client/runtime.ts`; authorization titles need both `key` and `ns`, so keep the two in step.
 */
export const APP_LOCALE_NAMESPACE = 'nb3-factory';

const title = (key: string) => ({ key, ns: APP_LOCALE_NAMESPACE });

/** One row of the `documents` Collection, as the business layer reads and writes it. */
export interface DocumentRow {
  readonly id: number;
  readonly title: string;
  readonly body: string | null;
  readonly ownerId: string;
  readonly published: boolean;
  readonly confidential: boolean;
  /** Temporal columns read back as wall-clock strings; a write may hand the Repository a `Date`. */
  readonly createdAt: string | Date;
  readonly updatedAt: string | Date;
}

/**
 * A custom Record Access: the records a person may read.
 *
 * Ownership, public visibility and explicit shares are one scope on purpose. Confidential documents drop out of
 * both the public branch and the share branch, so an accidental share of a confidential document still shows
 * nothing, while the owner branch keeps the document visible to its owner. The resolver is registered by
 * `server/providers/documents.ts`, which owns the `documentShares` lookup.
 */
export const documentsReadable: RecordAccessReference<'documents.readable'> = {
  key: 'documents.readable',
  collections: ['documents'],
};

/** Fields a write may name. `ownerId` and the timestamps are set by the service, never by the caller's choice. */
export const DOCUMENT_WRITE_FIELDS = [
  'title',
  'body',
  'published',
  'confidential',
  'updatedAt',
] as const;

/**
 * One builder per action. A builder's `options`/`default` apply to every operation it declares, and `bind` gives
 * them all the same scope key, so sharing one builder would let a read grant also confer write.
 */
export const documentsView = defineDatabasePermission((p) =>
  p
    .collection<DocumentRow>('documents')
    .title(title('documents.permissions.view'))
    .read('*')
    .options(
      recordAccess.allRecords,
      recordAccess.recordsIOwn,
      documentsReadable,
    )
    .default(documentsReadable),
);

export const documentsCreate = defineDatabasePermission((p) =>
  p
    .collection<DocumentRow>('documents')
    .title(title('documents.permissions.create'))
    // `createOne` selects the row it just wrote, so the policy that authorizes a create has to permit reading it back.
    // The scope stays whatever the grant chose; the route re-reads through the caller's own `view` policy anyway.
    .read('*')
    .create([
      'title',
      'body',
      'published',
      'confidential',
      'ownerId',
      'createdAt',
      'updatedAt',
    ])
    .options(recordAccess.allRecords)
    .default(recordAccess.allRecords),
);

export const documentsEdit = defineDatabasePermission((p) =>
  p
    .collection<DocumentRow>('documents')
    .title(title('documents.permissions.edit'))
    .update(DOCUMENT_WRITE_FIELDS)
    .options(recordAccess.recordsIOwn, recordAccess.allRecords)
    .default(recordAccess.recordsIOwn),
);

export const documentsDelete = defineDatabasePermission((p) =>
  p
    .collection<DocumentRow>('documents')
    .title(title('documents.permissions.delete'))
    .delete()
    .options(recordAccess.recordsIOwn, recordAccess.allRecords)
    .default(recordAccess.recordsIOwn),
);

/**
 * The business capability the application exposes: reading, creating, editing and deleting documents. Code defines
 * what each action does; permission sets only choose who gets it and which records it reaches.
 */
export const documents = defineCompositeResource('documents', (resource) =>
  resource
    .title(title('documents.title'))
    .action('view', (action) =>
      action
        .title(title('documents.actions.view'))
        .grant('documents', documentsView),
    )
    .action('create', (action) =>
      action
        .title(title('documents.actions.create'))
        .grant('documents', documentsCreate),
    )
    .action('edit', (action) =>
      action
        .title(title('documents.actions.edit'))
        .grant('documents', documentsEdit),
    )
    .action('delete', (action) =>
      action
        .title(title('documents.actions.delete'))
        .grant('documents', documentsDelete),
    ),
);
