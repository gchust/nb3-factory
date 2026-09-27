import { defineSeed } from '@nocobase/db';
import type { SeedContext } from '@nocobase/db';
// The `.ts` extension is deliberate: the database task loader imports this
// seed directly from source under Node's type stripping, which resolves a
// relative `.ts` specifier but not a `.js` one. The server build rewrites it
// to `.js` for the compiled tree (`rewriteRelativeImportExtensions`).
import {
  MEETING_I18N_NAMESPACE,
  meetingEmployeeGrants,
} from '../../../server/meeting/authorization.ts';

/**
 * The business permission set every signed-in employee holds. `root` bypasses
 * authorization entirely, so it does not need this set; everyone else reaches
 * the booking feature only through these grants.
 */
export const MEETING_EMPLOYEE_SET = 'meeting-employee';

/** The subject every signed-in account matches, per the authorization plugin. */
const AUTHENTICATED_SUBJECT = { type: 'authenticated', id: '*' } as const;

/**
 * Writes the employee permission set and its assignment in one idempotent
 * step. Keyed on the set key, matching how the built-in member seed decides
 * whether it has run: a second run inserts nothing.
 */
export async function seedMeetingPermissions({
  query,
}: SeedContext): Promise<void> {
  const now = new Date();

  const existingSet = await query
    .selectFrom('authorizationPermissionSets')
    .select('key')
    .where('key', '=', MEETING_EMPLOYEE_SET)
    .executeTakeFirst();

  if (!existingSet) {
    await query
      .insertInto('authorizationPermissionSets')
      .values({
        id: crypto.randomUUID(),
        key: MEETING_EMPLOYEE_SET,
        title: JSON.stringify({
          key: 'meeting.authz.permissionSet',
          ns: MEETING_I18N_NAMESPACE,
        }),
        // The grants are built by the same composite builders the runtime
        // registers, so a change to an action's policy cannot leave a stale
        // grant stored here.
        grants: JSON.stringify(meetingEmployeeGrants),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  }

  const assignmentId = `${AUTHENTICATED_SUBJECT.type}:${AUTHENTICATED_SUBJECT.id}:${MEETING_EMPLOYEE_SET}`;
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
        subjectType: AUTHENTICATED_SUBJECT.type,
        subjectId: AUTHENTICATED_SUBJECT.id,
        permissionSetKey: MEETING_EMPLOYEE_SET,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  }
}

const seed = defineSeed({
  name: '202609100004_meeting_permissions',
  run: seedMeetingPermissions,
});

export default seed;
