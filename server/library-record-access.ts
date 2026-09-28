import {
  defineRecordAccess,
  type RecordAccessReference,
} from '@nocobase/authorization/core';
import {
  anyScope,
  condition,
  type DatabaseScope,
} from '@nocobase/app-plugin-authorization/server';
import type { DatabaseManager, FilterNode } from '@nocobase/db';

import { APP_NAMESPACE } from './library-types.ts';

/** The record access key a reader's view grant selects. */
export const READER_VISIBLE_KEY = 'library.readerVisible';

/**
 * The serializable side of the definition, usable in permission sets and
 * seeds without importing the resolver.
 */
export function readerVisibleReference(): RecordAccessReference<
  typeof READER_VISIBLE_KEY
> {
  return { key: READER_VISIBLE_KEY, collections: ['documents'] };
}

/**
 * The filter a reader may see: never confidential, and either published or
 * explicitly shared with them.
 *
 * There is deliberately no branch that admits a confidential row. Sharing a
 * confidential document adds its id to the published-or-shared half, and the
 * `confidential` half still rejects it, so a mistaken share cannot leak one.
 * Returning a filter rather than `false` when nothing is shared matters: a
 * record access that resolves to `false` turns the whole request into a denial
 * instead of an empty result.
 */
/**
 * The server package exports `anyScope` but not its AND counterpart, so the
 * conjunction is assembled here with the same collapse rules: a `false` child
 * selects nothing, `true` children drop out, and one survivor is returned
 * unwrapped rather than nested in a single-item group.
 */
function everyScope(scopes: readonly DatabaseScope[]): DatabaseScope {
  if (scopes.includes(false)) {
    return false;
  }
  const nodes = scopes.filter(
    (scope): scope is FilterNode => typeof scope !== 'boolean',
  );
  if (nodes.length === 0) {
    return true;
  }
  return nodes.length === 1
    ? nodes[0]
    : { kind: 'group', logic: 'and', items: nodes };
}

export function buildReaderVisibleFilter(
  sharedDocumentIds: readonly string[],
): DatabaseScope {
  return everyScope([
    // A boolean column in this dialect accepts `$isTruly`/`$isFalsy`, not
    // `$eq`; the operators carry no value of their own.
    condition('confidential', '$isFalsy'),
    anyScope([
      condition('published', '$isTruly'),
      ...sharedDocumentIds.map((id) => condition('id', '$eq', id)),
    ]),
  ]);
}

/**
 * Registers `library.readerVisible`. The resolver reads the shares table
 * directly because a record access never receives a repository; the caller's
 * authorization resolves the returned filter against `documents` itself.
 */
export function defineReaderVisibleRecordAccess(database: DatabaseManager) {
  return defineRecordAccess(READER_VISIBLE_KEY, (access) =>
    access
      .title({ key: 'library.recordAccess.readerVisible', ns: APP_NAMESPACE })
      .collections('documents')
      .resolver(async ({ principal, collection }) => {
        if (collection !== 'documents' || principal.type !== 'user') {
          return false;
        }
        const sharedDocumentIds = await database
          .connection()
          .query.selectFrom('documentShares')
          .where('userId', '=', principal.id)
          .pluck<string>('documentId');
        return buildReaderVisibleFilter(sharedDocumentIds);
      }),
  );
}
