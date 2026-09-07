import { describe, expect, it } from 'vitest';
import {
  createAppAuthorization,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';

import { setupSalesAuthorization } from '../server/providers/sales-authz.js';
import { createRoleSubjectMiddleware } from '../server/providers/sales-role-subjects.js';
import { createTestDatabase } from './helpers/sales-test-db.js';

/**
 * The authorization plugin's identity middleware only resolves the `user`
 * principal and the `authenticated:*` subject. The sales provider appends a
 * middleware that expands the user's roles into `role:<key>` subjects, which
 * is what makes the role-assigned permission sets (and their page grants)
 * take effect. These tests pin that behavior.
 */
describe('sales role authorization', () => {
  it('adds role subjects for a user with roles', async () => {
    const { database } = await createTestDatabase({ seed: true });
    try {
      const user = await database
        .query()
        .selectFrom('user')
        .select('id')
        .where('email', '=', 'sales.a@example.test')
        .executeTakeFirstOrThrow();
      const added: { type: string; id: string }[] = [];
      const middleware = createRoleSubjectMiddleware(database);
      await middleware(
        {
          http: {},
          principal: { type: 'user', id: String(user.id) },
          subjects: { add: (subject) => added.push(subject) },
        },
        async () => undefined,
      );
      expect(added).toContainEqual({ type: 'role', id: 'sales' });
    } finally {
      await database.destroy();
    }
  });

  it('does not add role subjects for a user without roles', async () => {
    const { database } = await createTestDatabase({ seed: true });
    try {
      const user = await database
        .query()
        .selectFrom('user')
        .select('id')
        .where('email', '=', 'nocobase@example.test')
        .executeTakeFirst();
      // The admin account is not seeded in the test database; create a plain
      // user with no role assignment instead.
      const id = user ? String(user.id) : 'plain-user';
      if (!user) {
        await database
          .query()
          .insertInto('user')
          .values({
            id,
            name: 'Plain',
            username: 'plain',
            email: 'plain@example.test',
            emailVerified: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .execute();
      }
      const added: { type: string; id: string }[] = [];
      const middleware = createRoleSubjectMiddleware(database);
      await middleware(
        {
          http: {},
          principal: { type: 'user', id },
          subjects: { add: (subject) => added.push(subject) },
        },
        async () => undefined,
      );
      expect(added).toEqual([]);
    } finally {
      await database.destroy();
    }
  });

  it('resolves page grants for role-assigned permission sets', async () => {
    const { database } = await createTestDatabase({
      seed: true,
      authorization: true,
    });
    try {
      const authz: AppAuthorization = createAppAuthorization({
        connection: database.connection(),
      });
      await setupSalesAuthorization(authz, database);

      const salesUser = await database
        .query()
        .selectFrom('user')
        .select('id')
        .where('email', '=', 'sales.a@example.test')
        .executeTakeFirstOrThrow();
      const salesScope = authz.for({
        principal: { type: 'user', id: String(salesUser.id) },
        subjects: [
          { type: 'authenticated', id: '*' },
          { type: 'role', id: 'sales' },
        ],
      });
      const salesPermissions = await salesScope.permissions();
      const salesPages = salesPermissions.permissions
        .filter((permission) => permission.resource.type === 'page')
        .map((permission) => permission.resource.id);
      expect(salesPages).toEqual(
        expect.arrayContaining([
          'dashboard',
          'leads',
          'customers',
          'contacts',
          'opportunities',
          'follow-ups',
          'directory',
        ]),
      );

      const visitorUser = await database
        .query()
        .selectFrom('user')
        .select('id')
        .where('email', '=', 'visitor@example.test')
        .executeTakeFirstOrThrow();
      const visitorScope = authz.for({
        principal: { type: 'user', id: String(visitorUser.id) },
        subjects: [
          { type: 'authenticated', id: '*' },
          { type: 'role', id: 'visitor' },
        ],
      });
      const visitorPermissions = await visitorScope.permissions();
      const visitorPages = visitorPermissions.permissions
        .filter((permission) => permission.resource.type === 'page')
        .map((permission) => permission.resource.id);
      expect(visitorPages).toContain('directory');
      expect(visitorPages).not.toContain('leads');
    } finally {
      await database.destroy();
    }
  });
});
