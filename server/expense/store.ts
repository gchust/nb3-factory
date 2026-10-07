import { randomUUID } from 'node:crypto';

import type { DatabaseManager, FilterBuilder, FilterNode } from '@nocobase/db';

import {
  type ApprovalRecord,
  type ClaimRecord,
  type DepartmentMemberRecord,
  type DepartmentRecord,
  type ExportJobRecord,
  type ExportJobStatus,
  type ExpenseAction,
  type ExpenseStatus,
  type ItemRecord,
} from './model.js';
import { toAmount } from './logic.js';

/** Everything the service needs from storage. Implemented over the database, faked in tests. */
export interface ExpenseStore {
  listDepartments(): Promise<DepartmentRecord[]>;
  listMemberDepartmentIds(userId: string): Promise<string[]>;

  listClaims(query: ClaimQuery): Promise<ClaimRecord[]>;
  countClaims(query: ClaimQuery): Promise<number>;
  findClaim(id: string): Promise<ClaimRecord | null>;
  findClaimByNo(claimNo: string): Promise<ClaimRecord | null>;
  findClaimsByIds(ids: readonly string[]): Promise<ClaimRecord[]>;
  insertClaim(values: ClaimWriteValues): Promise<ClaimRecord>;
  updateClaim(id: string, values: Partial<ClaimWriteValues>): Promise<void>;
  /**
   * Move a claim from an expected status to the written one, atomically.
   *
   * The status is part of the filter, so two reviewers pressing Approve at the same time cannot both win: the second
   * update matches no row and the caller learns it lost. This is the guard that makes the approval chain safe without
   * an explicit transaction around every action.
   */
  updateClaimIfStatus(
    id: string,
    expectedStatus: ExpenseStatus,
    values: Partial<ClaimWriteValues>,
  ): Promise<boolean>;
  deleteClaim(id: string): Promise<void>;

  listItems(claimId: string): Promise<ItemRecord[]>;
  listItemsForClaims(claimIds: readonly string[]): Promise<ItemRecord[]>;
  replaceItems(
    claimId: string,
    items: readonly ItemWriteValues[],
  ): Promise<void>;

  listApprovals(claimId: string): Promise<ApprovalRecord[]>;
  listApprovalsForClaims(
    claimIds: readonly string[],
  ): Promise<ApprovalRecord[]>;
  insertApproval(values: ApprovalWriteValues): Promise<void>;

  findUser(userId: string): Promise<{ id: string; name: string } | null>;

  insertExportJob(values: ExportJobWriteValues): Promise<ExportJobRecord>;
  updateExportJob(
    id: string,
    values: Partial<ExportJobWriteValues>,
  ): Promise<void>;
  findExportJob(id: string): Promise<ExportJobRecord | null>;
  listExportJobs(requesterId: string): Promise<ExportJobRecord[]>;
  listUnfinishedExportJobs(): Promise<ExportJobRecord[]>;
}

export interface ClaimQuery {
  readonly ids?: readonly string[];
  readonly statuses?: readonly ExpenseStatus[];
  readonly departmentIds?: readonly string[];
  readonly applicantIds?: readonly string[];
  readonly keyword?: string;
  readonly submittedFrom?: string | null;
  readonly submittedTo?: string | null;
  /**
   * The visibility window for a non-finance actor: their own claims, plus the departments they supervise.
   * Applied in addition to every other condition, never instead of one.
   */
  readonly scope?: {
    readonly userId: string;
    readonly departmentIds: readonly string[];
  };
  readonly limit?: number;
  readonly offset?: number;
  readonly sort?: 'createdAt' | 'submittedAt' | 'totalAmount';
  readonly order?: 'asc' | 'desc';
}

export interface ClaimWriteValues {
  claimNo: string;
  title: string;
  applicantId: string;
  applicantName: string;
  departmentId: string | null;
  departmentName: string | null;
  status: ExpenseStatus;
  totalAmount: number;
  remark: string | null;
  submittedAt: Date | null;
  decidedAt: Date | null;
  paidAt: Date | null;
  paymentMethod: string | null;
  paymentRemark: string | null;
}

export interface ItemWriteValues {
  category: string;
  amount: number;
  expenseDate: string | null;
  description: string | null;
  invoiceId: string | null;
  invoiceName: string | null;
  invoiceExt: string | null;
  invoiceType: string | null;
  sortOrder: number;
}

export interface ApprovalWriteValues {
  claimId: string;
  action: ExpenseAction;
  operatorId: string;
  operatorName: string;
  fromStatus: ExpenseStatus;
  toStatus: ExpenseStatus;
  comment: string | null;
}

export interface ExportJobWriteValues {
  requesterId: string;
  status: ExportJobStatus;
  filter: string | null;
  total: number;
  processed: number;
  resultFilename: string | null;
  resultContent: string | null;
  resultSize: number;
  error: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
}

/** Row shapes as the repository returns them; amounts and dates are coerced on the way into the domain types. */
type ClaimRow = Omit<
  ClaimRecord,
  | 'status'
  | 'totalAmount'
  | 'submittedAt'
  | 'decidedAt'
  | 'paidAt'
  | 'createdAt'
  | 'updatedAt'
> & {
  status: string;
  totalAmount: number | string;
  submittedAt: Date | string | null;
  decidedAt: Date | string | null;
  paidAt: Date | string | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
};

type ItemRow = Omit<ItemRecord, 'amount' | 'expenseDate'> & {
  amount: number | string;
  expenseDate: Date | string | null;
};

type ApprovalRow = Omit<
  ApprovalRecord,
  'action' | 'fromStatus' | 'toStatus' | 'createdAt'
> & {
  action: string;
  fromStatus: string;
  toStatus: string;
  createdAt: Date | string | null;
};

type ExportJobRow = Omit<
  ExportJobRecord,
  | 'status'
  | 'resultSize'
  | 'startedAt'
  | 'finishedAt'
  | 'createdAt'
  | 'updatedAt'
> & {
  status: string;
  resultSize: number | string;
  startedAt: Date | string | null;
  finishedAt: Date | string | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
};

/**
 * `createdAt` and `updatedAt` are ordinary `datetime` columns, and a `uuid` primary key is not generated by the
 * database either — the schema layer declares plain `uuid`/`timestamp` columns with no default. So every write supplies
 * its own id and stamps its own timestamps; the domain values stay free of that bookkeeping.
 */
function stamp(): { createdAt: Date; updatedAt: Date } {
  const now = new Date();
  return { createdAt: now, updatedAt: now };
}

function identified(values: object): { id: string } & object {
  return { id: randomUUID(), ...values };
}

function touched(): { updatedAt: Date } {
  return { updatedAt: new Date() };
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  return value instanceof Date ? value : new Date(value);
}

/**
 * `expenseDate` is a `date` column: keep it as `YYYY-MM-DD` so a timezone shift never moves an expense to the
 * previous day.
 */
function toDateOnly(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

function mapClaim(row: ClaimRow): ClaimRecord {
  return {
    id: row.id,
    claimNo: row.claimNo,
    title: row.title,
    applicantId: row.applicantId,
    applicantName: row.applicantName,
    departmentId: row.departmentId,
    departmentName: row.departmentName,
    status: row.status as ExpenseStatus,
    totalAmount: toAmount(row.totalAmount),
    remark: row.remark,
    submittedAt: toDate(row.submittedAt),
    decidedAt: toDate(row.decidedAt),
    paidAt: toDate(row.paidAt),
    paymentMethod: row.paymentMethod,
    paymentRemark: row.paymentRemark,
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
  };
}

function mapItem(row: ItemRow): ItemRecord {
  return {
    id: row.id,
    claimId: row.claimId,
    category: row.category,
    amount: toAmount(row.amount),
    expenseDate: toDateOnly(row.expenseDate),
    description: row.description,
    invoiceId: row.invoiceId,
    invoiceName: row.invoiceName,
    invoiceExt: row.invoiceExt,
    invoiceType: row.invoiceType,
    sortOrder: row.sortOrder,
  };
}

function mapApproval(row: ApprovalRow): ApprovalRecord {
  return {
    id: row.id,
    claimId: row.claimId,
    action: row.action as ExpenseAction,
    operatorId: row.operatorId,
    operatorName: row.operatorName,
    fromStatus: row.fromStatus as ExpenseStatus,
    toStatus: row.toStatus as ExpenseStatus,
    comment: row.comment,
    createdAt: toDate(row.createdAt),
  };
}

function mapExportJob(row: ExportJobRow): ExportJobRecord {
  return {
    id: row.id,
    requesterId: row.requesterId,
    status: row.status as ExportJobStatus,
    filter: row.filter,
    total: Number(row.total ?? 0),
    processed: Number(row.processed ?? 0),
    resultFilename: row.resultFilename,
    resultContent: row.resultContent,
    resultSize: Number(row.resultSize ?? 0),
    error: row.error,
    startedAt: toDate(row.startedAt),
    finishedAt: toDate(row.finishedAt),
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
  };
}

/** The database-backed store. Collection and Field names stay logical; the connection handles the mapping. */
export class DatabaseExpenseStore implements ExpenseStore {
  constructor(private readonly database: DatabaseManager) {}

  async listDepartments(): Promise<DepartmentRecord[]> {
    const rows = await this.database
      .repository<DepartmentRecord>('expenseDepartments')
      .findMany({
        sort: (sort) => [
          sort.field('sortOrder').asc(),
          sort.field('createdAt').asc(),
        ],
      });
    return rows.map((row) => ({ ...row }));
  }

  async listMemberDepartmentIds(userId: string): Promise<string[]> {
    const rows = await this.database
      .repository<DepartmentMemberRecord>('expenseDepartmentMembers')
      .findMany({
        filter: (filter) =>
          filter.and([
            filter.string('userId').eq(userId),
            filter.boolean('active').isTrue(),
          ]),
      });
    return rows.map((row) => row.departmentId);
  }

  async listClaims(query: ClaimQuery): Promise<ClaimRecord[]> {
    if (query.ids && query.ids.length === 0) {
      return [];
    }
    const rows = await this.database
      .repository<ClaimRow>('expenseClaims')
      .findMany({
        filter: claimFilter(query),
        sort: (sort) =>
          sort
            .field(query.sort ?? 'createdAt')
            [query.order === 'asc' ? 'asc' : 'desc'](),
        limit: query.limit,
        offset: query.offset,
      });
    return rows.map(mapClaim);
  }

  async countClaims(query: ClaimQuery): Promise<number> {
    if (query.ids && query.ids.length === 0) {
      return 0;
    }
    return this.database
      .repository<ClaimRow>('expenseClaims')
      .count({ filter: claimFilter(query) });
  }

  async findClaim(id: string): Promise<ClaimRecord | null> {
    const row = await this.database
      .repository<ClaimRow>('expenseClaims')
      .findOne({ filter: { id } });
    return row ? mapClaim(row) : null;
  }

  async findClaimByNo(claimNo: string): Promise<ClaimRecord | null> {
    const row = await this.database
      .repository<ClaimRow>('expenseClaims')
      .findOne({ filter: { claimNo } });
    return row ? mapClaim(row) : null;
  }

  async findClaimsByIds(ids: readonly string[]): Promise<ClaimRecord[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.database
      .repository<ClaimRow>('expenseClaims')
      .findMany({
        filter: (filter) =>
          filter.or(ids.map((id) => filter.string('id').eq(id))),
      });
    return rows.map(mapClaim);
  }

  async insertClaim(values: ClaimWriteValues): Promise<ClaimRecord> {
    const { record } = await this.database
      .repository<ClaimRow>('expenseClaims')
      .createOne({ values: identified({ ...values, ...stamp() }) });
    return mapClaim(record);
  }

  async updateClaim(
    id: string,
    values: Partial<ClaimWriteValues>,
  ): Promise<void> {
    await this.database
      .repository<ClaimRow>('expenseClaims')
      .updateOne({ filter: { id }, values: { ...values, ...touched() } });
  }

  async updateClaimIfStatus(
    id: string,
    expectedStatus: ExpenseStatus,
    values: Partial<ClaimWriteValues>,
  ): Promise<boolean> {
    const result = await this.database
      .repository<ClaimRow>('expenseClaims')
      .updateMany({
        filter: (filter) =>
          filter.and([
            filter.string('id').eq(id),
            filter.string('status').eq(expectedStatus),
          ]),
        values: { ...values, ...touched() },
      });
    return result.updatedCount === 1;
  }

  async deleteClaim(id: string): Promise<void> {
    await this.database
      .repository<ClaimRow>('expenseClaims')
      .deleteOne({ filter: { id } });
  }

  async listItems(claimId: string): Promise<ItemRecord[]> {
    const rows = await this.database
      .repository<ItemRow>('expenseItems')
      .findMany({
        filter: { claimId },
        sort: (sort) => sort.field('sortOrder').asc(),
      });
    return rows.map(mapItem);
  }

  async listItemsForClaims(claimIds: readonly string[]): Promise<ItemRecord[]> {
    if (claimIds.length === 0) {
      return [];
    }
    const rows = await this.database
      .repository<ItemRow>('expenseItems')
      .findMany({
        filter: (filter) =>
          filter.or(
            claimIds.map((claimId) => filter.string('claimId').eq(claimId)),
          ),
        sort: (sort) => sort.field('sortOrder').asc(),
      });
    return rows.map(mapItem);
  }

  async replaceItems(
    claimId: string,
    items: readonly ItemWriteValues[],
  ): Promise<void> {
    const repository = this.database.repository<ItemRow>('expenseItems');
    await repository.deleteMany({ filter: { claimId } });
    // A claim has a handful of lines; creating them one by one keeps the values fully typed.
    for (const item of items) {
      await repository.createOne({
        values: identified({ ...item, claimId, ...stamp() }),
      });
    }
  }

  async listApprovals(claimId: string): Promise<ApprovalRecord[]> {
    const rows = await this.database
      .repository<ApprovalRow>('expenseApprovals')
      .findMany({
        filter: { claimId },
        sort: (sort) => sort.field('createdAt').asc(),
      });
    return rows.map(mapApproval);
  }

  async listApprovalsForClaims(
    claimIds: readonly string[],
  ): Promise<ApprovalRecord[]> {
    if (claimIds.length === 0) {
      return [];
    }
    const rows = await this.database
      .repository<ApprovalRow>('expenseApprovals')
      .findMany({
        filter: (filter) =>
          filter.or(
            claimIds.map((claimId) => filter.string('claimId').eq(claimId)),
          ),
        sort: (sort) => sort.field('createdAt').asc(),
      });
    return rows.map(mapApproval);
  }

  async insertApproval(values: ApprovalWriteValues): Promise<void> {
    await this.database
      .repository<ApprovalRow>('expenseApprovals')
      .createOne({ values: identified({ ...values, ...stamp() }) });
  }

  async findUser(userId: string): Promise<{ id: string; name: string } | null> {
    const row = await this.database
      .repository<{
        id: string;
        name?: string | null;
        nickname?: string | null;
      }>('user')
      .findOne({ filter: { id: userId } });
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      name: row.nickname?.trim() || row.name?.trim() || row.id,
    };
  }

  async insertExportJob(
    values: ExportJobWriteValues,
  ): Promise<ExportJobRecord> {
    const { record } = await this.database
      .repository<ExportJobRow>('expenseExportJobs')
      .createOne({ values: identified({ ...values, ...stamp() }) });
    return mapExportJob(record);
  }

  async updateExportJob(
    id: string,
    values: Partial<ExportJobWriteValues>,
  ): Promise<void> {
    await this.database
      .repository<ExportJobRow>('expenseExportJobs')
      .updateOne({ filter: { id }, values: { ...values, ...touched() } });
  }

  async findExportJob(id: string): Promise<ExportJobRecord | null> {
    const row = await this.database
      .repository<ExportJobRow>('expenseExportJobs')
      .findOne({ filter: { id } });
    return row ? mapExportJob(row) : null;
  }

  async listExportJobs(requesterId: string): Promise<ExportJobRecord[]> {
    const rows = await this.database
      .repository<ExportJobRow>('expenseExportJobs')
      .findMany({
        filter: { requesterId },
        sort: (sort) => sort.field('createdAt').desc(),
        limit: 20,
      });
    return rows.map(mapExportJob);
  }

  async listUnfinishedExportJobs(): Promise<ExportJobRecord[]> {
    // A host may mount the runtime without this application's migrations — an embedded scope or a minimal test fixture
    // resolves the providers but owns no expense schema. Startup resume is a no-op there; failing the boot because a
    // background job cannot be looked up would make the whole application unusable for that host.
    if (!(await this.database.collections().get('expenseExportJobs'))) {
      return [];
    }
    const rows = await this.database
      .repository<ExportJobRow>('expenseExportJobs')
      .findMany({
        filter: (filter) =>
          filter.or([
            filter.string('status').eq('pending'),
            filter.string('status').eq('running'),
          ]),
        sort: (sort) => sort.field('createdAt').asc(),
      });
    return rows.map(mapExportJob);
  }
}

function claimFilter(query: ClaimQuery) {
  return (filter: FilterBuilder<ClaimRow>): FilterNode => {
    const nodes: FilterNode[] = [];
    if (query.ids?.length) {
      nodes.push(filter.or(query.ids.map((id) => filter.string('id').eq(id))));
    }
    if (query.statuses?.length) {
      nodes.push(
        filter.or(
          query.statuses.map((status) => filter.string('status').eq(status)),
        ),
      );
    }
    if (query.departmentIds?.length) {
      nodes.push(
        filter.or(
          query.departmentIds.map((id) => filter.string('departmentId').eq(id)),
        ),
      );
    }
    if (query.applicantIds?.length) {
      nodes.push(
        filter.or(
          query.applicantIds.map((id) => filter.string('applicantId').eq(id)),
        ),
      );
    }
    if (query.keyword) {
      const keyword = query.keyword;
      nodes.push(
        filter.or([
          filter.string('claimNo').includes(keyword),
          filter.string('title').includes(keyword),
          filter.string('applicantName').includes(keyword),
        ]),
      );
    }
    if (query.submittedFrom) {
      nodes.push(filter.date('submittedAt').notBefore(query.submittedFrom));
    }
    if (query.submittedTo) {
      nodes.push(filter.date('submittedAt').notAfter(query.submittedTo));
    }
    if (query.scope) {
      const ownClaim = filter.string('applicantId').eq(query.scope.userId);
      const managed = query.scope.departmentIds.map((departmentId) =>
        filter.string('departmentId').eq(departmentId),
      );
      nodes.push(managed.length ? filter.or([ownClaim, ...managed]) : ownClaim);
    }
    if (nodes.length === 0) {
      // Every claim has an id, so this matches the whole collection without special-casing the caller.
      return filter.string('id').notEmpty();
    }
    return nodes.length === 1 ? nodes[0] : filter.and(nodes);
  };
}
