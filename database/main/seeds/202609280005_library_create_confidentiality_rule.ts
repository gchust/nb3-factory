import { defineSeed } from '@nocobase/db';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';

import {
  LIBRARY_RESOURCE,
  LIBRARY_NAMESPACE,
  READER_SUBJECT_ID,
  READER_SUBJECT_TYPE,
} from '../../../server/library/documents.ts';

/**
 * The confidentiality floor.
 *
 * A Restriction Rule on the reader subject intersects every read with the
 * non-confidential records, whichever grant or Sharing Rule produced the read.
 * It is a rule rather than a wider reader scope so that an ordinary share of a
 * confidential record still cannot cross it.
 *
 * An existing rule is left alone, so an administrator's later edit survives.
 */
const RULE_KEY = 'library-non-confidential';

const seed = defineSeed({
  name: '202609280005_library_create_confidentiality_rule',
  transaction: true,
  async run({ query }) {
    const now = new Date();
    let ruleId: string;
    const existing = await query
      .selectFrom('authorizationRestrictionRules')
      .select('id')
      .where('key', '=', RULE_KEY)
      .executeTakeFirst();
    if (existing) {
      ruleId = String(existing.id);
    } else {
      ruleId = crypto.randomUUID();
      await query
        .insertInto('authorizationRestrictionRules')
        .values({
          id: ruleId,
          key: RULE_KEY,
          title: encodeAuthorizationTitle({
            key: 'library.restrictionRule.nonConfidential',
            ns: LIBRARY_NAMESPACE,
          }),
          resourceType: 'composite',
          resourceId: LIBRARY_RESOURCE,
          actions: JSON.stringify([
            {
              action: 'view',
              scopeKey: 'documents',
              selection: {
                type: 'recordAccess',
                key: 'library.nonConfidential',
              },
            },
          ]),
          reason: '保密资料不因临时共享而暴露。',
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const assigned = await query
      .selectFrom('authorizationRestrictionRuleAssignments')
      .select('id')
      .where('restrictionRuleId', '=', ruleId)
      .where('subjectType', '=', READER_SUBJECT_TYPE)
      .where('subjectId', '=', READER_SUBJECT_ID)
      .executeTakeFirst();
    if (!assigned) {
      await query
        .insertInto('authorizationRestrictionRuleAssignments')
        .values({
          id: crypto.randomUUID(),
          restrictionRuleId: ruleId,
          subjectType: READER_SUBJECT_TYPE,
          subjectId: READER_SUBJECT_ID,
          createdAt: now,
        })
        .execute();
    }
  },
});

export default seed;
