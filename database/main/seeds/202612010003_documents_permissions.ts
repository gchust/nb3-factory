import { randomUUID } from 'node:crypto';

import { defineSeed } from '@nocobase/db';
import {
  encodeAuthorizationTitle,
  selection,
  type AuthorizationTitle,
} from '@nocobase/authorization/core';
import { defineRestrictionRule } from '@nocobase/authorization/restriction-rules';

import { DEMO_USERS } from '../../seed-data/documents.ts';
import { DOCUMENTS_SCOPE } from '../../../server/documents/constants.ts';
import {
  documents,
  documentsEditor,
  documentsReader,
  label,
  nonConfidentialDocuments,
  publicDocumentsAccessRule,
} from '../../../server/documents/resources.ts';

function encodedTitle(title: AuthorizationTitle | undefined): string | null {
  return title === undefined ? null : encodeAuthorizationTitle(title);
}

/** Installs the editor/reader permission sets and the two record-level rules. */
export default defineSeed({
  name: '202612010003_documents_permissions',

  run: async (context) => {
    const { query } = context;
    const users = await query
      .selectFrom('user')
      .select(['id', 'username'])
      .where('username', 'in', [
        DEMO_USERS.editor.username,
        DEMO_USERS.reader.username,
      ])
      .execute();
    const editor = users.find(
      (user) => user.username === DEMO_USERS.editor.username,
    );
    const reader = users.find(
      (user) => user.username === DEMO_USERS.reader.username,
    );
    if (!editor || !reader) {
      throw new Error(
        'The documents permissions seed requires the editor and reader accounts.',
      );
    }

    const now = new Date();

    for (const set of [documentsEditor, documentsReader]) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('id')
        .where('key', '=', set.key)
        .executeTakeFirst();
      if (!existing) {
        await query
          .insertInto('authorizationPermissionSets')
          .values({
            id: randomUUID(),
            key: set.key,
            title: encodedTitle(set.title),
            grants: JSON.stringify(set.grants),
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }
    }

    for (const [user, permissionSetKey] of [
      [editor, documentsEditor.key],
      [reader, documentsReader.key],
    ] as const) {
      const existing = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('subjectType', '=', 'user')
        .where('subjectId', '=', String(user.id))
        .where('permissionSetKey', '=', permissionSetKey)
        .executeTakeFirst();
      if (!existing) {
        await query
          .insertInto('authorizationPermissionSetAssignments')
          .values({
            id: randomUUID(),
            subjectType: 'user',
            subjectId: String(user.id),
            permissionSetKey,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }
    }

    const defaultRuleExists = await query
      .selectFrom('authorizationDefaultAccessRules')
      .select('id')
      .where('key', '=', publicDocumentsAccessRule.key)
      .executeTakeFirst();
    if (!defaultRuleExists) {
      await query
        .insertInto('authorizationDefaultAccessRules')
        .values({
          id: randomUUID(),
          key: publicDocumentsAccessRule.key,
          resourceType: publicDocumentsAccessRule.resource.type,
          resourceId: publicDocumentsAccessRule.resource.id,
          actions: JSON.stringify(publicDocumentsAccessRule.actions),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const restriction = defineRestrictionRule(
      'documents-confidential-reader',
      documents.reference(),
    )
      .scope(
        'view',
        DOCUMENTS_SCOPE,
        selection.recordAccess(nonConfidentialDocuments.reference().key),
      )
      .title(label('documents.restriction.confidentialTitle'))
      .subjects({ type: 'user', id: String(reader.id) })
      .reason('Confidential documents must never reach this reader.')
      .build();

    const restrictionRow = await query
      .selectFrom('authorizationRestrictionRules')
      .select('id')
      .where('key', '=', restriction.key)
      .executeTakeFirst();
    if (!restrictionRow) {
      const restrictionId = randomUUID();
      await query
        .insertInto('authorizationRestrictionRules')
        .values({
          id: restrictionId,
          key: restriction.key,
          title: encodedTitle(restriction.title),
          resourceType: restriction.resource.type,
          resourceId: restriction.resource.id,
          actions: JSON.stringify(restriction.actions),
          reason: restriction.reason ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      for (const subject of restriction.subjects) {
        await query
          .insertInto('authorizationRestrictionRuleAssignments')
          .values({
            id: randomUUID(),
            restrictionRuleId: restrictionId,
            subjectType: subject.type,
            subjectId: subject.id,
            createdAt: now,
          })
          .execute();
      }
    }
  },
});
