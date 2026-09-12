import type { DatabaseManager, QueryAdapter, Row } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import type {
  FileRecord,
  ServerFileRepository,
} from '@nocobase/app-plugin-file/server';
import type { driveManagerToken } from '@nocobase/app-server/drive';

import {
  contractFileViolation,
  type ContractFileKind,
} from './contract-files.js';

type AppDriveManager =
  typeof driveManagerToken extends ServiceToken<infer T> ? T : never;

export type ContractStatus = 'draft' | 'active' | 'expired' | 'terminated';

export const CONTRACT_STATUSES: readonly ContractStatus[] = [
  'draft',
  'active',
  'expired',
  'terminated',
];

/** Editable business fields of a contract, as the UI submits them. */
export interface ContractValue {
  readonly contractNo: string;
  readonly name: string;
  readonly party: string;
  readonly signedAt?: string | null;
  readonly amount?: string | number | null;
  readonly status?: ContractStatus;
  readonly remark?: string | null;
}

/** File selection belonging to a save: the single body plus ordered attachments. */
export interface ContractFileSelection {
  readonly bodyFileId?: string | null;
  readonly attachmentFileIds?: readonly string[];
}

export interface ContractSaveInput
  extends ContractValue, ContractFileSelection {}

export interface ContractRow {
  readonly id: number;
  readonly contractNo: string;
  readonly name: string;
  readonly party: string;
  readonly signedAt: string | null;
  readonly amount: string | number | null;
  readonly status: ContractStatus;
  readonly remark: string | null;
  readonly bodyFileId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ContractWithFiles extends ContractRow {
  readonly body: FileRecord | null;
  readonly attachments: readonly FileRecord[];
}

export interface ContractsServiceDependencies {
  /** Query adapter for the default 'main' connection. */
  readonly query: QueryAdapter;
  /** Database transaction runner (default connection). */
  readonly transaction: DatabaseManager['transaction'];
  /** Repository for contract body PDFs (single file per contract). */
  readonly files: ServerFileRepository;
  /** Repository for contract attachments (many files per contract). */
  readonly attachments: ServerFileRepository;
  /** Drive manager used to remove physical objects. */
  readonly drive: AppDriveManager;
  /** Builds the served content URL for a body file record. */
  readonly urlForBody: (record: FileRecord) => string;
  /** Builds the served content URL for an attachment file record. */
  readonly urlForAttachment: (record: FileRecord) => string;
}

/** Business error surfaced to the API with a stable code and HTTP status. */
export class ContractError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'ContractError';
    this.code = code;
    this.status = status;
  }
}

export const contractsServiceToken: ServiceToken<ContractsService> =
  createServiceToken<ContractsService>('app/contracts/service');

export class ContractsService {
  constructor(private readonly deps: ContractsServiceDependencies) {}

  async list(): Promise<ContractWithFiles[]> {
    const rows = await this.deps.query
      .selectFrom('contracts')
      .selectAll()
      .orderBy('id', 'asc')
      .execute();
    if (!rows.length) return [];
    return this.attachFiles(rows);
  }

  async get(id: number): Promise<ContractWithFiles> {
    const row = await this.deps.query
      .selectFrom('contracts')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row)
      throw new ContractError('CONTRACT_NOT_FOUND', '合同不存在。', 404);
    const [contract] = await this.attachFiles([row]);
    return contract;
  }

  async create(input: ContractSaveInput): Promise<ContractWithFiles> {
    const value = normalizeContractValue(input);
    let contractId: number | undefined;
    await this.deps.transaction(async (connection) => {
      const query = connection.query;
      await assertContractNoAvailable(query, value.contractNo, undefined);
      await assertFileSelectionAvailable(query, input, undefined);
      const inserted = await query
        .insertInto('contracts')
        .values({
          contractNo: value.contractNo,
          name: value.name,
          party: value.party,
          signedAt: value.signedAt,
          amount: value.amount,
          status: value.status,
          remark: value.remark,
          bodyFileId: input.bodyFileId ?? null,
          createdAt: toDbTimestamp(new Date()),
          updatedAt: toDbTimestamp(new Date()),
        })
        .execute();
      contractId = Number(inserted.insertId ?? inserted.rows?.[0]?.id);
      await insertAttachmentLinks(query, contractId, input.attachmentFileIds);
    });
    return this.get(contractId as number);
  }

  async update(
    id: number,
    input: ContractSaveInput,
  ): Promise<ContractWithFiles> {
    await this.get(id);
    const value = normalizeContractValue(input);
    await this.deps.transaction(async (connection) => {
      const query = connection.query;
      const current = await requireContractRow(query, id);
      await assertContractNoAvailable(query, value.contractNo, id);
      await assertFileSelectionAvailable(query, input, id);

      const now = toDbTimestamp(new Date());
      const patch: Record<string, unknown> = {
        contractNo: value.contractNo,
        name: value.name,
        party: value.party,
        signedAt: value.signedAt,
        amount: value.amount,
        status: value.status,
        remark: value.remark,
        updatedAt: now,
      };

      const nextBodyFileId = input.bodyFileId ?? null;
      if (nextBodyFileId !== current.bodyFileId) {
        patch.bodyFileId = nextBodyFileId;
        if (current.bodyFileId) {
          await this.removeFileRecord(query, current.bodyFileId);
        }
      }

      await query
        .updateTable('contracts')
        .set(patch)
        .where('id', '=', id)
        .execute();

      const currentAttachments = await attachmentFileIds(query, id);
      const requested = uniqueIds(input.attachmentFileIds);
      const currentSet = new Set(currentAttachments);
      const requestedSet = new Set(requested);
      for (const fileId of requested) {
        if (currentSet.has(fileId)) continue;
        await query
          .insertInto('contractAttachments')
          .values({ contractId: id, fileId, createdAt: now })
          .execute();
      }
      for (const fileId of currentAttachments) {
        if (requestedSet.has(fileId)) continue;
        await query
          .deleteFrom('contractAttachments')
          .where('contractId', '=', id)
          .where('fileId', '=', fileId)
          .execute();
        await this.removeFileRecord(query, fileId);
      }
    });
    return this.get(id);
  }

  async delete(id: number): Promise<void> {
    await this.deps.transaction(async (connection) => {
      const query = connection.query;
      await requireContractRow(query, id);
      const links = await query
        .selectFrom('contractAttachments')
        .select(['fileId'])
        .where('contractId', '=', id)
        .execute();
      for (const link of links) {
        await query
          .deleteFrom('contractAttachments')
          .where('contractId', '=', id)
          .where('fileId', '=', link.fileId as string)
          .execute();
        await this.removeFileRecord(query, link.fileId as string);
      }
      const contract = await requireContractRow(query, id);
      if (contract.bodyFileId) {
        await this.removeFileRecord(query, contract.bodyFileId);
      }
      await query.deleteFrom('contracts').where('id', '=', id).execute();
    });
  }

  /** Deletes one attachment of a contract without touching its siblings. */
  async deleteAttachment(contractId: number, fileId: string): Promise<void> {
    await this.deps.transaction(async (connection) => {
      const query = connection.query;
      const link = await query
        .selectFrom('contractAttachments')
        .select(['fileId'])
        .where('contractId', '=', contractId)
        .where('fileId', '=', fileId)
        .executeTakeFirst();
      if (!link) {
        throw new ContractError(
          'CONTRACT_ATTACHMENT_NOT_FOUND',
          '该附件不属于此合同。',
          404,
        );
      }
      await query
        .deleteFrom('contractAttachments')
        .where('contractId', '=', contractId)
        .where('fileId', '=', fileId)
        .execute();
      await this.removeFileRecord(query, fileId);
    });
  }

  /** Validates and stores one PDF body file. */
  async uploadBody(file: File): Promise<FileRecord> {
    assertAdmitted(file, 'body');
    const result = await this.deps.files.uploadOne({ file });
    return {
      ...result.record,
      contentUrl: this.deps.urlForBody(result.record),
    };
  }

  /** Validates and stores one or more attachment files. */
  async uploadAttachments(
    files: readonly File[],
  ): Promise<readonly FileRecord[]> {
    if (!files.length) {
      throw new ContractError(
        'CONTRACT_ATTACHMENTS_EMPTY',
        '请至少选择一个附件文件。',
      );
    }
    const rejected: string[] = [];
    for (const file of files) {
      const violation = contractFileViolation(file, 'attachment');
      if (violation) rejected.push(violation.message);
    }
    if (rejected.length) {
      throw new ContractError('CONTRACT_FILES_NOT_ALLOWED', rejected.join(' '));
    }
    const result = await this.deps.attachments.uploadMany({ files });
    return result.records.map((record) => ({
      ...record,
      contentUrl: this.deps.urlForAttachment(record),
    }));
  }

  /** Resolves a stored file record by id (both bodies and attachments). */
  async findFileRecord(fileId: string): Promise<FileRecord | null> {
    try {
      return (
        (await this.deps.files.findOne({ filter: { id: fileId } })) ?? null
      );
    } catch {
      return null;
    }
  }

  // ── internal helpers ───────────────────────────────────────────────────────

  private async attachFiles(
    rows: readonly Row[],
  ): Promise<ContractWithFiles[]> {
    const contracts = rows as unknown as ContractRow[];
    const contractIds = contracts.map((row) => row.id);
    const contractIdSet = new Set(contractIds);
    const links = await this.deps.query
      .selectFrom('contractAttachments')
      .select(['contractId', 'fileId'])
      .orderBy('id', 'asc')
      .execute();
    const attachmentsByContract = new Map<number, string[]>();
    for (const link of links) {
      const contractId = Number(link.contractId);
      const fileId = String(link.fileId);
      if (!contractIdSet.has(contractId)) continue;
      const current = attachmentsByContract.get(contractId) ?? [];
      current.push(fileId);
      attachmentsByContract.set(contractId, current);
    }

    const attachmentIds = [...attachmentsByContract.values()].flat();
    const bodyIds = contracts
      .map((row) => row.bodyFileId)
      .filter((fileId): fileId is string => Boolean(fileId));
    const records = await this.loadFileRecords([
      ...new Set([...attachmentIds, ...bodyIds]),
    ]);

    return contracts.map((row) => ({
      ...row,
      body: row.bodyFileId
        ? decorate(records.get(row.bodyFileId), this.deps.urlForBody)
        : null,
      attachments: (attachmentsByContract.get(row.id) ?? [])
        .map((fileId) =>
          decorate(records.get(fileId), this.deps.urlForAttachment),
        )
        .filter((record): record is FileRecord => record !== null),
    }));
  }

  private async loadFileRecords(
    ids: readonly string[],
    query: QueryAdapter = this.deps.query,
  ): Promise<Map<string, FileRecord>> {
    const records = new Map<string, FileRecord>();
    if (!ids.length) return records;
    const rows = await query
      .selectFrom('contractFiles')
      .selectAll()
      .where('id', 'in', ids)
      .execute();
    for (const row of rows) {
      records.set(row.id as string, row as unknown as FileRecord);
    }
    return records;
  }

  /** Deletes a file record and its physical object, tolerating drive errors. */
  private async removeFileRecord(
    query: QueryAdapter,
    fileId: string,
  ): Promise<void> {
    const record = (await this.loadFileRecords([fileId], query)).get(fileId);
    if (!record) return;
    await query.deleteFrom('contractFiles').where('id', '=', fileId).execute();
    try {
      await this.deps.drive.use(record.disk).delete(record.key);
    } catch (cause) {
      console.error(
        `[contracts] Failed to remove stored object ${record.key}:`,
        cause,
      );
    }
  }
}

function decorate(
  record: FileRecord | undefined,
  urlFor: (record: FileRecord) => string,
): FileRecord | null {
  return record ? { ...record, contentUrl: urlFor(record) } : null;
}

function assertAdmitted(
  file: File,
  kind: ContractFileKind,
): string | undefined {
  const violation = contractFileViolation(file, kind);
  if (violation) {
    throw new ContractError(violation.code, violation.message);
  }
  return undefined;
}

function normalizeContractValue(input: ContractSaveInput): {
  contractNo: string;
  name: string;
  party: string;
  signedAt: string | null;
  amount: string | null;
  status: ContractStatus;
  remark: string | null;
} {
  const contractNo = String(input.contractNo ?? '').trim();
  const name = String(input.name ?? '').trim();
  const party = String(input.party ?? '').trim();
  if (!contractNo)
    throw new ContractError('CONTRACT_NO_REQUIRED', '合同编号不能为空。');
  if (!name)
    throw new ContractError('CONTRACT_NAME_REQUIRED', '合同名称不能为空。');
  if (!party)
    throw new ContractError('CONTRACT_PARTY_REQUIRED', '签约对方不能为空。');

  const status = input.status ?? 'draft';
  if (!CONTRACT_STATUSES.includes(status)) {
    throw new ContractError('CONTRACT_STATUS_INVALID', '合同状态不正确。');
  }

  const signedAt = normalizeSignedAt(input.signedAt);
  const amount = normalizeAmount(input.amount);
  const remark =
    input.remark == null ? null : String(input.remark).trim() || null;
  return { contractNo, name, party, signedAt, amount, status, remark };
}

function normalizeSignedAt(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new ContractError(
      'CONTRACT_SIGNED_AT_INVALID',
      '签订日期格式不正确（应为 YYYY-MM-DD）。',
    );
  }
  return text;
}

function normalizeAmount(
  value: string | number | null | undefined,
): string | null {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw new ContractError(
      'CONTRACT_AMOUNT_INVALID',
      '合同金额格式不正确（最多两位小数）。',
    );
  }
  const [whole, fraction] = text.split('.');
  return `${whole}.${(fraction ?? '').padEnd(2, '0')}`;
}

function toDbTimestamp(date: Date): string {
  return date.toISOString().slice(0, -1);
}

async function assertContractNoAvailable(
  query: QueryAdapter,
  contractNo: string,
  exceptId: number | undefined,
): Promise<void> {
  const existing = await query
    .selectFrom('contracts')
    .select(['id'])
    .where('contractNo', '=', contractNo)
    .executeTakeFirst();
  if (existing && existing.id !== exceptId) {
    throw new ContractError(
      'CONTRACT_NO_TAKEN',
      '合同编号已存在，请使用其他编号。',
      409,
    );
  }
}

async function assertFileSelectionAvailable(
  query: QueryAdapter,
  input: ContractSaveInput,
  exceptContractId: number | undefined,
): Promise<void> {
  const fileIds = uniqueIds([
    ...(input.bodyFileId ? [input.bodyFileId] : []),
    ...(input.attachmentFileIds ?? []),
  ]);
  if (!fileIds.length) return;

  const existing = await query
    .selectFrom('contractFiles')
    .select(['id'])
    .where('id', 'in', fileIds)
    .execute();
  const existingIds = new Set(existing.map((row) => row.id as string));
  const missing = fileIds.filter((fileId) => !existingIds.has(fileId));
  if (missing.length) {
    throw new ContractError(
      'CONTRACT_FILE_NOT_FOUND',
      `所选文件不存在或已失效：${missing.join('、')}。`,
    );
  }

  if (input.bodyFileId) {
    const taken = await query
      .selectFrom('contracts')
      .select(['id'])
      .where('bodyFileId', '=', input.bodyFileId)
      .executeTakeFirst();
    if (taken && taken.id !== exceptContractId) {
      throw new ContractError(
        'CONTRACT_BODY_IN_USE',
        '该正文文件已属于其他合同，同一份 PDF 只能作为一份合同的正文。',
        409,
      );
    }
  }

  const requested = uniqueIds(input.attachmentFileIds);
  if (requested.length) {
    const taken = await query
      .selectFrom('contractAttachments')
      .select(['contractId', 'fileId'])
      .where('fileId', 'in', requested)
      .execute();
    const conflicting = taken.find(
      (link) => (link.contractId as number) !== exceptContractId,
    );
    if (conflicting) {
      throw new ContractError(
        'CONTRACT_ATTACHMENT_IN_USE',
        '部分附件已属于其他合同，一个附件只能归属一份合同。',
        409,
      );
    }
  }
}

async function requireContractRow(
  query: QueryAdapter,
  id: number,
): Promise<ContractRow> {
  const row = await query
    .selectFrom('contracts')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();
  if (!row) throw new ContractError('CONTRACT_NOT_FOUND', '合同不存在。', 404);
  return row as unknown as ContractRow;
}

async function insertAttachmentLinks(
  query: QueryAdapter,
  contractId: number,
  fileIds: readonly string[] | undefined,
): Promise<void> {
  for (const fileId of uniqueIds(fileIds)) {
    await query
      .insertInto('contractAttachments')
      .values({ contractId, fileId, createdAt: toDbTimestamp(new Date()) })
      .execute();
  }
}

async function attachmentFileIds(
  query: QueryAdapter,
  contractId: number,
): Promise<readonly string[]> {
  const links = await query
    .selectFrom('contractAttachments')
    .select(['fileId'])
    .where('contractId', '=', contractId)
    .orderBy('id', 'asc')
    .execute();
  return links.map((link) => link.fileId as string);
}

function uniqueIds(values: readonly string[] | undefined): readonly string[] {
  return [...new Set(values ?? [])];
}
