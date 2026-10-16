import { createHash } from 'node:crypto';

import { defineSeed } from '@nocobase/db';

/**
 * 阅读者乙's confidentiality Restriction Rule and its assignment.
 *
 * A Restriction Rule intersects every other source of access, so it is what
 * makes "a confidential document never reaches a reader" hold even after an
 * administrator shares one by mistake: a Sharing Rule widens a data scope and
 * this rule then narrows the result. 资料员甲 is not named as a subject, so its
 * own reading of a confidential document is untouched — that is why the rule is
 * assigned to one user rather than written against everyone.
 *
 * The rule's actions are stored the way the Restriction Rules store writes them
 * — a JSON array of `{ action, scopeKey, selection }` — instead of importing the
 * evolving composite definition, and the subject names 乙 by user id, so the
 * rule keeps holding whichever Permission Set later grants the action. It is
 * idempotent by the rule key and by the assigned subject.
 */

/** The composite resource `server/library/authorization.ts` registers at boot. */
const LIBRARY_RESOURCE = 'library.documents';
/** The one data scope key the resource binds documents under. */
const LIBRARY_SCOPE = 'documents';
/** The rule's stable key, also its resource-unique identity. */
const RESTRICTION_KEY = 'library.reader.notConfidential';
/** The record access that selects everything not marked confidential. */
const NOT_CONFIDENTIAL_RECORD_ACCESS = 'library.notConfidential';

/** The actions the rule narrows: reading documents, and nothing else. */
const CATEGORY_ACTIONS = [
  {
    action: 'view',
    scopeKey: LIBRARY_SCOPE,
    selection: { type: 'recordAccess', key: NOT_CONFIDENTIAL_RECORD_ACCESS },
  },
];

/** A reproducible uuid-shaped id derived from what it identifies. */
function stableAssignmentId(ruleId: string, subjectId: string): string {
  const hex = createHash('sha256')
    .update(`restriction-assignment:${ruleId}:user:${subjectId}`)
    .digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

export default defineSeed({
  name: '202610150005_library_restriction_rule',
  async run({ query }) {
    const reader = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', 'duzhe')
      .executeTakeFirst();
    if (!reader) return;

    const readerId = String(reader.id);
    const now = new Date();

    const existingRule = await query
      .selectFrom('authorizationRestrictionRules')
      .select('id')
      .where('key', '=', RESTRICTION_KEY)
      .executeTakeFirst();

    const ruleId = existingRule ? String(existingRule.id) : RESTRICTION_KEY;
    if (!existingRule) {
      await query
        .insertInto('authorizationRestrictionRules')
        .values({
          id: ruleId,
          key: RESTRICTION_KEY,
          title: JSON.stringify(
            'Confidential documents stay hidden from readers',
          ),
          resourceType: 'composite',
          resourceId: LIBRARY_RESOURCE,
          actions: JSON.stringify(CATEGORY_ACTIONS),
          reason:
            'A confidential document stays hidden from a reader even when it is shared by mistake.',
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const existingAssignment = await query
      .selectFrom('authorizationRestrictionRuleAssignments')
      .select('id')
      .where('restrictionRuleId', '=', ruleId)
      .where('subjectType', '=', 'user')
      .where('subjectId', '=', readerId)
      .executeTakeFirst();
    if (existingAssignment) return;

    await query
      .insertInto('authorizationRestrictionRuleAssignments')
      .values({
        id: stableAssignmentId(ruleId, readerId),
        restrictionRuleId: ruleId,
        subjectType: 'user',
        subjectId: readerId,
        createdAt: now,
      })
      .execute();
  },
});
