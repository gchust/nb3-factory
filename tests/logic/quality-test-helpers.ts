import sqlite from '@nocobase/db-sqlite';
import {
  createDatabaseManager,
  type DatabaseConnection,
  type DatabaseManager,
} from '@nocobase/db';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import type {
  AttachmentStorage,
  AttachmentStore,
} from '../../server/providers/quality-files.js';
import migration from '../../database/main/migrations/202609190001_create_quality_tables.js';
import attachmentMigration from '../../database/main/migrations/202609190004_create_quality_attachments.js';

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
  for (const definition of [migration, attachmentMigration]) {
    await definition.up({
      builder: connection.builder,
      query: connection.query,
      connection,
    });
  }
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

export interface MemoryAttachmentStorage extends AttachmentStorage {
  readonly objects: Map<string, Buffer>;
}

/** In-memory byte storage so permission tests need no real disk. */
export function createMemoryAttachmentStorage(): MemoryAttachmentStorage {
  const objects = new Map<string, Buffer>();
  return {
    objects,
    async exists(disk, key) {
      return objects.has(`${disk}:${key}`);
    },
    async getStream(disk, key) {
      const value = objects.get(`${disk}:${key}`);
      if (!value) throw new Error('missing object');
      return Readable.from(value);
    },
    async delete(disk, key) {
      objects.delete(`${disk}:${key}`);
    },
  };
}

/** Writes metadata rows straight to the test database for the service seam. */
export function createMemoryAttachmentStore(
  context: QualityTestDatabase,
  storage: MemoryAttachmentStorage,
): AttachmentStore {
  return {
    async upload(input) {
      const id = crypto.randomUUID();
      const suffix = input.file.name.includes('.')
        ? input.file.name.split('.').pop()!.toLowerCase()
        : '';
      const ext = /^[a-z0-9]{1,32}$/.test(suffix) ? suffix : '';
      const key = `objects/${id}${ext ? `.${ext}` : ''}`;
      storage.objects.set(
        `local:${key}`,
        Buffer.from(await input.file.arrayBuffer()),
      );
      const now = new Date();
      const mimeType = input.file.type || 'application/octet-stream';
      await context.connection.query
        .insertInto('qualityAttachments')
        .values({
          id,
          disk: 'local',
          key,
          filename: input.file.name,
          ext,
          mimeType,
          size: input.file.size,
          createdAt: now,
          updatedAt: now,
          targetType: input.targetType,
          targetId: input.targetId,
          category: input.category,
          uploadedById: input.uploadedById,
        })
        .execute();
      return {
        id,
        disk: 'local',
        key,
        filename: input.file.name,
        ext,
        mimeType,
        size: input.file.size,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
    },
  };
}
