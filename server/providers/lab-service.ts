import { randomUUID } from 'node:crypto';

import {
  databaseManagerToken,
  type DatabaseManager,
  type QueryAdapter,
} from '@nocobase/db';
import { addBasePathToLocation } from '@nocobase/app-server/support';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';

/**
 * All laboratory business rules live here.
 *
 * The routes above this layer only parse HTTP input, resolve the caller and map
 * a `LabError` to a status code. Everything that decides *who may see what* and
 * *which transition is legal* is a method on this service, so the same rules
 * apply whether a call arrives from a page, a test, or a future job.
 */

export type LabRole =
  'lab_admin' | 'teacher' | 'technician' | 'safety_officer' | 'student';

export type FileTargetType =
  | 'laboratory'
  | 'equipment'
  | 'calibration'
  | 'work_order'
  | 'safety_check'
  | 'training_record';

export interface LabAccess {
  readonly userId: string;
  readonly isRoot: boolean;
  /**
   * Holds the `lab-student` permission set. Together with the absence of a
   * staff membership this is what grants the published-equipment catalogue.
   */
  readonly isStudent: boolean;
  readonly memberships: readonly { labId: number; role: LabRole }[];
}

export class LabError extends Error {
  public constructor(
    public readonly status: 400 | 403 | 404 | 409,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'LabError';
  }
}

const forbidden = (message = 'You do not have access to this record.') =>
  new LabError(403, 'FORBIDDEN', message);
const notFound = (message = 'Record not found.') =>
  new LabError(404, 'NOT_FOUND', message);
const invalid = (message: string) =>
  new LabError(400, 'INVALID_INPUT', message);
const conflict = (message: string) => new LabError(409, 'CONFLICT', message);

type Row = Record<string, unknown>;

const num = (value: unknown): number =>
  value === null || value === undefined ? 0 : Number(value);
const int = (value: unknown): number | null =>
  value === null || value === undefined || value === '' ? null : Number(value);
/**
 * A stored value as text.
 *
 * A record value arrives from the database as data, so the scalars this knows about are read directly
 * and anything else is described rather than coerced into `"[object Object]"`.
 */
function scalarText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  return value === null || value === undefined ? '' : JSON.stringify(value);
}

const text = (value: unknown): string =>
  value === null || value === undefined ? '' : scalarText(value);
const optionalText = (value: unknown): string | null =>
  value === null || value === undefined || value === ''
    ? null
    : scalarText(value);
const flag = (value: unknown): boolean =>
  value === true || value === 1 || value === '1' || value === 'true';

/** Reads a stored temporal value back as a `Date`, using the wall-clock form the query builder writes. */
function toDate(value: unknown): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(scalarText(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function iso(value: unknown): string | null {
  return toDate(value)?.toISOString() ?? null;
}

function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }
  if (typeof value === 'string') {
    return Buffer.from(value, 'binary');
  }
  return Buffer.alloc(0);
}

function normalizeString(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  const result = typeof value === 'string' ? value.trim() : '';
  if (!result) {
    throw invalid(`${field} is required.`);
  }
  if (result.length > maxLength) {
    throw invalid(`${field} must be at most ${maxLength} characters.`);
  }
  return result;
}

function optionalString(
  value: unknown,
  field: string,
  maxLength: number,
): string | null {
  const result = optionalText(value);
  if (result !== null && result.length > maxLength) {
    throw invalid(`${field} must be at most ${maxLength} characters.`);
  }
  return result;
}

function parseDate(value: unknown, field: string): Date {
  const result = toDate(value);
  if (!result) {
    throw invalid(`${field} must be a valid date.`);
  }
  return result;
}

function requireEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  const result = typeof value === 'string' ? value : '';
  if (!allowed.includes(result as T)) {
    throw invalid(`${field} must be one of: ${allowed.join(', ')}.`);
  }
  return result as T;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EQUIPMENT_STATUSES = [
  'available',
  'in_use',
  'maintenance',
  'retired',
] as const;
const WORK_ORDER_TYPES = [
  'repair',
  'maintenance',
  'calibration',
  'scrap',
] as const;
const WORK_ORDER_PRIORITIES = ['low', 'normal', 'high', 'critical'] as const;
const SAFETY_RESULTS = ['pending', 'pass', 'issue'] as const;
const SAFETY_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
const BLOCKING_SEVERITIES = ['high', 'critical'];
const LAB_ROLES: readonly LabRole[] = [
  'lab_admin',
  'teacher',
  'technician',
  'safety_officer',
  'student',
];

const FILE_PURPOSES: readonly string[] = [
  'nameplate',
  'manual',
  'certificate',
  'before_repair',
  'after_repair',
  'fault_report',
  'roster',
  'risk_notice',
  'archive',
  'attachment',
];

/** Purposes a student may read even without lab membership. */
const STUDENT_FILE_PURPOSES = new Set(['manual', 'nameplate']);

const EXTENSION_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  csv: 'text/csv',
  txt: 'text/plain',
  md: 'text/markdown',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
};

const ALLOWED_UPLOAD_EXTENSIONS = new Set(Object.keys(EXTENSION_MIME));
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

// ---------------------------------------------------------------------------
// View types
// ---------------------------------------------------------------------------

export interface LaboratoryView {
  id: number;
  code: string;
  name: string;
  building: string | null;
  room: string | null;
  description: string | null;
  status: string;
  role: LabRole | null;
  equipmentCount: number;
  createdAt: string | null;
}

export interface LabMemberView {
  userId: string;
  role: LabRole;
  name: string | null;
  email: string | null;
}

export interface EquipmentView {
  id: number;
  assetNo: string;
  name: string;
  model: string | null;
  serialNo: string | null;
  category: string | null;
  labId: number;
  labName: string | null;
  status: string;
  purchaseDate: string | null;
  ownerName: string | null;
  description: string | null;
  studentVisible: boolean;
  studentDescription: string | null;
  calibrationExpiresAt: string | null;
  calibrationExpired: boolean;
  calibrationExpiringSoon: boolean;
  openBlockingIssues: number;
  restricted: boolean;
}

export interface CalibrationView {
  id: number;
  equipmentId: number;
  calibratedAt: string | null;
  expiresAt: string | null;
  provider: string | null;
  certificateNo: string | null;
  result: string;
  notes: string | null;
  expired: boolean;
  createdAt: string | null;
}

export interface ReservationView {
  id: number;
  equipmentId: number;
  equipmentName: string | null;
  assetNo: string | null;
  userId: string;
  startsAt: string | null;
  endsAt: string | null;
  purpose: string | null;
  status: string;
  createdAt: string | null;
}

export interface WorkOrderEventView {
  id: number;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  comment: string | null;
  actorId: string | null;
  createdAt: string | null;
}

export interface WorkOrderView {
  id: number;
  code: string;
  equipmentId: number;
  equipmentName: string | null;
  assetNo: string | null;
  labId: number;
  labName: string | null;
  title: string;
  description: string | null;
  type: string;
  priority: string;
  status: string;
  assigneeId: string | null;
  createdById: string | null;
  resolvedAt: string | null;
  reviewComment: string | null;
  reviewedById: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  events?: WorkOrderEventView[];
}

export interface SafetyCheckView {
  id: number;
  labId: number;
  labName: string | null;
  title: string;
  checkType: string | null;
  result: string;
  severity: string | null;
  status: string;
  findings: string | null;
  checkedAt: string | null;
  checkedById: string | null;
  closedAt: string | null;
  closedById: string | null;
  createdAt: string | null;
}

export interface TrainingRecordView {
  id: number;
  labId: number;
  labName: string | null;
  equipmentId: number | null;
  equipmentName: string | null;
  title: string;
  trainer: string | null;
  trainedAt: string | null;
  participantCount: number;
  notes: string | null;
  createdById: string | null;
  createdAt: string | null;
}

export interface LabFileView {
  id: string;
  filename: string;
  ext: string | null;
  mimeType: string;
  size: number;
  purpose: string | null;
  targetType: FileTargetType;
  targetId: string;
  remark: string | null;
  uploadedById: string | null;
  /** Display name of the uploading account, when it can still be resolved. */
  uploadedByName: string | null;
  createdAt: string | null;
  /** Server-built same-origin URL. */
  contentUrl: string;
}

export interface FileReadResult {
  filename: string;
  mimeType: string;
  size: number;
  content: Buffer;
}

interface TargetInfo {
  targetType: FileTargetType;
  targetId: string;
  labId: number | null;
  studentVisible: boolean;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface LabService {
  access(userId: string): Promise<LabAccess>;
  listLaboratories(userId: string): Promise<LaboratoryView[]>;
  listLabMembers(userId: string, labId: number): Promise<LabMemberView[]>;
  createLaboratory(
    userId: string,
    input: Record<string, unknown>,
  ): Promise<LaboratoryView>;
  updateLaboratory(
    userId: string,
    id: number,
    input: Record<string, unknown>,
  ): Promise<LaboratoryView>;

  listEquipment(
    userId: string,
    filters: Record<string, unknown>,
  ): Promise<EquipmentView[]>;
  getEquipment(userId: string, id: number): Promise<EquipmentView>;
  createEquipment(
    userId: string,
    input: Record<string, unknown>,
  ): Promise<EquipmentView>;
  updateEquipment(
    userId: string,
    id: number,
    input: Record<string, unknown>,
  ): Promise<EquipmentView>;

  listCalibrations(
    userId: string,
    filters: Record<string, unknown>,
  ): Promise<CalibrationView[]>;
  createCalibration(
    userId: string,
    input: Record<string, unknown>,
  ): Promise<CalibrationView>;

  listReservations(
    userId: string,
    filters: Record<string, unknown>,
  ): Promise<ReservationView[]>;
  createReservation(
    userId: string,
    input: Record<string, unknown>,
  ): Promise<ReservationView>;
  cancelReservation(userId: string, id: number): Promise<ReservationView>;

  listWorkOrders(
    userId: string,
    filters: Record<string, unknown>,
  ): Promise<WorkOrderView[]>;
  getWorkOrder(userId: string, id: number): Promise<WorkOrderView>;
  createWorkOrder(
    userId: string,
    input: Record<string, unknown>,
  ): Promise<WorkOrderView>;
  transitionWorkOrder(
    userId: string,
    id: number,
    input: Record<string, unknown>,
  ): Promise<WorkOrderView>;

  listSafetyChecks(
    userId: string,
    filters: Record<string, unknown>,
  ): Promise<SafetyCheckView[]>;
  createSafetyCheck(
    userId: string,
    input: Record<string, unknown>,
  ): Promise<SafetyCheckView>;
  updateSafetyCheck(
    userId: string,
    id: number,
    input: Record<string, unknown>,
  ): Promise<SafetyCheckView>;
  closeSafetyCheck(
    userId: string,
    id: number,
    input: Record<string, unknown>,
  ): Promise<SafetyCheckView>;

  listTrainingRecords(
    userId: string,
    filters: Record<string, unknown>,
  ): Promise<TrainingRecordView[]>;
  createTrainingRecord(
    userId: string,
    input: Record<string, unknown>,
  ): Promise<TrainingRecordView>;
  updateTrainingRecord(
    userId: string,
    id: number,
    input: Record<string, unknown>,
  ): Promise<TrainingRecordView>;

  dashboard(userId: string): Promise<Record<string, unknown>>;

  listFiles(
    userId: string,
    targetType: string,
    targetId: string,
  ): Promise<LabFileView[]>;
  uploadFile(
    userId: string,
    input: {
      targetType: string;
      targetId: string;
      purpose?: string | null;
      remark?: string | null;
      filename: string;
      mimeType?: string | null;
      content: Buffer;
    },
  ): Promise<LabFileView>;
  updateFile(
    userId: string,
    id: string,
    input: Record<string, unknown>,
  ): Promise<LabFileView>;
  deleteFile(userId: string, id: string): Promise<void>;
  readFile(userId: string, id: string): Promise<FileReadResult>;
}

export const labServiceToken: ServiceToken<LabService> =
  createServiceToken<LabService>('@nocobase/app/lab-service');

class LabServiceImpl implements LabService {
  private readonly query: QueryAdapter;

  public constructor(
    database: DatabaseManager,
    private readonly publicBasePath: string,
  ) {
    this.query = database.query();
  }

  // -- access ---------------------------------------------------------------

  public async access(userId: string): Promise<LabAccess> {
    const assignmentRows = await this.query
      .selectFrom('authorizationPermissionSetAssignments')
      .select('permissionSetKey')
      .where('subjectType', '=', 'user')
      .where('subjectId', '=', userId)
      .execute();
    const permissionSets = assignmentRows.map((row) =>
      text(row.permissionSetKey),
    );

    const membershipRows = await this.query
      .selectFrom('lab_members')
      .select(['labId', 'role'])
      .where('userId', '=', userId)
      .execute();

    const memberships = membershipRows.map((row) => ({
      labId: num(row.labId),
      role: text(row.role) as LabRole,
    }));

    return {
      userId,
      isRoot: permissionSets.includes('root'),
      isStudent: permissionSets.includes('lab-student'),
      memberships,
    };
  }

  /** Memberships that carry staff privileges; the `student` role is not one. */
  private staffMemberships(
    access: LabAccess,
  ): { labId: number; role: LabRole }[] {
    return access.memberships.filter(
      (membership) =>
        membership.role !== 'student' && LAB_ROLES.includes(membership.role),
    );
  }

  /**
   * Whether the caller reads the published subset of the equipment ledger.
   *
   * Only an account that holds the `lab-student` permission set and no staff
   * membership reads published records. A plain authenticated account with no
   * laboratory role sees nothing, so the `studentVisible` flag on a record can
   * never be used to enumerate another laboratory's data.
   */
  private readsPublishedCatalog(access: LabAccess): boolean {
    return access.isStudent && this.staffMemberships(access).length === 0;
  }

  /**
   * Whether the caller carries staff responsibility somewhere else and nowhere
   * near this record.
   *
   * `studentVisible` is what a caller with no laboratory responsibility may
   * read; it is not a substitute for membership. A staff member of one
   * laboratory must not read another laboratory's records, even a
   * student-visible one, so the flag is only honoured for a caller who holds no
   * staff membership at all. Root is exempt, and a record with no laboratory
   * cannot be foreign.
   */
  private isForeignStaff(access: LabAccess, labId: number | null): boolean {
    if (access.isRoot || labId === null) {
      return false;
    }
    const staff = this.staffMemberships(access);
    return staff.length > 0 && !staff.some((item) => item.labId === labId);
  }

  private assertLabRead(access: LabAccess, labId: number | null): void {
    if (access.isRoot) {
      return;
    }
    if (
      labId !== null &&
      this.staffMemberships(access).some((item) => item.labId === labId)
    ) {
      return;
    }
    throw forbidden('You are not a member of this laboratory.');
  }

  private assertLabWrite(
    access: LabAccess,
    labId: number,
    roles: readonly LabRole[],
  ): void {
    if (access.isRoot) {
      return;
    }
    const membership = this.staffMemberships(access).find(
      (item) => item.labId === labId,
    );
    if (membership && roles.includes(membership.role)) {
      return;
    }
    throw forbidden(
      'Your role in this laboratory does not allow this operation.',
    );
  }

  // -- laboratories ---------------------------------------------------------

  private laboratoryView(
    row: Row,
    access: LabAccess,
    equipmentCount: number,
  ): LaboratoryView {
    return {
      id: num(row.id),
      code: text(row.code),
      name: text(row.name),
      building: optionalText(row.building),
      room: optionalText(row.room),
      description: optionalText(row.description),
      status: text(row.status),
      role:
        access.memberships.find((item) => item.labId === num(row.id))?.role ??
        null,
      equipmentCount,
      createdAt: iso(row.createdAt),
    };
  }

  public async listLaboratories(userId: string): Promise<LaboratoryView[]> {
    const access = await this.access(userId);
    const staffLabIds = this.staffMemberships(access).map((item) => item.labId);

    let rows: Row[];
    if (access.isRoot) {
      rows = await this.query
        .selectFrom('laboratories')
        .selectAll()
        .orderBy('code', 'asc')
        .execute();
    } else if (staffLabIds.length > 0) {
      rows = await this.query
        .selectFrom('laboratories')
        .selectAll()
        .where((eb) => eb('id', 'in', staffLabIds))
        .orderBy('code', 'asc')
        .execute();
    } else if (this.readsPublishedCatalog(access)) {
      // A student sees only laboratories that hold equipment they may view.
      const visible = await this.query
        .selectFrom('equipment')
        .select('labId')
        .where('studentVisible', '=', true)
        .execute();
      const ids = [...new Set(visible.map((row) => num(row.labId)))];
      rows =
        ids.length === 0
          ? []
          : await this.query
              .selectFrom('laboratories')
              .selectAll()
              .where((eb) => eb('id', 'in', ids))
              .orderBy('code', 'asc')
              .execute();
    } else {
      // An authenticated account without a laboratory role sees no laboratory.
      rows = [];
    }

    const counts = await this.equipmentCountsByLab();
    return rows.map((row) =>
      this.laboratoryView(row, access, counts.get(num(row.id)) ?? 0),
    );
  }

  /**
   * The people attached to a laboratory, for choosing who a work order is given to.
   *
   * Reading a laboratory's roster is part of reading the laboratory, so the same
   * membership rule applies; the names come from the account table the
   * authentication plugin owns, joined here rather than exposed as a second
   * endpoint of its own.
   */
  public async listLabMembers(
    userId: string,
    labId: number,
  ): Promise<LabMemberView[]> {
    const access = await this.access(userId);
    this.assertLabRead(access, labId);
    const rows = await this.query
      .selectFrom('lab_members')
      .innerJoin('user', 'user.id', 'lab_members.userId')
      .select([
        'lab_members.userId',
        'lab_members.role',
        'user.name',
        'user.email',
      ])
      .where('lab_members.labId', '=', labId)
      .orderBy('user.name', 'asc')
      .execute();
    return rows.map((row) => ({
      userId: text(row.userId),
      role: text(row.role) as LabRole,
      name: optionalText(row.name),
      email: optionalText(row.email),
    }));
  }

  private async equipmentCountsByLab(): Promise<Map<number, number>> {
    const rows = await this.query
      .selectFrom('equipment')
      .select('labId')
      .execute();
    const counts = new Map<number, number>();
    for (const row of rows) {
      const labId = num(row.labId);
      counts.set(labId, (counts.get(labId) ?? 0) + 1);
    }
    return counts;
  }

  public async createLaboratory(
    userId: string,
    input: Record<string, unknown>,
  ): Promise<LaboratoryView> {
    const access = await this.access(userId);
    if (
      !access.isRoot &&
      this.staffMemberships(access).every((item) => item.role !== 'lab_admin')
    ) {
      throw forbidden(
        'Only a laboratory administrator may create a laboratory.',
      );
    }
    const code = normalizeString(input.code, 'code', 64);
    const existing = await this.query
      .selectFrom('laboratories')
      .select('id')
      .where('code', '=', code)
      .executeTakeFirst();
    if (existing) {
      throw conflict(`Laboratory code ${code} already exists.`);
    }
    const now = new Date();
    await this.query
      .insertInto('laboratories')
      .values({
        code,
        name: normalizeString(input.name, 'name', 200),
        building: optionalString(input.building, 'building', 200),
        room: optionalString(input.room, 'room', 64),
        description: optionalString(input.description, 'description', 4000),
        status: requireEnum(
          input.status ?? 'active',
          ['active', 'inactive'] as const,
          'status',
        ),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const row = await this.query
      .selectFrom('laboratories')
      .selectAll()
      .where('code', '=', code)
      .executeTakeFirstOrThrow();
    return this.laboratoryView(row, access, 0);
  }

  public async updateLaboratory(
    userId: string,
    id: number,
    input: Record<string, unknown>,
  ): Promise<LaboratoryView> {
    const access = await this.access(userId);
    this.assertLabWrite(access, id, ['lab_admin']);
    const current = await this.query
      .selectFrom('laboratories')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!current) {
      throw notFound('Laboratory not found.');
    }
    await this.query
      .updateTable('laboratories')
      .set({
        name:
          input.name === undefined
            ? text(current.name)
            : normalizeString(input.name, 'name', 200),
        building:
          input.building === undefined
            ? optionalText(current.building)
            : optionalString(input.building, 'building', 200),
        room:
          input.room === undefined
            ? optionalText(current.room)
            : optionalString(input.room, 'room', 64),
        description:
          input.description === undefined
            ? optionalText(current.description)
            : optionalString(input.description, 'description', 4000),
        status:
          input.status === undefined
            ? text(current.status)
            : requireEnum(
                input.status,
                ['active', 'inactive'] as const,
                'status',
              ),
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .execute();
    const row = await this.query
      .selectFrom('laboratories')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    const counts = await this.equipmentCountsByLab();
    return this.laboratoryView(row, access, counts.get(id) ?? 0);
  }

  // -- equipment ------------------------------------------------------------

  private async labNames(): Promise<Map<number, string>> {
    const rows = await this.query
      .selectFrom('laboratories')
      .select(['id', 'name'])
      .execute();
    return new Map(rows.map((row) => [num(row.id), text(row.name)]));
  }

  private async latestCalibrations(
    equipmentIds: number[],
  ): Promise<Map<number, Row>> {
    if (equipmentIds.length === 0) {
      return new Map();
    }
    const rows = await this.query
      .selectFrom('calibration_records')
      .selectAll()
      .where((eb) => eb('equipmentId', 'in', equipmentIds))
      .orderBy('expiresAt', 'desc')
      .execute();
    const latest = new Map<number, Row>();
    for (const row of rows) {
      const equipmentId = num(row.equipmentId);
      if (!latest.has(equipmentId)) {
        latest.set(equipmentId, row);
      }
    }
    return latest;
  }

  private async openBlockingIssueCounts(): Promise<Map<number, number>> {
    const rows = await this.query
      .selectFrom('safety_checks')
      .select(['labId', 'severity', 'status'])
      .execute();
    const counts = new Map<number, number>();
    for (const row of rows) {
      if (
        text(row.status) !== 'closed' &&
        BLOCKING_SEVERITIES.includes(text(row.severity))
      ) {
        const labId = num(row.labId);
        counts.set(labId, (counts.get(labId) ?? 0) + 1);
      }
    }
    return counts;
  }

  private equipmentView(
    row: Row,
    options: {
      restricted: boolean;
      labName: string | null;
      calibration: Row | undefined;
      blockingIssues: number;
      now: Date;
    },
  ): EquipmentView {
    const expiresAt = options.calibration
      ? toDate(options.calibration.expiresAt)
      : null;
    const calibrationExpired =
      !expiresAt || expiresAt.getTime() < options.now.getTime();
    const soonThreshold = options.now.getTime() + 30 * 24 * 60 * 60 * 1000;
    const calibrationExpiringSoon =
      Boolean(expiresAt) &&
      !calibrationExpired &&
      expiresAt.getTime() <= soonThreshold;

    return {
      id: num(row.id),
      assetNo: text(row.assetNo),
      name: text(row.name),
      model: options.restricted ? null : optionalText(row.model),
      serialNo: options.restricted ? null : optionalText(row.serialNo),
      category: optionalText(row.category),
      labId: num(row.labId),
      labName: options.labName,
      status: text(row.status),
      purchaseDate: options.restricted ? null : iso(row.purchaseDate),
      ownerName: options.restricted ? null : optionalText(row.ownerName),
      description: options.restricted
        ? optionalText(row.studentDescription)
        : optionalText(row.description),
      studentVisible: flag(row.studentVisible),
      studentDescription: optionalText(row.studentDescription),
      calibrationExpiresAt: expiresAt ? expiresAt.toISOString() : null,
      calibrationExpired,
      calibrationExpiringSoon,
      openBlockingIssues: options.blockingIssues,
      restricted: options.restricted,
    };
  }

  private async buildEquipmentViews(
    rows: Row[],
    access: LabAccess,
  ): Promise<EquipmentView[]> {
    const now = new Date();
    const names = await this.labNames();
    const calibrations = await this.latestCalibrations(
      rows.map((row) => num(row.id)),
    );
    const blocking = await this.openBlockingIssueCounts();
    const staffLabIds = new Set(
      this.staffMemberships(access).map((item) => item.labId),
    );

    return rows.map((row) =>
      this.equipmentView(row, {
        restricted: !access.isRoot && !staffLabIds.has(num(row.labId)),
        labName: names.get(num(row.labId)) ?? null,
        calibration: calibrations.get(num(row.id)),
        blockingIssues: blocking.get(num(row.labId)) ?? 0,
        now,
      }),
    );
  }

  public async listEquipment(
    userId: string,
    filters: Record<string, unknown>,
  ): Promise<EquipmentView[]> {
    const access = await this.access(userId);
    const staffLabIds = this.staffMemberships(access).map((item) => item.labId);
    const requestedLabId = int(filters.labId);
    const status =
      typeof filters.status === 'string' && filters.status
        ? filters.status
        : null;
    const category =
      typeof filters.category === 'string' && filters.category
        ? filters.category
        : null;
    const search =
      typeof filters.q === 'string' && filters.q.trim()
        ? filters.q.trim()
        : null;

    let builder = this.query.selectFrom('equipment').selectAll();
    if (!access.isRoot) {
      if (staffLabIds.length > 0) {
        builder = builder.where((eb) => eb('labId', 'in', staffLabIds));
      } else if (this.readsPublishedCatalog(access)) {
        builder = builder.where('studentVisible', '=', true);
      } else {
        // No laboratory role and no student permission set: nothing to read.
        return [];
      }
    }
    if (requestedLabId !== null) {
      builder = builder.where('labId', '=', requestedLabId);
    }
    if (status) {
      builder = builder.where('status', '=', status);
    }
    if (category) {
      builder = builder.where('category', '=', category);
    }
    if (search) {
      const pattern = `%${search}%`;
      builder = builder.where((eb) =>
        eb.or([eb('name', 'like', pattern), eb('assetNo', 'like', pattern)]),
      );
    }

    const rows = await builder.orderBy('assetNo', 'asc').execute();
    return this.buildEquipmentViews(rows, access);
  }

  private async loadEquipment(id: number): Promise<Row> {
    const row = await this.query
      .selectFrom('equipment')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) {
      throw notFound('Equipment not found.');
    }
    return row;
  }

  private async equipmentTarget(id: number): Promise<TargetInfo> {
    const row = await this.loadEquipment(id);
    return {
      targetType: 'equipment',
      targetId: String(id),
      labId: num(row.labId),
      studentVisible: flag(row.studentVisible),
    };
  }

  public async getEquipment(
    userId: string,
    id: number,
  ): Promise<EquipmentView> {
    const access = await this.access(userId);
    const row = await this.loadEquipment(id);
    const labId = num(row.labId);
    const isStaff =
      access.isRoot ||
      this.staffMemberships(access).some((item) => item.labId === labId);
    const seesPublished =
      this.readsPublishedCatalog(access) && flag(row.studentVisible);
    if (!isStaff && !seesPublished) {
      throw forbidden('This equipment record is not visible to you.');
    }
    const [view] = await this.buildEquipmentViews([row], access);
    return view;
  }

  public async createEquipment(
    userId: string,
    input: Record<string, unknown>,
  ): Promise<EquipmentView> {
    const access = await this.access(userId);
    const labId = int(input.labId);
    if (labId === null) {
      throw invalid('labId is required.');
    }
    this.assertLabWrite(access, labId, ['lab_admin']);
    const assetNo = normalizeString(input.assetNo, 'assetNo', 64);
    const existing = await this.query
      .selectFrom('equipment')
      .select('id')
      .where('assetNo', '=', assetNo)
      .executeTakeFirst();
    if (existing) {
      throw conflict(`Asset number ${assetNo} already exists.`);
    }
    const now = new Date();
    await this.query
      .insertInto('equipment')
      .values({
        assetNo,
        name: normalizeString(input.name, 'name', 200),
        model: optionalString(input.model, 'model', 200),
        serialNo: optionalString(input.serialNo, 'serialNo', 128),
        category: optionalString(input.category, 'category', 64),
        labId,
        status: requireEnum(
          input.status ?? 'available',
          EQUIPMENT_STATUSES,
          'status',
        ),
        purchaseDate: input.purchaseDate
          ? parseDate(input.purchaseDate, 'purchaseDate')
          : null,
        ownerName: optionalString(input.ownerName, 'ownerName', 200),
        description: optionalString(input.description, 'description', 4000),
        studentVisible: flag(input.studentVisible),
        studentDescription: optionalString(
          input.studentDescription,
          'studentDescription',
          4000,
        ),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const row = await this.query
      .selectFrom('equipment')
      .selectAll()
      .where('assetNo', '=', assetNo)
      .executeTakeFirstOrThrow();
    const [view] = await this.buildEquipmentViews([row], access);
    return view;
  }

  public async updateEquipment(
    userId: string,
    id: number,
    input: Record<string, unknown>,
  ): Promise<EquipmentView> {
    const access = await this.access(userId);
    const current = await this.loadEquipment(id);
    this.assertLabWrite(access, num(current.labId), ['lab_admin']);

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined)
      patch.name = normalizeString(input.name, 'name', 200);
    if (input.model !== undefined)
      patch.model = optionalString(input.model, 'model', 200);
    if (input.serialNo !== undefined)
      patch.serialNo = optionalString(input.serialNo, 'serialNo', 128);
    if (input.category !== undefined)
      patch.category = optionalString(input.category, 'category', 64);
    if (input.status !== undefined)
      patch.status = requireEnum(input.status, EQUIPMENT_STATUSES, 'status');
    if (input.purchaseDate !== undefined) {
      patch.purchaseDate = input.purchaseDate
        ? parseDate(input.purchaseDate, 'purchaseDate')
        : null;
    }
    if (input.ownerName !== undefined)
      patch.ownerName = optionalString(input.ownerName, 'ownerName', 200);
    if (input.description !== undefined)
      patch.description = optionalString(
        input.description,
        'description',
        4000,
      );
    if (input.studentVisible !== undefined)
      patch.studentVisible = flag(input.studentVisible);
    if (input.studentDescription !== undefined) {
      patch.studentDescription = optionalString(
        input.studentDescription,
        'studentDescription',
        4000,
      );
    }

    await this.query
      .updateTable('equipment')
      .set(patch)
      .where('id', '=', id)
      .execute();
    const row = await this.loadEquipment(id);
    const [view] = await this.buildEquipmentViews([row], access);
    return view;
  }

  // -- calibrations ---------------------------------------------------------

  private calibrationView(row: Row, now: Date): CalibrationView {
    const expiresAt = toDate(row.expiresAt);
    return {
      id: num(row.id),
      equipmentId: num(row.equipmentId),
      calibratedAt: iso(row.calibratedAt),
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      provider: optionalText(row.provider),
      certificateNo: optionalText(row.certificateNo),
      result: text(row.result),
      notes: optionalText(row.notes),
      expired: !expiresAt || expiresAt.getTime() < now.getTime(),
      createdAt: iso(row.createdAt),
    };
  }

  public async listCalibrations(
    userId: string,
    filters: Record<string, unknown>,
  ): Promise<CalibrationView[]> {
    const access = await this.access(userId);
    const equipmentId = int(filters.equipmentId);
    const labId = int(filters.labId);
    const now = new Date();

    let builder = this.query.selectFrom('calibration_records').selectAll();
    if (equipmentId !== null) {
      builder = builder.where('equipmentId', '=', equipmentId);
    }
    const rows = await builder.orderBy('expiresAt', 'desc').execute();
    const equipmentRows = await this.query
      .selectFrom('equipment')
      .select(['id', 'labId'])
      .execute();
    const labByEquipment = new Map(
      equipmentRows.map((row) => [num(row.id), num(row.labId)]),
    );
    const staffLabIds = new Set(
      this.staffMemberships(access).map((item) => item.labId),
    );

    const filtered = rows.filter((row) => {
      const rowLabId = labByEquipment.get(num(row.equipmentId)) ?? -1;
      if (labId !== null && rowLabId !== labId) {
        return false;
      }
      return access.isRoot || staffLabIds.has(rowLabId);
    });
    if (!access.isRoot && filtered.length === 0 && staffLabIds.size === 0) {
      throw forbidden('You are not a member of any laboratory.');
    }
    return filtered.map((row) => this.calibrationView(row, now));
  }

  public async createCalibration(
    userId: string,
    input: Record<string, unknown>,
  ): Promise<CalibrationView> {
    const access = await this.access(userId);
    const equipmentId = int(input.equipmentId);
    if (equipmentId === null) {
      throw invalid('equipmentId is required.');
    }
    const equipment = await this.loadEquipment(equipmentId);
    this.assertLabWrite(access, num(equipment.labId), [
      'lab_admin',
      'technician',
    ]);

    const calibratedAt = parseDate(input.calibratedAt, 'calibratedAt');
    const expiresAt = parseDate(input.expiresAt, 'expiresAt');
    if (expiresAt.getTime() <= calibratedAt.getTime()) {
      throw invalid('expiresAt must be later than calibratedAt.');
    }
    const result = requireEnum(
      input.result ?? 'passed',
      ['passed', 'failed'] as const,
      'result',
    );
    const now = new Date();
    await this.query
      .insertInto('calibration_records')
      .values({
        equipmentId,
        calibratedAt,
        expiresAt,
        provider: optionalString(input.provider, 'provider', 200),
        certificateNo: optionalString(
          input.certificateNo,
          'certificateNo',
          128,
        ),
        result,
        notes: optionalString(input.notes, 'notes', 4000),
        createdById: userId,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const row = await this.query
      .selectFrom('calibration_records')
      .selectAll()
      .where('equipmentId', '=', equipmentId)
      .orderBy('id', 'desc')
      .executeTakeFirst();
    if (!row) {
      throw conflict('The calibration record was not stored.');
    }
    return this.calibrationView(row, now);
  }

  // -- reservations ---------------------------------------------------------

  private async hasBlockingSafetyIssue(labId: number): Promise<boolean> {
    const rows = await this.query
      .selectFrom('safety_checks')
      .select(['severity', 'status'])
      .where('labId', '=', labId)
      .execute();
    return rows.some(
      (row) =>
        text(row.status) !== 'closed' &&
        BLOCKING_SEVERITIES.includes(text(row.severity)),
    );
  }

  private async latestCalibration(
    equipmentId: number,
  ): Promise<Row | undefined> {
    return await this.query
      .selectFrom('calibration_records')
      .selectAll()
      .where('equipmentId', '=', equipmentId)
      .orderBy('expiresAt', 'desc')
      .executeTakeFirst();
  }

  private async reservationView(
    row: Row,
    equipmentNames: Map<number, Row>,
  ): Promise<ReservationView> {
    const equipment = equipmentNames.get(num(row.equipmentId));
    return {
      id: num(row.id),
      equipmentId: num(row.equipmentId),
      equipmentName: equipment ? text(equipment.name) : null,
      assetNo: equipment ? text(equipment.assetNo) : null,
      userId: text(row.userId),
      startsAt: iso(row.startsAt),
      endsAt: iso(row.endsAt),
      purpose: optionalText(row.purpose),
      status: text(row.status),
      createdAt: iso(row.createdAt),
    };
  }

  public async listReservations(
    userId: string,
    filters: Record<string, unknown>,
  ): Promise<ReservationView[]> {
    const access = await this.access(userId);
    const equipmentId = int(filters.equipmentId);
    let builder = this.query.selectFrom('equipment_reservations').selectAll();
    if (equipmentId !== null) {
      builder = builder.where('equipmentId', '=', equipmentId);
    }
    const rows = await builder.orderBy('startsAt', 'desc').execute();
    const equipmentRows = await this.query
      .selectFrom('equipment')
      .select(['id', 'labId', 'name', 'assetNo'])
      .execute();
    const equipmentById = new Map(
      equipmentRows.map((row) => [num(row.id), row]),
    );
    const staffLabIds = new Set(
      this.staffMemberships(access).map((item) => item.labId),
    );

    const visible = rows.filter((row) => {
      if (access.isRoot) return true;
      if (text(row.userId) === userId) return true;
      const labId = equipmentById.get(num(row.equipmentId))?.labId;
      return labId !== undefined && staffLabIds.has(num(labId));
    });
    return Promise.all(
      visible.map((row) => this.reservationView(row, equipmentById)),
    );
  }

  public async createReservation(
    userId: string,
    input: Record<string, unknown>,
  ): Promise<ReservationView> {
    const access = await this.access(userId);
    const equipmentId = int(input.equipmentId);
    if (equipmentId === null) {
      throw invalid('equipmentId is required.');
    }
    const equipment = await this.loadEquipment(equipmentId);
    const labId = num(equipment.labId);
    const isStaff =
      access.isRoot ||
      this.staffMemberships(access).some((item) => item.labId === labId);
    if (
      !isStaff &&
      !(this.readsPublishedCatalog(access) && flag(equipment.studentVisible))
    ) {
      throw forbidden('You may not reserve this equipment.');
    }
    if (text(equipment.status) !== 'available') {
      throw conflict(
        `Equipment is ${text(equipment.status)} and cannot be reserved.`,
      );
    }

    const now = new Date();
    const calibration = await this.latestCalibration(equipmentId);
    const expiresAt = calibration ? toDate(calibration.expiresAt) : null;
    if (!expiresAt || expiresAt.getTime() < now.getTime()) {
      throw conflict(
        'Calibration has expired; the equipment cannot be reserved until it is recalibrated.',
      );
    }
    if (await this.hasBlockingSafetyIssue(labId)) {
      throw conflict(
        'An unresolved high or critical safety issue in this laboratory blocks reservations.',
      );
    }

    const startsAt = parseDate(input.startsAt, 'startsAt');
    const endsAt = parseDate(input.endsAt, 'endsAt');
    if (endsAt.getTime() <= startsAt.getTime()) {
      throw invalid('endsAt must be later than startsAt.');
    }
    if (endsAt.getTime() <= now.getTime()) {
      throw invalid('endsAt must be in the future.');
    }

    const overlapping = await this.query
      .selectFrom('equipment_reservations')
      .select(['id', 'startsAt', 'endsAt', 'status'])
      .where('equipmentId', '=', equipmentId)
      .execute();
    const clash = overlapping.some((row) => {
      if (!['reserved', 'in_use'].includes(text(row.status))) {
        return false;
      }
      const start = toDate(row.startsAt);
      const end = toDate(row.endsAt);
      if (!start || !end) return false;
      return (
        start.getTime() < endsAt.getTime() && end.getTime() > startsAt.getTime()
      );
    });
    if (clash) {
      throw conflict(
        'The equipment is already reserved for part of that period.',
      );
    }

    await this.query
      .insertInto('equipment_reservations')
      .values({
        equipmentId,
        userId,
        startsAt,
        endsAt,
        purpose: optionalString(input.purpose, 'purpose', 2000),
        status: 'reserved',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const row = await this.query
      .selectFrom('equipment_reservations')
      .selectAll()
      .where('equipmentId', '=', equipmentId)
      .where('userId', '=', userId)
      .orderBy('id', 'desc')
      .executeTakeFirstOrThrow();
    return this.reservationView(row, new Map([[equipmentId, equipment]]));
  }

  public async cancelReservation(
    userId: string,
    id: number,
  ): Promise<ReservationView> {
    const access = await this.access(userId);
    const row = await this.query
      .selectFrom('equipment_reservations')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) {
      throw notFound('Reservation not found.');
    }
    const equipment = await this.loadEquipment(num(row.equipmentId));
    const isOwner = text(row.userId) === userId;
    const isLabAdmin =
      access.isRoot ||
      this.staffMemberships(access).some(
        (item) =>
          item.labId === num(equipment.labId) && item.role === 'lab_admin',
      );
    if (!isOwner && !isLabAdmin) {
      throw forbidden(
        'Only the owner or a laboratory administrator may cancel this reservation.',
      );
    }
    if (['completed', 'cancelled'].includes(text(row.status))) {
      throw conflict('This reservation is already finished.');
    }
    await this.query
      .updateTable('equipment_reservations')
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where('id', '=', id)
      .execute();
    return this.reservationView(
      { ...row, status: 'cancelled' },
      new Map([[num(row.equipmentId), equipment]]),
    );
  }

  // -- work orders ----------------------------------------------------------

  private async workOrderView(
    row: Row,
    equipment: Map<number, Row>,
    labs: Map<number, string>,
  ): Promise<WorkOrderView> {
    const item = equipment.get(num(row.equipmentId));
    return {
      id: num(row.id),
      code: text(row.code),
      equipmentId: num(row.equipmentId),
      equipmentName: item ? text(item.name) : null,
      assetNo: item ? text(item.assetNo) : null,
      labId: num(row.labId),
      labName: labs.get(num(row.labId)) ?? null,
      title: text(row.title),
      description: optionalText(row.description),
      type: text(row.type),
      priority: text(row.priority),
      status: text(row.status),
      assigneeId: optionalText(row.assigneeId),
      createdById: optionalText(row.createdById),
      resolvedAt: iso(row.resolvedAt),
      reviewComment: optionalText(row.reviewComment),
      reviewedById: optionalText(row.reviewedById),
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  private async loadWorkOrder(id: number): Promise<Row> {
    const row = await this.query
      .selectFrom('work_orders')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) {
      throw notFound('Work order not found.');
    }
    return row;
  }

  public async listWorkOrders(
    userId: string,
    filters: Record<string, unknown>,
  ): Promise<WorkOrderView[]> {
    const access = await this.access(userId);
    const staffLabIds = this.staffMemberships(access).map((item) => item.labId);
    if (!access.isRoot && staffLabIds.length === 0) {
      return [];
    }
    const status =
      typeof filters.status === 'string' && filters.status
        ? filters.status
        : null;
    const priority =
      typeof filters.priority === 'string' && filters.priority
        ? filters.priority
        : null;
    const labId = int(filters.labId);

    let builder = this.query.selectFrom('work_orders').selectAll();
    if (!access.isRoot) {
      builder = builder.where((eb) => eb('labId', 'in', staffLabIds));
    }
    if (status) builder = builder.where('status', '=', status);
    if (priority) builder = builder.where('priority', '=', priority);
    if (labId !== null) builder = builder.where('labId', '=', labId);

    const rows = await builder.orderBy('createdAt', 'desc').execute();
    const [equipment, labs] = await Promise.all([
      this.equipmentMap(),
      this.labNames(),
    ]);
    return Promise.all(
      rows.map((row) => this.workOrderView(row, equipment, labs)),
    );
  }

  private async equipmentMap(): Promise<Map<number, Row>> {
    const rows = await this.query
      .selectFrom('equipment')
      .select(['id', 'labId', 'name', 'assetNo'])
      .execute();
    return new Map(rows.map((row) => [num(row.id), row]));
  }

  public async getWorkOrder(
    userId: string,
    id: number,
  ): Promise<WorkOrderView> {
    const access = await this.access(userId);
    const row = await this.loadWorkOrder(id);
    this.assertLabRead(access, num(row.labId));
    const [equipment, labs, eventRows] = await Promise.all([
      this.equipmentMap(),
      this.labNames(),
      this.query
        .selectFrom('work_order_events')
        .selectAll()
        .where('workOrderId', '=', id)
        .orderBy('createdAt', 'asc')
        .execute(),
    ]);
    const view = await this.workOrderView(row, equipment, labs);
    return {
      ...view,
      events: eventRows.map((event) => ({
        id: num(event.id),
        action: text(event.action),
        fromStatus: optionalText(event.fromStatus),
        toStatus: optionalText(event.toStatus),
        comment: optionalText(event.comment),
        actorId: optionalText(event.actorId),
        createdAt: iso(event.createdAt),
      })),
    };
  }

  private async nextWorkOrderCode(): Promise<string> {
    const year = new Date().getFullYear();
    const rows = await this.query
      .selectFrom('work_orders')
      .select('id')
      .execute();
    let sequence = rows.length + 1;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const code = `WO-${year}-${String(sequence).padStart(3, '0')}`;
      const existing = await this.query
        .selectFrom('work_orders')
        .select('id')
        .where('code', '=', code)
        .executeTakeFirst();
      if (!existing) {
        return code;
      }
      sequence += 1;
    }
    throw conflict('Could not allocate a work order number.');
  }

  public async createWorkOrder(
    userId: string,
    input: Record<string, unknown>,
  ): Promise<WorkOrderView> {
    const access = await this.access(userId);
    const equipmentId = int(input.equipmentId);
    if (equipmentId === null) {
      throw invalid('equipmentId is required.');
    }
    const equipment = await this.loadEquipment(equipmentId);
    const labId = num(equipment.labId);
    this.assertLabWrite(access, labId, [
      'lab_admin',
      'teacher',
      'technician',
      'safety_officer',
    ]);

    const now = new Date();
    const code = await this.nextWorkOrderCode();
    await this.query
      .insertInto('work_orders')
      .values({
        code,
        equipmentId,
        labId,
        title: normalizeString(input.title, 'title', 200),
        description: optionalString(input.description, 'description', 4000),
        type: requireEnum(input.type ?? 'repair', WORK_ORDER_TYPES, 'type'),
        priority: requireEnum(
          input.priority ?? 'normal',
          WORK_ORDER_PRIORITIES,
          'priority',
        ),
        status: 'open',
        assigneeId: null,
        createdById: userId,
        resolvedAt: null,
        reviewComment: null,
        reviewedById: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const row = await this.query
      .selectFrom('work_orders')
      .selectAll()
      .where('code', '=', code)
      .executeTakeFirstOrThrow();
    await this.query
      .insertInto('work_order_events')
      .values({
        workOrderId: num(row.id),
        action: 'create',
        fromStatus: null,
        toStatus: 'open',
        comment:
          optionalString(input.description, 'description', 4000) ??
          'Work order created.',
        actorId: userId,
        createdAt: now,
      })
      .execute();
    const [equipmentById, labs] = await Promise.all([
      this.equipmentMap(),
      this.labNames(),
    ]);
    return this.workOrderView(row, equipmentById, labs);
  }

  private transitionTarget(action: string, status: string): string {
    switch (action) {
      case 'assign':
        return status === 'open' ? 'assigned' : '';
      case 'start':
        return status === 'assigned' || status === 'open' ? 'in_progress' : '';
      case 'submit_review':
        return status === 'in_progress' ? 'pending_review' : '';
      case 'complete':
        return status === 'pending_review' ? 'completed' : '';
      case 'reject':
        return status === 'pending_review' ? 'in_progress' : '';
      case 'cancel':
        return ['open', 'assigned', 'in_progress', 'pending_review'].includes(
          status,
        )
          ? 'cancelled'
          : '';
      default:
        return '';
    }
  }

  public async transitionWorkOrder(
    userId: string,
    id: number,
    input: Record<string, unknown>,
  ): Promise<WorkOrderView> {
    const access = await this.access(userId);
    const row = await this.loadWorkOrder(id);
    const labId = num(row.labId);
    const action = normalizeString(input.action, 'action', 32);
    const comment = optionalString(input.comment, 'comment', 4000);
    const currentStatus = text(row.status);

    const targetStatus = this.transitionTarget(action, currentStatus);
    if (!targetStatus) {
      throw conflict(
        `Action "${action}" is not allowed while the work order is ${currentStatus}.`,
      );
    }

    const membership = access.isRoot
      ? { labId, role: 'lab_admin' as LabRole }
      : this.staffMemberships(access).find((item) => item.labId === labId);
    if (!membership) {
      throw forbidden('You are not a member of this laboratory.');
    }
    const role = membership.role;

    const allowedByRole: Record<string, readonly LabRole[]> = {
      assign: ['lab_admin'],
      start: ['lab_admin', 'technician'],
      submit_review: ['lab_admin', 'technician'],
      complete: ['lab_admin'],
      reject: ['lab_admin'],
      cancel: ['lab_admin'],
    };
    if (!allowedByRole[action].includes(role)) {
      throw forbidden(`Role ${role} may not perform "${action}".`);
    }

    if ((action === 'complete' || action === 'reject') && !comment) {
      throw invalid('A review comment is required for this transition.');
    }
    if (action === 'complete' && (await this.hasBlockingSafetyIssue(labId))) {
      throw conflict(
        'Equipment cannot be returned to service while a high or critical safety issue in this laboratory is unresolved.',
      );
    }

    const now = new Date();
    const patch: Record<string, unknown> = {
      status: targetStatus,
      updatedAt: now,
    };
    if (action === 'assign') {
      patch.assigneeId = normalizeString(input.assigneeId, 'assigneeId', 191);
    }
    if (action === 'complete') {
      patch.resolvedAt = now;
      patch.reviewComment = comment;
      patch.reviewedById = userId;
    }
    if (action === 'reject') {
      patch.reviewComment = comment;
      patch.reviewedById = userId;
    }

    await this.query
      .updateTable('work_orders')
      .set(patch)
      .where('id', '=', id)
      .execute();
    await this.query
      .insertInto('work_order_events')
      .values({
        workOrderId: id,
        action,
        fromStatus: currentStatus,
        toStatus: targetStatus,
        comment,
        actorId: userId,
        createdAt: now,
      })
      .execute();

    // Returning equipment to service is a business consequence of completion.
    if (action === 'complete') {
      await this.query
        .updateTable('equipment')
        .set({ status: 'available', updatedAt: now })
        .where('id', '=', num(row.equipmentId))
        .execute();
    }
    if (action === 'start') {
      await this.query
        .updateTable('equipment')
        .set({ status: 'maintenance', updatedAt: now })
        .where('id', '=', num(row.equipmentId))
        .execute();
    }

    return this.getWorkOrder(userId, id);
  }

  // -- safety checks --------------------------------------------------------

  private async safetyView(
    row: Row,
    labs: Map<number, string>,
  ): Promise<SafetyCheckView> {
    return {
      id: num(row.id),
      labId: num(row.labId),
      labName: labs.get(num(row.labId)) ?? null,
      title: text(row.title),
      checkType: optionalText(row.checkType),
      result: text(row.result),
      severity: optionalText(row.severity),
      status: text(row.status),
      findings: optionalText(row.findings),
      checkedAt: iso(row.checkedAt),
      checkedById: optionalText(row.checkedById),
      closedAt: iso(row.closedAt),
      closedById: optionalText(row.closedById),
      createdAt: iso(row.createdAt),
    };
  }

  public async listSafetyChecks(
    userId: string,
    filters: Record<string, unknown>,
  ): Promise<SafetyCheckView[]> {
    const access = await this.access(userId);
    const staffLabIds = this.staffMemberships(access).map((item) => item.labId);
    if (!access.isRoot && staffLabIds.length === 0) {
      return [];
    }
    const status =
      typeof filters.status === 'string' && filters.status
        ? filters.status
        : null;
    const severity =
      typeof filters.severity === 'string' && filters.severity
        ? filters.severity
        : null;
    const result =
      typeof filters.result === 'string' && filters.result
        ? filters.result
        : null;
    const labId = int(filters.labId);
    let builder = this.query.selectFrom('safety_checks').selectAll();
    if (!access.isRoot) {
      builder = builder.where((eb) => eb('labId', 'in', staffLabIds));
    }
    if (status) builder = builder.where('status', '=', status);
    if (result) builder = builder.where('result', '=', result);
    if (severity) builder = builder.where('severity', '=', severity);
    if (labId !== null) builder = builder.where('labId', '=', labId);
    const rows = await builder.orderBy('checkedAt', 'desc').execute();
    const labs = await this.labNames();
    return Promise.all(rows.map((row) => this.safetyView(row, labs)));
  }

  public async createSafetyCheck(
    userId: string,
    input: Record<string, unknown>,
  ): Promise<SafetyCheckView> {
    const access = await this.access(userId);
    const labId = int(input.labId);
    if (labId === null) {
      throw invalid('labId is required.');
    }
    this.assertLabWrite(access, labId, ['lab_admin', 'safety_officer']);
    const result = requireEnum(
      input.result ?? 'pending',
      SAFETY_RESULTS,
      'result',
    );
    const severity = input.severity
      ? requireEnum(input.severity, SAFETY_SEVERITIES, 'severity')
      : null;
    if (result === 'issue' && !severity) {
      throw invalid('severity is required when the inspection found an issue.');
    }
    const findings = normalizeString(input.findings, 'findings', 4000);
    const now = new Date();
    await this.query
      .insertInto('safety_checks')
      .values({
        labId,
        title: normalizeString(input.title, 'title', 200),
        checkType: optionalString(input.checkType, 'checkType', 64),
        result,
        severity,
        status: 'open',
        findings,
        checkedAt: input.checkedAt
          ? parseDate(input.checkedAt, 'checkedAt')
          : now,
        checkedById: userId,
        closedAt: null,
        closedById: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const row = await this.query
      .selectFrom('safety_checks')
      .selectAll()
      .where('labId', '=', labId)
      .where('title', '=', normalizeString(input.title, 'title', 200))
      .orderBy('id', 'desc')
      .executeTakeFirstOrThrow();
    return this.safetyView(row, await this.labNames());
  }

  private async loadSafetyCheck(id: number): Promise<Row> {
    const row = await this.query
      .selectFrom('safety_checks')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) {
      throw notFound('Safety inspection not found.');
    }
    return row;
  }

  public async updateSafetyCheck(
    userId: string,
    id: number,
    input: Record<string, unknown>,
  ): Promise<SafetyCheckView> {
    const access = await this.access(userId);
    const current = await this.loadSafetyCheck(id);
    this.assertLabWrite(access, num(current.labId), [
      'lab_admin',
      'safety_officer',
    ]);
    if (text(current.status) === 'closed') {
      throw conflict('A closed inspection cannot be edited.');
    }
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.title !== undefined)
      patch.title = normalizeString(input.title, 'title', 200);
    if (input.checkType !== undefined)
      patch.checkType = optionalString(input.checkType, 'checkType', 64);
    if (input.result !== undefined)
      patch.result = requireEnum(input.result, SAFETY_RESULTS, 'result');
    if (input.severity !== undefined) {
      patch.severity = input.severity
        ? requireEnum(input.severity, SAFETY_SEVERITIES, 'severity')
        : null;
    }
    if (input.findings !== undefined)
      patch.findings = normalizeString(input.findings, 'findings', 4000);
    if (input.checkedAt !== undefined)
      patch.checkedAt = parseDate(input.checkedAt, 'checkedAt');
    await this.query
      .updateTable('safety_checks')
      .set(patch)
      .where('id', '=', id)
      .execute();
    return this.safetyView(
      await this.loadSafetyCheck(id),
      await this.labNames(),
    );
  }

  public async closeSafetyCheck(
    userId: string,
    id: number,
    input: Record<string, unknown>,
  ): Promise<SafetyCheckView> {
    const access = await this.access(userId);
    const current = await this.loadSafetyCheck(id);
    this.assertLabWrite(access, num(current.labId), [
      'lab_admin',
      'safety_officer',
    ]);
    if (text(current.status) === 'closed') {
      throw conflict('This inspection is already closed.');
    }
    const comment = normalizeString(input.comment, 'comment', 4000);
    const now = new Date();
    const findings = [optionalText(current.findings), `[关闭说明] ${comment}`]
      .filter(Boolean)
      .join('\n');
    await this.query
      .updateTable('safety_checks')
      .set({
        status: 'closed',
        result: 'pass',
        severity: null,
        findings,
        closedAt: now,
        closedById: userId,
        updatedAt: now,
      })
      .where('id', '=', id)
      .execute();
    return this.safetyView(
      await this.loadSafetyCheck(id),
      await this.labNames(),
    );
  }

  // -- training records -----------------------------------------------------

  private async trainingView(
    row: Row,
    equipment: Map<number, Row>,
    labs: Map<number, string>,
  ): Promise<TrainingRecordView> {
    const item =
      row.equipmentId === null
        ? undefined
        : equipment.get(num(row.equipmentId));
    return {
      id: num(row.id),
      labId: num(row.labId),
      labName: labs.get(num(row.labId)) ?? null,
      equipmentId: row.equipmentId === null ? null : num(row.equipmentId),
      equipmentName: item ? text(item.name) : null,
      title: text(row.title),
      trainer: optionalText(row.trainer),
      trainedAt: iso(row.trainedAt),
      participantCount: num(row.participantCount),
      notes: optionalText(row.notes),
      createdById: optionalText(row.createdById),
      createdAt: iso(row.createdAt),
    };
  }

  public async listTrainingRecords(
    userId: string,
    filters: Record<string, unknown>,
  ): Promise<TrainingRecordView[]> {
    const access = await this.access(userId);
    const staffLabIds = this.staffMemberships(access).map((item) => item.labId);
    if (!access.isRoot && staffLabIds.length === 0) {
      return [];
    }
    const labId = int(filters.labId);
    let builder = this.query.selectFrom('training_records').selectAll();
    if (!access.isRoot) {
      builder = builder.where((eb) => eb('labId', 'in', staffLabIds));
    }
    if (labId !== null) builder = builder.where('labId', '=', labId);
    const rows = await builder.orderBy('trainedAt', 'desc').execute();
    const [equipment, labs] = await Promise.all([
      this.equipmentMap(),
      this.labNames(),
    ]);
    return Promise.all(
      rows.map((row) => this.trainingView(row, equipment, labs)),
    );
  }

  public async createTrainingRecord(
    userId: string,
    input: Record<string, unknown>,
  ): Promise<TrainingRecordView> {
    const access = await this.access(userId);
    const labId = int(input.labId);
    if (labId === null) {
      throw invalid('labId is required.');
    }
    this.assertLabWrite(access, labId, [
      'lab_admin',
      'teacher',
      'safety_officer',
    ]);
    const equipmentId = int(input.equipmentId);
    if (equipmentId !== null) {
      const equipment = await this.loadEquipment(equipmentId);
      if (num(equipment.labId) !== labId) {
        throw invalid(
          'The training equipment must belong to the same laboratory.',
        );
      }
    }
    const now = new Date();
    await this.query
      .insertInto('training_records')
      .values({
        labId,
        equipmentId,
        title: normalizeString(input.title, 'title', 200),
        trainer: optionalString(input.trainer, 'trainer', 200),
        trainedAt: input.trainedAt
          ? parseDate(input.trainedAt, 'trainedAt')
          : now,
        participantCount: Math.max(0, int(input.participantCount) ?? 0),
        notes: optionalString(input.notes, 'notes', 4000),
        createdById: userId,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const row = await this.query
      .selectFrom('training_records')
      .selectAll()
      .where('labId', '=', labId)
      .where('title', '=', normalizeString(input.title, 'title', 200))
      .orderBy('id', 'desc')
      .executeTakeFirstOrThrow();
    const [equipment, labs] = await Promise.all([
      this.equipmentMap(),
      this.labNames(),
    ]);
    return this.trainingView(row, equipment, labs);
  }

  public async updateTrainingRecord(
    userId: string,
    id: number,
    input: Record<string, unknown>,
  ): Promise<TrainingRecordView> {
    const access = await this.access(userId);
    const current = await this.query
      .selectFrom('training_records')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!current) {
      throw notFound('Training record not found.');
    }
    this.assertLabWrite(access, num(current.labId), [
      'lab_admin',
      'teacher',
      'safety_officer',
    ]);
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.title !== undefined)
      patch.title = normalizeString(input.title, 'title', 200);
    if (input.trainer !== undefined)
      patch.trainer = optionalString(input.trainer, 'trainer', 200);
    if (input.trainedAt !== undefined)
      patch.trainedAt = parseDate(input.trainedAt, 'trainedAt');
    if (input.participantCount !== undefined) {
      patch.participantCount = Math.max(0, int(input.participantCount) ?? 0);
    }
    if (input.equipmentId !== undefined) {
      const equipmentId = int(input.equipmentId);
      if (equipmentId !== null) {
        const equipment = await this.loadEquipment(equipmentId);
        if (num(equipment.labId) !== num(current.labId)) {
          throw invalid(
            'The training equipment must belong to the same laboratory.',
          );
        }
      }
      patch.equipmentId = equipmentId;
    }
    if (input.notes !== undefined)
      patch.notes = optionalString(input.notes, 'notes', 4000);
    await this.query
      .updateTable('training_records')
      .set(patch)
      .where('id', '=', id)
      .execute();
    const row = await this.query
      .selectFrom('training_records')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    const [equipment, labs] = await Promise.all([
      this.equipmentMap(),
      this.labNames(),
    ]);
    return this.trainingView(row, equipment, labs);
  }

  // -- dashboard ------------------------------------------------------------

  public async dashboard(userId: string): Promise<Record<string, unknown>> {
    const access = await this.access(userId);
    const staffLabIds = this.staffMemberships(access).map((item) => item.labId);
    const now = new Date();

    let equipmentRows = await this.query
      .selectFrom('equipment')
      .selectAll()
      .execute();
    if (!access.isRoot) {
      if (staffLabIds.length > 0) {
        equipmentRows = equipmentRows.filter((row) =>
          staffLabIds.includes(num(row.labId)),
        );
      } else if (this.readsPublishedCatalog(access)) {
        equipmentRows = equipmentRows.filter((row) => flag(row.studentVisible));
      } else {
        equipmentRows = [];
      }
    }

    const equipmentByStatus: Record<string, number> = {};
    for (const row of equipmentRows) {
      const status = text(row.status);
      equipmentByStatus[status] = (equipmentByStatus[status] ?? 0) + 1;
    }

    const calibrations = await this.latestCalibrations(
      equipmentRows.map((row) => num(row.id)),
    );
    let calibrationExpired = 0;
    let calibrationExpiringSoon = 0;
    const soonThreshold = now.getTime() + 30 * 24 * 60 * 60 * 1000;
    for (const row of equipmentRows) {
      const calibration = calibrations.get(num(row.id));
      const expiresAt = calibration ? toDate(calibration.expiresAt) : null;
      if (!expiresAt || expiresAt.getTime() < now.getTime()) {
        calibrationExpired += 1;
      } else if (expiresAt.getTime() <= soonThreshold) {
        calibrationExpiringSoon += 1;
      }
    }

    const workOrderRows = (
      await this.query.selectFrom('work_orders').selectAll().execute()
    ).filter((row) => access.isRoot || staffLabIds.includes(num(row.labId)));
    const openWorkOrders = workOrderRows.filter(
      (row) => !['completed', 'cancelled'].includes(text(row.status)),
    );
    const workOrdersByStatus: Record<string, number> = {};
    for (const row of workOrderRows) {
      const status = text(row.status);
      workOrdersByStatus[status] = (workOrdersByStatus[status] ?? 0) + 1;
    }

    const safetyRows = (
      await this.query.selectFrom('safety_checks').selectAll().execute()
    ).filter((row) => access.isRoot || staffLabIds.includes(num(row.labId)));
    const openSafetyIssues = safetyRows.filter(
      (row) => text(row.status) !== 'closed',
    );
    const blockingSafetyIssues = openSafetyIssues.filter((row) =>
      BLOCKING_SEVERITIES.includes(text(row.severity)),
    );

    const trainingRows = (
      await this.query.selectFrom('training_records').selectAll().execute()
    ).filter((row) => access.isRoot || staffLabIds.includes(num(row.labId)));

    const reservationRows = (
      await this.query
        .selectFrom('equipment_reservations')
        .selectAll()
        .execute()
    ).filter((row) => text(row.userId) === userId || access.isRoot);
    const upcomingReservations = reservationRows.filter((row) => {
      const start = toDate(row.startsAt);
      return (
        text(row.status) === 'reserved' &&
        start !== null &&
        start.getTime() >= now.getTime()
      );
    });

    const labRows = await this.query
      .selectFrom('laboratories')
      .select(['id', 'code', 'name'])
      .execute();
    const labs =
      access.isRoot || staffLabIds.length > 0
        ? labRows.filter(
            (row) => access.isRoot || staffLabIds.includes(num(row.id)),
          )
        : [];

    const recentWorkOrders = workOrderRows
      .sort((a, b) => num(b.id) - num(a.id))
      .slice(0, 5)
      .map((row) => ({
        id: num(row.id),
        code: text(row.code),
        title: text(row.title),
        status: text(row.status),
        priority: text(row.priority),
      }));

    return {
      laboratories: labs.map((row) => ({
        id: num(row.id),
        code: text(row.code),
        name: text(row.name),
      })),
      equipment: {
        total: equipmentRows.length,
        byStatus: equipmentByStatus,
        calibrationExpired,
        calibrationExpiringSoon,
      },
      workOrders: {
        total: workOrderRows.length,
        open: openWorkOrders.length,
        byStatus: workOrdersByStatus,
      },
      safety: {
        total: safetyRows.length,
        open: openSafetyIssues.length,
        blocking: blockingSafetyIssues.length,
      },
      training: {
        total: trainingRows.length,
        participants: trainingRows.reduce(
          (sum, row) => sum + num(row.participantCount),
          0,
        ),
      },
      reservations: {
        upcoming: upcomingReservations.length,
        total: reservationRows.length,
      },
      recentWorkOrders,
      restricted: !access.isRoot && staffLabIds.length === 0,
    };
  }

  // -- files ----------------------------------------------------------------

  private contentUrl(id: string): string {
    // The mounted path is part of the address a browser can reach — the same
    // convention the file plugin uses for the URLs it hands to the client.
    return addBasePathToLocation(
      `/lab-files/${id}/content`,
      this.publicBasePath,
    );
  }

  private fileView(
    row: Row,
    uploadedByName: string | null = null,
  ): LabFileView {
    const id = text(row.id);
    return {
      id,
      filename: text(row.filename),
      ext: optionalText(row.ext),
      mimeType: text(row.mimeType),
      size: num(row.size),
      purpose: optionalText(row.purpose),
      targetType: text(row.targetType) as FileTargetType,
      targetId: text(row.targetId),
      remark: optionalText(row.remark),
      uploadedById: optionalText(row.uploadedById),
      uploadedByName,
      createdAt: iso(row.createdAt),
      contentUrl: this.contentUrl(id),
    };
  }

  private static readonly FILE_COLUMNS = [
    'id',
    'filename',
    'ext',
    'mimeType',
    'size',
    'purpose',
    'targetType',
    'targetId',
    'remark',
    'uploadedById',
    'createdAt',
    'updatedAt',
  ] as const;

  private async resolveTarget(
    targetType: string,
    targetId: string,
  ): Promise<TargetInfo> {
    const allowed = [
      'laboratory',
      'equipment',
      'calibration',
      'work_order',
      'safety_check',
      'training_record',
    ];
    if (!allowed.includes(targetType)) {
      throw invalid(`targetType must be one of: ${allowed.join(', ')}.`);
    }
    const numericId = Number(targetId);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      throw invalid('targetId must be a positive integer.');
    }

    if (targetType === 'laboratory') {
      const lab = await this.query
        .selectFrom('laboratories')
        .select('id')
        .where('id', '=', numericId)
        .executeTakeFirst();
      if (!lab) throw notFound('Laboratory not found.');
      return {
        targetType: 'laboratory',
        targetId,
        labId: numericId,
        studentVisible: false,
      };
    }

    if (targetType === 'equipment') {
      return this.equipmentTarget(numericId);
    }

    if (targetType === 'calibration') {
      const calibration = await this.query
        .selectFrom('calibration_records')
        .select(['id', 'equipmentId'])
        .where('id', '=', numericId)
        .executeTakeFirst();
      if (!calibration) throw notFound('Calibration record not found.');
      const equipment = await this.loadEquipment(num(calibration.equipmentId));
      return {
        targetType: 'calibration',
        targetId,
        labId: num(equipment.labId),
        studentVisible: flag(equipment.studentVisible),
      };
    }

    if (targetType === 'work_order') {
      const order = await this.query
        .selectFrom('work_orders')
        .select(['id', 'labId'])
        .where('id', '=', numericId)
        .executeTakeFirst();
      if (!order) throw notFound('Work order not found.');
      return {
        targetType: 'work_order',
        targetId,
        labId: num(order.labId),
        studentVisible: false,
      };
    }

    if (targetType === 'safety_check') {
      const check = await this.query
        .selectFrom('safety_checks')
        .select(['id', 'labId'])
        .where('id', '=', numericId)
        .executeTakeFirst();
      if (!check) throw notFound('Safety inspection not found.');
      return {
        targetType: 'safety_check',
        targetId,
        labId: num(check.labId),
        studentVisible: false,
      };
    }

    const training = await this.query
      .selectFrom('training_records')
      .select(['id', 'labId'])
      .where('id', '=', numericId)
      .executeTakeFirst();
    if (!training) throw notFound('Training record not found.');
    return {
      targetType: 'training_record',
      targetId,
      labId: num(training.labId),
      studentVisible: false,
    };
  }

  private canReadTarget(
    access: LabAccess,
    target: TargetInfo,
    purpose: string | null,
  ): boolean {
    if (access.isRoot) {
      return true;
    }
    if (this.isForeignStaff(access, target.labId)) {
      return false;
    }
    if (
      this.readsPublishedCatalog(access) &&
      target.studentVisible &&
      ['equipment', 'calibration'].includes(target.targetType) &&
      purpose !== null &&
      STUDENT_FILE_PURPOSES.has(purpose)
    ) {
      return true;
    }
    return (
      target.labId !== null &&
      this.staffMemberships(access).some((item) => item.labId === target.labId)
    );
  }

  private canWriteTarget(access: LabAccess, target: TargetInfo): boolean {
    if (access.isRoot) {
      return true;
    }
    if (target.labId === null) {
      return false;
    }
    const rolesByTarget: Record<FileTargetType, readonly LabRole[]> = {
      laboratory: ['lab_admin'],
      equipment: ['lab_admin', 'technician'],
      calibration: ['lab_admin', 'technician'],
      work_order: ['lab_admin', 'technician'],
      safety_check: ['lab_admin', 'safety_officer'],
      training_record: ['lab_admin', 'teacher', 'safety_officer'],
    };
    const membership = this.staffMemberships(access).find(
      (item) => item.labId === target.labId,
    );
    return Boolean(
      membership && rolesByTarget[target.targetType].includes(membership.role),
    );
  }

  public async listFiles(
    userId: string,
    targetType: string,
    targetId: string,
  ): Promise<LabFileView[]> {
    const access = await this.access(userId);
    const target = await this.resolveTarget(targetType, targetId);
    // A student may browse the attachments of equipment they can see, but each row is
    // filtered below: only manuals and nameplates are readable without a lab membership.
    const staff =
      access.isRoot ||
      (target.labId !== null &&
        this.staffMemberships(access).some(
          (item) => item.labId === target.labId,
        ));
    const studentBrowsable =
      this.readsPublishedCatalog(access) &&
      target.studentVisible &&
      ['equipment', 'calibration'].includes(target.targetType);
    if (!staff && !studentBrowsable) {
      throw forbidden('You cannot read attachments for this record.');
    }
    const rows = await this.query
      .selectFrom('lab_files')
      .select([...LabServiceImpl.FILE_COLUMNS])
      .where('targetType', '=', targetType)
      .where('targetId', '=', targetId)
      .orderBy('createdAt', 'asc')
      .execute();
    const names = await this.uploaderNames(
      rows.map((row) => optionalText(row.uploadedById)),
    );
    const filtered = access.isRoot
      ? rows
      : rows.filter((row) =>
          this.canReadTarget(access, target, optionalText(row.purpose)),
        );
    return filtered.map((row) =>
      this.fileView(
        row,
        names.get(optionalText(row.uploadedById) ?? '') ?? null,
      ),
    );
  }

  /**
   * Display names for the accounts that uploaded a batch of files, keyed by user id.
   *
   * The account table belongs to the authentication plugin, so it is read here by id and the name is
   * returned alongside the file rather than exposing the roster as an endpoint of its own.
   */
  private async uploaderNames(
    ids: readonly (string | null)[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (unique.length === 0) return new Map();
    const rows = await this.query
      .selectFrom('user')
      .select(['id', 'name'])
      .where('id', 'in', unique)
      .execute();
    return new Map(rows.map((row) => [text(row.id), text(row.name)]));
  }

  public async uploadFile(
    userId: string,
    input: {
      targetType: string;
      targetId: string;
      purpose?: string | null;
      remark?: string | null;
      filename: string;
      mimeType?: string | null;
      content: Buffer;
    },
  ): Promise<LabFileView> {
    const access = await this.access(userId);
    const target = await this.resolveTarget(input.targetType, input.targetId);
    if (!this.canWriteTarget(access, target)) {
      throw forbidden('You may not attach files to this record.');
    }
    if (input.content.length === 0) {
      throw invalid('The uploaded file is empty.');
    }
    if (input.content.length > MAX_UPLOAD_BYTES) {
      throw invalid(
        `The file exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB limit.`,
      );
    }
    const filename = normalizeString(input.filename, 'filename', 255);
    if (filename.includes('/') || filename.includes('\\')) {
      throw invalid('The filename must not contain path separators.');
    }
    const ext = filename.includes('.')
      ? filename.split('.').pop()!.toLowerCase()
      : '';
    if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
      throw invalid(`Unsupported file type ".${ext || 'unknown'}".`);
    }
    const purpose =
      input.purpose === undefined ||
      input.purpose === null ||
      input.purpose === ''
        ? 'attachment'
        : requireEnum(input.purpose, FILE_PURPOSES, 'purpose');
    const mimeType =
      optionalText(input.mimeType)?.slice(0, 128) || EXTENSION_MIME[ext];
    const now = new Date();
    const id = randomUUID();
    await this.query
      .insertInto('lab_files')
      .values({
        id,
        filename,
        ext,
        mimeType,
        size: input.content.length,
        purpose,
        targetType: target.targetType,
        targetId: target.targetId,
        remark: optionalString(input.remark, 'remark', 2000),
        content: input.content,
        uploadedById: userId,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return this.fileView({
      id,
      filename,
      ext,
      mimeType,
      size: input.content.length,
      purpose,
      targetType: target.targetType,
      targetId: target.targetId,
      remark: optionalText(input.remark),
      uploadedById: userId,
      createdAt: now,
    });
  }

  public async updateFile(
    userId: string,
    id: string,
    input: Record<string, unknown>,
  ): Promise<LabFileView> {
    const access = await this.access(userId);
    const row = await this.query
      .selectFrom('lab_files')
      .select([...LabServiceImpl.FILE_COLUMNS])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) {
      throw notFound('File not found.');
    }
    const target = await this.resolveTarget(
      text(row.targetType),
      text(row.targetId),
    );
    if (!this.canWriteTarget(access, target)) {
      throw forbidden('You may not edit this file.');
    }
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.remark !== undefined)
      patch.remark = optionalString(input.remark, 'remark', 2000);
    if (input.purpose !== undefined)
      patch.purpose = requireEnum(input.purpose, FILE_PURPOSES, 'purpose');
    await this.query
      .updateTable('lab_files')
      .set(patch)
      .where('id', '=', id)
      .execute();
    const updated = await this.query
      .selectFrom('lab_files')
      .select([...LabServiceImpl.FILE_COLUMNS])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    return this.fileView(updated);
  }

  public async deleteFile(userId: string, id: string): Promise<void> {
    const access = await this.access(userId);
    const row = await this.query
      .selectFrom('lab_files')
      .select(['id', 'targetType', 'targetId', 'uploadedById'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) {
      throw notFound('File not found.');
    }
    const target = await this.resolveTarget(
      text(row.targetType),
      text(row.targetId),
    );
    const isUploader = text(row.uploadedById) === userId;
    if (
      !this.canWriteTarget(access, target) &&
      !(isUploader && target.labId !== null)
    ) {
      throw forbidden('You may not delete this file.');
    }
    await this.query.deleteFrom('lab_files').where('id', '=', id).execute();
  }

  public async readFile(userId: string, id: string): Promise<FileReadResult> {
    const access = await this.access(userId);
    const row = await this.query
      .selectFrom('lab_files')
      .select([
        'id',
        'filename',
        'mimeType',
        'size',
        'purpose',
        'targetType',
        'targetId',
        'content',
      ])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) {
      throw notFound('File not found.');
    }
    const target = await this.resolveTarget(
      text(row.targetType),
      text(row.targetId),
    );
    if (!this.canReadTarget(access, target, optionalText(row.purpose))) {
      throw forbidden('You cannot read this file.');
    }
    const content = toBuffer(row.content);
    return {
      filename: text(row.filename),
      mimeType: text(row.mimeType) || 'application/octet-stream',
      size: content.length,
      content,
    };
  }
}

export function createLabService(
  database: DatabaseManager,
  publicBasePath: string,
): LabService {
  return new LabServiceImpl(database, publicBasePath);
}

export default class LabServiceProvider extends ServiceProvider<Application> {
  public readonly name: string = '@nocobase/app/lab-service-provider';

  public override register(): void {
    this.app.container.singleton(labServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return createLabService(database, this.app.publicBasePath);
    });
  }
}
