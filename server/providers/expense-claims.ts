import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import type { Application } from '@nocobase/app-server/application';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/** A receipt file attached to an expense claim, with the fields the UI shows. */
export interface ExpenseClaimAttachment {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
}

/** A claim as returned by the detail endpoint. */
export interface ExpenseClaim {
  readonly id: number;
  readonly reason: string;
  readonly amount: number;
  readonly expenseDate: string;
  readonly createdAt: string;
  readonly attachments: readonly ExpenseClaimAttachment[];
}

/** A claim row for the list, carrying only the attachment count. */
export interface ExpenseClaimSummary {
  readonly id: number;
  readonly reason: string;
  readonly amount: number;
  readonly expenseDate: string;
  readonly createdAt: string;
  readonly attachmentCount: number;
}

export interface CreateExpenseClaimInput {
  readonly reason: string;
  readonly amount: number;
  readonly expenseDate: string;
  readonly attachmentIds: readonly string[];
}

export class ExpenseClaimValidationError extends Error {
  public readonly code = 'INVALID_EXPENSE_CLAIM';
}

export const expenseClaimServiceToken: ServiceToken<ExpenseClaimService> =
  createServiceToken<ExpenseClaimService>('app/expense-claims');

const MAX_ATTACHMENTS = 50;
const AMOUNT_PATTERN = /^\d+(?:\.\d{1,2})?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reads and writes expense claims and the link between a claim and its receipt
 * files. Receipt files themselves are owned by `@nocobase/app-plugin-file`;
 * this service only stores which file ids belong to which claim.
 */
export class ExpenseClaimService {
  public constructor(private readonly database: DatabaseManager) {}

  public async list(): Promise<readonly ExpenseClaimSummary[]> {
    const query = this.database.query();
    const claims = await query
      .selectFrom('expenseClaims')
      .selectAll()
      .orderBy('expenseDate', 'desc')
      .orderBy('id', 'desc')
      .execute();

    const links = await query
      .selectFrom('expenseClaimAttachments')
      .select('expenseClaimId')
      .execute();
    const counts = new Map<number, number>();
    for (const link of links) {
      const claimId = Number(link.expenseClaimId);
      counts.set(claimId, (counts.get(claimId) ?? 0) + 1);
    }

    return claims.map((claim) => ({
      id: Number(claim.id),
      reason: String(claim.reason),
      amount: Number(claim.amount),
      expenseDate: toDateOnly(claim.expenseDate),
      createdAt: toIsoString(claim.createdAt),
      attachmentCount: counts.get(Number(claim.id)) ?? 0,
    }));
  }

  public async get(id: number): Promise<ExpenseClaim | undefined> {
    const query = this.database.query();
    const claim = await query
      .selectFrom('expenseClaims')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!claim) return undefined;

    const links = await query
      .selectFrom('expenseClaimAttachments')
      .selectAll()
      .where('expenseClaimId', '=', id)
      .orderBy('sort', 'asc')
      .orderBy('id', 'asc')
      .execute();

    const fileIds = links.map((link) => String(link.fileId));
    const files = fileIds.length
      ? await query
          .selectFrom('expenseClaimFiles')
          .selectAll()
          .where('id', 'in', fileIds)
          .execute()
      : [];
    const byId = new Map(files.map((file) => [String(file.id), file]));

    const attachments: ExpenseClaimAttachment[] = [];
    for (const fileId of fileIds) {
      const file = byId.get(fileId);
      if (!file) continue;
      attachments.push({
        id: String(file.id),
        filename: String(file.filename),
        ext: String(file.ext),
        mimeType: String(file.mimeType),
        size: Number(file.size),
      });
    }

    return {
      id: Number(claim.id),
      reason: String(claim.reason),
      amount: Number(claim.amount),
      expenseDate: toDateOnly(claim.expenseDate),
      createdAt: toIsoString(claim.createdAt),
      attachments,
    };
  }

  public async create(raw: unknown): Promise<ExpenseClaim> {
    const input = normalizeCreateInput(raw);

    const id = await this.database.transaction(async (connection) => {
      const query = connection.query;
      const files = await query
        .selectFrom('expenseClaimFiles')
        .select('id')
        .where('id', 'in', [...input.attachmentIds])
        .execute();
      const known = new Set(files.map((file) => String(file.id)));
      const missing = input.attachmentIds.filter(
        (fileId) => !known.has(fileId),
      );
      if (missing.length) {
        throw new ExpenseClaimValidationError(
          `Attachment not found: ${missing.join(', ')}`,
        );
      }

      const linked = await query
        .selectFrom('expenseClaimAttachments')
        .select('fileId')
        .where('fileId', 'in', [...input.attachmentIds])
        .execute();
      if (linked.length) {
        throw new ExpenseClaimValidationError(
          `Attachment already linked to an expense claim: ${linked
            .map((row) => String(row.fileId))
            .join(', ')}`,
        );
      }

      const now = new Date();
      const inserted = await query
        .insertInto('expenseClaims')
        .values({
          reason: input.reason,
          amount: input.amount,
          expenseDate: input.expenseDate,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      const claimId = Number(inserted.insertId);
      if (!Number.isInteger(claimId) || claimId <= 0) {
        throw new Error('Failed to create the expense claim.');
      }

      await query
        .insertInto('expenseClaimAttachments')
        .values(
          input.attachmentIds.map((fileId, index) => ({
            expenseClaimId: claimId,
            fileId,
            sort: index,
            createdAt: now,
          })),
        )
        .execute();

      return claimId;
    });

    const created = await this.get(id);
    if (!created) throw new Error('Failed to read back the created claim.');
    return created;
  }
}

export default class ExpenseClaimsProvider extends ServiceProvider<Application> {
  public readonly name = 'app/expense-claims';

  public override register(): void {
    this.app.container.singleton(
      expenseClaimServiceToken,
      (resolver) =>
        new ExpenseClaimService(resolver.resolve(databaseManagerToken)),
    );
  }
}

function normalizeCreateInput(raw: unknown): CreateExpenseClaimInput {
  if (!isRecord(raw)) {
    throw new ExpenseClaimValidationError('A JSON object body is required.');
  }

  const reason = typeof raw.reason === 'string' ? raw.reason.trim() : '';
  if (!reason) {
    throw new ExpenseClaimValidationError('Reason is required.');
  }
  if (reason.length > 255) {
    throw new ExpenseClaimValidationError(
      'Reason must be 255 characters or fewer.',
    );
  }

  const amount = normalizeAmount(raw.amount);
  const expenseDate = normalizeExpenseDate(raw.expenseDate);
  const attachmentIds = normalizeAttachmentIds(raw.attachmentIds);

  return { reason, amount, expenseDate, attachmentIds };
}

function normalizeAmount(raw: unknown): number {
  const amount = typeof raw === 'number' ? raw : Number(raw);
  if (typeof raw !== 'number' && typeof raw !== 'string') {
    throw new ExpenseClaimValidationError('Amount must be a number.');
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ExpenseClaimValidationError('Amount must be greater than zero.');
  }
  const text = typeof raw === 'string' ? raw.trim() : String(raw);
  if (typeof raw === 'string' && !AMOUNT_PATTERN.test(text)) {
    throw new ExpenseClaimValidationError(
      'Amount must have at most two decimal places.',
    );
  }
  const rounded = Math.round(amount * 100) / 100;
  if (rounded > 9_999_999_999.99) {
    throw new ExpenseClaimValidationError('Amount is too large.');
  }
  return rounded;
}

function normalizeExpenseDate(raw: unknown): string {
  if (typeof raw !== 'string' || !DATE_PATTERN.test(raw)) {
    throw new ExpenseClaimValidationError('Expense date must be YYYY-MM-DD.');
  }
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || toDateOnly(parsed) !== raw) {
    throw new ExpenseClaimValidationError('Expense date is not a valid date.');
  }
  return raw;
}

function normalizeAttachmentIds(raw: unknown): readonly string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ExpenseClaimValidationError(
      'At least one receipt attachment is required.',
    );
  }
  const ids: string[] = [];
  for (const value of raw) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new ExpenseClaimValidationError('Attachment ids must be strings.');
    }
    const id = value.trim();
    if (!ids.includes(id)) ids.push(id);
  }
  if (ids.length > MAX_ATTACHMENTS) {
    throw new ExpenseClaimValidationError(
      `At most ${MAX_ATTACHMENTS} attachments are allowed.`,
    );
  }
  return ids;
}

function toDateOnly(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
