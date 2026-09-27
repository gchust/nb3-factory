import {
  defineCompositeResource,
  defineRecordAccess,
  type AuthorizationSubjectType,
} from '@nocobase/authorization/core';
import {
  DatabasePermissionBuilder,
  recordAccess,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';
import { buildFilter } from '@nocobase/repository-input';

/**
 * The document library's authorization model.
 *
 * The collection grant of `documents`, the composite actions the UI and the
 * routes check, the record accesses the rules choose from, and the
 * `library.reader` subject that carries the confidentiality floor.
 *
 * The model is deliberately the built-in one: a Permission Set grants a
 * composite action, a Sharing Rule adds ordinary non-confidential records, and
 * a Restriction Rule intersects every reader's read scope with the
 * non-confidential records. No request reads past these decisions.
 */

/** The application's locale namespace, shared with the server-registered titles. */
export const LIBRARY_NAMESPACE = 'nb3-factory';

/** The composite identifier both the routes and the rules name. */
export const LIBRARY_RESOURCE = 'library.documents';

/** The Permission Sets the sample accounts hold. */
export const MANAGER_PERMISSION_SET = 'library-manager';
export const READER_PERMISSION_SET = 'library-reader';

/** The subject id a holder of the reader Permission Set resolves to. */
export const READER_SUBJECT_TYPE = 'library.reader';
export const READER_SUBJECT_ID = 'reader';

export interface DocumentRecord {
  id: string;
  title: string;
  body: string | null;
  ownerId: string;
  published: boolean;
  confidential: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function label(key: string) {
  return { key, ns: LIBRARY_NAMESPACE };
}

/** Records the signed-in user owns, on any collection that carries `ownerId`. */
export const ownDocumentsAccess = defineRecordAccess('library.own', (access) =>
  access
    .collections('documents')
    .title(label('library.recordAccess.own'))
    .resolver(({ principal }) =>
      principal.type === 'user'
        ? buildFilter<DocumentRecord>((filter) =>
            filter.string('ownerId').eq(principal.id),
          )
        : false,
    ),
);

/** Published, non-confidential records: what every reader may browse. */
export const publishedDocumentsAccess = defineRecordAccess(
  'library.published',
  (access) =>
    access
      .collections('documents')
      .title(label('library.recordAccess.published'))
      .resolver(() =>
        buildFilter<DocumentRecord>((filter) =>
          filter.and([
            filter.boolean('published').isTrue(),
            filter.boolean('confidential').isFalse(),
          ]),
        ),
      ),
);

/**
 * Every non-confidential record. The confidentiality floor a Restriction Rule
 * intersects into a reader's scope, so an ordinary share of a confidential
 * record cannot cross it.
 */
export const nonConfidentialDocumentsAccess = defineRecordAccess(
  'library.nonConfidential',
  (access) =>
    access
      .collections('documents')
      .title(label('library.recordAccess.nonConfidential'))
      .resolver(() =>
        buildFilter<DocumentRecord>((filter) =>
          filter.boolean('confidential').isFalse(),
        ),
      ),
);

function documentPermission() {
  return new DatabasePermissionBuilder<DocumentRecord>('documents')
    .title(label('library.scope.documents'))
    .options(
      recordAccess.allRecords,
      recordAccess.recordsIOwn,
      ownDocumentsAccess.reference(),
      publishedDocumentsAccess.reference(),
      nonConfidentialDocumentsAccess.reference(),
    )
    .default(recordAccess.allRecords);
}

/**
 * Reading a document, alone or as part of maintaining it. Every mutating
 * action includes `read` because the Repository validates and returns the
 * affected record through its bound read Policy; a write-only grant produces a
 * Policy whose `read` node is `false`, and the write is refused before it runs.
 */
const viewPermission = documentPermission().read('*');
const createPermission = documentPermission().read('*').create('*');
const editPermission = documentPermission().read('*').update('*');
const deletePermission = documentPermission().read('*').delete();

/**
 * The library's actions. `view` is the reader's only action; `edit`, `create`
 * and `delete` are the manager's. Each names the `documents` data scope, so a
 * rule can target one action and one scope.
 */
export const libraryDocuments = defineCompositeResource(
  LIBRARY_RESOURCE,
  (resource) =>
    resource
      .title(label('library.resource.title'))
      .action('view', (action) =>
        action
          .title(label('library.action.view'))
          .grant('documents', viewPermission, {
            title: label('library.scope.documents'),
          }),
      )
      .action('create', (action) =>
        action
          .title(label('library.action.create'))
          .grant('documents', createPermission, {
            title: label('library.scope.documents'),
          }),
      )
      .action('edit', (action) =>
        action
          .title(label('library.action.edit'))
          .grant('documents', editPermission, {
            title: label('library.scope.documents'),
          }),
      )
      .action('delete', (action) =>
        action
          .title(label('library.action.delete'))
          .grant('documents', deletePermission, {
            title: label('library.scope.documents'),
          }),
      ),
);

/**
 * Resolves to `reader` exactly for a user who holds the reader Permission Set.
 *
 * Reading the assignments directly keeps the subject independent of grant
 * resolution, so it can be asked while grants are already being resolved.
 */
export function readerSubject(
  authz: AppAuthorization,
): AuthorizationSubjectType {
  return {
    async resolveFor(principal) {
      if (principal.type !== 'user') {
        return [];
      }
      const assignments = await authz.permissionSets.listAssignments(
        READER_PERMISSION_SET,
      );
      const holds = assignments.some(
        (assignment) =>
          assignment.subject.type === 'user' &&
          assignment.subject.id === principal.id,
      );
      return holds ? [READER_SUBJECT_ID] : [];
    },
    async filterActive(ids) {
      return ids.filter((id) => id === READER_SUBJECT_ID);
    },
  };
}

/** The titles the client and the permission workspace read. */
export function registerLibraryAuthorization(authz: AppAuthorization): void {
  authz.database.collections.add({
    name: 'documents',
    title: label('library.database.documents'),
  });
  authz.recordAccess.define(ownDocumentsAccess);
  authz.recordAccess.define(publishedDocumentsAccess);
  authz.recordAccess.define(nonConfidentialDocumentsAccess);
  authz.subjects.add(READER_SUBJECT_TYPE, readerSubject(authz));
  const reference = authz.compositeResources.define(libraryDocuments);
  authz.ui.sections.add({
    name: 'library',
    parent: 'business',
    title: label('library.section'),
    order: 10,
  });
  authz.ui.place(reference, { section: 'library' });
}
