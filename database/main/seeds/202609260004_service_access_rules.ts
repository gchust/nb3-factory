import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { defineSeed } from '@nocobase/db';

import { asText } from '../../../server/service/text.ts';

import {
  serviceDefaultAccessRules,
  serviceRestrictionRules,
} from '../../seed-data/access-rules.ts';

/**
 * Persists the authorization baselines. The restriction rule is assigned to
 * the demonstration engineers, who are the only holders of the `share` action,
 * so it applies to whoever could hand a work order on.
 */
export default defineSeed({
  name: '202609260004_service_access_rules',
  transaction: true,
  async run(context) {
    const now = new Date();
    const defaultRules = context.repository('authorizationDefaultAccessRules');
    for (const rule of serviceDefaultAccessRules) {
      const existing = await defaultRules.findOne({
        filter: { key: rule.key },
      });
      if (existing) {
        continue;
      }
      await defaultRules.createOne({
        values: {
          id: rule.key,
          key: rule.key,
          resourceType: rule.resource.type,
          resourceId: rule.resource.id,
          actions: JSON.stringify(rule.actions),
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    const restrictionRules = context.repository(
      'authorizationRestrictionRules',
    );
    const restrictionAssignments = context.repository(
      'authorizationRestrictionRuleAssignments',
    );
    const users = context.repository('user');

    for (const rule of serviceRestrictionRules) {
      let ruleId = rule.key;
      const existing = await restrictionRules.findOne({
        filter: { key: rule.key },
      });
      if (existing) {
        ruleId = asText(existing.id);
      } else {
        await restrictionRules.createOne({
          values: {
            id: ruleId,
            key: rule.key,
            title: encodeAuthorizationTitle(rule.title),
            resourceType: rule.resource.type,
            resourceId: rule.resource.id,
            actions: JSON.stringify(rule.actions),
            reason: rule.reason,
            createdAt: now,
            updatedAt: now,
          },
        });
      }

      for (const email of [
        'engineer.a@service.local',
        'engineer.b@service.local',
      ]) {
        const user = await users.findOne({ filter: { email } });
        if (!user) {
          continue;
        }
        const subjectId = asText(user.id);
        const assigned = await restrictionAssignments.findOne({
          filter: {
            restrictionRuleId: ruleId,
            subjectType: 'user',
            subjectId,
          },
        });
        if (!assigned) {
          await restrictionAssignments.createOne({
            values: {
              id: `${rule.key}-${subjectId}`,
              restrictionRuleId: ruleId,
              subjectType: 'user',
              subjectId,
              createdAt: now,
            },
          });
        }
      }
    }
  },
});
