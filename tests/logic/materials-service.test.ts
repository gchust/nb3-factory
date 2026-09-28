// @vitest-environment node
import type { DatabaseManager } from '@nocobase/db';
import { describe, expect, it } from 'vitest';

import {
  createMaterialsService,
  MaterialValidationError,
  type MaterialFileRecord,
  type MaterialRecord,
} from '../../server/providers/materials.js';

interface Filter {
  readonly [key: string]: unknown;
}

type Row = Record<string, unknown>;

function matches(row: Row, filter: Filter | undefined): boolean {
  if (!filter) return true;
  return Object.entries(filter).every(([key, value]) => row[key] === value);
}

/**
 * A stand-in for one Repository, just large enough for the operations the
 * service performs. It keeps the filtering honest: every service query is
 * narrowed by `ownerId`, so a row owned by somebody else is never returned.
 */
function inMemoryRepository(rows: Row[]) {
  return {
    async findMany(options: { filter?: Filter; sort?: unknown } = {}) {
      return rows.filter((row) => matches(row, options.filter));
    },
    async findOne(options: { filter?: Filter } = {}) {
      return rows.find((row) => matches(row, options.filter));
    },
    async createOne(options: { values: Row }) {
      rows.push({ ...options.values });
      return { record: { ...options.values } };
    },
    async updateOne(options: { filter?: Filter; values: Row }) {
      const row = rows.find((candidate) => matches(candidate, options.filter));
      if (!row) return { record: undefined };
      Object.assign(row, options.values);
      return { record: { ...row } };
    },
    async deleteOne(options: { filter?: Filter } = {}) {
      const index = rows.findIndex((row) => matches(row, options.filter));
      if (index >= 0) rows.splice(index, 1);
      return { deletedCount: index >= 0 ? 1 : 0 };
    },
  };
}

function createFixture() {
  const materialRows: Row[] = [];
  const fileRows: Row[] = [
    {
      id: 'file-a',
      ownerId: 'jia',
      materialId: null,
      filename: 'a.png',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'file-b',
      ownerId: 'jia',
      materialId: null,
      filename: 'b.docx',
      createdAt: '2026-01-01T00:00:01.000Z',
    },
    {
      id: 'file-peer',
      ownerId: 'yi',
      materialId: null,
      filename: 'theirs.png',
      createdAt: '2026-01-01T00:00:02.000Z',
    },
  ];
  const database = {
    repository: (collection: string) =>
      collection === 'project_materials'
        ? inMemoryRepository(materialRows)
        : inMemoryRepository(fileRows),
  } as unknown as DatabaseManager;
  return {
    service: createMaterialsService(database),
    materialRows,
    fileRows,
  };
}

describe('materials service', () => {
  it('requires a title and does not create a material without one', async () => {
    const { service, materialRows } = createFixture();
    await expect(
      service.create('jia', { title: '   ' }),
    ).rejects.toBeInstanceOf(MaterialValidationError);
    await expect(service.create('jia', {})).rejects.toMatchObject({
      code: 'VALIDATION_TITLE_REQUIRED',
    });
    expect(materialRows).toHaveLength(0);
  });

  it('binds submitted attachments and keeps them bound across an update', async () => {
    const { service, fileRows } = createFixture();
    const created = await service.create('jia', {
      title: 'Report',
      fileIds: ['file-a', 'file-b'],
    });
    expect(created.files.map((file) => file.id)).toEqual(['file-a', 'file-b']);
    expect(fileRows.find((row) => row.id === 'file-a')?.materialId).toBe(
      created.material.id,
    );

    const updated = await service.update('jia', created.material.id, {
      title: 'Report v2',
    });
    expect(updated?.material.title).toBe('Report v2');
    expect(updated?.files).toHaveLength(2);
  });

  it('detaches a removed attachment without disturbing its bytes', async () => {
    const { service, fileRows } = createFixture();
    const created = await service.create('jia', {
      title: 'Report',
      fileIds: ['file-a', 'file-b'],
    });
    const updated = await service.update('jia', created.material.id, {
      fileIds: ['file-a'],
    });
    expect(updated?.files.map((file) => file.id)).toEqual(['file-a']);
    const detached = fileRows.find((row) => row.id === 'file-b');
    expect(detached).toBeDefined();
    expect(detached?.materialId).toBeNull();
  });

  it('never attaches or lists an attachment that belongs to someone else', async () => {
    const { service, fileRows } = createFixture();
    const created = await service.create('jia', {
      title: 'Report',
      fileIds: ['file-peer'],
    });
    expect(created.files).toHaveLength(0);
    expect(
      fileRows.find((row) => row.id === 'file-peer')?.materialId,
    ).toBeNull();
  });

  it('scopes list, get and update to the owner', async () => {
    const { service } = createFixture();
    const { material } = await service.create('jia', { title: 'Report' });
    expect(await service.list('yi')).toEqual([]);
    expect(await service.get('yi', material.id)).toBeUndefined();
    expect(
      await service.update('yi', material.id, { title: 'Hijacked' }),
    ).toBeUndefined();
    expect(await service.remove('yi', material.id)).toBe(false);
    expect(await service.get('jia', material.id)).toBeDefined();
  });

  it('detaches every bound attachment when the material is removed', async () => {
    const { service, fileRows, materialRows } = createFixture();
    const created = await service.create('jia', {
      title: 'Report',
      fileIds: ['file-a'],
    });
    expect(await service.remove('jia', created.material.id)).toBe(true);
    expect(materialRows).toHaveLength(0);
    expect(fileRows.find((row) => row.id === 'file-a')?.materialId).toBeNull();
  });

  it('exposes the record shapes the route serializes', () => {
    const material: MaterialRecord = {
      id: 'x',
      title: 't',
      ownerId: 'jia',
      createdAt: 'now',
      updatedAt: 'now',
    };
    const file: MaterialFileRecord = {
      id: 'f',
      disk: 'local',
      key: 'objects/f.png',
      filename: 'f.png',
      ext: 'png',
      mimeType: 'image/png',
      size: 10,
      ownerId: 'jia',
      materialId: null,
      createdAt: 'now',
      updatedAt: 'now',
    };
    expect(material.ownerId).toBe('jia');
    expect(file.materialId).toBeNull();
  });
});
