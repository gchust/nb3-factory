import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import {
  createDatabaseManager,
  createMigrator,
  createSeeder,
  type DatabaseManager,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  assertEquipmentStatus,
  assertInspectionConclusion,
  createEquipmentInspectionService,
  EquipmentInspectionError,
  type EquipmentInspectionService,
} from '../../server/providers/equipment-inspection.js';

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, 'database/main/migrations');
const SEEDS_DIR = path.join(ROOT, 'database/main/seeds');

const MIGRATION_NAME = '202609100001_create_equipment_inspection';
const SEED_NAME = '202609100002_seed_equipment_inspection';

interface TestDatabase {
  readonly db: DatabaseManager;
  readonly filename: string;
  cleanup(): void;
}

function createTestDatabase(): TestDatabase {
  const directory = mkdtempSync(path.join(tmpdir(), 'equipment-inspection-'));
  const filename = path.join(directory, 'test.sqlite');
  const db = createDatabaseManager({
    default: 'main',
    connections: {
      main: {
        dialect: 'sqlite',
        filename,
        schemaManagement: 'managed',
      },
    },
  });
  return {
    db,
    filename,
    cleanup: () => {
      void db.destroy();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

function listTables(filename: string): string[] {
  const sqlite = new Database(filename, { readonly: true });
  try {
    return sqlite
      .prepare(
        "select name from sqlite_master where type = 'table' order by name",
      )
      .all()
      .map((row) => row.name as string);
  } finally {
    sqlite.close();
  }
}

function tableColumns(filename: string, table: string): string[] {
  const sqlite = new Database(filename, { readonly: true });
  try {
    return sqlite
      .prepare(`pragma table_info(${table})`)
      .all()
      .map((row) => {
        return row.name as string;
      });
  } finally {
    sqlite.close();
  }
}

describe('equipment inspection migration', () => {
  let database: TestDatabase;

  beforeEach(async () => {
    database = createTestDatabase();
    await database.db.connect('main');
  });

  afterEach(() => {
    database.cleanup();
  });

  it('up creates the five collections and down reverses them against a real database', async () => {
    const migrator = createMigrator({
      database: database.db,
      directory: MIGRATIONS_DIR,
    });

    const run = await migrator.latest();
    expect(run.executed).toContain(MIGRATION_NAME);

    const tables = listTables(database.filename);
    for (const table of [
      'equipment',
      'equipment_main_images',
      'equipment_documents',
      'inspection_records',
      'inspection_photos',
    ]) {
      expect(tables).toContain(table);
    }

    expect(tableColumns(database.filename, 'equipment')).toEqual(
      expect.arrayContaining([
        'device_no',
        'name',
        'location',
        'status',
        'owner',
        'remark',
        'created_at',
        'updated_at',
      ]),
    );
    expect(tableColumns(database.filename, 'equipment_main_images')).toEqual(
      expect.arrayContaining(['equipment_id', 'disk', 'key', 'filename']),
    );
    expect(tableColumns(database.filename, 'equipment_documents')).toEqual(
      expect.arrayContaining(['equipment_id']),
    );
    expect(tableColumns(database.filename, 'inspection_records')).toEqual(
      expect.arrayContaining([
        'equipment_id',
        'inspected_at',
        'inspector',
        'conclusion',
      ]),
    );
    expect(tableColumns(database.filename, 'inspection_photos')).toEqual(
      expect.arrayContaining(['inspection_record_id']),
    );

    await migrator.rollback();

    const remaining = listTables(database.filename);
    for (const table of [
      'equipment',
      'equipment_main_images',
      'equipment_documents',
      'inspection_records',
      'inspection_photos',
    ]) {
      expect(remaining).not.toContain(table);
    }
  });

  it('is idempotent on a second run', async () => {
    const migrator = createMigrator({
      database: database.db,
      directory: MIGRATIONS_DIR,
    });
    const first = await migrator.latest();
    const second = await migrator.latest();
    expect(first.executed).toContain(MIGRATION_NAME);
    expect(second.skipped).toContain(MIGRATION_NAME);
    expect(second.executed).not.toContain(MIGRATION_NAME);
  });
});

describe('equipment inspection seed', () => {
  let database: TestDatabase;

  beforeEach(async () => {
    database = createTestDatabase();
    await database.db.connect('main');
    const migrator = createMigrator({
      database: database.db,
      directory: MIGRATIONS_DIR,
    });
    await migrator.latest();
  });

  afterEach(() => {
    database.cleanup();
  });

  function createSeederForTest() {
    return createSeeder({
      database: database.db,
      directory: SEEDS_DIR,
    });
  }

  it('seeds four equipment each with one inspection and empty file tables', async () => {
    const first = await createSeederForTest().run();
    expect(first.executed).toContain(SEED_NAME);

    const equipment = await database.db
      .query()
      .selectFrom('equipment')
      .selectAll()
      .orderBy('deviceNo', 'asc')
      .execute();
    expect(equipment).toHaveLength(4);
    expect(equipment.map((row) => row.deviceNo)).toEqual([
      'DEV-AIR-002',
      'DEV-CNC-001',
      'DEV-FORK-004',
      'DEV-PRESS-003',
    ]);
    const statuses = new Set(equipment.map((row) => row.status));
    expect(statuses).toEqual(
      new Set(['running', 'maintenance', 'stopped', 'scrapped']),
    );

    const inspections = await database.db
      .query()
      .selectFrom('inspectionRecords')
      .selectAll()
      .execute();
    expect(inspections).toHaveLength(4);
    const byEquipment = new Map<number, number>();
    for (const inspection of inspections) {
      byEquipment.set(
        inspection.equipmentId,
        (byEquipment.get(inspection.equipmentId) ?? 0) + 1,
      );
    }
    expect(byEquipment.size).toBe(4);
    expect([...byEquipment.values()]).toEqual([1, 1, 1, 1]);

    const mainImages = await database.db
      .query()
      .selectFrom('equipmentMainImages')
      .selectAll()
      .execute();
    const documents = await database.db
      .query()
      .selectFrom('equipmentDocuments')
      .selectAll()
      .execute();
    const photos = await database.db
      .query()
      .selectFrom('inspectionPhotos')
      .selectAll()
      .execute();
    expect(mainImages).toHaveLength(0);
    expect(documents).toHaveLength(0);
    expect(photos).toHaveLength(0);
  });

  it('repeat run is skipped and a re-run against existing data only adds the missing device', async () => {
    const seeder = createSeederForTest();
    await seeder.run();
    const repeat = await seeder.run();
    expect(repeat.skipped).toContain(SEED_NAME);
    expect(repeat.executed).not.toContain(SEED_NAME);

    // Simulate a deployment that already has data: drop one seeded device and
    // its inspection, then clear the seed history so the seed runs again.
    await database.db
      .query()
      .deleteFrom('inspectionRecords')
      .where('equipmentId', '=', 1)
      .execute();
    await database.db
      .query()
      .deleteFrom('equipment')
      .where('id', '=', 1)
      .execute();
    const sqlite = new Database(database.filename);
    sqlite
      .prepare('delete from __nocobase_seeds where name = ?')
      .run(SEED_NAME);
    sqlite.close();

    const rerun = await createSeederForTest().run();
    expect(rerun.executed).toContain(SEED_NAME);

    const rows = await database.db
      .query()
      .selectFrom('equipment')
      .select('id')
      .execute();
    expect(rows).toHaveLength(4);
  });
});

describe('equipment inspection service', () => {
  let database: TestDatabase;
  let service: EquipmentInspectionService;

  beforeEach(async () => {
    database = createTestDatabase();
    await database.db.connect('main');
    const migrator = createMigrator({
      database: database.db,
      directory: MIGRATIONS_DIR,
    });
    await migrator.latest();
    await createSeeder({ database: database.db, directory: SEEDS_DIR }).run();
    service = createEquipmentInspectionService(database.db);
  });

  afterEach(() => {
    database.cleanup();
  });

  async function insertFile(
    table: 'equipmentMainImages' | 'equipmentDocuments' | 'inspectionPhotos',
    filename: string,
  ): Promise<string> {
    const id = `00000000-0000-4000-8000-${Math.random()
      .toString(16)
      .slice(2, 14)}`;
    const now = new Date('2026-09-01T00:00:00.000Z');
    await database.db
      .query()
      .insertInto(table)
      .values({
        id,
        disk: 'local',
        key: `objects/${id}.${filename.split('.').at(-1)}`,
        filename,
        ext: filename.split('.').at(-1),
        mimeType: 'text/plain',
        size: 12,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return id;
  }

  it('lists the seeded equipment with counts', async () => {
    const list = await service.listEquipment();
    expect(list).toHaveLength(4);
    for (const row of list) {
      expect(row.inspectionCount).toBe(1);
      expect(row.documentCount).toBe(0);
    }
  });

  it('creates an equipment record linking one main image and documents', async () => {
    const imageId = await insertFile('equipmentMainImages', 'main.png');
    const firstDoc = await insertFile('equipmentDocuments', 'a.txt');
    const secondDoc = await insertFile('equipmentDocuments', 'b.txt');

    const created = await service.createEquipment({
      deviceNo: 'DEV-TEST-001',
      name: 'Test Machine',
      location: 'Shop 1',
      status: 'running',
      owner: 'Tester',
      remark: 'Remark',
      mainImageId: imageId,
      documentIds: [firstDoc, secondDoc],
    });

    expect(created.id).toBeGreaterThan(0);
    expect(created.mainImage?.id).toBe(imageId);
    expect(created.documents.map((document) => document.id)).toEqual([
      firstDoc,
      secondDoc,
    ]);
    expect(created.documentCount).toBe(2);

    const list = await service.listEquipment();
    const summary = list.find((row) => row.deviceNo === 'DEV-TEST-001');
    expect(summary?.mainImage?.id).toBe(imageId);
    expect(summary?.documentCount).toBe(2);
  });

  it('rejects a duplicate device number on create and update', async () => {
    await expect(
      service.createEquipment({
        deviceNo: 'DEV-CNC-001',
        name: 'Duplicate',
        location: 'X',
        status: 'running',
      }),
    ).rejects.toMatchObject<EquipmentInspectionError>({
      code: 'DEVICE_NO_TAKEN',
    });

    const created = await service.createEquipment({
      deviceNo: 'DEV-TEST-002',
      name: 'Rename Me',
      location: 'X',
      status: 'stopped',
    });
    await expect(
      service.updateEquipment(created.id, {
        deviceNo: 'DEV-CNC-001',
        name: 'Rename Me',
        location: 'X',
        status: 'stopped',
      }),
    ).rejects.toBeInstanceOf(EquipmentInspectionError);
  });

  it('keeps exactly one main image when it is replaced', async () => {
    const first = await insertFile('equipmentMainImages', 'first.png');
    const second = await insertFile('equipmentMainImages', 'second.png');
    const created = await service.createEquipment({
      deviceNo: 'DEV-TEST-003',
      name: 'Image Swap',
      location: 'X',
      status: 'maintenance',
      mainImageId: first,
    });
    expect(created.mainImage?.id).toBe(first);

    const updated = await service.updateEquipment(created.id, {
      deviceNo: 'DEV-TEST-003',
      name: 'Image Swap',
      location: 'X',
      status: 'maintenance',
      mainImageId: second,
    });
    expect(updated.mainImage?.id).toBe(second);

    const rows = await database.db
      .query()
      .selectFrom('equipmentMainImages')
      .selectAll()
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(second);
  });

  it('reconciles documents on update, dropping unselected rows', async () => {
    const a = await insertFile('equipmentDocuments', 'a.txt');
    const b = await insertFile('equipmentDocuments', 'b.txt');
    const created = await service.createEquipment({
      deviceNo: 'DEV-TEST-004',
      name: 'Doc Reconcile',
      location: 'X',
      status: 'running',
      documentIds: [a, b],
    });
    expect(created.documents).toHaveLength(2);

    const updated = await service.updateEquipment(created.id, {
      deviceNo: 'DEV-TEST-004',
      name: 'Doc Reconcile',
      location: 'X',
      status: 'running',
      documentIds: [a],
    });
    expect(updated.documents.map((document) => document.id)).toEqual([a]);

    const rows = await database.db
      .query()
      .selectFrom('equipmentDocuments')
      .selectAll()
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(a);
  });

  it('clears the main image and documents when the lists are emptied', async () => {
    const imageId = await insertFile('equipmentMainImages', 'main.png');
    const docId = await insertFile('equipmentDocuments', 'a.txt');
    const created = await service.createEquipment({
      deviceNo: 'DEV-TEST-005',
      name: 'Clear Files',
      location: 'X',
      status: 'running',
      mainImageId: imageId,
      documentIds: [docId],
    });
    const updated = await service.updateEquipment(created.id, {
      deviceNo: 'DEV-TEST-005',
      name: 'Clear Files',
      location: 'X',
      status: 'running',
    });
    expect(updated.mainImage).toBeUndefined();
    expect(updated.documents).toHaveLength(0);
  });

  it('creates an inspection with photos and backfills them on read', async () => {
    const photoA = await insertFile('inspectionPhotos', 'photo-a.png');
    const photoB = await insertFile('inspectionPhotos', 'photo-b.png');
    const equipment = await service.createEquipment({
      deviceNo: 'DEV-TEST-006',
      name: 'Inspect Me',
      location: 'X',
      status: 'running',
    });

    const inspection = await service.createInspection({
      equipmentId: equipment.id,
      inspectedAt: '2026-09-10T08:00:00.000Z',
      inspector: 'Tester',
      conclusion: 'normal',
      photoIds: [photoA, photoB],
    });
    expect(inspection.photos.map((photo) => photo.id)).toEqual([
      photoA,
      photoB,
    ]);

    const backfilled = await service.getInspection(inspection.id);
    expect(backfilled?.photos.map((photo) => photo.id)).toEqual([
      photoA,
      photoB,
    ]);

    const record = await service.getEquipment(equipment.id);
    expect(record?.inspections[0]?.photos).toHaveLength(2);
  });

  it('reconciles inspection photos on update and deletes the inspection with its photos', async () => {
    const photoA = await insertFile('inspectionPhotos', 'photo-a.png');
    const photoB = await insertFile('inspectionPhotos', 'photo-b.png');
    const equipment = await service.createEquipment({
      deviceNo: 'DEV-TEST-007',
      name: 'Photo Reconcile',
      location: 'X',
      status: 'running',
    });
    const inspection = await service.createInspection({
      equipmentId: equipment.id,
      inspectedAt: '2026-09-10T09:00:00.000Z',
      inspector: 'Tester',
      conclusion: 'issue',
      photoIds: [photoA, photoB],
    });

    const updated = await service.updateInspection(inspection.id, {
      equipmentId: equipment.id,
      inspectedAt: '2026-09-10T09:30:00.000Z',
      inspector: 'Tester',
      conclusion: 'major',
      photoIds: [photoB],
    });
    expect(updated.photos.map((photo) => photo.id)).toEqual([photoB]);

    await service.deleteInspection(inspection.id);
    const photos = await database.db
      .query()
      .selectFrom('inspectionPhotos')
      .selectAll()
      .execute();
    expect(photos).toHaveLength(0);
  });

  it('cascades file rows when the equipment is deleted', async () => {
    const imageId = await insertFile('equipmentMainImages', 'main.png');
    const docId = await insertFile('equipmentDocuments', 'a.txt');
    const photoId = await insertFile('inspectionPhotos', 'photo.png');
    const equipment = await service.createEquipment({
      deviceNo: 'DEV-TEST-008',
      name: 'Cascade',
      location: 'X',
      status: 'running',
      mainImageId: imageId,
      documentIds: [docId],
    });
    const inspection = await service.createInspection({
      equipmentId: equipment.id,
      inspectedAt: '2026-09-10T10:00:00.000Z',
      inspector: 'Tester',
      conclusion: 'normal',
      photoIds: [photoId],
    });
    expect(inspection.id).toBeGreaterThan(0);

    await service.deleteEquipment(equipment.id);

    const equipmentRows = await database.db
      .query()
      .selectFrom('equipment')
      .selectAll()
      .execute();
    expect(equipmentRows).toHaveLength(4);
    const inspectionRows = await database.db
      .query()
      .selectFrom('inspectionRecords')
      .selectAll()
      .execute();
    expect(inspectionRows).toHaveLength(4);
    expect(
      await database.db
        .query()
        .selectFrom('equipmentMainImages')
        .selectAll()
        .execute(),
    ).toHaveLength(0);
    expect(
      await database.db
        .query()
        .selectFrom('equipmentDocuments')
        .selectAll()
        .execute(),
    ).toHaveLength(0);
    expect(
      await database.db
        .query()
        .selectFrom('inspectionPhotos')
        .selectAll()
        .execute(),
    ).toHaveLength(0);
    expect(await service.getEquipment(equipment.id)).toBeUndefined();
  });

  it('rejects invalid statuses and conclusions', () => {
    expect(() => assertEquipmentStatus('unknown')).toThrow(
      EquipmentInspectionError,
    );
    expect(() => assertEquipmentStatus('running')).not.toThrow();
    expect(() => assertInspectionConclusion('unknown')).toThrow(
      EquipmentInspectionError,
    );
    expect(() => assertInspectionConclusion('normal')).not.toThrow();
  });

  it('treats missing records as undefined', async () => {
    expect(await service.getEquipment(9999)).toBeUndefined();
    expect(await service.getInspection(9999)).toBeUndefined();
    await expect(
      service.updateEquipment(9999, {
        deviceNo: 'DEV-NOPE',
        name: 'Nope',
        location: 'X',
        status: 'running',
      }),
    ).rejects.toMatchObject<EquipmentInspectionError>({ code: 'NOT_FOUND' });
  });
});
