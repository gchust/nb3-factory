import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { defineSeed, type SeedDefinition } from '@nocobase/db';

import { integrationDeviceReader } from '../../seed-data/permission-sets.ts';
import { INTEGRATION_USER } from './202609280003_integration_account.ts';

/**
 * Installs the read-only set and assigns it to the integration account. Both steps are looked up by stable identity
 * before inserting, so an install that already ran leaves the stored set and assignment untouched.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609280004_integration_device_reader',
  transaction: true,
  async run({ query }) {
    const now = new Date();

    const existingSet = await query
      .selectFrom('authorizationPermissionSets')
      .select('key')
      .where('key', '=', integrationDeviceReader.key)
      .executeTakeFirst();
    if (!existingSet) {
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: crypto.randomUUID(),
          key: integrationDeviceReader.key,
          title: encodeAuthorizationTitle(integrationDeviceReader.title),
          grants: JSON.stringify(integrationDeviceReader.grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const user = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', INTEGRATION_USER.username.toLowerCase())
      .limit(1)
      .executeTakeFirst();
    if (!user) return;

    const userId = String(user.id);
    const assignmentId = `user:${userId}:${integrationDeviceReader.key}`;
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
          subjectType: 'user',
          subjectId: userId,
          permissionSetKey: integrationDeviceReader.key,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
