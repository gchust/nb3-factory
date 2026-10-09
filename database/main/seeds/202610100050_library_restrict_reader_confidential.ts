import { defineSeed } from '@nocobase/db';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';

const RULE_KEY = 'library.reader.hide-confidential';

/**
 * Restricts 阅读者乙 to non-confidential documents for the library `view`
 * action. Restriction rules intersect with every grant, so this also removes a
 * confidential document that a sharing rule mistakenly opened. 资料员甲 has no
 * such rule, so their own access is unaffected.
 */
const seed = defineSeed({
  name: '202610100050_library_restrict_reader_confidential',
  async run({ query }) {
    const reader = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', 'reader')
      .executeTakeFirst();
    if (!reader) {
      return;
    }
    const existing = await query
      .selectFrom('authorizationRestrictionRules')
      .select('id')
      .where('key', '=', RULE_KEY)
      .executeTakeFirst();
    if (existing) {
      return;
    }
    const now = new Date();
    const ruleId = crypto.randomUUID();
    await query
      .insertInto('authorizationRestrictionRules')
      .values({
        id: ruleId,
        key: RULE_KEY,
        title: encodeAuthorizationTitle({
          key: 'library.restriction.hideConfidential',
          ns: 'nb3-factory',
        }),
        resourceType: 'composite',
        resourceId: 'library.documents',
        actions: JSON.stringify([
          {
            action: 'view',
            scopeKey: 'documents',
            selection: { type: 'recordAccess', key: 'library.nonConfidential' },
          },
        ]),
        reason: '保密资料不向阅读者开放。',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await query
      .insertInto('authorizationRestrictionRuleAssignments')
      .values({
        id: crypto.randomUUID(),
        restrictionRuleId: ruleId,
        subjectType: 'user',
        subjectId: String(reader.id),
        createdAt: now,
      })
      .execute();
  },
});

export default seed;
