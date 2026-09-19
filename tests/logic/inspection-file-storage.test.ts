// @vitest-environment node
import path from 'node:path';

import { ServerFileRepositoryManager } from '@nocobase/app-plugin-file/server';
import sqlite from '@nocobase/db-sqlite';
import {
  createDatabaseManager,
  createMigrator,
  type DatabaseManager,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InspectionService } from '../../server/providers/inspection-service.js';

/**
 * An in-memory stand-in for a storage disk. It records the key each upload is
 * written to, which is what proves two same-named files never share an object.
 */
class MemoryDisk {
  readonly objects = new Map<string, Uint8Array>();

  async putStream(
    key: string,
    stream: AsyncIterable<Uint8Array | string>,
  ): Promise<void> {
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    this.objects.set(key, Buffer.concat(chunks));
  }

  async getMetaData(key: string): Promise<{ contentLength: number }> {
    const bytes = this.objects.get(key);
    if (!bytes) throw new Error(`missing object ${key}`);
    return { contentLength: bytes.byteLength };
  }

  async getBytes(key: string): Promise<Uint8Array> {
    const bytes = this.objects.get(key);
    if (!bytes) throw new Error(`missing object ${key}`);
    return bytes;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async getVisibility(): Promise<'private'> {
    return 'private';
  }

  async getUrl(): Promise<string> {
    return '';
  }

  async getSignedUrl(): Promise<string> {
    return '';
  }
}

const INSPECTOR = 'inspector-1';
const inspector = { userId: INSPECTOR, roles: new Set(['inspector']) };

describe('inspection file storage isolation', () => {
  let database: DatabaseManager;
  let disk: MemoryDisk;
  let repository: ReturnType<ServerFileRepositoryManager['repository']>;
  let service: InspectionService;

  beforeEach(async () => {
    database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    await migrateApp(database);
    disk = new MemoryDisk();
    repository = new ServerFileRepositoryManager(database, {
      // The File Repository Drive manager contract names this method `use`.
      // eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix
      use: () => disk,
    } as never).repository('appFiles', {
      disk: 'local',
      accessPath: '/app-files',
      policy: { read: true, create: true, update: false, delete: false },
    });
    service = new InspectionService(database);
    await seedFixture(database);
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('stores same-named files as separate objects and separate records', async () => {
    const first = await repository.uploadOne({
      file: new File([new Uint8Array([1, 2, 3])], '现场照片.png', {
        type: 'image/png',
      }),
    });
    const second = await repository.uploadOne({
      file: new File([new Uint8Array([9, 9, 9, 9])], '现场照片.png', {
        type: 'image/png',
      }),
    });

    expect(first.record.id).not.toBe(second.record.id);
    expect(first.record.key).not.toBe(second.record.key);
    expect([...(await disk.getBytes(first.record.key))]).toEqual([1, 2, 3]);
    expect([...(await disk.getBytes(second.record.key))]).toEqual([9, 9, 9, 9]);
    expect(
      await database.query().selectFrom('appFiles').select('id').execute(),
    ).toHaveLength(2);
  });

  it('keeps each task bound to the object it uploaded', async () => {
    const first = await repository.uploadOne({
      file: new File([new Uint8Array([1, 2, 3])], '现场照片.png', {
        type: 'image/png',
      }),
    });
    const second = await repository.uploadOne({
      file: new File([new Uint8Array([9, 9, 9, 9])], '现场照片.png', {
        type: 'image/png',
      }),
    });

    const firstTask = await service.createTask(
      { userId: 'manager-1', roles: new Set(['equipment-manager']) },
      {
        equipmentId: 1,
        templateId: 1,
        assigneeId: INSPECTOR,
        plannedDate: '2026-09-19T01:00:00.000Z',
      },
    );
    const secondTask = await service.createTask(
      { userId: 'manager-1', roles: new Set(['equipment-manager']) },
      {
        equipmentId: 1,
        templateId: 1,
        assigneeId: INSPECTOR,
        plannedDate: '2026-09-25T01:00:00.000Z',
      },
    );
    const firstDetail = await service.getTask(inspector, firstTask.id);
    const secondDetail = await service.getTask(inspector, secondTask.id);
    const firstItem = firstDetail.results[0];
    const secondItem = secondDetail.results[0];
    if (!firstItem || !secondItem) throw new Error('missing result');

    await service.addInspectionFiles(
      inspector,
      firstTask.id,
      firstItem.id,
      [recordOf(first)],
      null,
    );
    await service.addInspectionFiles(
      inspector,
      secondTask.id,
      secondItem.id,
      [recordOf(second)],
      null,
    );

    const firstView = await service.getTask(inspector, firstTask.id);
    const secondView = await service.getTask(inspector, secondTask.id);
    expect(firstView.results[0]?.attachments[0]?.fileId).toBe(first.record.id);
    expect(secondView.results[0]?.attachments[0]?.fileId).toBe(
      second.record.id,
    );

    // Overwriting the stored object behind one task's file is impossible from
    // the other: their keys differ, so removing one object leaves the other.
    await disk.delete(second.record.key);
    expect([...(await disk.getBytes(first.record.key))]).toEqual([1, 2, 3]);
  });
});

function recordOf(
  uploaded: Awaited<
    ReturnType<ServerFileRepositoryManager['repository']>['uploadOne']
  >,
) {
  const { record } = uploaded;
  return {
    id: String(record.id),
    filename: String(record.filename),
    mimeType: String(record.mimeType),
    size: record.size,
    ext: String(record.ext),
  };
}

async function migrateApp(database: DatabaseManager): Promise<void> {
  await migratePackage(database, '@nocobase/app-plugin-authentication');
  await createMigrator({
    database,
    packageName: 'app',
    directory: path.resolve('database/main/migrations'),
  }).latest();
}

async function migratePackage(
  database: DatabaseManager,
  packageName: string,
): Promise<void> {
  const { default: plugin } = await import(packageName + '/server');
  if (!plugin.baseDir || !plugin.database?.migrations) {
    throw new Error('Missing plugin migrations: ' + packageName);
  }
  await createMigrator({
    database,
    packageName,
    directory: path.resolve(plugin.baseDir, plugin.database.migrations),
  }).latest();
}

async function seedFixture(database: DatabaseManager): Promise<void> {
  const query = database.query();
  const now = new Date();
  await query
    .insertInto('equipment')
    .values({
      id: 1,
      code: 'EQ-001',
      name: '数控车床',
      model: 'CNC-L450',
      location: '一号车间',
      commissionedAt: now,
      status: 'running',
      photoFileId: null,
      remark: null,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  await query
    .insertInto('inspectionTemplates')
    .values({
      id: 1,
      name: '日常巡检',
      description: null,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  await query
    .insertInto('inspectionTemplateItems')
    .values([
      {
        id: 1,
        templateId: 1,
        seq: 1,
        title: '润滑油位',
        standard: '油位正常',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 2,
        templateId: 1,
        seq: 2,
        title: '运行声音',
        standard: '无异常噪音',
        createdAt: now,
        updatedAt: now,
      },
    ])
    .execute();
}
