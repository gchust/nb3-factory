import { defineSeed, type SeedDefinition } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * Demo accounts for the inspection workflow: two inspectors and two repairers.
 * Passwords are demo-only credentials for this sample application.
 */
export interface DemoUser {
  readonly id: string;
  readonly name: string;
  readonly username: string;
  readonly email: string;
  readonly role: 'inspector' | 'repairer';
}

export const DEMO_PASSWORD = 'Demo12345!';

export const DEMO_USERS: readonly DemoUser[] = [
  {
    id: '1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a01',
    name: '张伟',
    username: 'inspector1',
    email: 'inspector1@example.com',
    role: 'inspector',
  },
  {
    id: '1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a02',
    name: '李娜',
    username: 'inspector2',
    email: 'inspector2@example.com',
    role: 'inspector',
  },
  {
    id: '2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b01',
    name: '王强',
    username: 'repairer1',
    email: 'repairer1@example.com',
    role: 'repairer',
  },
  {
    id: '2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b02',
    name: '刘敏',
    username: 'repairer2',
    email: 'repairer2@example.com',
    role: 'repairer',
  },
];

const seed: SeedDefinition = defineSeed({
  name: '202609190102_seed_demo_users',

  async run({ query }) {
    const now = new Date();
    for (const user of DEMO_USERS) {
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', user.username)
        .executeTakeFirst();
      if (existing) continue;

      const password = await hashPassword(DEMO_PASSWORD);
      await query
        .insertInto('user')
        .values({
          id: user.id,
          name: user.name,
          username: user.username,
          email: user.email,
          emailVerified: true,
          disabledAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await query
        .insertInto('account')
        .values({
          id: crypto.randomUUID(),
          issuer: 'local:credential',
          accountId: user.id,
          providerId: 'credential',
          userId: user.id,
          password,
          createdAt: now,
          updatedAt: now,
        })
        .execute();

      const assignmentId = `user:${user.id}:${user.role}`;
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: assignmentId,
          subjectType: 'user',
          subjectId: user.id,
          permissionSetKey: user.role,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
