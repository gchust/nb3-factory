import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import {
  createDatabaseManager,
  type DatabaseManager,
  type QueryAdapter,
} from '@nocobase/db';
import type {
  FileRecord,
  UploadManyResult,
  UploadOneResult,
  ServerFileRepository,
} from '@nocobase/app-plugin-file/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ContractsService,
  ContractError,
  type ContractSaveInput,
} from '../server/providers/contracts.js';
import { MAX_CONTRACT_FILE_SIZE } from '../server/providers/contract-files.js';

const MIGRATIONS_DIR = path.resolve(
  process.cwd(),
  'database',
  'main',
  'migrations',
);

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot < 0 ? '' : filename.slice(dot + 1).toLowerCase();
}

function timestamp(): string {
  return new Date().toISOString().slice(0, -1);
}

describe('ContractsService', () => {
  let manager: DatabaseManager;
  let directory: string;
  let deletedKeys: string[];

  const query = (): QueryAdapter => manager.query('main');

  /** Builds a repository stub that mirrors the file plugin: metadata in DB, no physical store. */
  function stubRepositories(): {
    readonly files: ServerFileRepository;
    readonly attachments: ServerFileRepository;
  } {
    const make = () => {
      return {
        async uploadOne(input: {
          readonly file: File;
        }): Promise<UploadOneResult> {
          const record = await insertFileRecord(input.file);
          return { record, createdTargets: [] };
        },
        async uploadMany(input: {
          readonly files: readonly File[];
        }): Promise<UploadManyResult> {
          const records: FileRecord[] = [];
          for (const upload of input.files) {
            records.push(await insertFileRecord(upload));
          }
          return { createdCount: records.length, records };
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
    };
    return { files: make(), attachments: make() };
  }

  async function insertFileRecord(file: File): Promise<FileRecord> {
    const id = randomUUID();
    const record: FileRecord = {
      id,
      disk: 'local',
      key: `objects/${id}.${extensionOf(file.name) || 'bin'}`,
      filename: file.name,
      ext: extensionOf(file.name),
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
    const { files, attachments } = stubRepositories();
    return new ContractsService({
      query: query(),
      transaction: (fn) => manager.transaction(fn),
      files,
      attachments,
      drive: {
        // Mirror of the application's drive manager contract (`drive.use`).
        // eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix
        use: () => ({
          delete: async (key: string) => {
            deletedKeys.push(key);
          },
        }),
      } as never,
      urlForBody: (record) => `/api/contracts:fileContent/${record.id}`,
      urlForAttachment: (record) => `/api/contracts:fileContent/${record.id}`,
    });
  }

  function saveInput(
    overrides: Partial<ContractSaveInput> = {},
  ): ContractSaveInput {
    return {
      contractNo: 'HT-TEST-001',
      name: '测试采购合同',
      party: '杭州测试有限公司',
      signedAt: '2026-06-01',
      amount: '12000.5',
      status: 'active',
      remark: '单元测试',
      bodyFileId: null,
      attachmentFileIds: [],
      ...overrides,
    };
  }

  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contracts-test-'));
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
    const migrator = manager.createMigrator({
      directory: MIGRATIONS_DIR,
      packageName: 'app',
    });
    const result = await migrator.latest();
    if (result.executed.length !== 4) {
      throw new Error(
        `Expected 4 migrations, ran ${result.executed.join(', ')}`,
      );
    }
  });

  afterEach(async () => {
    await manager.destroy();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('creates a contract with normalized values and no files', async () => {
    const service = makeService();
    const contract = await service.create(saveInput());
    expect(contract.id).toBeGreaterThan(0);
    expect(contract.contractNo).toBe('HT-TEST-001');
    expect(contract.amount).toBe(12000.5);
    expect(contract.status).toBe('active');
    expect(contract.body).toBeNull();
    expect(contract.attachments).toEqual([]);
  });

  it('validates required fields, signed date and amount', async () => {
    const service = makeService();
    await expect(
      service.create(saveInput({ contractNo: '' })),
    ).rejects.toMatchObject({
      code: 'CONTRACT_NO_REQUIRED',
    });
    await expect(service.create(saveInput({ name: '' }))).rejects.toMatchObject(
      {
        code: 'CONTRACT_NAME_REQUIRED',
      },
    );
    await expect(
      service.create(saveInput({ party: '  ' })),
    ).rejects.toMatchObject({
      code: 'CONTRACT_PARTY_REQUIRED',
    });
    await expect(
      service.create(saveInput({ signedAt: '2026/06/01' })),
    ).rejects.toMatchObject({ code: 'CONTRACT_SIGNED_AT_INVALID' });
    await expect(
      service.create(saveInput({ amount: '12.345' })),
    ).rejects.toMatchObject({ code: 'CONTRACT_AMOUNT_INVALID' });
    await expect(
      service.create(saveInput({ status: 'archived' as never })),
    ).rejects.toMatchObject({ code: 'CONTRACT_STATUS_INVALID' });
  });

  it('rejects a duplicate contract number with 409', async () => {
    const service = makeService();
    await service.create(saveInput());
    await expect(service.create(saveInput())).rejects.toMatchObject({
      code: 'CONTRACT_NO_TAKEN',
      status: 409,
    });
  });

  it('persists a body file and exposes its content URL', async () => {
    const service = makeService();
    const body = await service.uploadBody(
      new File(['%PDF-1.4 fake'], 'contract.pdf', { type: 'application/pdf' }),
    );
    expect(body.contentUrl).toBe(`/api/contracts:fileContent/${body.id}`);
    const contract = await service.create(saveInput({ bodyFileId: body.id }));
    expect(contract.body?.id).toBe(body.id);
  });

  it('rejects a disallowed body file before storing anything', async () => {
    const service = makeService();
    await expect(
      service.uploadBody(new File(['x'], 'scan.png', { type: 'image/png' })),
    ).rejects.toMatchObject({ code: 'BODY_FILE_TYPE_NOT_ALLOWED' });
    await expect(
      service.uploadBody(
        new File([new Uint8Array(MAX_CONTRACT_FILE_SIZE + 1)], 'big.pdf', {
          type: 'application/pdf',
        }),
      ),
    ).rejects.toMatchObject({ code: 'CONTRACT_FILE_TOO_LARGE' });
  });

  it('rejects oversized or disallowed attachments as a batch', async () => {
    const service = makeService();
    await expect(service.uploadAttachments([])).rejects.toMatchObject({
      code: 'CONTRACT_ATTACHMENTS_EMPTY',
    });
    await expect(
      service.uploadAttachments([
        new File(['x'], 'run.exe', { type: 'application/x-msdownload' }),
      ]),
    ).rejects.toMatchObject({ code: 'CONTRACT_FILES_NOT_ALLOWED' });
  });

  it('replaces the body file and removes the old record and object', async () => {
    const service = makeService();
    const first = await service.uploadBody(
      new File(['%PDF-1.4 v1'], 'v1.pdf', { type: 'application/pdf' }),
    );
    const contract = await service.create(saveInput({ bodyFileId: first.id }));
    const second = await service.uploadBody(
      new File(['%PDF-1.4 v2'], 'v2.pdf', { type: 'application/pdf' }),
    );
    const updated = await service.update(contract.id, {
      ...saveInput(),
      bodyFileId: second.id,
    });
    expect(updated.body?.id).toBe(second.id);
    const oldRow = await query()
      .selectFrom('contractFiles')
      .selectAll()
      .where('id', '=', first.id)
      .executeTakeFirst();
    expect(oldRow).toBeUndefined();
    expect(deletedKeys).toContain(first.key);
  });

  it('rejects a body file already used by another contract', async () => {
    const service = makeService();
    const body = await service.uploadBody(
      new File(['%PDF-1.4'], 'shared.pdf', { type: 'application/pdf' }),
    );
    await service.create(saveInput({ bodyFileId: body.id }));
    await expect(
      service.create(
        saveInput({ contractNo: 'HT-TEST-002', bodyFileId: body.id }),
      ),
    ).rejects.toMatchObject({ code: 'CONTRACT_BODY_IN_USE', status: 409 });
  });

  it('keeps attachments isolated between contracts', async () => {
    const service = makeService();
    const a1 = await service.uploadAttachments([
      new File(['alpha'], 'alpha.txt', { type: 'text/plain' }),
    ]);
    const a2 = await service.uploadAttachments([
      new File(['bravo'], 'bravo.txt', { type: 'text/plain' }),
    ]);
    const contractA = await service.create(
      saveInput({ contractNo: 'HT-TEST-A', attachmentFileIds: [a1[0]!.id] }),
    );
    const contractB = await service.create(
      saveInput({ contractNo: 'HT-TEST-B', attachmentFileIds: [a2[0]!.id] }),
    );

    // Removing B's attachment from A is rejected.
    await expect(
      service.deleteAttachment(contractA.id, a2[0]!.id),
    ).rejects.toMatchObject({
      code: 'CONTRACT_ATTACHMENT_NOT_FOUND',
      status: 404,
    });

    // Removing A's own attachment leaves A empty but B untouched.
    await service.deleteAttachment(contractA.id, a1[0]!.id);
    const refreshedA = await service.get(contractA.id);
    const refreshedB = await service.get(contractB.id);
    expect(refreshedA.attachments).toEqual([]);
    expect(refreshedB.attachments.map((record) => record.id)).toEqual([
      a2[0]!.id,
    ]);
    expect(deletedKeys).toContain(a1[0]!.key);
  });

  it('rejects reusing an attachment that already belongs to another contract', async () => {
    const service = makeService();
    const uploaded = await service.uploadAttachments([
      new File(['same'], 'same.txt', { type: 'text/plain' }),
    ]);
    await service.create(
      saveInput({
        contractNo: 'HT-TEST-A',
        attachmentFileIds: [uploaded[0]!.id],
      }),
    );
    await expect(
      service.create(
        saveInput({
          contractNo: 'HT-TEST-B',
          attachmentFileIds: [uploaded[0]!.id],
        }),
      ),
    ).rejects.toMatchObject({
      code: 'CONTRACT_ATTACHMENT_IN_USE',
      status: 409,
    });
  });

  it('diffs the attachment list on update and removes departed files', async () => {
    const service = makeService();
    const first = await service.uploadAttachments([
      new File(['1'], 'one.txt', { type: 'text/plain' }),
    ]);
    const second = await service.uploadAttachments([
      new File(['2'], 'two.txt', { type: 'text/plain' }),
    ]);
    const contract = await service.create(
      saveInput({
        attachmentFileIds: [first[0]!.id, second[0]!.id],
      }),
    );
    const updated = await service.update(contract.id, {
      ...saveInput(),
      attachmentFileIds: [second[0]!.id],
    });
    expect(updated.attachments.map((record) => record.id)).toEqual([
      second[0]!.id,
    ]);
    expect(deletedKeys).toContain(first[0]!.key);
  });

  it('cascades deletion: removes the contract, its body and every attachment', async () => {
    const service = makeService();
    const body = await service.uploadBody(
      new File(['%PDF-1.4'], 'c.pdf', { type: 'application/pdf' }),
    );
    const attachment = await service.uploadAttachments([
      new File(['note'], 'note.txt', { type: 'text/plain' }),
    ]);
    const contract = await service.create(
      saveInput({
        bodyFileId: body.id,
        attachmentFileIds: [attachment[0]!.id],
      }),
    );
    const other = await service.create(
      saveInput({ contractNo: 'HT-TEST-OTHER' }),
    );

    await service.delete(contract.id);

    expect(
      await query()
        .selectFrom('contracts')
        .selectAll()
        .where('id', '=', contract.id)
        .executeTakeFirst(),
    ).toBeUndefined();
    expect(
      await query()
        .selectFrom('contractFiles')
        .selectAll()
        .where('id', '=', body.id)
        .executeTakeFirst(),
    ).toBeUndefined();
    expect(
      await query()
        .selectFrom('contractFiles')
        .selectAll()
        .where('id', '=', attachment[0]!.id)
        .executeTakeFirst(),
    ).toBeUndefined();
    expect(deletedKeys).toContain(body.key);
    expect(deletedKeys).toContain(attachment[0]!.key);

    // The untouched contract remains, with its own files untouched.
    const remaining = await service.get(other.id);
    expect(remaining.contractNo).toBe('HT-TEST-OTHER');
  });

  it('lists contracts with their attachments in insertion order', async () => {
    const service = makeService();
    const uploaded = await service.uploadAttachments([
      new File(['b'], 'b.txt', { type: 'text/plain' }),
      new File(['a'], 'a.txt', { type: 'text/plain' }),
    ]);
    await service.create(
      saveInput({
        contractNo: 'HT-TEST-A',
        attachmentFileIds: [uploaded[0]!.id, uploaded[1]!.id],
      }),
    );
    await service.create(saveInput({ contractNo: 'HT-TEST-B' }));

    const list = await service.list();
    expect(list).toHaveLength(2);
    expect(list[0]!.attachments.map((record) => record.id)).toEqual([
      uploaded[0]!.id,
      uploaded[1]!.id,
    ]);
    expect(list[1]!.attachments).toEqual([]);
  });

  it('returns 404 for a missing contract', async () => {
    const service = makeService();
    await expect(service.get(99999)).rejects.toMatchObject({
      code: 'CONTRACT_NOT_FOUND',
      status: 404,
    });
    await expect(service.update(99999, saveInput())).rejects.toMatchObject({
      code: 'CONTRACT_NOT_FOUND',
    });
    await expect(service.delete(99999)).rejects.toBeInstanceOf(ContractError);
  });
});
