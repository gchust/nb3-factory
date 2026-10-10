import { defineSeed } from '@nocobase/db';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';

/**
 * The confidentiality invariant: for `阅读者乙`, only non-confidential records
 * are ever reached by the library's view/edit/delete actions. A restriction
 * narrows the union of grants, sharing rules and default access, so a
 * document shared with 乙 while `confidential` is true still does not appear.
 * `资料员甲` and the administrator are not subjects of this rule and keep their
 * access.
 *
 * The resource identity is spelled out here rather than imported from the
 * runtime declarations on purpose: seeds are run both from source (under Node's
 * native TypeScript loader, which resolves only the specifiers that literally
 * exist on disk) and from the compiled output, and a seed is a snapshot that
 * must not change meaning when another file does. Keep it self-contained.
 */
const RULE_KEY = 'library.nonConfidential';
const LIBRARY_RESOURCE_ID = 'library.documents';
const LIBRARY_DOCUMENTS_COLLECTION = 'libraryDocuments';
const LIBRARY_READER_ACCOUNT_ID = '10000000-0000-4000-8000-000000000002';

const seed = defineSeed({
  name: '202609210004_library_restrictions',
  async run({ query }) {
    const now = new Date();

    const actions = ['view', 'edit', 'delete'].map((action) => ({
      action,
      scopeKey: LIBRARY_DOCUMENTS_COLLECTION,
      selection: { type: 'recordAccess', key: 'library.nonConfidential' },
    }));

    let rule = await query
      .selectFrom('authorizationRestrictionRules')
      .select('id')
      .where('key', '=', RULE_KEY)
      .executeTakeFirst();

    if (!rule) {
      const id = crypto.randomUUID();
      await query
        .insertInto('authorizationRestrictionRules')
        .values({
          id,
          key: RULE_KEY,
          title: encodeAuthorizationTitle({
            key: 'library.restriction.nonConfidential',
            ns: 'nb3-factory',
          }),
          resourceType: 'composite',
          resourceId: LIBRARY_RESOURCE_ID,
          actions: JSON.stringify(actions),
          reason:
            '保密资料对所有读者都不可见，无论是否被共享；仅管理员与资料拥有者例外。',
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      rule = { id };
    }

    const ruleId = String(rule.id);
    const assignmentId = `user:${LIBRARY_READER_ACCOUNT_ID}:${RULE_KEY}`;
    const existing = await query
      .selectFrom('authorizationRestrictionRuleAssignments')
      .select('id')
      .where('id', '=', assignmentId)
      .executeTakeFirst();
    if (existing) return;

    await query
      .insertInto('authorizationRestrictionRuleAssignments')
      .values({
        id: assignmentId,
        restrictionRuleId: ruleId,
        subjectType: 'user',
        subjectId: LIBRARY_READER_ACCOUNT_ID,
        createdAt: now,
      })
      .execute();
  },
});

export default seed;
