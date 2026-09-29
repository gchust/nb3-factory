import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { defineSeed } from '@nocobase/db';

import { asText } from '../../../server/service/text.ts';
import { SERVICE_PERMISSION_SETS } from '../../../server/service/constants.ts';

import { servicePermissionSets } from '../../seed-data/permission-sets.ts';
import { TEST_ACCOUNTS } from '../../seed-data/test-accounts.ts';

interface StoredGrant {
  resource?: { type?: string; id?: string };
  actions?: Array<{ action?: string }>;
}

/** Read a stored grants value however the column happens to serialize it. */
function normaliseGrants(value: unknown): StoredGrant[] {
  if (Array.isArray(value)) {
    return value as StoredGrant[];
  }
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as StoredGrant[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Persists the initial job permission sets, assigns them to the demonstration
 * accounts, and records the engineer team groups. Each write is skipped when
 * the row already exists, so an administrator's later edits survive a re-run.
 */
export default defineSeed({
  name: '202609260002_service_permissions',
  transaction: true,
  async run(context) {
    const sets = context.repository('authorizationPermissionSets');
    for (const set of servicePermissionSets) {
      const existing = await sets.findOne({ filter: { key: set.key } });
      if (existing) {
        // Permission sets are administrator-editable, so an existing one is left
        // alone — with two exceptions for grants the account cannot work
        // without. The integration set is replaced once when its required device
        // list or api-keys page grant changed. The supervisor set gains the
        // Scheduler page grant additively, so the supervisor can inspect and run
        // the two business schedules without losing any administrator edit.
        if (set.key === SERVICE_PERMISSION_SETS.integration) {
          const grants = JSON.stringify(set.grants);
          const current =
            typeof existing.grants === 'string'
              ? existing.grants
              : JSON.stringify(existing.grants ?? []);
          if (current !== grants) {
            await sets.updateOne({
              filter: { key: set.key },
              values: { grants, updatedAt: new Date() },
            });
          }
        } else if (set.key === SERVICE_PERMISSION_SETS.supervisor) {
          const current = normaliseGrants(existing.grants);
          const hasScheduler = current.some(
            (grant) =>
              grant?.resource?.type === 'page' &&
              grant.resource.id === 'scheduler.schedules',
          );
          if (!hasScheduler) {
            current.push({
              resource: { type: 'page', id: 'scheduler.schedules' },
              actions: [{ action: 'access' }],
            });
            await sets.updateOne({
              filter: { key: set.key },
              values: {
                grants: JSON.stringify(current),
                updatedAt: new Date(),
              },
            });
          }
        }
        continue;
      }
      const now = new Date();
      await sets.createOne({
        values: {
          id: set.key,
          key: set.key,
          title: encodeAuthorizationTitle(set.title),
          grants: JSON.stringify(set.grants),
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    const users = context.repository('user');
    const assignments = context.repository(
      'authorizationPermissionSetAssignments',
    );
    const members = context.repository('serviceTeamMembers');

    for (const account of TEST_ACCOUNTS) {
      const user = await users.findOne({ filter: { email: account.email } });
      if (!user) {
        continue;
      }
      const userId = asText(user.id);

      const assigned = await assignments.findOne({
        filter: {
          permissionSetKey: account.permissionSet,
          subjectType: 'user',
          subjectId: userId,
        },
      });
      if (!assigned) {
        const now = new Date();
        await assignments.createOne({
          values: {
            id: `service-${account.key}-set`,
            permissionSetKey: account.permissionSet,
            subjectType: 'user',
            subjectId: userId,
            createdAt: now,
            updatedAt: now,
          },
        });
      }

      if (account.teamGroup) {
        const member = await members.findOne({ filter: { userId } });
        if (!member) {
          const now = new Date();
          await members.createOne({
            values: {
              userId,
              groupName: account.teamGroup,
              displayName: account.displayName ?? account.name,
              createdAt: now,
              updatedAt: now,
            },
          });
        }
      }
    }
  },
});
