import {
  defineSeed,
  type SeedContext,
  type SeedDefinition,
} from '@nocobase/db';

/**
 * Grant page access for the expense-claims (报销) application pages to every
 * authenticated user.
 *
 * The authorization plugin's `202608250002_create_default_pages_permission_set`
 * migration creates a `default-pages` permission set assigned to
 * `authenticated:*` that only includes the `home` page. Without a matching
 * `page` grant, the client-side route guard (`useCan` → `page/<routeName>` /
 * `access`) renders "Access denied" for the application's own pages, so a
 * freshly registered employee could not even open the claim list, the new-claim
 * form, or a claim's detail page — even though the server-side row-level rules
 * already limit a non-finance user to their own claims.
 *
 * This seed extends that same default set (idempotently) with the three
 * application pages. Page access is only a routing gate: the server API still
 * independently enforces ownership and the finance-only review policy.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609120004_grant_expense_claims_pages_access',

  async run({ query }: SeedContext): Promise<void> {
    const appPages = [
      'expense-claims',
      'expense-claims.new',
      'expense-claims.detail',
    ];

    const set = await query
      .selectFrom('authorizationPermissionSets')
      .select(['id', 'grants', 'createdAt', 'updatedAt'])
      .where('key', '=', 'default-pages')
      .executeTakeFirst();

    if (set) {
      const grants = parseGrants(set.grants);
      const missing = appPages.filter(
        (id) =>
          !grants.some(
            (grant) =>
              grant.resource?.type === 'page' && grant.resource.id === id,
          ),
      );
      if (missing.length > 0) {
        for (const id of missing) {
          grants.push({
            resource: { type: 'page', id },
            actions: [{ action: 'access' }],
          });
        }
        await query
          .updateTable('authorizationPermissionSets')
          .set({
            grants: JSON.stringify(grants),
            updatedAt: new Date(),
          })
          .where('key', '=', 'default-pages')
          .execute();
      }
      return;
    }

    // Defensive: if the plugin's migration somehow did not run, create the
    // permission set and its authenticated assignment exactly as that migration
    // would have, so the app's pages are reachable anyway.
    const now = new Date();
    const existingSet = await query
      .selectFrom('authorizationPermissionSets')
      .select('id')
      .where('key', '=', 'default-pages')
      .executeTakeFirst();
    if (!existingSet) {
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: crypto.randomUUID(),
          key: 'default-pages',
          title: 'Default pages',
          grants: JSON.stringify([
            {
              resource: { type: 'page', id: 'home' },
              actions: [{ action: 'access' }],
            },
            ...appPages.map((id) => ({
              resource: { type: 'page', id },
              actions: [{ action: 'access' }],
            })),
          ]),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
    const existingAssignment = await query
      .selectFrom('authorizationPermissionSetAssignments')
      .select('id')
      .where('id', '=', 'authenticated:*:default-pages')
      .executeTakeFirst();
    if (!existingAssignment) {
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: 'authenticated:*:default-pages',
          subjectType: 'authenticated',
          subjectId: '*',
          permissionSetKey: 'default-pages',
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

interface PageGrant {
  readonly resource?: { readonly type?: string; readonly id?: string };
  readonly actions?: readonly unknown[];
}

function parseGrants(raw: unknown): PageGrant[] {
  if (typeof raw !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isPageGrant) : [];
  } catch {
    return [];
  }
}

function isPageGrant(value: unknown): value is PageGrant {
  return (
    typeof value === 'object' &&
    value !== null &&
    'resource' in value &&
    typeof (value as PageGrant).resource === 'object'
  );
}

export default seed;
