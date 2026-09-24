import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { defineMigration } from '@nocobase/db';

// The first released seed opened private draft D to the reader with a sharing
// rule. The delivered default must not do that: an administrator shares the
// draft at runtime, and before that the reader sees only the public material.
// The seed no longer writes that row; this migration removes it from a database
// that already received the old initial state.
//
// The confidential C sharing rule is intentionally left in place: it exists so
// the restriction rule can be seen to outrank another sharing source, and it
// never exposes C. This is a data migration only, so it declares the row it
// touches by its stable key rather than reading any evolving Collection.
const DRAFT_SHARING_RULE_ID = 'library-share-draft-d';

const migration = defineMigration({
  name: '202609300002_remove_default_draft_sharing',
  transaction: true,
  // The sharing tables belong to the authorization sharing-rules plugin, so
  // they are only present when that plugin is registered. A database without
  // them (an embedded runtime that loads no plugins, or an application that
  // never enabled sharing) has nothing to clean up, so the migration is
  // inapplicable and stays unrecorded instead of failing on a missing table.
  async shouldRun({ builder }) {
    return (
      (await builder.hasCollection('authorizationSharingRules')) &&
      (await builder.hasCollection('authorizationSharingRuleAssignments'))
    );
  },
  async up({ query }) {
    await query
      .deleteFrom('authorizationSharingRuleAssignments')
      .where('sharingRuleId', '=', DRAFT_SHARING_RULE_ID)
      .execute();
    await query
      .deleteFrom('authorizationSharingRules')
      .where('id', '=', DRAFT_SHARING_RULE_ID)
      .execute();
  },
  async down({ query }) {
    const now = new Date();
    await query
      .insertInto('authorizationSharingRules')
      .values({
        id: DRAFT_SHARING_RULE_ID,
        key: DRAFT_SHARING_RULE_ID,
        title: encodeAuthorizationTitle('Share private draft D'),
        resourceType: 'resource',
        resourceId: 'library.materials',
        actions: JSON.stringify([
          {
            action: 'view',
            scopeKey: 'materials',
            selection: { type: 'records', ids: ['library-draft-d'] },
          },
        ]),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await query
      .insertInto('authorizationSharingRuleAssignments')
      .values({
        id: `${DRAFT_SHARING_RULE_ID}-reader-b`,
        sharingRuleId: DRAFT_SHARING_RULE_ID,
        subjectType: 'user',
        subjectId: 'library-reader-b',
        createdAt: now,
      })
      .execute();
  },
});

export default migration;
