import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * Creates the fictional colleagues the ticket feature is demonstrated with, so
 * the feature can be looked at without creating accounts by hand first.
 *
 * They are ordinary accounts and ordinary rows: nothing in the runtime treats
 * them specially, and an administrator may rename, disable or delete any of
 * them afterwards. The ids are fixed rather than generated, so re-running the
 * seed is a no-op and a test can name the same rows the database holds.
 *
 * They are written the way the authentication plugin's own administrator seed
 * writes an account - a `user` row plus a `credential` `account` row holding
 * the hash `better-auth` verifies - because a seed runs with a restricted
 * service container and cannot ask the authentication service to sign anybody
 * up. An account that already exists is left alone, so re-running the seed
 * neither duplicates a colleague nor resets a password somebody has since
 * changed.
 *
 * The passwords are written here in the open because they are demonstration
 * credentials on a database that starts empty; the deployment guidance is to
 * change them, or to delete these accounts, before the application is exposed.
 * They are deliberately not repeated in any report or log.
 *
 * The list stays in this file rather than in a shared module: a seed is loaded
 * on its own, by its own path, and the data it writes is what an installation
 * already holds, so it must read the same however the rest of the source is
 * arranged.
 */

interface DemoAccount {
  /** The `user.id` and `account.userId` of the account. */
  readonly id: string;
  /** The display name the sign-in session and every ticket records. */
  readonly name: string;
  /** The sign-in name, stored lowercased. */
  readonly username: string;
  readonly email: string;
  readonly password: string;
}

const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    id: 'demo-employee-1',
    name: 'Emma Reed',
    username: 'employee1',
    email: 'employee1@example.com',
    password: 'Employee@123',
  },
  {
    id: 'demo-employee-2',
    name: 'Ben Ortiz',
    username: 'employee2',
    email: 'employee2@example.com',
    password: 'Employee@123',
  },
  {
    id: 'demo-handler-1',
    name: 'Hank Ford',
    username: 'handler1',
    email: 'handler1@example.com',
    password: 'Handler@123',
  },
];

const seed = defineSeed({
  name: '202609210001_it_tickets_demo_accounts',
  async run({ query }) {
    for (const account of DEMO_ACCOUNTS) {
      const username = account.username.toLowerCase();
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', username)
        .limit(1)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      const now = new Date();
      const password = await hashPassword(account.password);
      await query
        .insertInto('user')
        .values({
          id: account.id,
          name: account.name,
          username,
          email: account.email.toLowerCase(),
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await query
        .insertInto('account')
        .values({
          // One credential per account, with an id that names the account it
          // belongs to rather than a fresh random value.
          id: `${account.id}-credential`,
          accountId: account.id,
          providerId: 'credential',
          userId: account.id,
          password,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
