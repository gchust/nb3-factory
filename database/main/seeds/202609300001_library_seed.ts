import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

import {
  libraryEditorPermissionSet,
  libraryReaderPermissionSet,
} from '../../seed-data/library-permission-sets.ts';

/**
 * Initial data for the one-page library: two known test accounts, the two job
 * Permission Sets, the by-default readable baseline, the reader's confidential
 * restriction, a sharing rule that exposes confidential C, and three sample
 * records. No rule shares private draft D: the reader cannot see D until an
 * administrator creates a sharing rule for it at runtime. The C sharing rule is
 * seeded deliberately so the delivered state proves the restriction outranks
 * another sharing source.
 *
 * The seed is idempotent by logical key, so re-running it preserves an
 * administrator's later edits instead of overwriting them. It writes
 * documented persistence rows directly (a seed's restricted connection exposes
 * no runtime authorization service), and keeps every declaration here rather
 * than importing evolving collection or model code.
 */

const EDITOR_USER_ID = 'library-editor-a';
const READER_USER_ID = 'library-reader-b';
const TEST_PASSWORD = 'library123';

const PUBLIC_MATERIAL_ID = 'library-public-p';
const DRAFT_MATERIAL_ID = 'library-draft-d';
const CONFIDENTIAL_MATERIAL_ID = 'library-confidential-c';

interface SeedQuery {
  selectFrom(table: string): {
    select(column: string): {
      where(
        column: string,
        operator: string,
        value: unknown,
      ): {
        executeTakeFirst(): Promise<unknown>;
      };
    };
  };
  insertInto(table: string): {
    values(value: Record<string, unknown>): { execute(): Promise<unknown> };
  };
}

async function idExists(
  query: SeedQuery,
  table: string,
  column: string,
  value: unknown,
): Promise<boolean> {
  const row = await query
    .selectFrom(table)
    .select('id')
    .where(column, '=', value)
    .executeTakeFirst();
  return row !== undefined;
}

const seed = defineSeed({
  name: '202609300001_library_seed',
  transaction: true,
  async run({ query: rawQuery }) {
    const query = rawQuery as unknown as SeedQuery;
    const now = new Date();

    // --- Test accounts -----------------------------------------------------
    const passwordHash = await hashPassword(TEST_PASSWORD);
    const accounts = [
      {
        id: EDITOR_USER_ID,
        name: 'Library Editor A',
        username: 'librarian.a',
        email: 'librarian.a@example.com',
      },
      {
        id: READER_USER_ID,
        name: 'Library Reader B',
        username: 'reader.b',
        email: 'reader.b@example.com',
      },
    ];
    for (const account of accounts) {
      if (await idExists(query, 'user', 'id', account.id)) {
        continue;
      }
      await query
        .insertInto('user')
        .values({
          id: account.id,
          name: account.name,
          username: account.username,
          email: account.email,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await query
        .insertInto('account')
        .values({
          id: `account-${account.id}`,
          accountId: account.id,
          providerId: 'credential',
          userId: account.id,
          password: passwordHash,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    // --- Permission Sets and their assignments -----------------------------
    const permissionSets = [
      { set: libraryEditorPermissionSet, subject: EDITOR_USER_ID },
      { set: libraryReaderPermissionSet, subject: READER_USER_ID },
    ];
    for (const { set, subject } of permissionSets) {
      if (
        await idExists(query, 'authorizationPermissionSets', 'key', set.key)
      ) {
        continue;
      }
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: set.key,
          key: set.key,
          title: encodeAuthorizationTitle(set.title),
          grants: JSON.stringify(set.grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: `assignment-${set.key}-${subject}`,
          subjectType: 'user',
          subjectId: subject,
          permissionSetKey: set.key,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    // --- Default Access: published, non-confidential materials for viewers --
    if (
      !(await idExists(
        query,
        'authorizationDefaultAccessRules',
        'resourceId',
        'library.materials',
      ))
    ) {
      await query
        .insertInto('authorizationDefaultAccessRules')
        .values({
          id: 'library-default-view',
          resourceType: 'resource',
          resourceId: 'library.materials',
          actions: JSON.stringify([
            {
              action: 'view',
              scopeKey: 'materials',
              scope: {
                type: 'database',
                recordAccess: 'library.public',
              },
            },
          ]),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    // --- Restriction: the reader never sees confidential materials ---------
    if (
      !(await idExists(
        query,
        'authorizationRestrictionRules',
        'key',
        'library-hide-confidential',
      ))
    ) {
      await query
        .insertInto('authorizationRestrictionRules')
        .values({
          id: 'library-hide-confidential',
          key: 'library-hide-confidential',
          title: encodeAuthorizationTitle('Hide confidential materials'),
          resourceType: 'resource',
          resourceId: 'library.materials',
          actions: JSON.stringify([
            {
              action: 'view',
              scopeKey: 'materials',
              scope: {
                type: 'database',
                recordAccess: 'library.nonConfidential',
              },
            },
          ]),
          reason: 'Confidential materials are never shown to readers.',
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await query
        .insertInto('authorizationRestrictionRuleAssignments')
        .values({
          id: 'library-hide-confidential-reader-b',
          restrictionRuleId: 'library-hide-confidential',
          subjectType: 'user',
          subjectId: READER_USER_ID,
          createdAt: now,
        })
        .execute();
    }

    // --- Sharing: expose confidential C so the restriction can be shown to
    // --- outrank another sharing source. Private draft D is deliberately not
    // --- shared: an administrator opens it at runtime.
    const confidentialSharingRule = {
      id: 'library-share-confidential-c',
      key: 'library-share-confidential-c',
      title: 'Share confidential C',
    };
    if (
      !(await idExists(
        query,
        'authorizationSharingRules',
        'key',
        confidentialSharingRule.key,
      ))
    ) {
      await query
        .insertInto('authorizationSharingRules')
        .values({
          id: confidentialSharingRule.id,
          key: confidentialSharingRule.key,
          title: encodeAuthorizationTitle(confidentialSharingRule.title),
          resourceType: 'resource',
          resourceId: 'library.materials',
          actions: JSON.stringify([
            {
              action: 'view',
              scopeKey: 'materials',
              selection: { type: 'records', ids: [CONFIDENTIAL_MATERIAL_ID] },
            },
          ]),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await query
        .insertInto('authorizationSharingRuleAssignments')
        .values({
          id: `${confidentialSharingRule.id}-reader-b`,
          sharingRuleId: confidentialSharingRule.id,
          subjectType: 'user',
          subjectId: READER_USER_ID,
          createdAt: now,
        })
        .execute();
    }

    // --- Sample records ----------------------------------------------------
    const materials = [
      {
        id: PUBLIC_MATERIAL_ID,
        title: 'Public material P',
        body: 'Published and not confidential.',
        published: true,
        confidential: false,
      },
      {
        id: DRAFT_MATERIAL_ID,
        title: 'Private draft D',
        body: 'Unpublished draft owned by A.',
        published: false,
        confidential: false,
      },
      {
        id: CONFIDENTIAL_MATERIAL_ID,
        title: 'Confidential material C',
        body: 'Confidential and invisible to the reader.',
        published: false,
        confidential: true,
      },
    ];
    for (const material of materials) {
      if (await idExists(query, 'materials', 'id', material.id)) {
        continue;
      }
      await query
        .insertInto('materials')
        .values({
          id: material.id,
          title: material.title,
          body: material.body,
          ownerId: EDITOR_USER_ID,
          published: material.published,
          confidential: material.confidential,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
