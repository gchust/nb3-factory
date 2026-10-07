import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { defineSeed, type QueryAdapter } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';
import type { PermissionSet } from '@nocobase/authorization/permission-sets';
import {
  demoAccounts,
  type DemoAccountSeed,
} from '../../seed-data/accounts.ts';
import { materialsSeed } from '../../seed-data/materials.ts';
import {
  materialsColleague,
  materialsSupervisor,
} from '../../seed-data/permission-sets.ts';

const SUPERVISOR_SET = materialsSupervisor.key;
const COLLEAGUE_SET = materialsColleague.key;

/** Creates a signed-in account with a credential login, or returns the id of the one that already exists. */
async function ensureAccount(
  query: QueryAdapter,
  account: DemoAccountSeed,
): Promise<string> {
  const existing = await query
    .selectFrom('user')
    .select('id')
    .where('username', '=', account.username)
    .executeTakeFirst();
  if (existing) {
    return String(existing.id);
  }
  const now = new Date();
  const userId = crypto.randomUUID();
  await query
    .insertInto('user')
    .values({
      id: userId,
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
      id: crypto.randomUUID(),
      accountId: userId,
      providerId: 'credential',
      userId,
      password: await hashPassword(account.password),
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  return userId;
}

/** Writes one Permission Set the first time only, so an administrator's later edit is never overwritten. */
async function ensurePermissionSet(
  query: QueryAdapter,
  permissionSet: PermissionSet,
): Promise<void> {
  const existing = await query
    .selectFrom('authorizationPermissionSets')
    .select('key')
    .where('key', '=', permissionSet.key)
    .executeTakeFirst();
  if (existing) {
    return;
  }
  const now = new Date();
  await query
    .insertInto('authorizationPermissionSets')
    .values({
      id: crypto.randomUUID(),
      key: permissionSet.key,
      title: encodeAuthorizationTitle(permissionSet.title),
      grants: JSON.stringify(permissionSet.grants),
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

/** Assigns a set to a subject unless that exact assignment already exists. */
async function ensureAssignment(
  query: QueryAdapter,
  subjectType: string,
  subjectId: string,
  permissionSetKey: string,
): Promise<void> {
  const id = `${subjectType}:${subjectId}:${permissionSetKey}`;
  const existing = await query
    .selectFrom('authorizationPermissionSetAssignments')
    .select('id')
    .where('id', '=', id)
    .executeTakeFirst();
  if (existing) {
    return;
  }
  const now = new Date();
  await query
    .insertInto('authorizationPermissionSetAssignments')
    .values({
      id,
      subjectType,
      subjectId,
      permissionSetKey,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

/**
 * The sample content and the two demonstration accounts this application is verified with.
 *
 * Every step checks first and inserts once, so re-running the seed is safe and an administrator's later edits to the
 * Permission Sets survive.
 */
export default defineSeed({
  name: '202609250001_materials_initial_data',
  transaction: true,
  async run({ query }) {
    const now = new Date();
    for (const material of materialsSeed) {
      const existing = await query
        .selectFrom('materials')
        .select('id')
        .where('title', '=', material.title)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      await query
        .insertInto('materials')
        .values({
          title: material.title,
          body: material.body,
          restricted: material.restricted,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    await ensurePermissionSet(query, materialsSupervisor);
    await ensurePermissionSet(query, materialsColleague);

    const supervisorId = await ensureAccount(query, demoAccounts.supervisor);
    await ensureAccount(query, demoAccounts.colleague);

    // The colleague level is the default for every signed-in user: `authenticated:*` resolves for each session, so a
    // colleague reads the two unrestricted materials and can maintain none.
    await ensureAssignment(query, 'authenticated', '*', COLLEAGUE_SET);
    // The supervisor level is granted to that one account: every record, and the right to maintain it.
    await ensureAssignment(query, 'user', supervisorId, SUPERVISOR_SET);
  },
});
