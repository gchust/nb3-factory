import {
  encodeAuthorizationTitle,
  type PermissionGrant,
} from '@nocobase/authorization/core';
import { definePermissionSet } from '@nocobase/authorization/permission-sets';
import { defineSeed } from '@nocobase/db';

/**
 * The composite resource `server/library/authorization.ts` registers at boot.
 * A seed is immutable history and cannot import that evolving definition, so
 * this file stores the grant values it expands to and owns them from here on.
 */
const LIBRARY_RESOURCE = 'library.documents';
/** The one data scope key the resource binds documents under. */
const LIBRARY_SCOPE = 'documents';

/** The page a qualified colleague opens to reach the library. */
const pageGrant: PermissionGrant = {
  resource: { type: 'page', id: 'library.documents' },
  actions: [{ action: 'access' }],
};

/**
 * Builds the composite grant for one Permission Set. Each action names one data
 * scope value; the authorization backend expands it against the model declared
 * in code when it checks a request.
 */
function documentGrant(
  actions: Readonly<Record<string, string>>,
): PermissionGrant {
  return {
    resource: { type: 'composite', id: LIBRARY_RESOURCE },
    actions: Object.entries(actions).map(([action, scope]) => ({
      action,
      policy: { type: 'composite', scopes: { [LIBRARY_SCOPE]: scope } },
    })),
  };
}

/**
 * 资料员甲 maintains documents: it sees what it owns and may create more. It
 * reads the whole library because a confidential document must stay readable to
 * a maintainer — that is what makes the reader's restriction visible.
 */
const maintainer = definePermissionSet('library.maintainer')
  .title('Document maintainer')
  .grant(
    pageGrant,
    documentGrant({
      view: 'allRecords',
      create: 'allRecords',
      edit: 'recordsIOwn',
    }),
  )
  .build();

/**
 * 阅读者乙 reads. It has no `create` or `edit` action at all, so no sharing
 * rule can give it one: a Sharing Rule widens the records an action reaches, it
 * never adds an action. Its view scope is "published", and a Restriction Rule
 * narrows that to "not confidential" — the two together are the requirement.
 */
const reader = definePermissionSet('library.reader')
  .title('Document reader')
  .grant(
    pageGrant,
    documentGrant({
      view: 'library.published',
    }),
  )
  .build();

/**
 * Installs the library's initial Permission Sets. They are ordinary persisted
 * configuration: an administrator may edit their grants, scopes and assignments
 * afterwards, and this seed preserves whatever is already there.
 */
export default defineSeed({
  name: '202610150002_library_permission_sets',
  transaction: true,
  async run({ query }) {
    for (const permissionSet of [maintainer, reader]) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('id')
        .where('key', '=', permissionSet.key)
        .executeTakeFirst();
      if (existing) continue;

      const now = new Date();
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: crypto.randomUUID(),
          key: permissionSet.key,
          title: encodeAuthorizationTitle(permissionSet.title),
          grants: JSON.stringify(permissionSet.grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
