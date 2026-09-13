import { defineSeed, type SeedDefinition } from '@nocobase/db';

// Registers the application's HR roles as Authorization Permission Sets. The
// Users page lists direct Permission Sets as assignable roles, so `hr` and
// `department-manager` can be handed to a user there. `employee` is attached
// to the authenticated subject as a default, which is what makes a freshly
// self-registered account a regular employee without an administrator step.
//
// The sets carry no grants: this application enforces its own record-level
// rules (department scope, own-records-only) in its server routes, because the
// built-in static record policies cannot express "the manager's own
// department" or the annual-leave balance rule.
const HR_ROLES = [
  { key: 'hr', title: 'HR' },
  { key: 'department-manager', title: 'Department manager' },
  { key: 'employee', title: 'Employee' },
] as const;

const EMPLOYEE = 'employee';

const seed: SeedDefinition = defineSeed({
  name: '202609130101_seed_hr_roles',

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
    for (const role of HR_ROLES) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', role.key)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: crypto.randomUUID(),
          key: role.key,
          title: role.title,
          grants: JSON.stringify([]),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const assignmentId = `authenticated:*:${EMPLOYEE}`;
    const existingAssignment = await query
      .selectFrom('authorizationPermissionSetAssignments')
      .select('id')
      .where('id', '=', assignmentId)
      .executeTakeFirst();
    if (!existingAssignment) {
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: assignmentId,
          subjectType: 'authenticated',
          subjectId: '*',
          permissionSetKey: EMPLOYEE,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

interface TableSchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
  };
}

export default seed;
