import sqlite from '@nocobase/db-sqlite';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import type { MiddlewareHandler } from 'hono';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import type { FileRecord } from '@nocobase/app-plugin-file/server';

import migration from '../../database/main/migrations/202609200001_create_library_collections.js';
import type {
  LibraryDrive,
  LibraryFileUploader,
} from '../../server/providers/library-service.js';

/** An in-memory database with the library schema applied by the real migration. */
export async function createLibraryDatabase(): Promise<DatabaseManager> {
  const database = createDatabaseManager({
    drivers: { sqlite },
    default: 'main',
    connections: {
      main: { dialect: 'sqlite', filename: ':memory:' },
    },
  });
  const connection = database.connection();
  await migration.up({
    builder: connection.builder,
    query: connection.query,
    connection,
  });
  return database;
}

export interface TestAuth {
  readonly required: () => MiddlewareHandler;
}

/**
 * Stands in for the authentication service. A request without `x-test-user` is anonymous; with it,
 * the header names the signed-in user. This is what lets the tests exercise the real 401 boundary.
 */
export function createTestAuth(): TestAuth {
  return {
    required: () => async (context, next) => {
      const id = context.req.header('x-test-user');
      if (!id) {
        return context.json({ code: 'UNAUTHORIZED' }, 401);
      }
      context.set('auth', {
        user: {
          id,
          name: context.req.header('x-test-name') ?? id,
        },
      });
      await next();
    },
  };
}

export function createAdministratorChecker(
  adminIds: ReadonlySet<string>,
): (userId: string) => Promise<boolean> {
  return async (userId: string) => adminIds.has(userId);
}

export interface FakeDrive extends LibraryDrive {
  readonly objects: Map<string, Buffer>;
}

export function createFakeDrive(
  objects: Map<string, Buffer> = new Map(),
): FakeDrive {
  return {
    objects,
    // The `use(disk)` method name comes from the drive manager's public contract, not React.
    // eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix
    use: () => ({
      getStream: (key: string) =>
        Promise.resolve(Readable.from(objects.get(key) ?? Buffer.alloc(0))),
      exists: (key: string) => Promise.resolve(objects.has(key)),
      put: (key: string, contents: Buffer) => {
        objects.set(key, contents);
        return Promise.resolve();
      },
      delete: (key: string) => {
        objects.delete(key);
        return Promise.resolve();
      },
    }),
  };
}

export interface FakeUploader extends LibraryFileUploader {
  readonly uploaded: FileRecord[];
}

/**
 * Mirrors what the file Repository does: assigns an id, writes the object, inserts the metadata row
 * and returns the record. The service then attaches the row to its material.
 */
export function createFakeUploader(
  database: DatabaseManager,
  objects: Map<string, Buffer>,
  failFor: ReadonlySet<string> = new Set(),
): FakeUploader {
  const uploaded: FileRecord[] = [];
  return {
    uploaded,
    uploadOne: async ({ file }) => {
      if (failFor.has(file.name)) {
        throw new Error('storage failed');
      }
      const id = randomUUID();
      const suffix = file.name.includes('.')
        ? file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase()
        : '';
      const key = `objects/${id}${suffix ? `.${suffix}` : ''}`;
      const bytes = Buffer.from(await file.arrayBuffer());
      const now = new Date();
      objects.set(key, bytes);
      const mimeType = file.type || 'application/octet-stream';
      await database
        .query()
        .insertInto('materialFiles')
        .values({
          id,
          disk: 'local',
          key,
          filename: file.name,
          ext: suffix,
          mimeType,
          size: file.size,
          createdAt: now,
          updatedAt: now,
          materialId: null,
          role: 'attachment',
          uploaderId: null,
          uploaderName: null,
        })
        .execute();
      const record: FileRecord = {
        id,
        disk: 'local',
        key,
        filename: file.name,
        ext: suffix,
        mimeType,
        size: file.size,
        createdAt: now,
        updatedAt: now,
      };
      uploaded.push(record);
      return { record, createdTargets: [] };
    },
  };
}

export function makeFile(
  name: string,
  contents: string,
  type = 'text/plain',
): File {
  return new File([contents], name, { type });
}
