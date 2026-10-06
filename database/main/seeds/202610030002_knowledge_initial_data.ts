import { defineSeed, type SeedContext } from '@nocobase/db';
import type { PermissionGrant } from '@nocobase/authorization/core';
import { hashPassword } from 'better-auth/crypto';
import {
  KNOWLEDGE_COLLEAGUE_SET,
  KNOWLEDGE_MATERIALS,
  KNOWLEDGE_SUPERVISOR_SET,
  KNOWLEDGE_USERS,
  knowledgeColleagueGrants,
  knowledgeSupervisorGrants,
  type KnowledgeFixtureUser,
} from '../../seed-data/knowledge.ts';

/**
 * Installation data for the read-only knowledge assistant: the three fixed materials, the two isolated test accounts,
 * and the two permission sets whose grants are what decide which materials each of them may read.
 *
 * Idempotent by construction. Every row is inserted only when its key is absent, so applying the seed twice changes
 * nothing, and a material a supervisor has since edited is never reset to its original text — the requirement is that
 * a corrected material stays corrected, including across a redeployment that runs the seed again.
 *
 * The grants are built by the feature's own composite resource rather than written by hand, so what is stored expands
 * against the definition the server registers; a grant the server cannot expand would be refused at startup. The
 * default `member` set is deliberately left alone: every signed-in subject already holds it.
 */

const SUPERVISOR_SET_TITLE = {
  key: 'knowledge.permissionSets.supervisor',
  ns: 'nb3-factory',
};
const COLLEAGUE_SET_TITLE = {
  key: 'knowledge.permissionSets.colleague',
  ns: 'nb3-factory',
};

/** A timestamp fixed at the moment the seed runs; rows are installation data, not audit history. */
const seededAt = (): Date => new Date();

async function ensureMaterial(
  query: SeedContext['query'],
  material: (typeof KNOWLEDGE_MATERIALS)[number],
): Promise<void> {
  const existing = await query
    .selectFrom('knowledgeMaterials')
    .select('id')
    .where('id', '=', material.id)
    .executeTakeFirst();
  if (existing) return;
  await query
    .insertInto('knowledgeMaterials')
    .values({
      id: material.id,
      title: material.title,
      content: material.content,
    })
    .execute();
}

async function ensureUser(
  query: SeedContext['query'],
  user: KnowledgeFixtureUser,
): Promise<void> {
  const existing = await query
    .selectFrom('user')
    .select('id')
    .where('id', '=', user.id)
    .executeTakeFirst();
  if (existing) return;

  const now = seededAt();
  const password = await hashPassword(user.password);
  await query
    .insertInto('user')
    .values({
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  await query
    .insertInto('account')
    .values({
      id: `${user.id}-credential`,
      accountId: user.id,
      providerId: 'credential',
      userId: user.id,
      password,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

async function ensurePermissionSet(
  query: SeedContext['query'],
  key: string,
  title: { key: string; ns: string },
  grants: readonly PermissionGrant[],
): Promise<void> {
  const existing = await query
    .selectFrom('authorizationPermissionSets')
    .select('key')
    .where('key', '=', key)
    .executeTakeFirst();
  if (existing) return;
  const now = seededAt();
  await query
    .insertInto('authorizationPermissionSets')
    .values({
      id: `${key}-permission-set`,
      key,
      title: JSON.stringify(title),
      grants: JSON.stringify(grants),
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

async function ensureAssignment(
  query: SeedContext['query'],
  user: KnowledgeFixtureUser,
): Promise<void> {
  const id = `user:${user.id}:${user.permissionSet}`;
  const existing = await query
    .selectFrom('authorizationPermissionSetAssignments')
    .select('id')
    .where('id', '=', id)
    .executeTakeFirst();
  if (existing) return;
  const now = seededAt();
  await query
    .insertInto('authorizationPermissionSetAssignments')
    .values({
      id,
      subjectType: 'user',
      subjectId: user.id,
      permissionSetKey: user.permissionSet,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

const seed = defineSeed({
  name: '202610030002_knowledge_initial_data',
  async run({ query }) {
    for (const material of KNOWLEDGE_MATERIALS) {
      await ensureMaterial(query, material);
    }

    await ensurePermissionSet(
      query,
      KNOWLEDGE_SUPERVISOR_SET,
      SUPERVISOR_SET_TITLE,
      knowledgeSupervisorGrants(),
    );
    await ensurePermissionSet(
      query,
      KNOWLEDGE_COLLEAGUE_SET,
      COLLEAGUE_SET_TITLE,
      knowledgeColleagueGrants(),
    );

    for (const user of KNOWLEDGE_USERS) {
      await ensureUser(query, user);
      await ensureAssignment(query, user);
    }
  },
});

export default seed;
