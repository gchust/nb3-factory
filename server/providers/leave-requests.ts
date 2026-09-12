import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import type { NocoBaseDriveManager } from '@nocobase/drive';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import type {
  FileRecord,
  ServerFileRepositoryManager,
} from '@nocobase/app-plugin-file/server';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/** Leave types offered by the application (事假/病假/年假/调休). */
export const LEAVE_REQUEST_TYPES = [
  'personal',
  'sick',
  'annual',
  'compensatory',
] as const;
export type LeaveRequestType = (typeof LEAVE_REQUEST_TYPES)[number];

/** Workflow states of a leave request. */
export const LEAVE_REQUEST_STATUSES = [
  'pending',
  'approved',
  'rejected',
] as const;
export type LeaveRequestStatus = (typeof LEAVE_REQUEST_STATUSES)[number];

export const EVIDENCE_COLLECTION = 'leaveEvidenceFiles';
export const EVIDENCE_DISK = 'local';
export const EVIDENCE_ACCESS_PATH = '/uploads/leave-evidence';

export interface LeaveRequestActor {
  /** Numeric user id when the identity provider uses one; null otherwise. */
  readonly id: number | null;
  readonly name: string;
}

export interface CreateLeaveRequestInput {
  readonly type: LeaveRequestType;
  readonly startAt: string;
  readonly endAt: string;
  readonly days: number;
  readonly reason: string;
}

export type LeaveRequestRow = {
  id: number;
  applicantId: number | null;
  applicantName: string;
  type: string;
  startAt: unknown;
  endAt: unknown;
  days: unknown;
  reason: string;
  status: string;
  approvalComment: string | null;
  approvedById: number | null;
  approvedByName: string | null;
  approvedAt: unknown;
  createdAt: unknown;
  updatedAt: unknown;
};

export type LeaveEvidenceRow = {
  id: string;
  disk: string;
  key: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number;
  createdAt: unknown;
  updatedAt: unknown;
  leaveRequestId: number | null;
};

/** Evidence record as handed to the API, with a resolvable content URL. */
export interface LeaveEvidenceView extends FileRecord {
  leaveRequestId: number | null;
  contentUrl: string;
}

export interface LeaveRequestSummary {
  id: number;
  applicantId: number | null;
  applicantName: string;
  type: LeaveRequestType;
  startAt: string;
  endAt: string;
  days: number;
  reason: string;
  status: LeaveRequestStatus;
  createdAt: string;
  evidenceCount: number;
}

export interface LeaveRequestDetail extends LeaveRequestSummary {
  approvalComment: string | null;
  approvedById: number | null;
  approvedByName: string | null;
  approvedAt: string | null;
  evidenceFiles: readonly LeaveEvidenceView[];
}

/** Domain errors. Routes translate them into HTTP responses; the service never picks a status code. */
export class LeaveRequestInvalidInputError extends Error {
  public readonly code = 'INVALID_INPUT';
  constructor(message: string) {
    super(message);
    this.name = 'LeaveRequestInvalidInputError';
  }
}

export class LeaveRequestNotFoundError extends Error {
  public readonly code = 'NOT_FOUND';
  constructor(id: number) {
    super(`Leave request ${id} not found.`);
    this.name = 'LeaveRequestNotFoundError';
  }
}

export class LeaveRequestAlreadyProcessedError extends Error {
  public readonly code = 'ALREADY_PROCESSED';
  constructor(public readonly status: LeaveRequestStatus) {
    super(`Leave request has already been processed (${status}).`);
    this.name = 'LeaveRequestAlreadyProcessedError';
  }
}

export class LeaveEvidenceNotFoundError extends Error {
  public readonly code = 'NOT_FOUND';
  constructor(evidenceId: string) {
    super(`Evidence ${evidenceId} not found.`);
    this.name = 'LeaveEvidenceNotFoundError';
  }
}

export interface LeaveRequestService {
  /** All leave requests, newest first, with their evidence count. */
  list(): Promise<readonly LeaveRequestSummary[]>;
  /** One leave request with its evidence files, or undefined. */
  get(id: number): Promise<LeaveRequestDetail | undefined>;
  /** Create a leave request for the given actor. */
  create(
    input: CreateLeaveRequestInput,
    actor: LeaveRequestActor,
  ): Promise<LeaveRequestDetail>;
  /** Approve a pending request, recording approver and time. */
  approve(
    id: number,
    comment: string,
    actor: LeaveRequestActor,
  ): Promise<LeaveRequestDetail>;
  /** Reject a pending request, recording approver and time. */
  reject(
    id: number,
    comment: string,
    actor: LeaveRequestActor,
  ): Promise<LeaveRequestDetail>;
  /** Attach uploaded files to a request and return their stored records. */
  uploadEvidence(
    id: number,
    files: readonly File[],
  ): Promise<readonly FileRecord[]>;
  /** Delete one evidence file (metadata + physical storage) if it belongs to the request. */
  deleteEvidence(requestId: number, evidenceId: string): Promise<void>;
  /** Look up an evidence record by id for the content route. */
  findEvidenceById(evidenceId: string): Promise<LeaveEvidenceRow | undefined>;
}

export const leaveRequestServiceToken: ServiceToken<LeaveRequestService> =
  createServiceToken<LeaveRequestService>('app/leave-request-service');

export default class LeaveRequestServiceProvider extends ServiceProvider<Application> {
  public readonly name = 'app/leave-request-provider';

  public override register(): void {
    this.app.container.singleton(leaveRequestServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      const files = this.app.container.resolve(
        serverFileRepositoryManagerToken,
      );
      const drive = this.app.container.resolve(driveManagerToken);
      return createLeaveRequestService(database, files, drive);
    });
  }
}

export function createLeaveRequestService(
  database: DatabaseManager,
  files: ServerFileRepositoryManager,
  drive: NocoBaseDriveManager,
): LeaveRequestService {
  const evidence = files.repository(EVIDENCE_COLLECTION, {
    disk: EVIDENCE_DISK,
    accessPath: EVIDENCE_ACCESS_PATH,
  });

  const query = database.query();
  const now = () => new Date();

  async function process(
    id: number,
    comment: string,
    actor: LeaveRequestActor,
    target: Extract<LeaveRequestStatus, 'approved' | 'rejected'>,
  ) {
    const row = await query
      .selectFrom('leaveRequests')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw new LeaveRequestNotFoundError(id);
    const request = row as unknown as LeaveRequestRow;
    if (request.status !== 'pending') {
      throw new LeaveRequestAlreadyProcessedError(statusOf(request.status));
    }
    const nowValue = now();
    await query
      .updateTable('leaveRequests')
      .set({
        status: target,
        approvalComment: comment.trim(),
        approvedById: actor.id,
        approvedByName: actor.name,
        approvedAt: nowValue,
        updatedAt: nowValue,
      })
      .where('id', '=', id)
      .execute();
    const updated = await query
      .selectFrom('leaveRequests')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    return detailOf(updated as LeaveRequestRow, await evidenceRows(id));
  }

  async function evidenceRows(
    requestId: number,
  ): Promise<readonly LeaveEvidenceRow[]> {
    const rows = await query
      .selectFrom('leaveEvidenceFiles')
      .selectAll()
      .where('leaveRequestId', '=', requestId)
      .orderBy('createdAt', 'asc')
      .execute();
    return rows as unknown as LeaveEvidenceRow[];
  }

  return {
    async list() {
      const [rows, counts] = await Promise.all([
        query
          .selectFrom('leaveRequests')
          .selectAll()
          .orderBy('createdAt', 'desc')
          .execute(),
        query
          .selectFrom('leaveEvidenceFiles')
          .select(['leaveRequestId', 'id'])
          .execute(),
      ]);
      const countByRequest = new Map<number, number>();
      for (const row of counts) {
        const requestId = row.leaveRequestId;
        if (typeof requestId === 'number') {
          countByRequest.set(
            requestId,
            (countByRequest.get(requestId) ?? 0) + 1,
          );
        }
      }
      return (rows as unknown as LeaveRequestRow[]).map((row) => ({
        id: row.id,
        applicantId: row.applicantId,
        applicantName: row.applicantName,
        type: typeOf(row.type),
        startAt: toIso(row.startAt),
        endAt: toIso(row.endAt),
        days: Number(row.days),
        reason: row.reason,
        status: statusOf(row.status),
        createdAt: toIso(row.createdAt),
        evidenceCount: countByRequest.get(row.id) ?? 0,
      }));
    },

    async get(id) {
      const row = await query
        .selectFrom('leaveRequests')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!row) return undefined;
      return detailOf(row as LeaveRequestRow, await evidenceRows(id));
    },

    async create(input, actor) {
      const nowValue = now();
      const result = await query
        .insertInto('leaveRequests')
        .values({
          applicantId: actor.id,
          applicantName: actor.name,
          type: input.type,
          startAt: new Date(input.startAt),
          endAt: new Date(input.endAt),
          days: input.days,
          reason: input.reason.trim(),
          status: 'pending',
          approvalComment: null,
          approvedById: null,
          approvedByName: null,
          approvedAt: null,
          createdAt: nowValue,
          updatedAt: nowValue,
        })
        .execute();
      const id = Number(result.insertId);
      if (!Number.isInteger(id)) {
        throw new Error(
          'The database did not return the new leave request id.',
        );
      }
      const inserted = await query
        .selectFrom('leaveRequests')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      return detailOf(inserted as LeaveRequestRow, await evidenceRows(id));
    },

    async approve(id, comment, actor) {
      return process(id, comment, actor, 'approved');
    },

    async reject(id, comment, actor) {
      return process(id, comment, actor, 'rejected');
    },

    async uploadEvidence(id, filesToUpload) {
      await this.get(id).then((request) => {
        if (!request) throw new LeaveRequestNotFoundError(id);
      });
      const { records } = await evidence.uploadMany({ files: filesToUpload });
      if (records.length > 0) {
        await query
          .updateTable('leaveEvidenceFiles')
          .set({ leaveRequestId: id, updatedAt: new Date() })
          .where(
            'id',
            'in',
            records.map((record) => record.id),
          )
          .execute();
      }
      // Re-read so every returned record carries its request link. `id` and `id`
      // are unique together, so ordering is stable per record.
      if (records.length === 0) return [];
      const rows = await query
        .selectFrom('leaveEvidenceFiles')
        .selectAll()
        .where(
          'id',
          'in',
          records.map((record) => record.id),
        )
        .orderBy('createdAt', 'asc')
        .execute();
      return rows as unknown as readonly FileRecord[];
    },

    async deleteEvidence(requestId, evidenceId) {
      const record = await query
        .selectFrom('leaveEvidenceFiles')
        .selectAll()
        .where('id', '=', evidenceId)
        .where('leaveRequestId', '=', requestId)
        .executeTakeFirst();
      if (!record) throw new LeaveEvidenceNotFoundError(evidenceId);
      const file = record as unknown as LeaveEvidenceRow;
      await query
        .deleteFrom('leaveEvidenceFiles')
        .where('id', '=', evidenceId)
        .execute();
      // Best effort physical deletion; the metadata is already gone.
      try {
        await drive.use(file.disk).delete(file.key);
      } catch (error) {
        // Ignored: an orphaned storage object is harmless.
        void error;
      }
    },

    async findEvidenceById(evidenceId) {
      const row = await query
        .selectFrom('leaveEvidenceFiles')
        .selectAll()
        .where('id', '=', evidenceId)
        .executeTakeFirst();
      return row as unknown as LeaveEvidenceRow | undefined;
    },
  };
}

function detailOf(
  row: LeaveRequestRow,
  evidenceRows: readonly LeaveEvidenceRow[],
): LeaveRequestDetail {
  return {
    id: row.id,
    applicantId: row.applicantId,
    applicantName: row.applicantName,
    type: typeOf(row.type),
    startAt: toIso(row.startAt),
    endAt: toIso(row.endAt),
    days: Number(row.days),
    reason: row.reason,
    status: statusOf(row.status),
    createdAt: toIso(row.createdAt),
    evidenceCount: evidenceRows.length,
    approvalComment: row.approvalComment,
    approvedById: row.approvedById,
    approvedByName: row.approvedByName,
    approvedAt: row.approvedAt ? toIso(row.approvedAt) : null,
    evidenceFiles: evidenceRows.map((record) => ({
      ...record,
      contentUrl: '',
    })) as readonly LeaveEvidenceView[],
  };
}

function typeOf(value: string): LeaveRequestType {
  if ((LEAVE_REQUEST_TYPES as readonly string[]).includes(value)) {
    return value as LeaveRequestType;
  }
  throw new LeaveRequestInvalidInputError(`Unknown leave type: ${value}`);
}

function statusOf(value: string): LeaveRequestStatus {
  if ((LEAVE_REQUEST_STATUSES as readonly string[]).includes(value)) {
    return value as LeaveRequestStatus;
  }
  throw new LeaveRequestInvalidInputError(`Unknown leave status: ${value}`);
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return String(value);
}
