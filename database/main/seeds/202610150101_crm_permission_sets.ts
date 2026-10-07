import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { defineSeed } from '@nocobase/db';

import { crmSales, crmSalesManager } from '../../seed-data/permission-sets.ts';

/**
 * Installs the two CRM permission sets. An administrator can rename, edit or
 * delete them afterwards; this seed only creates what is missing so a later
 * run never overwrites a decision made in the authorization workspace.
 */
export default defineSeed({
  name: '202610150101_crm_permission_sets',
  async run({ query }) {
    const now = new Date().toISOString();

    for (const set of [crmSales, crmSalesManager]) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', set.key)
        .limit(1)
        .executeTakeFirst();

      if (existing) {
        continue;
      }

      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: set.key,
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
