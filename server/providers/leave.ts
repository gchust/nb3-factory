import type {
  DatabaseManager,
  FilterNode,
  Repository,
  RepositoryFilter,
} from '@nocobase/db';
import { ApiError } from '@nocobase/app-server/router';

export const LEAVE_ERROR_DOMAIN = 'leave';

export const leaveTypes = ['annual', 'sick', 'personal', 'unpaid'] as const;
export type LeaveType = (typeof leaveTypes)[number];

export const leaveStatuses = ['pending', 'approved', 'rejected'] as const;
export type LeaveStatus = (typeof leaveStatuses)[number];

export interface LeaveRequestRecord {
  id: string;
  userId: string;
  userName: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  reviewerId: string | null;
  reviewerName: string | null;
  reviewComment: string | null;
  submittedAt: Date | string;
  decidedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface LeaveRequestView {
  id: string;
  userId: string;
  userName: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  reviewerId: string | null;
  reviewerName: string | null;
  reviewComment: string | null;
  submittedAt: string;
  decidedAt: string | null;
}

export interface LeaveListInput {
  scope: 'mine' | 'team';
  status?: LeaveStatus;
  type?: LeaveType;
  page: number;
  pageSize: number;
}

export interface CreateLeaveInput {
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
}

export interface LeaveStats {
  pending: number;
  approved: number;
  yearTotal: number;
  teamPending: number | null;
}

export interface LeaveDecisionInput {
  status: 'approved' | 'rejected';
  comment?: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

function invalidDates(message: string): ApiError {
  return new ApiError({
    status: 'INVALID_ARGUMENT',
    reason: 'INVALID_LEAVE_DATES',
    domain: LEAVE_ERROR_DOMAIN,
    message,
  });
}

function parseCalendarDate(value: string): Date {
  if (!DATE_PATTERN.test(value)) {
    throw invalidDates('A leave date must be written as YYYY-MM-DD.');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw invalidDates(`"${value}" is not a real calendar date.`);
  }
  return date;
}

function dateOnly(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function instant(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function view(record: LeaveRequestRecord): LeaveRequestView {
  return {
    id: record.id,
    userId: record.userId,
    userName: record.userName,
    type: record.type,
    startDate: dateOnly(record.startDate),
    endDate: dateOnly(record.endDate),
    days: record.days,
    reason: record.reason,
    status: record.status,
    reviewerId: record.reviewerId ?? null,
    reviewerName: record.reviewerName ?? null,
    reviewComment: record.reviewComment ?? null,
    submittedAt: instant(record.submittedAt) ?? new Date(0).toISOString(),
    decidedAt: instant(record.decidedAt),
  };
}

/** Working days inclusive of both ends; Saturday and Sunday are not counted. */
export function workingDays(startDate: string, endDate: string): number {
  const start = parseCalendarDate(startDate);
  const end = parseCalendarDate(endDate);
  if (end < start) {
    throw invalidDates('The end date cannot be before the start date.');
  }
  let days = 0;
  for (
    let cursor = start;
    cursor.getTime() <= end.getTime();
    cursor = new Date(cursor.getTime() + 86_400_000)
  ) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) days += 1;
  }
  if (days === 0) {
    throw invalidDates(
      'A leave request must include at least one working day.',
    );
  }
  return days;
}

function leaveNotFound(requestId: string): ApiError {
  return new ApiError({
    status: 'NOT_FOUND',
    reason: 'LEAVE_REQUEST_NOT_FOUND',
    domain: LEAVE_ERROR_DOMAIN,
    message: `Leave request ${requestId} was not found.`,
  });
}

/**
 * Leave request domain logic. Routes decide who may call which operation; this
 * service owns date validation, conflict checks and the pending-only transition
 * that makes two managers approving one request safe.
 */
export class LeaveService {
  private readonly requests: Repository<LeaveRequestRecord>;

  constructor(database: DatabaseManager) {
    this.requests = database.repository<LeaveRequestRecord>('leaveRequests');
  }

  async list(
    userId: string,
    input: LeaveListInput,
  ): Promise<{ items: LeaveRequestView[]; total: number }> {
    const filter = this.listFilter(userId, input);
    const [records, total] = await Promise.all([
      this.requests.findMany({
        filter,
        sort: (sort) => [sort.field('submittedAt').desc()],
        offset: (input.page - 1) * input.pageSize,
        limit: input.pageSize,
      }),
      this.requests.count({ filter }),
    ]);
    return { items: records.map(view), total };
  }

  async get(requestId: string): Promise<LeaveRequestView> {
    const record = await this.requests.findOne({ filter: { id: requestId } });
    if (!record) throw leaveNotFound(requestId);
    return view(record);
  }

  async create(
    user: { id: string; name?: string | null; email?: string | null },
    input: CreateLeaveInput,
  ): Promise<LeaveRequestView> {
    const days = workingDays(input.startDate, input.endDate);
    const overlap = await this.requests.findOne({
      filter: (filter) =>
        filter.and([
          filter.string('userId').eq(user.id),
          filter.or([
            filter.string('status').eq('pending'),
            filter.string('status').eq('approved'),
          ]),
          filter.date('startDate').notAfter(input.endDate),
          filter.date('endDate').notBefore(input.startDate),
        ]),
      sort: (sort) => [sort.field('submittedAt').desc()],
    });
    if (overlap) {
      throw new ApiError({
        status: 'FAILED_PRECONDITION',
        reason: 'LEAVE_REQUEST_OVERLAP',
        domain: LEAVE_ERROR_DOMAIN,
        message:
          'This request overlaps leave that is already pending or approved.',
      });
    }

    const now = new Date();
    const created = await this.requests.createOne({
      values: {
        id: crypto.randomUUID(),
        userId: user.id,
        userName: user.name?.trim() || user.email?.trim() || user.id,
        type: input.type,
        startDate: input.startDate,
        endDate: input.endDate,
        days,
        reason: input.reason.trim(),
        status: 'pending',
        reviewerId: null,
        reviewerName: null,
        reviewComment: null,
        submittedAt: now,
        decidedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    });
    return view(created.record);
  }

  /**
   * Moves a request out of `pending` exactly once. The state predicate is part of
   * the update, so a second manager's decision finds nothing to change instead
   * of overwriting the first.
   */
  async decide(
    requestId: string,
    reviewer: { id: string; name: string },
    input: LeaveDecisionInput,
  ): Promise<LeaveRequestView> {
    const now = new Date();
    const result = await this.requests.updateMany({
      filter: (filter) =>
        filter.and([
          filter.string('id').eq(requestId),
          filter.string('status').eq('pending'),
        ]),
      values: {
        status: input.status,
        reviewerId: reviewer.id,
        reviewerName: reviewer.name,
        reviewComment: input.comment?.trim() || null,
        decidedAt: now,
        updatedAt: now,
      },
    });
    if (result.updatedCount === 0) {
      const existing = await this.requests.exists({
        filter: { id: requestId },
      });
      if (!existing) throw leaveNotFound(requestId);
      throw new ApiError({
        status: 'FAILED_PRECONDITION',
        reason: 'LEAVE_REQUEST_NOT_PENDING',
        domain: LEAVE_ERROR_DOMAIN,
        message: `Leave request ${requestId} has already been decided.`,
      });
    }
    return this.get(requestId);
  }

  async stats(userId: string, includeTeam: boolean): Promise<LeaveStats> {
    const year = new Date().getUTCFullYear();
    const yearStart = `${year}-01-01`;
    const nextYearStart = `${year + 1}-01-01`;
    const [pending, approved, yearTotal, teamPending] = await Promise.all([
      this.requests.count({
        filter: (filter) =>
          filter.and([
            filter.string('userId').eq(userId),
            filter.string('status').eq('pending'),
          ]),
      }),
      this.requests.count({
        filter: (filter) =>
          filter.and([
            filter.string('userId').eq(userId),
            filter.string('status').eq('approved'),
            filter.date('startDate').notBefore(yearStart),
            filter.date('startDate').before(nextYearStart),
          ]),
      }),
      this.requests.count({
        filter: (filter) =>
          filter.and([
            filter.string('userId').eq(userId),
            filter.date('startDate').notBefore(yearStart),
            filter.date('startDate').before(nextYearStart),
          ]),
      }),
      includeTeam
        ? this.requests.count({
            filter: (filter) => filter.string('status').eq('pending'),
          })
        : Promise.resolve(null),
    ]);
    return { pending, approved, yearTotal, teamPending };
  }

  /** Approved leave overlapping a calendar month, for the team calendar. */
  async calendar(month: string): Promise<LeaveRequestView[]> {
    const [yearText, monthText] = month.split('-');
    const year = Number(yearText);
    const monthIndex = Number(monthText) - 1;
    const start = new Date(Date.UTC(year, monthIndex, 1));
    const end = new Date(Date.UTC(year, monthIndex + 1, 0));
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);
    const records = await this.requests.findMany({
      filter: (filter) =>
        filter.and([
          filter.string('status').eq('approved'),
          filter.date('startDate').notAfter(endDate),
          filter.date('endDate').notBefore(startDate),
        ]),
      sort: (sort) => [sort.field('startDate').asc()],
      limit: 500,
    });
    return records.map(view);
  }

  private listFilter(
    userId: string,
    input: LeaveListInput,
  ): RepositoryFilter<LeaveRequestRecord> {
    return (filter) => {
      const conditions: FilterNode[] = [];
      if (input.scope === 'mine') {
        conditions.push(filter.string('userId').eq(userId));
      }
      if (input.status) {
        conditions.push(filter.string('status').eq(input.status));
      }
      if (input.type) {
        conditions.push(filter.string('type').eq(input.type));
      }
      return filter.and(conditions);
    };
  }
}
