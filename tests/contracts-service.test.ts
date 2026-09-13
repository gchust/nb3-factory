import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type {
  FileRecord,
  ServerFileRepository,
  UploadOneResult,
} from '@nocobase/app-plugin-file/server';
import {
  createDatabaseManager,
  type DatabaseManager,
  type QueryAdapter,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  attachmentViolation,
  ContractsService,
  ContractError,
  type ContractInput,
} from '../server/providers/contracts.js';

const MIGRATIONS_DIR = path.resolve(
  process.cwd(),
  'database',
  'main',
  'migrations',
);

function timestamp(): string {
  return new Date().toISOString().slice(0, -1);
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot < 0 ? '' : filename.slice(dot + 1).toLowerCase();
}

describe('ContractsService', () => {
  let manager: DatabaseManager;
  let directory: string;
  let deletedKeys: string[];

  const query = (): QueryAdapter => manager.query('main');

  async function insertFileRecord(file: File): Promise<FileRecord> {
    const id = randomUUID();
    const ext = extensionOf(file.name);
    const record: FileRecord = {
      id,
      disk: 'local',
      key: `objects/${id}${ext ? `.${ext}` : ''}`,
      filename: file.name,
      ext,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      createdAt: timestamp(),
      updatedAt: timestamp(),
    };
    await query()
      .insertInto('contractFiles')
      .values({
        id: record.id,
        disk: record.disk,
        key: record.key,
        filename: record.filename,
        ext: record.ext,
        mimeType: record.mimeType,
        size: record.size,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      })
      .execute();
    return record;
  }

  function makeService(): ContractsService {
    const repository = {
      async uploadOne(input: {
        readonly file: File;
      }): Promise<UploadOneResult> {
        return {
          record: await insertFileRecord(input.file),
          createdTargets: [],
        };
      },
      async findOne(input: {
        readonly filter: { id: string };
      }): Promise<FileRecord | null> {
        const row = await query()
          .selectFrom('contractFiles')
          .selectAll()
          .where('id', '=', input.filter.id)
          .executeTakeFirst();
        return row ? (row as unknown as FileRecord) : null;
      },
    } as unknown as ServerFileRepository;

    return new ContractsService({
      query: query(),
      transaction: (fn) => manager.transaction(fn),
      files: repository,
      drive: {
        // Only `drive.use(disk).delete(key)` is exercised by the service.
        // eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix
        use: () => ({
          delete: async (key: string) => {
            deletedKeys.push(key);
          },
        }),
      } as never,
      urlFor: (record) => `/api/contracts/attachments/${record.id}/content`,
    });
  }

  async function upload(
    name: string,
    type: string,
    content = 'attachment-bytes',
  ): Promise<{ id: string; key: string }> {
    const attachment = await makeService().uploadAttachment(
      new File([content], name, { type }),
    );
    return { id: attachment.id, key: `objects/${attachment.id}` };
  }

  function input(overrides: Partial<ContractInput> = {}): ContractInput {
    return {
      name: '测试采购合同',
      counterparty: '杭州测试有限公司',
      category: 'procurement',
      ...overrides,
    };
  }

  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contracts-service-'));
    deletedKeys = [];
    manager = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          driver: 'better-sqlite3',
          filename: path.join(directory, 'database.sqlite'),
        },
      },
    });
    await manager.connect('main');
    await manager
      .createMigrator({ directory: MIGRATIONS_DIR, packageName: 'app' })
      .latest();
  });

  afterEach(async () => {
    await manager.destroy();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('creates a contract with its attachment', async () => {
    const service = makeService();
    const file = await upload('lease.txt', 'text/plain');
    const contract = await service.create(input({ attachmentId: file.id }));
    expect(contract.id).toBeGreaterThan(0);
    expect(contract.name).toBe('测试采购合同');
    expect(contract.category).toBe('procurement');
    expect(contract.attachment?.id).toBe(file.id);
    expect(contract.attachment?.filename).toBe('lease.txt');
    expect(contract.attachment?.contentUrl).toContain(file.id);
  });

  it('requires name, counterparty, a valid category and an attachment', async () => {
    const service = makeService();
    await expect(
      service.create(input({ name: '  ', attachmentId: 'x' })),
    ).rejects.toMatchObject({ code: 'CONTRACT_NAME_REQUIRED' });
    await expect(
      service.create(input({ counterparty: '', attachmentId: 'x' })),
    ).rejects.toMatchObject({ code: 'CONTRACT_COUNTERPARTY_REQUIRED' });
    await expect(
      service.create(input({ category: 'other', attachmentId: 'x' })),
    ).rejects.toMatchObject({ code: 'CONTRACT_CATEGORY_INVALID' });
    await expect(service.create(input())).rejects.toMatchObject({
      code: 'CONTRACT_ATTACHMENT_REQUIRED',
    });
    await expect(
      service.create(input({ attachmentId: 'missing-file' })),
    ).rejects.toMatchObject({ code: 'CONTRACT_ATTACHMENT_NOT_FOUND' });
  });

  it('validates attachment type and size before storing', () => {
    expect(
      attachmentViolation({
        name: 'a.exe',
        type: 'application/x-msdownload',
        size: 1,
      })?.code,
    ).toBe('CONTRACT_ATTACHMENT_TYPE_NOT_ALLOWED');
    expect(
      attachmentViolation({ name: 'note.txt', type: 'text/plain', size: 10 }),
    ).toBeUndefined();
    expect(
      attachmentViolation({
        name: 'big.pdf',
        type: 'application/pdf',
        size: 5 * 1024 * 1024 + 1,
      })?.code,
    ).toBe('CONTRACT_ATTACHMENT_TOO_LARGE');
  });

  it('lists contracts filtered by category, newest first', async () => {
    const service = makeService();
    const a = await upload('a.txt', 'text/plain');
    const b = await upload('b.txt', 'text/plain');
    await service.create(
      input({ name: '采购一', category: 'procurement', attachmentId: a.id }),
    );
    await service.create(
      input({ name: '销售一', category: 'sales', attachmentId: b.id }),
    );

    const all = await service.list('all');
    expect(all.map((item) => item.name)).toEqual(['销售一', '采购一']);

    const procurement = await service.list('procurement');
    expect(procurement.map((item) => item.name)).toEqual(['采购一']);
    expect(procurement[0]?.attachment?.filename).toBe('a.txt');

    await expect(service.list('nope')).rejects.toMatchObject({
      code: 'CONTRACT_CATEGORY_INVALID',
    });
  });

  it('rejects an attachment already used by another contract', async () => {
    const service = makeService();
    const file = await upload('shared.txt', 'text/plain');
    await service.create(input({ attachmentId: file.id }));
    await expect(
      service.create(input({ name: 'other', attachmentId: file.id })),
    ).rejects.toMatchObject({
      code: 'CONTRACT_ATTACHMENT_IN_USE',
      status: 409,
    });
  });

  it('replaces the attachment on update and removes the old record and object', async () => {
    const service = makeService();
    const first = await upload('v1.txt', 'text/plain');
    const second = await upload('v2.txt', 'text/plain');
    const contract = await service.create(input({ attachmentId: first.id }));

    const updated = await service.update(
      contract.id,
      input({ name: '更新后的合同', attachmentId: second.id }),
    );
    expect(updated.name).toBe('更新后的合同');
    expect(updated.attachment?.id).toBe(second.id);

    const oldRow = await query()
      .selectFrom('contractFiles')
      .selectAll()
      .where('id', '=', first.id)
      .executeTakeFirst();
    expect(oldRow).toBeUndefined();
    expect(deletedKeys).toContain(`objects/${first.id}.txt`);
  });

  it('returns 404 for a missing contract', async () => {
    const service = makeService();
    await expect(service.get(99999)).rejects.toBeInstanceOf(ContractError);
    await expect(service.get(99999)).rejects.toMatchObject({
      code: 'CONTRACT_NOT_FOUND',
      status: 404,
    });
  });
});
