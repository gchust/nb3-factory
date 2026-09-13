import { defineSeed, type SeedDefinition } from '@nocobase/db';

// The client hides a route and refuses to load its page when the signed-in
// subject has no `page:<routeName>:access` grant (see
// client/routing/client-page.ts and the authorization client's access control
// provider). The framework grants `page:home:access` to every authenticated
// subject through its own `default-pages` permission set, but it cannot know
// about this application's routes, so without these grants a freshly
// self-registered employee sees no HR menu and every HR URL answers "Access
// denied".
//
// Only the coarse "may open this page" gate is configured here. The HR roles
// carry no database-collection grants: record-level rules (own records, own
// department) are enforced in server/routes/hr.ts and the HR service.
//
// This is a separate seed rather than an edit to 202609130101_seed_hr_roles
// because an applied seed's checksum is immutable; changing the original would
// make the next application start fail with a checksum error.
//
// Keep the page ids in step with the route `name` values in client/routes.ts.

const PAGE = 'page';
const ACCESS = 'access';

const ROLE_PAGES: Readonly<Record<string, readonly string[]>> = {
  // Every authenticated account receives this set through the
  // `authenticated:*` assignment made in 202609130101_seed_hr_roles.
  employee: ['hrLeaveRequests', 'hrOvertimeRequests'],
  // Managers approve through the leave and overtime pages; the approvals page
  // mirrors those decisions in one place.
  'department-manager': [
    'hrLeaveRequests',
    'hrOvertimeRequests',
    'hrApprovals',
  ],
  // HR maintains the records and reads every request, so it reaches every page.
  hr: [
    'hrEmployees',
    'hrDepartments',
    'hrLeaveRequests',
    'hrOvertimeRequests',
    'hrApprovals',
    'hrStatistics',
  ],
};

const ROLE_TITLES: Readonly<Record<string, string>> = {
  employee: 'Employee',
  'department-manager': 'Department manager',
  hr: 'HR',
};

const seed: SeedDefinition = defineSeed({
  name: '202609130103_seed_hr_page_permissions',

  async run({ query, connection }) {
    const client = await connection.client<TableSchemaClient>();
    if (
      !(await client.schema.hasTable('authorization_permission_sets')) ||
      !(await client.schema.hasTable(
        'authorization_permission_set_assignments',
      ))
    ) {
      return;
    }

    const now = new Date();
    for (const [key, pages] of Object.entries(ROLE_PAGES)) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select(['key', 'grants'])
        .where('key', '=', key)
        .executeTakeFirst();
      if (!existing) {
        // Self-contained: create the set if the role seed has not run. Normal
        // startup runs the role seed first because seeds execute in name order.
        await query
          .insertInto('authorizationPermissionSets')
          .values({
            id: crypto.randomUUID(),
            key,
            title: ROLE_TITLES[key] ?? key,
            grants: JSON.stringify(pages.map(pageGrant)),
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        continue;
      }
      const grants = parseGrants(existing.grants);
      const next = addPageGrants(grants, pages);
      if (next === grants) continue;
      await query
        .updateTable('authorizationPermissionSets')
        .set({ grants: JSON.stringify(next), updatedAt: new Date() })
        .where('key', '=', key)
        .execute();
    }

    // Defensive: the role seed owns this assignment, but repeat it so a run
    // that only had this seed still wires the employee default.
    const assignmentId = 'authenticated:*:employee';
    const assignment = await query
      .selectFrom('authorizationPermissionSetAssignments')
      .select('id')
      .where('id', '=', assignmentId)
      .executeTakeFirst();
    if (!assignment) {
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: assignmentId,
          subjectType: 'authenticated',
          subjectId: '*',
          permissionSetKey: 'employee',
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

function pageGrant(id: string): PermissionGrantRecord {
  return { resource: { type: PAGE, id }, actions: [{ action: ACCESS }] };
}

function addPageGrants(
  grants: readonly PermissionGrantRecord[],
  pages: readonly string[],
): readonly PermissionGrantRecord[] {
  const missing = pages.filter(
    (id) =>
      !grants.some(
        (grant) =>
          grant.resource.type === PAGE &&
          grant.resource.id === id &&
          grant.actions.some(({ action }) => action === ACCESS),
      ),
  );
  if (missing.length === 0) return grants;
  return [...grants, ...missing.map(pageGrant)];
}

function parseGrants(value: unknown): readonly PermissionGrantRecord[] {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(parsed) || !parsed.every(isPermissionGrantRecord)) {
    throw new Error(
      'HR page permission grants must be a valid permission grant array.',
    );
  }
  return parsed;
}

function isPermissionGrantRecord(
  value: unknown,
): value is PermissionGrantRecord {
  if (!isRecord(value) || !isRecord(value.resource)) return false;
  if (
    typeof value.resource.type !== 'string' ||
    typeof value.resource.id !== 'string' ||
    !Array.isArray(value.actions)
  ) {
    return false;
  }
  return value.actions.every(
    (action) => isRecord(action) && typeof action.action === 'string',
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

interface PermissionGrantRecord {
  readonly resource: {
    readonly type: string;
    readonly id: string;
  };
  readonly actions: readonly {
    readonly action: string;
    readonly policy?: unknown;
  }[];
}

interface TableSchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
  };
}

export default seed;
