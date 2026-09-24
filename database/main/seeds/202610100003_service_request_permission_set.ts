import { defineSeed } from '@nocobase/db';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { serviceRequestUser } from '../../seed-data/service-request-permissions.ts';
import { SERVICE_REQUEST_TEST_USERS } from '../../seed-data/service-request-fixtures.ts';

/**
 * Persists the initial `service-request-user` permission set and assigns it to
 * the two test accounts. This is installation configuration, not code-owned
 * state: an administrator may edit the set or reassign it afterwards, and a
 * re-run preserves what already exists.
 *
 * It deliberately touches nothing about the built-in `root`/`member` sets.
 */
const seed = defineSeed({
  name: '202610100003_service_request_permission_set',
  transaction: true,
  async run({ query }) {
    const now = new Date();

    const existingSet = await query
      .selectFrom('authorizationPermissionSets')
      .select('key')
      .where('key', '=', serviceRequestUser.key)
      .executeTakeFirst();
    if (!existingSet) {
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: serviceRequestUser.key,
          key: serviceRequestUser.key,
          title: encodeAuthorizationTitle(serviceRequestUser.title),
          grants: JSON.stringify(serviceRequestUser.grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    for (const fixture of SERVICE_REQUEST_TEST_USERS) {
      const user = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', fixture.username)
        .limit(1)
        .executeTakeFirst();
      if (!user) continue;

      const subjectId = String(user.id);
      const assignmentId = `user:${subjectId}:${serviceRequestUser.key}`;
      const existingAssignment = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('id', '=', assignmentId)
        .executeTakeFirst();
      if (existingAssignment) continue;

      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: assignmentId,
          subjectType: 'user',
          subjectId,
          permissionSetKey: serviceRequestUser.key,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
