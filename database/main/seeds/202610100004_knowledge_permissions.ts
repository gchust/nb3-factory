import type { PermissionGrant } from '@nocobase/authorization/core';
import { definePermissionSet } from '@nocobase/authorization/permission-sets';
import { defineSeed } from '@nocobase/db';

// Relative imports name the on-disk `.ts` source: the seed loader imports this
// file directly with Node, and the compiler rewrites the extension for the build.
import {
  KNOWLEDGE_PAGES,
  PUBLIC_DOCUMENTS_ACCESS,
  knowledgeDocuments,
} from '../../../server/knowledge-resources.ts';

/**
 * The two business permission sets and their assignments.
 *
 * A set carries the same grants the UI and the assistant check:
 *
 *   knowledge-supervisor  read + manage every document, both pages
 *   knowledge-colleague   read only the public documents, both pages
 *
 * Neither set is `root`, so neither bypasses authorization. The platform's
 * `member` set stays untouched: it is assigned to every authenticated subject
 * by its own seed and carries no grants.
 */
const pageGrant = (id: string): PermissionGrant => ({
  resource: { type: 'page', id },
  actions: [{ action: 'access' }],
});

const readAll = { documents: 'allRecords' } as const;
const readPublic = { documents: PUBLIC_DOCUMENTS_ACCESS } as const;

const supervisorSet = definePermissionSet('knowledge-supervisor')
  .title({ key: 'knowledge.permissionSet.supervisor', ns: 'nb3-factory' })
  .grant(
    knowledgeDocuments.reference().grant({ read: readAll, manage: readAll }),
    pageGrant(KNOWLEDGE_PAGES.assistant),
    pageGrant(KNOWLEDGE_PAGES.documents),
  )
  .build();

const colleagueSet = definePermissionSet('knowledge-colleague')
  .title({ key: 'knowledge.permissionSet.colleague', ns: 'nb3-factory' })
  .grant(
    knowledgeDocuments.reference().grant({ read: readPublic }),
    pageGrant(KNOWLEDGE_PAGES.assistant),
    pageGrant(KNOWLEDGE_PAGES.documents),
  )
  .build();

const sets = [
  { set: supervisorSet, username: 'knowledge.supervisor' },
  { set: colleagueSet, username: 'knowledge.colleague' },
] as const;

export default defineSeed({
  name: '202610100004_knowledge_permissions',
  async run({ query }) {
    for (const { set, username } of sets) {
      const existingSet = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', set.key)
        .executeTakeFirst();
      if (!existingSet) {
        const now = new Date();
        await query
          .insertInto('authorizationPermissionSets')
          .values({
            id: crypto.randomUUID(),
            key: set.key,
            title: JSON.stringify(set.title),
            grants: JSON.stringify(set.grants),
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }

      const user = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', username)
        .executeTakeFirst();
      if (!user) {
        continue;
      }

      const assignmentId = `user:${String(user.id)}:${set.key}`;
      const existingAssignment = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('id', '=', assignmentId)
        .executeTakeFirst();
      if (!existingAssignment) {
        const now = new Date();
        await query
          .insertInto('authorizationPermissionSetAssignments')
          .values({
            id: assignmentId,
            subjectType: 'user',
            subjectId: user.id,
            permissionSetKey: set.key,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }
    }
  },
});
