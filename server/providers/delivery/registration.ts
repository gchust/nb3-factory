import { randomUUID } from 'node:crypto';

import type { QueryAdapter } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

import { badRequest, conflict, DeliveryError } from './errors.js';

export interface RegistrationInput {
  readonly name?: unknown;
  readonly username?: unknown;
  readonly email?: unknown;
  readonly password?: unknown;
}

export interface RegisteredAccount {
  readonly id: string;
  readonly username: string;
  readonly name: string;
  readonly email: string;
}

const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,32}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Credential issuer every locally stored account carries. The authentication
 * schema declares `account.issuer` as NOT NULL, and the plugin's own sign-up
 * path does not supply it, so this application creates the account row itself
 * and keeps the value consistent with the seeded administrator.
 */
export const CREDENTIAL_ISSUER = 'local:credential';

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Create the user and its credential account in one step.
 *
 * Sign-in stays with the authentication plugin: the rows written here match the
 * shape its sign-in path verifies against (password hashed with the same
 * helper, `providerId` of `credential`, and the session tables untouched).
 */
export async function registerAccount(
  query: QueryAdapter,
  input: RegistrationInput,
): Promise<RegisteredAccount> {
  const name = text(input.name);
  const username = text(input.username);
  const email = text(input.email).toLowerCase();
  const password = typeof input.password === 'string' ? input.password : '';

  if (!name) throw badRequest('REQUIRED_FIELD', 'A name is required.');
  if (!USERNAME_PATTERN.test(username)) {
    throw badRequest(
      'INVALID_USERNAME',
      'A username is 3 to 32 characters using letters, digits, dot, dash or underscore.',
    );
  }
  if (!EMAIL_PATTERN.test(email)) {
    throw badRequest('INVALID_EMAIL', 'A valid email address is required.');
  }
  if (password.length < 8) {
    throw badRequest(
      'WEAK_PASSWORD',
      'The password must be at least 8 characters.',
    );
  }

  const duplicateUsername = await query
    .selectFrom('user')
    .select('id')
    .where('username', '=', username)
    .limit(1)
    .executeTakeFirst();
  if (duplicateUsername) {
    throw conflict('USERNAME_TAKEN', 'That username is already registered.');
  }
  const duplicateEmail = await query
    .selectFrom('user')
    .select('id')
    .where('email', '=', email)
    .limit(1)
    .executeTakeFirst();
  if (duplicateEmail) {
    throw conflict('EMAIL_TAKEN', 'That email address is already registered.');
  }

  const now = new Date().toISOString().slice(0, -1);
  const userId = randomUUID();
  await query
    .insertInto('user')
    .values({
      id: userId,
      name,
      username,
      email,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  try {
    await query
      .insertInto('account')
      .values({
        id: randomUUID(),
        issuer: CREDENTIAL_ISSUER,
        accountId: userId,
        providerId: 'credential',
        userId,
        password: await hashPassword(password),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  } catch (error) {
    // Leave no half-registered identity behind.
    await query.deleteFrom('user').where('id', '=', userId).execute();
    throw error instanceof DeliveryError
      ? error
      : badRequest('REGISTRATION_FAILED', 'The account could not be created.');
  }

  return { id: userId, username, name, email };
}
