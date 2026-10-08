import {
  defineCompositeResource,
  defineRecordAccess,
  type AuthorizationTitle,
} from '@nocobase/authorization/core';
import {
  defineDatabasePermission,
  recordAccess,
} from '@nocobase/app-plugin-authorization/server';
import { buildFilter } from '@nocobase/repository-input';

/**
 * Portable declarations for the internal document library.
 *
 * This module is imported both by the owning service provider, which registers
 * the declarations at boot, and by the installation seeds, which persist the
 * initial jobs. It therefore stays free of runtime wiring: nothing here queries
 * or registers with a running application.
 */

/** The physical Collection the library stores documents in. */
export const DOCUMENTS_COLLECTION = 'documents';

/** The composite resource an administrator grants: one business operation. */
export const DOCUMENTS_RESOURCE = 'library.documents';

/** The page id the client route in `client/routes.ts` declares. */
export const DOCUMENTS_PAGE = 'library.documents';

/** The single data scope key every document action is configured through. */
export const DOCUMENTS_SCOPE = 'documents';

/**
 * Record access keys used by grants and rules. Stored values, so they are
 * spelled once here and referenced everywhere else.
 */
export const DOCUMENT_SCOPES = {
  /** The signed-in user's own documents. */
  own: 'recordsIOwn',
  /** Published and not confidential: what an ordinary reader sees. */
  published: 'library.published',
  /** Not confidential, whatever its published state. */
  nonConfidential: 'library.nonConfidential',
  /** Owned by the reader, or not confidential. The confidentiality invariant. */
  readable: 'library.readable',
} as const;

/** The client i18n namespace this application translates its own text under. */
const NAMESPACE = 'nb3-factory';

/** A user-visible title resolved from this application's locale files. */
function text(key: string): AuthorizationTitle {
  return { key, ns: NAMESPACE };
}

/**
 * The row shape the library reads and writes. `id` is a string primary key,
 * matching the identifiers the authorization layer carries (record selections
 * and shares address records by string id); `ownerId` holds a user id and is
 * what ownership resolves against.
 */
export interface Document {
  id: string;
  code: string;
  title: string;
  body: string | null;
  ownerId: string;
  published: boolean;
  confidential: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Columns a read returns. */
const READ_FIELDS = [
  'id',
  'code',
  'title',
  'body',
  'ownerId',
  'published',
  'confidential',
  'createdAt',
  'updatedAt',
] as const;

/**
 * Columns a create may set. The server fills `code`, `ownerId` and both
 * timestamps, so they are named here even though a browser never sends them.
 */
const CREATE_FIELDS = [
  'id',
  'code',
  'title',
  'body',
  'ownerId',
  'published',
  'confidential',
  'createdAt',
  'updatedAt',
] as const;

/** Columns an update may set. Ownership and creation time are immutable. */
const UPDATE_FIELDS = [
  'title',
  'body',
  'published',
  'confidential',
  'updatedAt',
] as const;

/**
 * Named ways to select documents.
 *
 * A scope only describes records; it never lets anybody reach them. `published`
 * is what an ordinary reader is granted. `readable` states the standing
 * confidentiality invariant — a document is reachable by its owner, or by
 * anyone at all while it is not confidential — and is what the collection-wide
 * Restriction Rule intersects every branch with.
 */
export const documentRecordAccess = {
  published: defineRecordAccess(DOCUMENT_SCOPES.published, (access) =>
    access
      .title(text('library.recordAccess.published'))
      .collections(DOCUMENTS_COLLECTION)
      .resolver(() =>
        buildFilter((f) =>
          f.and([
            f.boolean('published').isTrue(),
            f.boolean('confidential').isFalse(),
          ]),
        ),
      ),
  ),
  nonConfidential: defineRecordAccess(
    DOCUMENT_SCOPES.nonConfidential,
    (access) =>
      access
        .title(text('library.recordAccess.nonConfidential'))
        .collections(DOCUMENTS_COLLECTION)
        .resolver(() =>
          buildFilter((f) => f.boolean('confidential').isFalse()),
        ),
  ),
  readable: defineRecordAccess(DOCUMENT_SCOPES.readable, (access) =>
    access
      .title(text('library.recordAccess.readable'))
      .collections(DOCUMENTS_COLLECTION)
      .resolver(({ principal }) => {
        if (principal.type !== 'user') {
          return false;
        }
        return buildFilter((f) =>
          f.or([
            f.string('ownerId').eq(principal.id),
            f.boolean('confidential').isFalse(),
          ]),
        );
      }),
  ),
};

const documentLabel = text('library.data.documents');

/** The Collection registration for the permission workspace. */
export const documentsCollectionDefinition = {
  name: DOCUMENTS_COLLECTION,
  title: documentLabel,
} as const;

/** The workspace subsection the document library is listed under. */
export const librarySection = {
  name: 'library',
  title: text('library.section.title'),
  parent: 'business',
} as const;

/** The record access this application declares, in registration order. */
export const documentRecordAccessList = [
  documentRecordAccess.published,
  documentRecordAccess.nonConfidential,
  documentRecordAccess.readable,
] as const;

/**
 * The document library business operation.
 *
 * `view` reads, `create`/`edit`/`delete` write, and every one of them is bound
 * to the single data scope key `documents` so an administrator configures a
 * record scope once per action. Fields are declared here and cannot be widened
 * by configuration.
 */
export const libraryDocuments = defineCompositeResource(
  DOCUMENTS_RESOURCE,
  (resource) =>
    resource
      .title(text('library.resource.documents'))
      .action('view', (action) =>
        action.title(text('library.action.view')).grant(
          DOCUMENTS_SCOPE,
          defineDatabasePermission((permission) =>
            permission
              .collection<Document>(DOCUMENTS_COLLECTION)
              .title(documentLabel)
              .read(READ_FIELDS)
              .options(
                recordAccess.recordsIOwn,
                documentRecordAccess.published.reference(),
                documentRecordAccess.nonConfidential.reference(),
                documentRecordAccess.readable.reference(),
              ),
          ),
          { title: text('library.scope.documents') },
        ),
      )
      .action('create', (action) =>
        action.title(text('library.action.create')).grant(
          DOCUMENTS_SCOPE,
          defineDatabasePermission((permission) =>
            permission
              .collection<Document>(DOCUMENTS_COLLECTION)
              .title(documentLabel)
              // A create also reads the row it just wrote, so the read
              // operation is declared on the same grant.
              .read(READ_FIELDS)
              .create(CREATE_FIELDS)
              .options(recordAccess.recordsIOwn),
          ),
          { title: text('library.scope.documents') },
        ),
      )
      .action('edit', (action) =>
        action.title(text('library.action.edit')).grant(
          DOCUMENTS_SCOPE,
          defineDatabasePermission((permission) =>
            permission
              .collection<Document>(DOCUMENTS_COLLECTION)
              .title(documentLabel)
              // An update reads the row before it writes it, so the read
              // operation is declared on the same grant.
              .read(READ_FIELDS)
              .update(UPDATE_FIELDS)
              .options(recordAccess.recordsIOwn),
          ),
          { title: text('library.scope.documents') },
        ),
      )
      .action('delete', (action) =>
        action.title(text('library.action.delete')).grant(
          DOCUMENTS_SCOPE,
          defineDatabasePermission((permission) =>
            permission
              .collection<Document>(DOCUMENTS_COLLECTION)
              .title(documentLabel)
              .delete()
              .options(recordAccess.recordsIOwn),
          ),
          { title: text('library.scope.documents') },
        ),
      ),
);

/**
 * The standing confidentiality invariant as a collection-wide Restriction
 * Rule on `documents`, covering every branch that reaches the Collection.
 *
 * A restriction intersects what grants and Sharing Rules allow, so a document
 * that is confidential stays unreachable for anyone but its owner even after
 * an administrator shares it; the owner is unaffected because ownership is
 * part of the scope. An installation seed persists this once, after which it
 * is an ordinary rule the administrator edits on the Restriction Rules page.
 */
export const confidentialDocumentsRule = {
  key: 'library-confidential-documents',
  title: text('library.rule.confidential.title'),
  resource: { type: 'database.collection' as const, id: DOCUMENTS_COLLECTION },
  actions: (['read', 'update', 'delete'] as const).map((action) => ({
    action,
    selection: { type: 'recordAccess' as const, key: DOCUMENT_SCOPES.readable },
  })),
  subjects: [{ type: 'authenticated', id: '*' }],
  reason: '保密资料仅负责人本人可读，共享资格也不能将其开放。',
};
