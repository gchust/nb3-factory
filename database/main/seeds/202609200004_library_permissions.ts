import { defineSeed } from '@nocobase/db';

/** Must match the users and documents seeds. */
const EDITOR_USER_ID = '11111111-1111-4111-8111-111111111111';
const READER_USER_ID = '22222222-2222-4222-8222-222222222222';

const EDITOR_SET = 'library-editor';
const READER_SET = 'library-reader';
const RESTRICTION_RULE_ID = 'library-reader-confidential';
const NS = 'nb3-factory';

/**
 * The library permission model:
 *
 * - `library-editor` (资料员甲): may maintain documents, but only sees rows its
 *   `library.visible` record access selects — its own drafts plus every
 *   published, non-confidential document — and edits or deletes only its own.
 * - `library-reader` (阅读者乙): read-only. `read` is the only granted action,
 *   so the reader can never create, update or delete a document.
 * - A restriction rule on 乙 narrows every `read` of `documents` to
 *   non-confidential rows. It intersects with the reader's positive access, so
 *   a confidential document stays hidden even when an administrator shares it.
 */
const seed = defineSeed({
  name: '202609200004_library_permissions',
  async run({ query }) {
    const now = new Date();

    const grant = (actions: readonly Record<string, unknown>[]): unknown[] => [
      {
        resource: { type: 'page', id: 'library.documents' },
        actions: [{ action: 'access' }],
      },
      {
        resource: { type: 'database.collection', id: 'documents' },
        actions,
      },
    ];

    const editorGrants = grant([
      {
        action: 'read',
        policy: {
          type: 'database',
          fields: '*',
          recordAccess: ['library.visible'],
        },
      },
      {
        action: 'create',
        policy: {
          type: 'database',
          // The two timestamps are in the allowlist because the application
          // assigns them itself; the collection does not manage them.
          fields: [
            'title',
            'content',
            'published',
            'confidential',
            'ownerId',
            'createdAt',
            'updatedAt',
          ],
        },
      },
      {
        action: 'update',
        policy: {
          type: 'database',
          fields: [
            'title',
            'content',
            'published',
            'confidential',
            'updatedAt',
          ],
          recordAccess: ['recordsIOwn'],
        },
      },
      {
        action: 'delete',
        policy: {
          type: 'database',
          recordAccess: ['recordsIOwn'],
        },
      },
    ]);

    const readerGrants = grant([
      {
        action: 'read',
        policy: {
          type: 'database',
          fields: '*',
          recordAccess: ['library.readable'],
        },
      },
    ]);

    const permissionSet = async (
      key: string,
      titleKey: string,
      grants: unknown[],
    ): Promise<void> => {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('id')
        .where('key', '=', key)
        .executeTakeFirst();
      if (existing) return;
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: key,
          key,
          title: JSON.stringify({ key: titleKey, ns: NS }),
          grants: JSON.stringify(grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    };

    await permissionSet(
      EDITOR_SET,
      'library.permissionSets.editor',
      editorGrants,
    );
    await permissionSet(
      READER_SET,
      'library.permissionSets.reader',
      readerGrants,
    );

    const assignment = async (
      userId: string,
      permissionSetKey: string,
    ): Promise<void> => {
      const id = `user:${userId}:${permissionSetKey}`;
      const existing = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();
      if (existing) return;
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id,
          subjectType: 'user',
          subjectId: userId,
          permissionSetKey,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    };

    await assignment(EDITOR_USER_ID, EDITOR_SET);
    await assignment(READER_USER_ID, READER_SET);

    const existingRule = await query
      .selectFrom('authorizationRestrictionRules')
      .select('id')
      .where('key', '=', RESTRICTION_RULE_ID)
      .executeTakeFirst();
    if (!existingRule) {
      await query
        .insertInto('authorizationRestrictionRules')
        .values({
          id: RESTRICTION_RULE_ID,
          key: RESTRICTION_RULE_ID,
          title: JSON.stringify({
            key: 'library.restrictionRules.readerConfidential',
            ns: NS,
          }),
          resourceType: 'database.collection',
          resourceId: 'documents',
          actions: JSON.stringify([
            {
              action: 'read',
              selection: {
                type: 'recordAccess',
                key: 'library.nonConfidential',
              },
            },
          ]),
          reason: '保密资料不向阅读者开放',
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await query
        .insertInto('authorizationRestrictionRuleAssignments')
        .values({
          id: `${RESTRICTION_RULE_ID}:${READER_USER_ID}`,
          restrictionRuleId: RESTRICTION_RULE_ID,
          subjectType: 'user',
          subjectId: READER_USER_ID,
          createdAt: now,
        })
        .execute();
    }
  },
});

export default seed;
