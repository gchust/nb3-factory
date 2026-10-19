import { defineSeed } from '@nocobase/db';

/**
 * Gives every signed-in employee the baseline IT ticket access, and gives the
 * installation's root administrators the service desk set as well.
 *
 * The `it-employee` grants are limited to a person's own tickets, so this
 * assignment is what makes `/it-tickets` reachable for someone who has just
 * registered rather than an escalation of their access. Root administrators
 * can already do everything; assigning the service desk set to them is what
 * makes new-ticket and overdue notifications reach a real inbox before an
 * administrator has assigned the set to anyone.
 */
export default defineSeed({
  name: '202610070003_it_default_access',
  transaction: true,
  async run({ query }) {
    const now = new Date();
    const assignmentId = 'authenticated:*:it-employee';
    const existingEmployee = await query
      .selectFrom('authorizationPermissionSetAssignments')
      .select('id')
      .where('id', '=', assignmentId)
      .executeTakeFirst();
    if (!existingEmployee) {
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: assignmentId,
          subjectType: 'authenticated',
          subjectId: '*',
          permissionSetKey: 'it-employee',
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const roots = await query
      .selectFrom('authorizationPermissionSetAssignments')
      .select('subjectId')
      .where('permissionSetKey', '=', 'root')
      .where('subjectType', '=', 'user')
      .execute();
    for (const root of roots) {
      const subjectId = String(root.subjectId);
      const rootAssignmentId = `user:${subjectId}:it-service-desk`;
      const existingRoot = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('id', '=', rootAssignmentId)
        .executeTakeFirst();
      if (existingRoot) continue;
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: rootAssignmentId,
          subjectType: 'user',
          subjectId,
          permissionSetKey: 'it-service-desk',
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
