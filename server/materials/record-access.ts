import {
  defineRecordAccess,
  type RecordAccessBuilder,
} from '@nocobase/authorization/core';
import type { DatabaseManager, FilterNode } from '@nocobase/db';
import {
  anyScope,
  condition,
  type DatabaseScope,
} from '@nocobase/app-plugin-authorization/server';

import {
  CONFIDENTIALITY_RECORD_ACCESS,
  MATERIALS_COLLECTION,
  MATERIAL_SHARES_COLLECTION,
  MATERIALS_NAMESPACE,
  READABLE_RECORD_ACCESS,
} from './constants.js';

/**
 * `and` over scopes. The shared `allScopes` helper is not re-exported from the authorization plugin's public entry, and
 * an `and` group is all that is missing, so it is built here rather than reaching into an internal module path.
 */
function allOf(scopes: readonly DatabaseScope[]): DatabaseScope {
  if (scopes.includes(false)) {
    return false;
  }
  const items = scopes.filter((scope): scope is FilterNode => scope !== true);
  if (items.length === 0) {
    return true;
  }
  return items.length === 1 ? items[0] : { kind: 'group', logic: 'and', items };
}

function title(key: string) {
  return { key, ns: MATERIALS_NAMESPACE };
}

function principalUserId(principal: {
  readonly type: string;
  readonly id: string;
}): string | undefined {
  return principal.type === 'user' ? principal.id : undefined;
}

/**
 * The ids of the materials temporarily shared with this reader.
 *
 * The rows live in this application's own table rather than the sharing-rules plugin's generic one, because a share
 * here is "one material for one reader" that the reader may not otherwise see, and the predicate below has to be able
 * to consult it. A generic rule cannot express "not confidential, and published or shared", which is the whole model.
 */
async function sharedMaterialIds(
  database: DatabaseManager,
  principalId: string | undefined,
): Promise<number[]> {
  if (!principalId) {
    return [];
  }
  const rows = await database
    .query()
    .selectFrom(MATERIAL_SHARES_COLLECTION)
    .select('materialId')
    .where('userId', '=', principalId)
    .execute();
  return rows
    .map((row) => row.materialId)
    .filter((value): value is number => typeof value === 'number');
}

function readableScope(sharedIds: readonly number[]): DatabaseScope {
  const publishedOrShared = anyScope([
    condition('published', '$isTruly'),
    ...sharedIds.map((id) => condition('id', '$eq', id)),
  ]);
  return allOf([condition('confidential', '$isFalsy'), publishedOrShared]);
}

/** The two Record Access policies the materials permission model is stated in. */
export function defineMaterialRecordAccess(database: DatabaseManager) {
  const readable = defineRecordAccess(
    READABLE_RECORD_ACCESS,
    (access: RecordAccessBuilder<typeof READABLE_RECORD_ACCESS>) =>
      access
        .title(title('recordAccess.readable'))
        .collections(MATERIALS_COLLECTION)
        .resolver(async ({ principal }) =>
          readableScope(
            await sharedMaterialIds(database, principalUserId(principal)),
          ),
        ),
  );

  const confidentiality = defineRecordAccess(
    CONFIDENTIALITY_RECORD_ACCESS,
    (access: RecordAccessBuilder<typeof CONFIDENTIALITY_RECORD_ACCESS>) =>
      access
        .title(title('recordAccess.confidentiality'))
        .collections(MATERIALS_COLLECTION)
        .resolver(({ principal }) =>
          allOf([
            anyScope([
              condition('confidential', '$isFalsy'),
              ...(principalUserId(principal)
                ? [condition('ownerId', '$eq', principalUserId(principal))]
                : []),
            ]),
          ]),
        ),
  );

  return { readable, confidentiality };
}
