import { createHash } from 'node:crypto';

import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { defineSeed } from '@nocobase/db';

import { libraryReaderRestriction } from '../../seed-data/library-restriction-rule.ts';
import { READER_ACCOUNT } from '../../../server/library/seed-data.ts';

/**
 * A stable id derived from what it identifies, shaped as a UUID. The store generates a random one
 * for an assignment created through the API; a seeded id has to be reproducible instead, and it has
 * to fit the assignment's `id` column, which is narrower than the sentence it would otherwise spell
 * out.
 */
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

/**
 * 乙's confidentiality restriction rule and its assignment.
 *
 * Idempotent by the rule key and by the assigned subject. The rule's actions are
 * stored the way the Restriction Rules store writes them — a JSON array of
 * `{ action, scopeKey, selection }` — and the subject names the reader by user
 * id, so the rule keeps holding whichever set later grants the action.
 */
export default defineSeed({
  name: '202610070005_library_restriction_rule',
  async run({ query }) {
    const reader = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', READER_ACCOUNT.username)
      .executeTakeFirst();
    if (!reader) return;

    const readerId = String(reader.id);
    const rule = libraryReaderRestriction(readerId);
    const now = new Date();

    const existingRule = await query
      .selectFrom('authorizationRestrictionRules')
      .select('id')
      .where('key', '=', rule.key)
      .executeTakeFirst();

    const ruleId = existingRule ? String(existingRule.id) : rule.key;
    if (!existingRule) {
      await query
        .insertInto('authorizationRestrictionRules')
        .values({
          id: ruleId,
          key: rule.key,
          title: encodeAuthorizationTitle(rule.title),
          resourceType: rule.resource.type,
          resourceId: rule.resource.id,
          actions: JSON.stringify(rule.actions),
          reason: rule.reason,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const assignmentId = stableAssignmentId(ruleId, readerId);
    const existingAssignment = await query
      .selectFrom('authorizationRestrictionRuleAssignments')
      .select('id')
      .where('restrictionRuleId', '=', ruleId)
      .where('subjectId', '=', readerId)
      .executeTakeFirst();
    if (existingAssignment) return;

    await query
      .insertInto('authorizationRestrictionRuleAssignments')
      .values({
        id: assignmentId,
        restrictionRuleId: ruleId,
        subjectType: 'user',
        subjectId: readerId,
        createdAt: now,
      })
      .execute();
  },
});
