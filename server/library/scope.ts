import type { RecordAccessReference } from '@nocobase/authorization/core';
import type { FilterNode } from '@nocobase/db';
import {
  anyScope,
  condition,
  type AppAuthorization,
  type DatabaseScope,
} from '@nocobase/app-plugin-authorization/server';

/**
 * The application namespace the authorization UI resolves the titles of these
 * record access definitions in. It is the package name from `client/runtime.ts`.
 */
export const LIBRARY_NAMESPACE = 'nb3-factory';

/** The collection the library permission model governs. */
export const DOCUMENTS_COLLECTION = 'documents';

/**
 * Record access keys, named once so the grants, the restriction rule and the
 * tests all spell them the same way.
 */
export const LIBRARY_RECORD_ACCESS = {
  /** Published and not confidential: every reader may open these. */
  readable: 'library.readable',
  /** Not confidential, whatever its published state. */
  nonConfidential: 'library.nonConfidential',
  /** The owner's own rows plus every readable row. */
  visible: 'library.visible',
  /**
   * The one record a temporary share points at.
   *
   * The authorization package's `records` selection carries string ids only,
   * and this table's primary key is an integer, so a `records` selection would
   * be rejected by the repository's filter validation. Naming the id in a
   * record access lets the resolver hand back a real number instead.
   */
  sharedDocument: 'library.sharedDocument',
} as const;

/** The params the `sharedDocument` record access reads. */
export interface SharedDocumentParams {
  readonly documentId?: unknown;
}

/**
 * The AND fold of the authorization package's internal `allScopes`.
 *
 * That helper is not part of the package's public surface, so the fold is
 * repeated here rather than reaching through a private subpath. `true` drops
 * out, `false` wins, and a single node collapses to itself.
 */
export function allScopes(scopes: readonly DatabaseScope[]): DatabaseScope {
  if (scopes.includes(false)) return false;
  const items = scopes.filter(
    (scope): scope is FilterNode => scope !== true && scope !== false,
  );
  if (items.length === 0) return true;
  return items.length === 1 ? items[0] : group('and', items);
}

function group(logic: 'and' | 'or', items: readonly FilterNode[]): FilterNode {
  return { kind: 'group', logic, items };
}

/** Published and not confidential. */
export function readableScope(): DatabaseScope {
  return allScopes([
    condition('published', '$isTruly'),
    condition('confidential', '$isFalsy'),
  ]);
}

/** Not confidential, leaving the published axis to the positive access. */
export function nonConfidentialScope(): DatabaseScope {
  return condition('confidential', '$isFalsy');
}

/** The owner's own rows plus every readable row. */
export function visibleScope(principalId: string): DatabaseScope {
  return anyScope([condition('ownerId', '$eq', principalId), readableScope()]);
}

/**
 * Exactly the one row a temporary share named.
 *
 * A missing, malformed or fractional id resolves to `false` rather than to a
 * filter the repository would refuse, so a broken share denies instead of
 * failing the request.
 */
export function sharedDocumentScope(documentId: unknown): DatabaseScope {
  const parsed =
    typeof documentId === 'number' ? documentId : Number(documentId);
  if (!Number.isSafeInteger(parsed)) return false;
  return condition('id', '$eq', parsed);
}

export interface LibraryRecordAccessReferences {
  readonly readable: RecordAccessReference<
    typeof LIBRARY_RECORD_ACCESS.readable
  >;
  readonly nonConfidential: RecordAccessReference<
    typeof LIBRARY_RECORD_ACCESS.nonConfidential
  >;
  readonly visible: RecordAccessReference<typeof LIBRARY_RECORD_ACCESS.visible>;
  readonly sharedDocument: RecordAccessReference<
    typeof LIBRARY_RECORD_ACCESS.sharedDocument
  >;
}

/**
 * Registers the three library data scopes.
 *
 * Called once from the provider's `boot()`. A second call throws in the
 * record-access registry, which is what should happen if two providers ever
 * tried to own the same key.
 */
export function registerLibraryRecordAccess(
  authz: AppAuthorization,
): LibraryRecordAccessReferences {
  const readable = authz.recordAccess.define({
    key: LIBRARY_RECORD_ACCESS.readable,
    title: { key: 'library.recordAccess.readable', ns: LIBRARY_NAMESPACE },
    collections: [DOCUMENTS_COLLECTION],
    resolve: () => readableScope(),
  });
  const nonConfidential = authz.recordAccess.define({
    key: LIBRARY_RECORD_ACCESS.nonConfidential,
    title: {
      key: 'library.recordAccess.nonConfidential',
      ns: LIBRARY_NAMESPACE,
    },
    collections: [DOCUMENTS_COLLECTION],
    resolve: () => nonConfidentialScope(),
  });
  const visible = authz.recordAccess.define({
    key: LIBRARY_RECORD_ACCESS.visible,
    title: { key: 'library.recordAccess.visible', ns: LIBRARY_NAMESPACE },
    collections: [DOCUMENTS_COLLECTION],
    resolve: ({ principal }) =>
      principal.type === 'user' ? visibleScope(principal.id) : false,
  });
  const sharedDocument = authz.recordAccess.define({
    key: LIBRARY_RECORD_ACCESS.sharedDocument,
    title: {
      key: 'library.recordAccess.sharedDocument',
      ns: LIBRARY_NAMESPACE,
    },
    collections: [DOCUMENTS_COLLECTION],
    resolve: ({ params }) =>
      sharedDocumentScope(
        (params as SharedDocumentParams | undefined)?.documentId,
      ),
  });
  return { readable, nonConfidential, visible, sharedDocument };
}
