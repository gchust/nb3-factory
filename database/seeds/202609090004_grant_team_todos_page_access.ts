import { defineSeed, type SeedDefinition } from '@nocobase/db';

interface PageGrant {
  resource?: { type?: string; id?: string };
  actions?: Array<{ action?: string }>;
}

/**
 * The authorization plugin's migration creates the `default-pages` permission
 * set (assigned to the `authenticated:*` subject) with only the home page
 * grant. The team-todos page must be reachable by every logged-in user —
 * "any logged-in user can manage team shared todos" — so extend that set with
 * a `page:team-todos` access grant. Idempotent: the grant is added only when
 * it is missing, and a repeat run changes nothing.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609090004_grant_team_todos_page_access',

  async run({ query }) {
    let set;
    try {
      set = await query
        .selectFrom('authorizationPermissionSets')
        .select(['id', 'grants'])
        .where('key', '=', 'default-pages')
        .executeTakeFirst();
    } catch {
      // The permission-set table is owned by the authorization plugin. In an
      // isolated seed run without the plugin's migrations the table is absent;
      // there is nothing to extend and the seed is a no-op.
      return;
    }
    if (!set) {
      // The authorization plugin is always registered, so its migration has
      // created the set before seeds run. Guard anyway so an isolated seed
      // run without the plugin is a no-op rather than a failure.
      return;
    }

    const grants = parseGrants(set.grants);
    if (hasPageGrant(grants, 'team-todos')) {
      return;
    }

    await query
      .updateTable('authorizationPermissionSets')
      .set({
        grants: JSON.stringify([
          ...grants,
          {
            resource: { type: 'page', id: 'team-todos' },
            actions: [{ action: 'access' }],
          },
        ]),
        updatedAt: new Date(),
      })
      .where('key', '=', 'default-pages')
      .execute();
  },
});

function parseGrants(value: unknown): PageGrant[] {
  if (Array.isArray(value)) {
    return value as PageGrant[];
  }
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as PageGrant[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function hasPageGrant(grants: PageGrant[], pageId: string): boolean {
  return grants.some(
    (grant) =>
      grant?.resource?.type === 'page' &&
      grant.resource.id === pageId &&
      grant.actions?.some((action) => action?.action === 'access'),
  );
}

export default seed;
