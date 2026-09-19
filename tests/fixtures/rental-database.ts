import path from 'node:path';

import sqlite from '@nocobase/db-sqlite';
import {
  createDatabaseManager,
  createMigrator,
  type DatabaseManager,
} from '@nocobase/db';

export const MIGRATIONS_DIR = path.resolve(
  import.meta.dirname,
  '../../database/main/migrations',
);
export const SEEDS_DIR = path.resolve(
  import.meta.dirname,
  '../../database/main/seeds',
);

/** An in-memory database with the authentication schema and the rental tables. */
export async function createRentalTestDatabase(): Promise<DatabaseManager> {
  const database = createDatabaseManager({
    drivers: { sqlite },
    default: 'main',
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  await migratePackage(database, '@nocobase/app-plugin-authentication');
  await migrateApp(database);
  return database;
}

export async function migrateApp(database: DatabaseManager): Promise<void> {
  await createMigrator({
    database,
    packageName: 'app',
    directory: MIGRATIONS_DIR,
  }).latest();
}

export async function migratePackage(
  database: DatabaseManager,
  packageName: string,
): Promise<void> {
  const { default: plugin } = await import(`${packageName}/server`);
  if (!plugin.baseDir || !plugin.database?.migrations) {
    throw new Error(`Missing plugin migrations: ${packageName}`);
  }
  await createMigrator({
    database,
    packageName,
    directory: path.resolve(plugin.baseDir, plugin.database.migrations),
  }).latest();
}

export async function createUser(
  database: DatabaseManager,
  id: string,
  username: string,
): Promise<void> {
  const now = new Date();
  await database
    .connection()
    .query.insertInto('user')
    .values({
      id,
      name: username,
      username,
      email: `${username}@example.com`,
      emailVerified: true,
      disabledAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}
