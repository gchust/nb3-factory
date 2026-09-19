import sqlite from '@nocobase/db-sqlite';
import {
  createDatabaseManager,
  type DatabaseConnection,
  type DatabaseManager,
} from '@nocobase/db';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import migration from '../../database/main/migrations/202609190001_create_quality_tables.js';

export interface QualityTestDatabase {
  readonly database: DatabaseManager;
  readonly connection: DatabaseConnection;
  dispose(): Promise<void>;
}

/** A real SQLite file database with the quality schema applied. */
export async function createQualityDatabase(): Promise<QualityTestDatabase> {
  const directory = mkdtempSync(path.join(tmpdir(), 'quality-test-'));
  const database = createDatabaseManager({
    drivers: { sqlite },
    default: 'main',
    connections: {
      main: { dialect: 'sqlite', filename: path.join(directory, 'db.sqlite') },
    },
  });
  const connection = database.connection();
  await migration.up({
    builder: connection.builder,
    query: connection.query,
    connection,
  });
  return {
    database,
    connection,
    async dispose() {
      await database.destroy();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

/** Creates the authentication and authorization tables the role seed needs. */
export async function createIdentityTables(
  connection: DatabaseConnection,
): Promise<void> {
  const builder = connection.builder;
  await builder.createCollection('user', (collection) => {
    collection.string('id', { length: 64, nullable: false });
    collection.string('name', { length: 255, nullable: false });
    collection.string('username', { length: 255, nullable: false });
    collection.string('email', { length: 255, nullable: false });
    collection.boolean('emailVerified', { nullable: false });
    collection.datetime('createdAt', { nullable: false });
    collection.datetime('updatedAt', { nullable: false });
    collection.primary('id');
  });
  await builder.createCollection('account', (collection) => {
    collection.string('id', { length: 64, nullable: false });
    collection.string('issuer', { length: 255, nullable: false });
    collection.string('accountId', { length: 320, nullable: false });
    collection.string('providerId', { length: 128, nullable: false });
    collection.string('userId', { length: 64, nullable: false });
    collection.text('password', { nullable: true });
    collection.datetime('createdAt', { nullable: false });
    collection.datetime('updatedAt', { nullable: false });
    collection.primary('id');
  });
  await builder.createCollection(
    'authorizationPermissionSets',
    (collection) => {
      collection.string('id', { length: 64, nullable: false });
      collection.string('key', { length: 255, nullable: false });
      collection.string('title', { length: 255, nullable: true });
      collection.json('grants', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.primary('id');
      collection.unique('key');
    },
  );
  await builder.createCollection(
    'authorizationPermissionSetAssignments',
    (collection) => {
      collection.string('id', { length: 255, nullable: false });
      collection.string('subjectType', { length: 64, nullable: false });
      collection.string('subjectId', { length: 255, nullable: false });
      collection.string('permissionSetKey', { length: 255, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.primary('id');
      collection.unique(['subjectType', 'subjectId', 'permissionSetKey']);
    },
  );
}
