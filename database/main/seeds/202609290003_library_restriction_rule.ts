import { defineSeed } from '@nocobase/db';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import {
  LIBRARY_NAMESPACE,
  MATERIALS_COLLECTION,
  RECORD_ACCESS_NON_CONFIDENTIAL,
} from '../../../server/library/resources.ts';

/**
 * The reader's confidentiality invariant, persisted as a restriction rule on the whole collection.
 *
 * It narrows every branch that reaches `materials` for 阅读者乙, so an accidentally shared draft can be opened while a
 * confidential document stays invisible even if a sharing grant names it. The rule selects the records still allowed
 * (non-confidential ones) and cannot widen anything; 资料员甲 is not a subject and is unaffected.
 */
const RULE_KEY = 'library-reader-non-confidential';

export default defineSeed({
  name: '202609290003_library_restriction_rule',
  transaction: true,
  async run({ query }) {
    const reader = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', 'yier')
      .executeTakeFirst();
    if (!reader) return;

    const now = new Date();
    const existing = await query
      .selectFrom('authorizationRestrictionRules')
      .select('id')
      .where('key', '=', RULE_KEY)
      .executeTakeFirst();

    if (!existing) {
      await query
        .insertInto('authorizationRestrictionRules')
        .values({
          id: RULE_KEY,
          key: RULE_KEY,
          title: encodeAuthorizationTitle({
            key: 'library.restriction.confidential',
            ns: LIBRARY_NAMESPACE,
          }),
          resourceType: 'database.collection',
          resourceId: MATERIALS_COLLECTION,
          actions: JSON.stringify([
            {
              action: 'read',
              selection: {
                type: 'recordAccess',
                key: RECORD_ACCESS_NON_CONFIDENTIAL,
              },
            },
          ]),
          reason: 'Confidential documents are never readable by readers.',
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const assignment = await query
      .selectFrom('authorizationRestrictionRuleAssignments')
      .select('id')
      .where('restrictionRuleId', '=', RULE_KEY)
      .where('subjectType', '=', 'user')
      .where('subjectId', '=', String(reader.id))
      .executeTakeFirst();
    if (assignment) return;

    await query
      .insertInto('authorizationRestrictionRuleAssignments')
      .values({
        id: crypto.randomUUID(),
        restrictionRuleId: RULE_KEY,
        subjectType: 'user',
        subjectId: String(reader.id),
        createdAt: now,
      })
      .execute();
  },
});
