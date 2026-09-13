import type {
  FileRecord,
  ServerFileRepository,
} from '@nocobase/app-plugin-file/server';
import type { NocoBaseDriveManager } from '@nocobase/drive';
import type { DatabaseManager, QueryAdapter } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

export const CONTRACT_CATEGORIES = ['procurement', 'sales', 'service'] as const;

export type ContractCategory = (typeof CONTRACT_CATEGORIES)[number];

/** 5 MiB per attachment, mirrored by the client for instant feedback. */
export const MAX_ATTACHMENT_SIZE: number = 5 * 1024 * 1024;

const ALLOWED_EXTENSIONS: ReadonlySet<string> = new Set([
  'pdf',
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'bmp',
  'txt',
  'md',
]);

const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'text/plain',
  'text/markdown',
]);

export interface AttachmentCandidate {
  readonly name: string;
  readonly type: string;
  readonly size: number;
}

export interface AttachmentViolation {
  readonly code: string;
  readonly message: string;
}

export function isContractCategory(value: unknown): value is ContractCategory {
  return (
    typeof value === 'string' &&
    (CONTRACT_CATEGORIES as readonly string[]).includes(value)
  );
}

export function attachmentExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot < 0 ? '' : filename.slice(dot + 1).toLowerCase();
}

/** Returns the first admission violation for an attachment, or undefined. */
export function attachmentViolation(
  file: AttachmentCandidate,
): AttachmentViolation | undefined {
  const allowed =
    ALLOWED_MIME_TYPES.has(file.type.trim().toLowerCase()) ||
    ALLOWED_EXTENSIONS.has(attachmentExtension(file.name));
  if (!allowed) {
    return {
      code: 'CONTRACT_ATTACHMENT_TYPE_NOT_ALLOWED',
      message:
        '附件仅支持 PDF、图片或文本文件（.pdf/.jpg/.png/.gif/.webp/.bmp/.txt/.md）。',
    };
  }
  if (file.size > MAX_ATTACHMENT_SIZE) {
    return {
      code: 'CONTRACT_ATTACHMENT_TOO_LARGE',
      message: '附件不能超过 5 MiB。',
    };
  }
  return undefined;
}

export interface ContractAttachmentView {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  /** Application path served by the authenticated content endpoint. */
  readonly contentUrl: string;
}

export interface ContractView {
  readonly id: number;
  readonly name: string;
  readonly counterparty: string;
  readonly category: ContractCategory;
  readonly attachment: ContractAttachmentView | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ContractInput {
  readonly name?: unknown;
  readonly counterparty?: unknown;
  readonly category?: unknown;
  readonly attachmentId?: unknown;
}

export interface ContractsServiceDependencies {
  readonly query: QueryAdapter;
  readonly transaction: DatabaseManager['transaction'];
  readonly files: ServerFileRepository;
  readonly drive: NocoBaseDriveManager;
  /** Builds the served content URL for a stored file record. */
  readonly urlFor: (record: Pick<FileRecord, 'id'>) => string;
}

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

interface NormalizedContract {
  readonly name: string;
  readonly counterparty: string;
  readonly category: ContractCategory;
  readonly attachmentId: string;
}

export class ContractsService {
  constructor(private readonly deps: ContractsServiceDependencies) {}

  async list(category?: string): Promise<ContractView[]> {
    let query = this.deps.query.selectFrom('contracts').selectAll();
    if (category !== undefined && category !== '' && category !== 'all') {
      if (!isContractCategory(category)) {
        throw new ContractError(
          'CONTRACT_CATEGORY_INVALID',
          '合同分类不正确。',
        );
      }
      query = query.where('category', '=', category);
    }
    const rows = await query.orderBy('id', 'desc').execute();
    return this.decorate(rows as unknown as ContractRow[]);
  }

  async get(id: number): Promise<ContractView> {
    const row = await requireRow(this.deps.query, id);
    const [contract] = await this.decorate([row]);
    return contract;
  }

  async create(input: ContractInput): Promise<ContractView> {
    const value = normalizeContractInput(input);
    let contractId: number | undefined;
    await this.deps.transaction(async (connection) => {
      const query = connection.query;
      await assertAttachmentAvailable(query, value.attachmentId, undefined);
      const inserted = await query
        .insertInto('contracts')
        .values({
          name: value.name,
          counterparty: value.counterparty,
          category: value.category,
          attachmentId: value.attachmentId,
          createdAt: toDbTimestamp(new Date()),
          updatedAt: toDbTimestamp(new Date()),
        })
        .execute();
      contractId = Number(inserted.insertId ?? inserted.rows?.[0]?.id);
    });
    return this.get(contractId as number);
  }

  async update(id: number, input: ContractInput): Promise<ContractView> {
    await this.get(id);
    const value = normalizeContractInput(input);
    await this.deps.transaction(async (connection) => {
      const query = connection.query;
      const current = await requireRow(query, id);
      await assertAttachmentAvailable(query, value.attachmentId, id);
      await query
        .updateTable('contracts')
        .set({
          name: value.name,
          counterparty: value.counterparty,
          category: value.category,
          attachmentId: value.attachmentId,
          updatedAt: toDbTimestamp(new Date()),
        })
        .where('id', '=', id)
        .execute();
      if (current.attachmentId && current.attachmentId !== value.attachmentId) {
        await this.removeFileRecord(query, current.attachmentId);
      }
    });
    return this.get(id);
  }

  /** Validates and stores one attachment, returning it with its content URL. */
  async uploadAttachment(file: File): Promise<ContractAttachmentView> {
    const violation = attachmentViolation(file);
    if (violation) {
      throw new ContractError(violation.code, violation.message);
    }
    const result = await this.deps.files.uploadOne({ file });
    return this.toAttachmentView(result.record);
  }

  /** Resolves a stored attachment record for the content endpoint. */
  async findFileRecord(fileId: string): Promise<FileRecord | null> {
    try {
      return (
        (await this.deps.files.findOne({ filter: { id: fileId } })) ?? null
      );
    } catch {
      return null;
    }
  }

  private async decorate(
    rows: readonly ContractRow[],
  ): Promise<ContractView[]> {
    const contracts = rows;
    const attachmentIds = [
      ...new Set(
        contracts
          .map((row) => row.attachmentId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const records = await this.loadFileRecords(attachmentIds);
    return contracts.map((row) => ({
      id: row.id,
      name: row.name,
      counterparty: row.counterparty,
      category: row.category,
      attachment: row.attachmentId
        ? this.toAttachmentViewOrNull(records.get(row.attachmentId))
        : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  private toAttachmentViewOrNull(
    record: FileRecord | undefined,
  ): ContractAttachmentView | null {
    return record ? this.toAttachmentView(record) : null;
  }

  private toAttachmentView(
    record: Pick<FileRecord, 'id' | 'filename' | 'ext' | 'mimeType' | 'size'>,
  ): ContractAttachmentView {
    return {
      id: record.id,
      filename: record.filename,
      ext: record.ext,
      mimeType: record.mimeType,
      size: record.size,
      contentUrl: this.deps.urlFor(record),
    };
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

  /** Deletes a file record and best-effort removes its physical object. */
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
        `[contracts] Failed to remove object ${record.key}:`,
        cause,
      );
    }
  }
}

interface ContractRow {
  readonly id: number;
  readonly name: string;
  readonly counterparty: string;
  readonly category: ContractCategory;
  readonly attachmentId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function normalizeContractInput(input: ContractInput): NormalizedContract {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const counterparty =
    typeof input.counterparty === 'string' ? input.counterparty.trim() : '';
  if (!name) {
    throw new ContractError('CONTRACT_NAME_REQUIRED', '合同名称不能为空。');
  }
  if (name.length > 255) {
    throw new ContractError(
      'CONTRACT_NAME_TOO_LONG',
      '合同名称不能超过 255 个字符。',
    );
  }
  if (!counterparty) {
    throw new ContractError(
      'CONTRACT_COUNTERPARTY_REQUIRED',
      '签约对方不能为空。',
    );
  }
  if (counterparty.length > 255) {
    throw new ContractError(
      'CONTRACT_COUNTERPARTY_TOO_LONG',
      '签约对方不能超过 255 个字符。',
    );
  }
  if (!isContractCategory(input.category)) {
    throw new ContractError('CONTRACT_CATEGORY_INVALID', '合同分类不正确。');
  }
  const attachmentId =
    typeof input.attachmentId === 'string' ? input.attachmentId.trim() : '';
  if (!attachmentId) {
    throw new ContractError(
      'CONTRACT_ATTACHMENT_REQUIRED',
      '请先上传一份合同附件。',
    );
  }
  return { name, counterparty, category: input.category, attachmentId };
}

async function requireRow(
  query: QueryAdapter,
  id: number,
): Promise<ContractRow> {
  const row = await query
    .selectFrom('contracts')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();
  if (!row) {
    throw new ContractError('CONTRACT_NOT_FOUND', '合同不存在。', 404);
  }
  return row as unknown as ContractRow;
}

/** The attachment must exist and belong to no other contract. */
async function assertAttachmentAvailable(
  query: QueryAdapter,
  attachmentId: string,
  exceptContractId: number | undefined,
): Promise<void> {
  const file = await query
    .selectFrom('contractFiles')
    .select(['id'])
    .where('id', '=', attachmentId)
    .executeTakeFirst();
  if (!file) {
    throw new ContractError(
      'CONTRACT_ATTACHMENT_NOT_FOUND',
      '附件不存在或已失效，请重新上传。',
    );
  }
  const taken = await query
    .selectFrom('contracts')
    .select(['id'])
    .where('attachmentId', '=', attachmentId)
    .executeTakeFirst();
  if (taken && Number(taken.id) !== exceptContractId) {
    throw new ContractError(
      'CONTRACT_ATTACHMENT_IN_USE',
      '该附件已属于其他合同，请重新上传。',
      409,
    );
  }
}

function toDbTimestamp(date: Date): string {
  return date.toISOString().slice(0, -1);
}
