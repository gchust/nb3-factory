import { createHash } from 'node:crypto';

import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { defineSeed } from '@nocobase/db';

import {
  documentsStaff,
  documentsSupervisor,
} from '../../seed-data/documents-permission-sets.ts';

/**
 * A stable id derived from the set key, shaped as a UUID. The store generates a random UUID for a set
 * created through the API; a seeded row must be reproducible instead, so re-running the seed on
 * another database produces the same row.
 */
function stablePermissionSetId(key: string): string {
  const hex = createHash('sha256')
    .update(`permission-set:${key}`)
    .digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

/**
 * Install the two documents roles. A set that an administrator already edited is preserved: the
 * seed only fills in what is missing, never overwrites stored grants.
 */
export default defineSeed({
  name: '202610060003_documents_permission_sets',
  transaction: true,
  async run({ query }) {
    for (const set of [documentsSupervisor, documentsStaff]) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', set.key)
        .executeTakeFirst();
      if (existing) continue;
      const now = new Date('2026-10-06T00:00:00.000Z');
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: stablePermissionSetId(set.key),
          key: set.key,
          title: encodeAuthorizationTitle(set.title),
          grants: JSON.stringify(set.grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
