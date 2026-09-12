import type { Application } from '@nocobase/app-server/application';
import { type AppAuthorization } from '@nocobase/app-plugin-authorization';
import {
  serverFileRepositoryManagerToken,
  ServerFileRepositoryManager,
} from '@nocobase/app-plugin-file/server';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { Readable } from 'node:stream';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';
import type { NocoBaseDriveManager } from '@nocobase/drive';
import type { DatabaseManager, Row } from '@nocobase/db';
import { databaseManagerToken } from '@nocobase/db';

/**
 * Expense reimbursement module (报销).
 *
 * Access model - enforced here in the service, in every query:
 * - Every signed-in user may create claims and see their own claims only
 *   (`applicantId` must match the request principal).
 * - Finance users (members of the `system-administrator` permission set) may
 *   list and open every claim, and may approve or reject them.
 * - A direct URL to someone else's claim resolves to 403/404: the ownership
 *   predicate is part of the SQL query, never a client-side filter.
 *
 * These rules are deliberately fixed business logic rather than
 * administrator-configurable Permissions Sets: the visibility rule belongs to
 * this feature, and an explicit predicate in every statement is the smallest
 * surface that cannot be misconfigured. The authorization plugin's public
 * API is still used to decide finance membership (`system-administrator`).
 */

export const EXPENSE_TYPES = [
  'travel',
  'office',
  'entertainment',
  'transport',
  'other',
] as const;

export const EXPENSE_STATUSES = ['pending', 'approved', 'rejected'] as const;

export type ExpenseType = (typeof EXPENSE_TYPES)[number];
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

const SYSTEM_ADMINISTRATOR = 'system-administrator';

export interface ExpenseClaimItemField {
  readonly itemName: string;
  readonly amount: number;
  readonly note?: string | null;
}

export interface ExpenseClaimAttachmentField {
  readonly fileId: string;
}

export interface CreateExpenseClaimInput {
  readonly expenseType: ExpenseType;
  readonly expenseDate: string;
  readonly totalAmount: number;
  readonly description?: string | null;
  readonly items: readonly ExpenseClaimItemField[];
  readonly attachments?: readonly ExpenseClaimAttachmentField[];
}

export interface ExpenseClaimRow {
  readonly id: string;
  readonly claimNumber: string;
  readonly applicantId: string;
  readonly applicantName: string;
  readonly expenseType: string;
  readonly expenseDate: string;
  readonly totalAmount: number;
  readonly description: string | null;
  readonly status: string;
  readonly reviewerId: string | null;
  readonly reviewedAt: Date | string | null;
  readonly rejectReason: string | null;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
}

export interface ExpenseClaimListItem extends ExpenseClaimRow {
  readonly itemCount: number;
}

export interface ExpenseClaimAttachmentRow {
  readonly id: string;
  readonly claimId: string;
  readonly fileId: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly createdAt: Date | string;
}

export interface ExpenseClaimDetail extends ExpenseClaimRow {
  readonly isFinance: boolean;
  readonly reviewerName: string | null;
  readonly items: readonly {
    readonly id: string;
    readonly itemName: string;
    readonly amount: number;
    readonly note: string | null;
  }[];
  readonly attachments: readonly (ExpenseClaimAttachmentRow & {
    readonly contentUrl: string;
  })[];
}

export interface ResolvedDownload {
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly stream: ReadableStream;
}

export interface ExpenseClaimService {
  list(
    userId: string,
    isFinance: boolean,
  ): Promise<readonly ExpenseClaimListItem[]>;
  getDetail(
    claimId: string,
    userId: string,
    isFinance: boolean,
    publicBasePath: string,
  ): Promise<ExpenseClaimDetail | null>;
  create(
    userId: string,
    input: CreateExpenseClaimInput,
  ): Promise<{ id: string; claimNumber: string }>;
  review(
    claimId: string,
    reviewerId: string,
    action: 'approve' | 'reject',
    reason: string | null,
  ): Promise<{ id: string; claimNumber: string; status: ExpenseStatus }>;
  deleteAttachment(
    userId: string,
    isFinance: boolean,
    attachmentId: string,
  ): Promise<boolean>;
  resolveDownload(
    fileId: string,
    userId: string,
    isFinance: boolean,
  ): Promise<ResolvedDownload | undefined>;
}

/** True when the user is a finance (system administrator) member. */
export async function isFinanceUser(
  authorization: AppAuthorization,
  userId: string,
): Promise<boolean> {
  const assignments =
    await authorization.permissionSets.listAssignments(SYSTEM_ADMINISTRATOR);
  return assignments.some(
    (assignment) =>
      assignment.subject.type === 'user' && assignment.subject.id === userId,
  );
}

export class ExpenseClaimValidationError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'ExpenseClaimValidationError';
    this.code = code;
    this.status = status;
  }
}

export const expenseClaimServiceToken: ServiceToken<ExpenseClaimService> =
  createServiceToken<ExpenseClaimService>('app/expense-claim-service');

export default class ExpenseClaimsProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/expense-claims-provider';

  public override register(): void {
    this.app.container.singleton(expenseClaimServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      const fileManager = this.app.container.resolve(
        serverFileRepositoryManagerToken,
      );
      const drive = this.app.container.resolve(driveManagerToken);
      return createExpenseClaimService(database, fileManager, drive);
    });
  }
}

export function createExpenseClaimService(
  database: DatabaseManager,
  fileManager: ServerFileRepositoryManager,
  drive: NocoBaseDriveManager,
): ExpenseClaimService {
  const files = fileManager.repository('expense_claim_files', {
    connection: 'main',
    disk: 'local',
    accessPath: '/uploads/expense-claims',
  });

  return {
    async list(userId, isFinance) {
      let query = database.query().selectFrom('expense_claims').selectAll();
      if (!isFinance) {
        query = query.where('applicantId', '=', userId);
      }
      const claims = (await query.orderBy('createdAt', 'desc').execute()).map(
        normalizeClaim,
      );
      const counts = await itemCounts(
        database,
        claims.map(({ id }) => id),
      );
      return claims.map((claim) => ({
        ...claim,
        itemCount: counts.get(claim.id) ?? 0,
      }));
    },

    async getDetail(claimId, userId, isFinance, publicBasePath) {
      const claim = await findClaim(database, claimId);
      if (!claim) return null;
      if (!canAccess(claim, userId, isFinance)) {
        throw new ExpenseClaimValidationError(
          'FORBIDDEN',
          '无权查看该报销单。',
          403,
        );
      }

      const [items, attachmentRows] = await Promise.all([
        database
          .query()
          .selectFrom('expense_claim_items')
          .select(['id', 'itemName', 'amount', 'note'])
          .where('claimId', '=', claimId)
          .orderBy('createdAt', 'asc')
          .execute(),
        database
          .query()
          .selectFrom('expense_claim_attachments')
          .selectAll()
          .where('claimId', '=', claimId)
          .orderBy('createdAt', 'asc')
          .execute(),
      ]);

      const reviewerName = claim.reviewerId
        ? await userName(database, claim.reviewerId)
        : null;

      return {
        ...claim,
        isFinance,
        reviewerName,
        items: items.map((item) => ({
          id: item.id as string,
          itemName: item.itemName as string,
          amount: toNumber(item.amount),
          note: (item.note as string | null) ?? null,
        })),
        attachments: attachmentRows.map((attachment) => ({
          ...normalizeAttachment(attachment),
          contentUrl: `${stripTrailingSlash(publicBasePath)}${fileUrl(
            attachment.fileId as string,
            attachment.ext as string,
          )}`,
        })),
      };
    },

    async create(userId, input) {
      validateCreateInput(input);

      const applicantName = (await userName(database, userId)) ?? userId;
      const attachmentFiles = await resolveAttachmentFiles(
        database,
        input.attachments,
      );

      const id = crypto.randomUUID();
      const claimNumber = createClaimNumber();
      const now = new Date();

      await database.transaction(async (connection) => {
        const query = connection.query;
        await query
          .insertInto('expense_claims')
          .values({
            id,
            claimNumber,
            applicantId: userId,
            applicantName,
            expenseType: input.expenseType,
            expenseDate: input.expenseDate,
            totalAmount: input.totalAmount,
            description: input.description?.trim()
              ? input.description.trim()
              : null,
            status: 'pending',
            reviewerId: null,
            reviewedAt: null,
            rejectReason: null,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        await query
          .insertInto('expense_claim_items')
          .values(
            input.items.map((item) => ({
              id: crypto.randomUUID(),
              claimId: id,
              itemName: item.itemName.trim(),
              amount: item.amount,
              note: item.note?.trim() ? item.note.trim() : null,
              createdAt: now,
              updatedAt: now,
            })),
          )
          .execute();
        if (input.attachments && input.attachments.length > 0) {
          await query
            .insertInto('expense_claim_attachments')
            .values(
              input.attachments.map(({ fileId }) => {
                const file = attachmentFiles.get(fileId);
                return {
                  id: crypto.randomUUID(),
                  claimId: id,
                  fileId,
                  filename: file?.filename as string,
                  ext: file?.ext as string,
                  mimeType: file?.mimeType as string,
                  size: toNumber(file?.size),
                  createdAt: now,
                  updatedAt: now,
                };
              }),
            )
            .execute();
        }
      });

      return { id, claimNumber };
    },

    async review(claimId, reviewerId, action, reason) {
      if (action === 'reject' && !(reason && reason.trim())) {
        throw new ExpenseClaimValidationError(
          'REJECT_REASON_REQUIRED',
          '退回报销单时必须填写退回原因。',
          400,
        );
      }
      const claim = await findClaim(database, claimId);
      if (!claim) {
        throw new ExpenseClaimValidationError(
          'CLAIM_NOT_FOUND',
          '报销单不存在。',
          404,
        );
      }
      if (claim.status !== 'pending') {
        throw new ExpenseClaimValidationError(
          'CLAIM_NOT_PENDING',
          '只有待审核的报销单可以被审核。',
          409,
        );
      }
      const status: ExpenseStatus =
        action === 'approve' ? 'approved' : 'rejected';
      const now = new Date();
      await database
        .query()
        .updateTable('expense_claims')
        .set({
          status,
          reviewerId,
          reviewedAt: now,
          rejectReason: status === 'rejected' ? (reason?.trim() ?? null) : null,
          updatedAt: now,
        })
        .where('id', '=', claimId)
        .execute();
      return { id: claimId, claimNumber: claim.claimNumber, status };
    },

    async deleteAttachment(userId, isFinance, attachmentId) {
      const attachment = await database
        .query()
        .selectFrom('expense_claim_attachments')
        .selectAll()
        .where('id', '=', attachmentId)
        .executeTakeFirst();
      if (!attachment) return false;
      const claim = await findClaim(database, attachment.claimId as string);
      if (!claim || !canAccess(claim, userId, isFinance)) {
        throw new ExpenseClaimValidationError(
          'ATTACHMENT_FORBIDDEN',
          '无权操作该报销单的附件。',
          403,
        );
      }
      if (claim.status !== 'pending') {
        throw new ExpenseClaimValidationError(
          'ATTACHMENT_CLAIM_NOT_PENDING',
          '只有待审核的报销单可以删除附件。',
          409,
        );
      }
      await database.transaction(async (connection) => {
        const query = connection.query;
        await query
          .deleteFrom('expense_claim_attachments')
          .where('id', '=', attachmentId)
          .execute();
        await query
          .deleteFrom('expense_claim_files')
          .where('id', '=', attachment.fileId as string)
          .execute();
      });
      return true;
    },

    async resolveDownload(fileId, userId, isFinance) {
      const attachment = await database
        .query()
        .selectFrom('expense_claim_attachments')
        .selectAll()
        .where('fileId', '=', fileId)
        .executeTakeFirst();
      if (!attachment) return undefined;
      const claim = await findClaim(database, attachment.claimId as string);
      if (!claim || !canAccess(claim, userId, isFinance)) {
        throw new ExpenseClaimValidationError(
          'ATTACHMENT_FORBIDDEN',
          '无权下载该报销单的附件。',
          403,
        );
      }
      const record = await files.findOne({ filter: { id: fileId } });
      if (!record) return undefined;
      const disk = drive.use(record.disk);
      if (!(await disk.exists(record.key))) return undefined;
      const stream = Readable.toWeb(await disk.getStream(record.key));
      return {
        filename: record.filename,
        mimeType: record.mimeType,
        size: toNumber(record.size),
        stream,
      };
    },
  };
}

function canAccess(claim: ExpenseClaimRow, userId: string, isFinance: boolean) {
  return isFinance || claim.applicantId === userId;
}

function normalizeClaim(row: Row): ExpenseClaimRow {
  return {
    id: row.id as string,
    claimNumber: row.claimNumber as string,
    applicantId: row.applicantId as string,
    applicantName: row.applicantName as string,
    expenseType: row.expenseType as string,
    expenseDate: row.expenseDate as string,
    totalAmount: toNumber(row.totalAmount),
    description: (row.description as string | null) ?? null,
    status: row.status as string,
    reviewerId: (row.reviewerId as string | null) ?? null,
    reviewedAt: (row.reviewedAt as Date | string | null) ?? null,
    rejectReason: (row.rejectReason as string | null) ?? null,
    createdAt: row.createdAt as Date | string,
    updatedAt: row.updatedAt as Date | string,
  };
}

function normalizeAttachment(row: Row): ExpenseClaimAttachmentRow {
  return {
    id: row.id as string,
    claimId: row.claimId as string,
    fileId: row.fileId as string,
    filename: row.filename as string,
    ext: row.ext as string,
    mimeType: row.mimeType as string,
    size: toNumber(row.size),
    createdAt: row.createdAt as Date | string,
  };
}

async function itemCounts(
  database: DatabaseManager,
  claimIds: readonly string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (claimIds.length === 0) return counts;
  const rows = await database
    .query()
    .selectFrom('expense_claim_items')
    .select(['claimId', 'id'])
    .where('claimId', 'in', claimIds)
    .execute();
  for (const row of rows) {
    const key = row.claimId as string;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

async function findClaim(
  database: DatabaseManager,
  claimId: string,
): Promise<ExpenseClaimRow | undefined> {
  const row = await database
    .query()
    .selectFrom('expense_claims')
    .selectAll()
    .where('id', '=', claimId)
    .executeTakeFirst();
  return row ? normalizeClaim(row) : undefined;
}

async function userName(
  database: DatabaseManager,
  userId: string,
): Promise<string | null> {
  const row = await database
    .query()
    .selectFrom('user')
    .select(['name', 'username'])
    .where('id', '=', userId)
    .executeTakeFirst();
  if (!row) return null;
  return (row.name as string) || (row.username as string) || null;
}

async function resolveAttachmentFiles(
  database: DatabaseManager,
  attachments: readonly ExpenseClaimAttachmentField[] | undefined,
): Promise<Map<string, Row>> {
  const filesById = new Map<string, Row>();
  if (!attachments || attachments.length === 0) return filesById;
  const fileIds = [...new Set(attachments.map(({ fileId }) => fileId))];
  const rows = await database
    .query()
    .selectFrom('expense_claim_files')
    .selectAll()
    .where('id', 'in', fileIds)
    .execute();
  for (const row of rows) filesById.set(row.id as string, row);
  for (const fileId of fileIds) {
    if (!filesById.has(fileId)) {
      throw new ExpenseClaimValidationError(
        'ATTACHMENT_FILE_NOT_FOUND',
        '上传的附件不存在，请重新上传。',
        400,
      );
    }
  }
  const linked = await database
    .query()
    .selectFrom('expense_claim_attachments')
    .select('fileId')
    .where('fileId', 'in', fileIds)
    .execute();
  if (linked.length > 0) {
    throw new ExpenseClaimValidationError(
      'ATTACHMENT_ALREADY_LINKED',
      '附件已被其他报销单使用，请重新上传。',
      409,
    );
  }
  return filesById;
}

function validateCreateInput(input: CreateExpenseClaimInput): void {
  if (!expenseTypeAllowed(input.expenseType)) {
    throw new ExpenseClaimValidationError(
      'INVALID_EXPENSE_TYPE',
      '费用类型不正确。',
      400,
    );
  }
  if (!isDateOnly(input.expenseDate)) {
    throw new ExpenseClaimValidationError(
      'INVALID_EXPENSE_DATE',
      '报销日期格式不正确（应为 YYYY-MM-DD）。',
      400,
    );
  }
  if (
    typeof input.totalAmount !== 'number' ||
    !Number.isFinite(input.totalAmount) ||
    input.totalAmount <= 0
  ) {
    throw new ExpenseClaimValidationError(
      'INVALID_TOTAL_AMOUNT',
      '报销总金额必须是大于 0 的数字。',
      400,
    );
  }
  if (
    input.description !== undefined &&
    input.description !== null &&
    typeof input.description !== 'string'
  ) {
    throw new ExpenseClaimValidationError(
      'INVALID_DESCRIPTION',
      '报销说明格式不正确。',
      400,
    );
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new ExpenseClaimValidationError(
      'ITEMS_REQUIRED',
      '至少需要一条报销明细。',
      400,
    );
  }
  if (input.items.length > 100) {
    throw new ExpenseClaimValidationError(
      'ITEMS_TOO_MANY',
      '报销明细不能超过 100 条。',
      400,
    );
  }
  let sumCents = 0;
  const itemFields = input.items as readonly ExpenseClaimItemField[];
  for (const item of itemFields) {
    if (
      typeof item.amount !== 'number' ||
      !Number.isFinite(item.amount) ||
      item.amount < 0
    ) {
      throw new ExpenseClaimValidationError(
        'INVALID_ITEM_AMOUNT',
        '明细金额必须是大于等于 0 的数字。',
        400,
      );
    }
    if (typeof item.itemName !== 'string' || !item.itemName.trim()) {
      throw new ExpenseClaimValidationError(
        'INVALID_ITEM_NAME',
        '明细名称不能为空。',
        400,
      );
    }
    sumCents += Math.round(item.amount * 100);
  }
  if (sumCents !== Math.round(input.totalAmount * 100)) {
    throw new ExpenseClaimValidationError(
      'ITEM_SUM_MISMATCH',
      '报销明细金额合计与报销总金额不一致，请检查后重新填写。',
      422,
    );
  }
}

function expenseTypeAllowed(value: unknown): value is ExpenseType {
  return (
    typeof value === 'string' &&
    (EXPENSE_TYPES as readonly string[]).includes(value)
  );
}

function isDateOnly(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime());
}

function createClaimNumber(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `BX-${yyyy}${mm}${dd}-${random}`;
}

function fileUrl(fileId: string, ext: string): string {
  if (!ext) return `/uploads/expense-claims/${encodeURIComponent(fileId)}`;
  return `/uploads/expense-claims/${encodeURIComponent(fileId)}.${encodeURIComponent(ext)}`;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return NaN;
}
