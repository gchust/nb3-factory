import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createInspectionService } from '../../server/providers/inspection-service.js';
import type { InspectionService } from '../../server/providers/inspection-service.js';
import {
  createInspectionDatabase,
  type InspectionDatabase,
} from '../support/inspection-database.js';

const FILE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FILE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FILE_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('InspectionService against a real database', () => {
  let database: InspectionDatabase;
  let service: InspectionService;
  let abnormalRecordId: number;
  let normalRecordId: number;

  beforeAll(async () => {
    database = await createInspectionDatabase();
    service = createInspectionService(database.manager);
    const query = () => database.connection.query;

    await query()
      .insertInto('inspectionDevices')
      .values({
        code: 'D-1',
        name: 'Device one',
        location: 'A',
        type: 'pump',
        status: 'in_use',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();

    for (const [id, name] of [
      [FILE_A, 'a.png'],
      [FILE_B, 'b.png'],
      [FILE_C, 'c.png'],
    ] as const) {
      await query()
        .insertInto('inspectionFiles')
        .values({
          id,
          disk: 'local',
          key: `objects/${id}.png`,
          filename: name,
          ext: 'png',
          mimeType: 'image/png',
          size: 100,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .execute();
    }

    abnormalRecordId = await insertRecord(
      'abnormal',
      '2026-01-10T00:00:00.000Z',
    );
    normalRecordId = await insertRecord('normal', '2026-06-10T00:00:00.000Z');
    await linkPhoto(abnormalRecordId, FILE_A);
    await linkPhoto(abnormalRecordId, FILE_B);

    async function insertRecord(
      result: string,
      createdAt: string,
    ): Promise<number> {
      const inserted = await query()
        .insertInto('inspectionRecords')
        .values({
          deviceId: 1,
          planId: null,
          result,
          description: null,
          team: 'A team',
          createdById: 'inspector-1',
          createdByName: 'Inspector',
          createdAt: new Date(createdAt),
          updatedAt: new Date(createdAt),
        })
        .execute();
      return Number(inserted.insertId);
    }

    async function linkPhoto(recordId: number, fileId: string): Promise<void> {
      await query()
        .insertInto('inspectionRecordPhotos')
        .values({ recordId, fileId, createdAt: new Date() })
        .execute();
    }
  });

  afterAll(async () => {
    await database.dispose();
  });

  it('filters by a date range in the stored encoding', async () => {
    const all = await service.listRecords({});
    expect(all).toHaveLength(2);

    const afterJune = await service.listRecords({
      from: '2026-06-01T00:00:00.000Z',
    });
    expect(afterJune.map((row) => row.id)).toEqual([normalRecordId]);

    const beforeFebruary = await service.listRecords({
      to: '2026-02-01T00:00:00.000Z',
    });
    expect(beforeFebruary.map((row) => row.id)).toEqual([abnormalRecordId]);
  });

  it('filters by result', async () => {
    const abnormal = await service.listRecords({ result: 'abnormal' });
    expect(abnormal.map((row) => row.id)).toEqual([abnormalRecordId]);
  });

  it('scopes records to their creator', async () => {
    expect(
      await service.listRecords({ createdById: 'inspector-1' }),
    ).toHaveLength(2);
    expect(
      await service.listRecords({ createdById: 'inspector-2' }),
    ).toHaveLength(0);
  });

  it('reports per-device inspection and abnormal counts', async () => {
    const stats = await service.deviceStats();
    expect(stats).toEqual([
      expect.objectContaining({ deviceId: 1, inspections: 2, abnormals: 1 }),
    ]);
    const scoped = await service.deviceStats('inspector-2');
    expect(scoped).toEqual([
      expect.objectContaining({ deviceId: 1, inspections: 0, abnormals: 0 }),
    ]);
  });

  it('lists the photos of a record', async () => {
    const photos = await service.listPhotos([abnormalRecordId]);
    expect(photos.map((photo) => photo.fileId).sort()).toEqual(
      [FILE_A, FILE_B].sort(),
    );
  });

  it('deletes a single photo and leaves its sibling intact', async () => {
    await expect(
      service.deleteRecordPhoto(abnormalRecordId, FILE_A),
    ).resolves.toBe(true);
    const photos = await service.listPhotos([abnormalRecordId]);
    expect(photos.map((photo) => photo.fileId)).toEqual([FILE_B]);
    expect(await service.existingFileIds([FILE_A])).toEqual([]);
    expect(await service.existingFileIds([FILE_B])).toEqual([FILE_B]);
  });

  it('refuses to delete a photo that is not on the record', async () => {
    await expect(
      service.deleteRecordPhoto(abnormalRecordId, FILE_C),
    ).resolves.toBe(false);
    expect(await service.existingFileIds([FILE_C])).toEqual([FILE_C]);
  });
});
