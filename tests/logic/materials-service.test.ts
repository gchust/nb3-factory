import type { DatabaseManager } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  MaterialValidationError,
  ProjectMaterialsService,
} from '../../server/providers/materials/index.js';

type Row = Record<string, unknown>;

interface FindOptions {
  readonly filter?: Row;
  readonly sort?: unknown;
}

function matches(row: Row, filter: Row | undefined): boolean {
  return Object.entries(filter ?? {}).every(
    ([key, value]) => row[key] === value,
  );
}

/** An in-memory stand-in for one Collection's Repository. */
class MemoryRepository {
  constructor(private readonly rows: Row[]) {}

  findMany(options?: FindOptions): Row[] {
    return this.rows.filter((row) => matches(row, options?.filter));
  }

  async findOne(options: { filter: Row }): Promise<Row | undefined> {
    return this.rows.find((row) => matches(row, options.filter));
  }

  async createOne(options: { values: Row }): Promise<{ record: Row }> {
    this.rows.push({ ...options.values });
    return { record: options.values };
  }

  async updateOne(options: {
    filter: Row;
    values: Row;
  }): Promise<{ record: Row | undefined }> {
    const row = this.rows.find((candidate) =>
      matches(candidate, options.filter),
    );
    if (row) Object.assign(row, options.values);
    return { record: row };
  }

  async updateMany(options: { filter: Row; values: Row }): Promise<number> {
    let count = 0;
    for (const row of this.rows) {
      if (!matches(row, options.filter)) continue;
      Object.assign(row, options.values);
      count += 1;
    }
    return count;
  }
}

interface Tables {
  readonly projectMaterials: Row[];
  readonly projectAttachments: Row[];
}

function createDatabase(tables: Tables): DatabaseManager {
  const repository = (name: string): MemoryRepository => {
    const rows = tables[name as keyof Tables];
    if (!rows) throw new Error(`Unknown collection ${name}`);
    return new MemoryRepository(rows);
  };
  const fake = {
    repository,
    transaction: async (work: (connection: unknown) => Promise<unknown>) =>
      work({ repository }),
  };
  return fake as unknown as DatabaseManager;
}

function createService(tables: Tables): ProjectMaterialsService {
  const drive = {
    // The drive manager's disk accessor is named `use`, which this rule reads as a React hook.
    // eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix
    use: () => ({
      exists: async () => true,
      getStream: async () => undefined,
    }),
  };
  return new ProjectMaterialsService(
    createDatabase(tables),
    drive as never,
    () => '/main',
  );
}

function material(id: string, ownerId: string, title = 'Material'): Row {
  return {
    id,
    title,
    ownerId,
    createdAt: '2026-09-20',
    updatedAt: '2026-09-20',
  };
}

function attachment(
  id: string,
  ownerId: string,
  materialId: string | null,
): Row {
  return {
    id,
    disk: 'local',
    key: `objects/${id}`,
    filename: `${id}.png`,
    ext: 'png',
    mimeType: 'image/png',
    size: 10,
    ownerId,
    materialId,
    sort: 0,
    createdAt: '2026-09-20',
    updatedAt: '2026-09-20',
  };
}

let tables: Tables;
beforeEach(() => {
  tables = { projectMaterials: [], projectAttachments: [] };
});
afterEach(() => {
  tables = { projectMaterials: [], projectAttachments: [] };
});

describe('ProjectMaterialsService ownership', () => {
  it('lists only the caller’s materials and never another owner’s attachments', async () => {
    tables.projectMaterials.push(material('m-a', 'a'), material('m-b', 'b'));
    tables.projectAttachments.push(attachment('f-a', 'a', 'm-a'));
    const service = createService(tables);

    const forA = await service.list('a');
    expect(forA.map((item) => item.id)).toEqual(['m-a']);
    expect(forA[0]!.attachments.map((item) => item.id)).toEqual(['f-a']);

    const forB = await service.list('b');
    expect(forB.map((item) => item.id)).toEqual(['m-b']);
    expect(forB[0]!.attachments).toEqual([]);
  });

  it('answers a material that belongs to someone else as missing', async () => {
    tables.projectMaterials.push(material('m-a', 'a'));
    const service = createService(tables);
    await expect(service.get('b', 'm-a')).resolves.toBeUndefined();
  });

  it('distinguishes a missing attachment from a forbidden one', async () => {
    tables.projectAttachments.push(attachment('f-a', 'a', null));
    const service = createService(tables);
    await expect(service.resolveAttachment('a', 'f-a')).resolves.toMatchObject({
      status: 'ok',
    });
    await expect(service.resolveAttachment('b', 'f-a')).resolves.toEqual({
      status: 'forbidden',
    });
    await expect(service.resolveAttachment('a', 'nope')).resolves.toEqual({
      status: 'missing',
    });
  });
});

describe('ProjectMaterialsService validation and attachment lifecycle', () => {
  it('refuses a title-less material', async () => {
    const service = createService(tables);
    await expect(service.create('a', { title: '   ' })).rejects.toBeInstanceOf(
      MaterialValidationError,
    );
    await expect(service.create('a', { title: '   ' })).rejects.toMatchObject({
      code: 'TITLE_REQUIRED',
    });
  });

  it('refuses an attachment that belongs to another owner', async () => {
    tables.projectAttachments.push(attachment('f-b', 'b', null));
    const service = createService(tables);
    await expect(
      service.create('a', { title: 'Mine', attachmentIds: ['f-b'] }),
    ).rejects.toMatchObject({ code: 'ATTACHMENT_NOT_FOUND' });
  });

  it('links uploaded attachments on create and detaches removed ones on update', async () => {
    tables.projectAttachments.push(
      attachment('f-1', 'a', null),
      attachment('f-2', 'a', null),
    );
    const service = createService(tables);

    const created = await service.create('a', {
      title: 'First',
      attachmentIds: ['f-1', 'f-2'],
    });
    expect(created.attachments.map((item) => item.id)).toEqual(['f-1', 'f-2']);
    expect(tables.projectAttachments[0]!.materialId).toBe(created.id);

    const updated = await service.update('a', created.id, {
      title: 'First',
      attachmentIds: ['f-2'],
    });
    expect(updated?.attachments.map((item) => item.id)).toEqual(['f-2']);
    // The detached row survives with no material link rather than being deleted.
    expect(tables.projectAttachments[0]!.materialId).toBeNull();
    expect(tables.projectAttachments).toHaveLength(2);
  });

  it('keeps the stored title when an update only changes attachments', async () => {
    tables.projectAttachments.push(attachment('f-1', 'a', null));
    const service = createService(tables);
    const created = await service.create('a', { title: 'Kept' });
    const updated = await service.update('a', created.id, {
      attachmentIds: ['f-1'],
    });
    expect(updated?.title).toBe('Kept');
  });
});
