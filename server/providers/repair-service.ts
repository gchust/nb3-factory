/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion -- The database query adapter returns
   generic rows. Each query in this file names the shape it produces so the DTOs stay explicit; the
   assertions are deliberate and are backed by the tests in tests/logic/repair-service.test.ts. */
import type {
  DatabaseManager,
  Expression,
  ExpressionBuilder,
  QueryAdapter,
  SqlBool,
} from '@nocobase/db';

/**
 * Property repair domain rules: tickets, dispatching, material stock, acceptance and settlement.
 *
 * The service owns business behavior only. It never reads a request or decides an HTTP status; routes map the
 * `RepairError` codes it throws onto responses.
 */

export const REPAIR_ROLES = [
  'admin',
  'dispatcher',
  'technician',
  'supervisor',
  'finance',
  'reporter',
] as const;

export type RepairRole = (typeof REPAIR_ROLES)[number];

export function isRepairRole(value: unknown): value is RepairRole {
  return (
    typeof value === 'string' &&
    (REPAIR_ROLES as readonly string[]).includes(value)
  );
}

export const TICKET_STATUSES = [
  'pending_dispatch',
  'assigned',
  'in_progress',
  'pending_acceptance',
  'rework',
  'completed',
  'cancelled',
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const ATTACHMENT_CATEGORIES = [
  'fault',
  'before',
  'after',
  'report',
  'receipt',
] as const;
export type AttachmentCategory = (typeof ATTACHMENT_CATEGORIES)[number];

export function isAttachmentCategory(
  value: unknown,
): value is AttachmentCategory {
  return (
    typeof value === 'string' &&
    (ATTACHMENT_CATEGORIES as readonly string[]).includes(value)
  );
}

/** The statuses in which a ticket is considered an unfinished repair. */
const OVERDUE_STATUSES: readonly TicketStatus[] = [
  'assigned',
  'in_progress',
  'rework',
];

export interface RepairPrincipal {
  readonly userId: string;
  readonly name: string;
  readonly role: RepairRole;
}

export interface RepairCapabilities {
  readonly viewAll: boolean;
  readonly create: boolean;
  readonly dispatch: boolean;
  readonly work: boolean;
  readonly accept: boolean;
  readonly cancel: boolean;
  readonly settle: boolean;
  readonly stockIn: boolean;
  readonly manageAssets: boolean;
}

const CAPABILITIES: Readonly<Record<RepairRole, RepairCapabilities>> = {
  admin: {
    viewAll: true,
    create: true,
    dispatch: true,
    work: true,
    accept: true,
    cancel: true,
    settle: true,
    stockIn: true,
    manageAssets: true,
  },
  dispatcher: {
    viewAll: true,
    create: true,
    dispatch: true,
    work: false,
    accept: false,
    cancel: true,
    settle: false,
    stockIn: true,
    manageAssets: true,
  },
  technician: {
    viewAll: false,
    create: true,
    dispatch: false,
    work: true,
    accept: false,
    cancel: false,
    settle: false,
    stockIn: false,
    manageAssets: false,
  },
  supervisor: {
    viewAll: true,
    create: true,
    dispatch: false,
    work: false,
    accept: true,
    cancel: true,
    settle: false,
    stockIn: true,
    manageAssets: true,
  },
  finance: {
    viewAll: true,
    create: true,
    dispatch: false,
    work: false,
    accept: false,
    cancel: false,
    settle: true,
    stockIn: false,
    manageAssets: false,
  },
  reporter: {
    viewAll: false,
    create: true,
    dispatch: false,
    work: false,
    accept: false,
    cancel: false,
    settle: false,
    stockIn: false,
    manageAssets: false,
  },
};

export function capabilitiesFor(role: RepairRole): RepairCapabilities {
  return CAPABILITIES[role];
}

export type RepairErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'INVALID_TRANSITION'
  | 'MISSING_EVIDENCE'
  | 'INSUFFICIENT_STOCK'
  | 'SETTLEMENT_EXISTS'
  | 'NOT_SETTLEABLE'
  | 'ALREADY_RETURNED'
  | 'TOO_MANY_FILES'
  | 'FILE_TOO_LARGE';

const ERROR_STATUS: Readonly<Record<RepairErrorCode, number>> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  INVALID_TRANSITION: 409,
  MISSING_EVIDENCE: 400,
  INSUFFICIENT_STOCK: 409,
  SETTLEMENT_EXISTS: 409,
  NOT_SETTLEABLE: 409,
  ALREADY_RETURNED: 409,
  TOO_MANY_FILES: 400,
  FILE_TOO_LARGE: 413,
};

export class RepairError extends Error {
  readonly code: RepairErrorCode;
  readonly status: number;

  constructor(code: RepairErrorCode, message: string) {
    super(message);
    this.name = 'RepairError';
    this.code = code;
    this.status = ERROR_STATUS[code];
  }
}

export const MAX_FILES_PER_UPLOAD = 5;
export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

interface TicketRow {
  id: number;
  ticketNo: string;
  title: string;
  buildingId: number;
  roomId: number | null;
  equipmentId: number | null;
  location: string;
  faultType: string;
  priority: string;
  description: string;
  contactName: string;
  contactPhone: string;
  status: string;
  reporterId: string;
  reporterName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assignedAt: unknown;
  dueAt: unknown;
  startedAt: unknown;
  finishedAt: unknown;
  faultCause: string | null;
  repairProcess: string | null;
  laborCost: unknown;
  reworkCount: number | null;
  cancelReason: string | null;
  acceptanceResult: string | null;
  acceptanceRemark: string | null;
  acceptedAt: unknown;
  completedAt: unknown;
  settledAt: unknown;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface TicketDto {
  id: number;
  ticketNo: string;
  title: string;
  buildingId: number;
  buildingName: string | null;
  roomId: number | null;
  roomNumber: string | null;
  equipmentId: number | null;
  equipmentName: string | null;
  location: string;
  faultType: string;
  priority: string;
  description: string;
  contactName: string;
  contactPhone: string;
  status: string;
  reporterId: string;
  reporterName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assignedAt: string | null;
  dueAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  faultCause: string | null;
  repairProcess: string | null;
  laborCost: number;
  materialCost: number;
  totalCost: number;
  reworkCount: number;
  cancelReason: string | null;
  acceptanceResult: string | null;
  acceptanceRemark: string | null;
  acceptedAt: string | null;
  completedAt: string | null;
  settledAt: string | null;
  overdue: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface TicketListFilters {
  readonly buildingId?: number | undefined;
  readonly roomId?: number | undefined;
  readonly status?: string | undefined;
  readonly assigneeId?: string | undefined;
  readonly priority?: string | undefined;
  readonly keyword?: string | undefined;
  readonly overdueOnly?: boolean | undefined;
  readonly page?: number | undefined;
  readonly pageSize?: number | undefined;
}

export interface AttachmentDto {
  readonly linkId: number;
  readonly fileId: string;
  readonly category: string;
  readonly note: string | null;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly uploadedById: string | null;
  readonly uploadedByName: string | null;
  readonly createdAt: string | null;
}

export interface TicketMaterialDto {
  readonly id: number;
  readonly materialId: number;
  readonly materialName: string;
  readonly unit: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly cost: number;
  readonly status: string;
  readonly remark: string | null;
  readonly requestedByName: string | null;
  readonly returnedAt: string | null;
  readonly createdAt: string | null;
}

export interface TicketEventDto {
  readonly id: number;
  readonly type: string;
  readonly fromStatus: string | null;
  readonly toStatus: string | null;
  readonly remark: string | null;
  readonly operatorName: string | null;
  readonly createdAt: string | null;
}

export interface SettlementDto {
  readonly id: number;
  readonly settlementNo: string;
  readonly ticketId: number;
  readonly ticketNo: string;
  readonly ticketTitle: string;
  readonly buildingName: string | null;
  readonly materialCost: number;
  readonly laborCost: number;
  readonly totalAmount: number;
  readonly status: string;
  readonly settledByName: string | null;
  readonly remark: string | null;
  readonly settledAt: string | null;
}

interface SettlementRow {
  id: number;
  settlementNo: string;
  ticketId: number;
  materialCost: unknown;
  laborCost: unknown;
  totalAmount: unknown;
  status: string;
  settledByName: string | null;
  remark: string | null;
  settledAt: unknown;
}

export interface TicketDetailDto extends TicketDto {
  readonly attachments: readonly AttachmentDto[];
  readonly materials: readonly TicketMaterialDto[];
  readonly events: readonly TicketEventDto[];
  readonly settlement: SettlementDto | null;
  readonly capabilities: RepairCapabilities;
}

type FilterSpec =
  | { readonly kind: 'eq'; readonly column: string; readonly value: unknown }
  | {
      readonly kind: 'in';
      readonly column: string;
      readonly values: readonly unknown[];
    }
  | {
      readonly kind: 'like';
      readonly column: string;
      readonly value: string;
    }
  | {
      readonly kind: 'lt';
      readonly column: string;
      readonly value: unknown;
    }
  | {
      readonly kind: 'orLike';
      readonly columns: readonly string[];
      readonly value: string;
    };

function toExpression(
  eb: ExpressionBuilder,
  spec: FilterSpec,
): Expression<SqlBool> {
  switch (spec.kind) {
    case 'eq':
      return eb(spec.column, '=', spec.value);
    case 'in':
      return eb(spec.column, 'in', spec.values);
    case 'like':
      return eb(spec.column, 'like', spec.value);
    case 'lt':
      return eb(spec.column, '<', spec.value);
    case 'orLike':
      return eb.or(
        spec.columns.map((column) => eb(column, 'like', spec.value)),
      );
  }
}

type WhereFactory = (eb: ExpressionBuilder) => Expression<SqlBool>;

function buildWhere(specs: readonly FilterSpec[]): WhereFactory | undefined {
  if (!specs.length) return undefined;
  return (eb) => eb.and(specs.map((spec) => toExpression(eb, spec)));
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

/** A stored temporal value as a Date, or null when it is absent or unparseable. */
function toDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function toIso(value: unknown): string | null {
  return toDate(value)?.toISOString() ?? null;
}

/**
 * The storage format a `datetime` column accepts: local wall-clock time with milliseconds and no zone suffix.
 * Writing an ISO string with a `Z` is rejected by the query adapter, so comparisons build this form explicitly.
 */
function toDbDateTime(value: Date): string {
  const pad = (part: number): string => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}.${String(value.getMilliseconds()).padStart(3, '0')}`;
}

function requireString(
  value: unknown,
  code: RepairErrorCode = 'VALIDATION',
): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new RepairError(code, 'A required value is missing.');
  }
  return value.trim();
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requirePositiveNumber(value: unknown, label: string): number {
  const numeric = toNumber(value);
  if (numeric <= 0) {
    throw new RepairError('VALIDATION', `${label} must be greater than zero.`);
  }
  return numeric;
}

function requireNonNegativeNumber(value: unknown, label: string): number {
  const numeric = toNumber(value);
  if (numeric < 0) {
    throw new RepairError('VALIDATION', `${label} cannot be negative.`);
  }
  return numeric;
}

function isOverdue(row: { status: string; dueAt: unknown }): boolean {
  if (!OVERDUE_STATUSES.includes(row.status as TicketStatus)) return false;
  const due = toIso(row.dueAt);
  return due !== null && new Date(due).getTime() < Date.now();
}

export interface ListResult<T> {
  readonly rows: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface RepairServiceOptions {
  readonly connection?: string;
}

/**
 * Read/write API for the repair domain. Instantiated per route factory (and per test) with the resolved database.
 */
export class RepairService {
  private readonly database: DatabaseManager;
  private readonly connection: string | undefined;

  constructor(database: DatabaseManager, options: RepairServiceOptions = {}) {
    this.database = database;
    this.connection = options.connection;
  }

  private query(): QueryAdapter {
    return this.database.query(this.connection);
  }

  // ---- Identity --------------------------------------------------------

  async resolvePrincipal(user: {
    id: number | string;
    name?: string | null;
  }): Promise<RepairPrincipal> {
    const userId = String(user.id);
    const row = (await this.query()
      .selectFrom('repairMembers')
      .select(['role', 'displayName'])
      .where('userId', '=', userId)
      .executeTakeFirst()) as
      { role?: string; displayName?: string | null } | undefined;
    const role = isRepairRole(row?.role) ? row.role : 'reporter';
    return {
      userId,
      name: row?.displayName ?? user.name ?? `user-${userId}`,
      role,
    };
  }

  capabilities(principal: RepairPrincipal): RepairCapabilities {
    return capabilitiesFor(principal.role);
  }

  // ---- Tickets ---------------------------------------------------------

  private ticketScopeSpecs(principal: RepairPrincipal): readonly FilterSpec[] {
    if (this.capabilities(principal).viewAll) return [];
    if (principal.role === 'technician') {
      return [{ kind: 'eq', column: 'assigneeId', value: principal.userId }];
    }
    return [{ kind: 'eq', column: 'reporterId', value: principal.userId }];
  }

  private ticketFilterSpecs(
    principal: RepairPrincipal,
    filters: TicketListFilters,
  ): readonly FilterSpec[] {
    const specs: FilterSpec[] = [...this.ticketScopeSpecs(principal)];
    if (filters.buildingId) {
      specs.push({
        kind: 'eq',
        column: 'buildingId',
        value: filters.buildingId,
      });
    }
    if (filters.roomId) {
      specs.push({ kind: 'eq', column: 'roomId', value: filters.roomId });
    }
    if (filters.status) {
      specs.push({ kind: 'eq', column: 'status', value: filters.status });
    }
    if (filters.assigneeId) {
      specs.push({
        kind: 'eq',
        column: 'assigneeId',
        value: filters.assigneeId,
      });
    }
    if (filters.priority) {
      specs.push({ kind: 'eq', column: 'priority', value: filters.priority });
    }
    if (filters.overdueOnly) {
      specs.push({ kind: 'in', column: 'status', values: OVERDUE_STATUSES });
      specs.push({
        kind: 'lt',
        column: 'dueAt',
        value: toDbDateTime(new Date()),
      });
    }
    if (filters.keyword) {
      specs.push({
        kind: 'orLike',
        columns: ['ticketNo', 'title', 'location', 'assigneeName'],
        value: `%${filters.keyword}%`,
      });
    }
    return specs;
  }

  private async decorateTickets(
    rows: readonly TicketRow[],
  ): Promise<TicketDto[]> {
    if (!rows.length) return [];
    const buildingIds = [
      ...new Set(rows.map((row) => row.buildingId).filter(Boolean)),
    ];
    const roomIds = [...new Set(rows.map((row) => row.roomId).filter(Boolean))];
    const equipmentIds = [
      ...new Set(rows.map((row) => row.equipmentId).filter(Boolean)),
    ];
    const ticketIds = rows.map((row) => row.id);

    const buildings = buildingIds.length
      ? ((await this.query()
          .selectFrom('buildings')
          .select(['id', 'name'])
          .where('id', 'in', buildingIds)
          .execute()) as { id: number; name: string }[])
      : [];
    const rooms = roomIds.length
      ? ((await this.query()
          .selectFrom('rooms')
          .select(['id', 'roomNumber'])
          .where('id', 'in', roomIds)
          .execute()) as { id: number; roomNumber: string }[])
      : [];
    const equipment = equipmentIds.length
      ? ((await this.query()
          .selectFrom('equipment')
          .select(['id', 'name'])
          .where('id', 'in', equipmentIds)
          .execute()) as { id: number; name: string }[])
      : [];
    const usages = ticketIds.length
      ? ((await this.query()
          .selectFrom('repairTicketMaterials')
          .select(['ticketId', 'cost', 'status'])
          .where('ticketId', 'in', ticketIds)
          .execute()) as {
          ticketId: number;
          cost: unknown;
          status: string;
        }[])
      : [];

    const buildingNames = new Map(buildings.map((row) => [row.id, row.name]));
    const roomNumbers = new Map(rooms.map((row) => [row.id, row.roomNumber]));
    const equipmentNames = new Map(equipment.map((row) => [row.id, row.name]));
    const materialCosts = new Map<number, number>();
    for (const usage of usages) {
      if (usage.status === 'returned') continue;
      materialCosts.set(
        usage.ticketId,
        (materialCosts.get(usage.ticketId) ?? 0) + toNumber(usage.cost),
      );
    }

    return rows.map((row) =>
      this.toTicketDto(row, {
        buildingName: buildingNames.get(row.buildingId) ?? null,
        roomNumber: row.roomId ? (roomNumbers.get(row.roomId) ?? null) : null,
        equipmentName: row.equipmentId
          ? (equipmentNames.get(row.equipmentId) ?? null)
          : null,
        materialCost: materialCosts.get(row.id) ?? 0,
      }),
    );
  }

  private toTicketDto(
    row: TicketRow,
    extra: {
      buildingName: string | null;
      roomNumber: string | null;
      equipmentName: string | null;
      materialCost: number;
    },
  ): TicketDto {
    const laborCost = toNumber(row.laborCost);
    return {
      id: row.id,
      ticketNo: row.ticketNo,
      title: row.title,
      buildingId: row.buildingId,
      buildingName: extra.buildingName,
      roomId: row.roomId,
      roomNumber: extra.roomNumber,
      equipmentId: row.equipmentId,
      equipmentName: extra.equipmentName,
      location: row.location,
      faultType: row.faultType,
      priority: row.priority,
      description: row.description,
      contactName: row.contactName,
      contactPhone: row.contactPhone,
      status: row.status,
      reporterId: row.reporterId,
      reporterName: row.reporterName,
      assigneeId: row.assigneeId,
      assigneeName: row.assigneeName,
      assignedAt: toIso(row.assignedAt),
      dueAt: toIso(row.dueAt),
      startedAt: toIso(row.startedAt),
      finishedAt: toIso(row.finishedAt),
      faultCause: row.faultCause,
      repairProcess: row.repairProcess,
      laborCost,
      materialCost: extra.materialCost,
      totalCost: laborCost + extra.materialCost,
      reworkCount: toNumber(row.reworkCount),
      cancelReason: row.cancelReason,
      acceptanceResult: row.acceptanceResult,
      acceptanceRemark: row.acceptanceRemark,
      acceptedAt: toIso(row.acceptedAt),
      completedAt: toIso(row.completedAt),
      settledAt: toIso(row.settledAt),
      overdue: isOverdue(row),
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    };
  }

  async listTickets(
    principal: RepairPrincipal,
    filters: TicketListFilters,
  ): Promise<ListResult<TicketDto>> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    const specs = this.ticketFilterSpecs(principal, filters);
    const where = buildWhere(specs);
    let rowsQuery = this.query().selectFrom('repairTickets').selectAll();
    if (where) rowsQuery = rowsQuery.where(where);
    const rows = (await rowsQuery
      .orderBy('createdAt', 'desc')
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .execute()) as unknown as TicketRow[];
    let countQuery = this.query()
      .selectFrom('repairTickets')
      .select((eb) => [eb.fn.count('id').as('count')]);
    if (where) countQuery = countQuery.where(where);
    const countRows = (await countQuery.execute()) as { count?: unknown }[];
    return {
      rows: await this.decorateTickets(rows),
      total: Number(countRows[0]?.count ?? 0),
      page,
      pageSize,
    };
  }

  private async loadTicketRow(ticketId: number): Promise<TicketRow> {
    const row = (await this.query()
      .selectFrom('repairTickets')
      .selectAll()
      .where('id', '=', ticketId)
      .executeTakeFirst()) as unknown as TicketRow | undefined;
    if (!row) throw new RepairError('NOT_FOUND', 'Ticket not found.');
    return row;
  }

  canViewTicket(
    principal: RepairPrincipal,
    row: Pick<TicketRow, 'reporterId' | 'assigneeId'>,
  ): boolean {
    if (this.capabilities(principal).viewAll) return true;
    if (principal.role === 'technician') {
      return row.assigneeId === principal.userId;
    }
    return row.reporterId === principal.userId;
  }

  async getTicket(
    principal: RepairPrincipal,
    ticketId: number,
  ): Promise<TicketDetailDto> {
    const row = await this.loadTicketRow(ticketId);
    if (!this.canViewTicket(principal, row)) {
      throw new RepairError('FORBIDDEN', 'You cannot access this ticket.');
    }
    const [decorated] = await this.decorateTickets([row]);
    const detail = decorated as TicketDetailDto;
    const [attachments, materials, events, settlement] = await Promise.all([
      this.listAttachments(ticketId),
      this.listTicketMaterials(principal, ticketId),
      this.listEvents(ticketId),
      this.getSettlementForTicket(ticketId),
    ]);
    return {
      ...detail,
      attachments,
      materials,
      events,
      settlement,
      capabilities: this.capabilities(principal),
    };
  }

  private async listEvents(ticketId: number): Promise<TicketEventDto[]> {
    const rows = (await this.query()
      .selectFrom('repairTicketEvents')
      .selectAll()
      .where('ticketId', '=', ticketId)
      .orderBy('id', 'asc')
      .execute()) as {
      id: number;
      type: string;
      fromStatus: string | null;
      toStatus: string | null;
      remark: string | null;
      operatorName: string | null;
      createdAt: unknown;
    }[];
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      remark: row.remark,
      operatorName: row.operatorName,
      createdAt: toIso(row.createdAt),
    }));
  }

  private async recordEvent(
    connection: { query: QueryAdapter },
    input: {
      ticketId: number;
      type: string;
      fromStatus?: string | null;
      toStatus?: string | null;
      remark?: string | null;
      principal: RepairPrincipal;
    },
  ): Promise<void> {
    const now = new Date();
    await connection.query
      .insertInto('repairTicketEvents')
      .values({
        ticketId: input.ticketId,
        type: input.type,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus ?? null,
        remark: input.remark ?? null,
        operatorId: input.principal.userId,
        operatorName: input.principal.name,
        createdAt: now,
      })
      .execute();
  }

  async createTicket(
    principal: RepairPrincipal,
    input: Record<string, unknown>,
  ): Promise<number> {
    if (!this.capabilities(principal).create) {
      throw new RepairError('FORBIDDEN', 'You cannot create a ticket.');
    }
    const now = new Date();
    const buildingId = toNumber(input.buildingId);
    if (!buildingId) {
      throw new RepairError('VALIDATION', 'A building is required.');
    }
    const building = await this.query()
      .selectFrom('buildings')
      .select(['id'])
      .where('id', '=', buildingId)
      .executeTakeFirst();
    if (!building) {
      throw new RepairError(
        'VALIDATION',
        'The selected building does not exist.',
      );
    }
    const priority = optionalString(input.priority) ?? 'normal';
    if (!(TICKET_PRIORITIES as readonly string[]).includes(priority)) {
      throw new RepairError('VALIDATION', 'Unknown priority.');
    }
    const insert = await this.query()
      .insertInto('repairTickets')
      .values({
        ticketNo: `PENDING-${now.getTime()}-${principal.userId}`,
        title: requireString(input.title),
        buildingId,
        roomId: input.roomId ? toNumber(input.roomId) : null,
        equipmentId: input.equipmentId ? toNumber(input.equipmentId) : null,
        location: requireString(input.location),
        faultType: requireString(input.faultType),
        priority,
        description: requireString(input.description),
        contactName: requireString(input.contactName),
        contactPhone: requireString(input.contactPhone),
        status: 'pending_dispatch',
        reporterId: principal.userId,
        reporterName: principal.name,
        reworkCount: 0,
        laborCost: 0,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const ticketId = Number(insert.insertId);
    const ticketNo = this.buildTicketNo(ticketId, now);
    await this.query()
      .updateTable('repairTickets')
      .set({ ticketNo })
      .where('id', '=', ticketId)
      .execute();
    await this.recordEvent(
      { query: this.query() },
      {
        ticketId,
        type: 'created',
        toStatus: 'pending_dispatch',
        remark: null,
        principal,
      },
    );
    return ticketId;
  }

  private buildTicketNo(ticketId: number, at: Date): string {
    const year = at.getUTCFullYear();
    const month = String(at.getUTCMonth() + 1).padStart(2, '0');
    return `RP-${year}${month}-${String(ticketId).padStart(4, '0')}`;
  }

  private async transition(
    principal: RepairPrincipal,
    ticketId: number,
    input: {
      type: string;
      from: readonly TicketStatus[];
      to: TicketStatus;
      patch: Record<string, unknown>;
      remark?: string | null;
      guard?: (row: TicketRow) => void;
    },
  ): Promise<TicketRow> {
    const row = await this.loadTicketRow(ticketId);
    if (!this.canViewTicket(principal, row)) {
      throw new RepairError('FORBIDDEN', 'You cannot access this ticket.');
    }
    input.guard?.(row);
    if (!input.from.includes(row.status as TicketStatus)) {
      throw new RepairError(
        'INVALID_TRANSITION',
        `The ticket cannot move from ${row.status} to ${input.to}.`,
      );
    }
    const now = new Date();
    await this.database.transaction(async (connection) => {
      await connection.query
        .updateTable('repairTickets')
        .set({ ...input.patch, status: input.to, updatedAt: now })
        .where('id', '=', ticketId)
        .where('status', '=', row.status)
        .execute();
      await this.recordEvent(connection, {
        ticketId,
        type: input.type,
        fromStatus: row.status,
        toStatus: input.to,
        remark: input.remark ?? null,
        principal,
      });
    });
    return this.loadTicketRow(ticketId);
  }

  private requireCapability(
    principal: RepairPrincipal,
    key: keyof RepairCapabilities,
    message: string,
  ): void {
    if (!this.capabilities(principal)[key]) {
      throw new RepairError('FORBIDDEN', message);
    }
  }

  async dispatchTicket(
    principal: RepairPrincipal,
    ticketId: number,
    input: Record<string, unknown>,
  ): Promise<TicketDto> {
    this.requireCapability(
      principal,
      'dispatch',
      'You cannot dispatch tickets.',
    );
    const assigneeId = requireString(input.assigneeId);
    const assignee = (await this.query()
      .selectFrom('repairMembers')
      .select(['userId', 'displayName', 'role'])
      .where('userId', '=', assigneeId)
      .executeTakeFirst()) as
      { userId: string; displayName: string | null; role: string } | undefined;
    if (!assignee || !['technician', 'admin'].includes(assignee.role)) {
      throw new RepairError(
        'VALIDATION',
        'The selected user cannot be assigned repairs.',
      );
    }
    const dueAt = optionalString(input.dueAt);
    if (!dueAt) {
      throw new RepairError('VALIDATION', 'A due time is required.');
    }
    const due = new Date(dueAt);
    if (Number.isNaN(due.getTime())) {
      throw new RepairError('VALIDATION', 'The due time is not a valid date.');
    }
    const now = new Date();
    await this.transition(principal, ticketId, {
      type: 'dispatched',
      from: ['pending_dispatch', 'rework'],
      to: 'assigned',
      remark: optionalString(input.remark),
      patch: {
        assigneeId,
        assigneeName: assignee.displayName ?? `user-${assigneeId}`,
        assignedAt: now,
        dueAt: due,
      },
    });
    return (
      await this.decorateTickets([await this.loadTicketRow(ticketId)])
    )[0];
  }

  async startTicket(
    principal: RepairPrincipal,
    ticketId: number,
  ): Promise<TicketDto> {
    const row = await this.loadTicketRow(ticketId);
    const isAssignee = row.assigneeId === principal.userId;
    if (!isAssignee && principal.role !== 'admin') {
      throw new RepairError(
        'FORBIDDEN',
        'Only the assigned technician can start.',
      );
    }
    const now = new Date();
    await this.transition(principal, ticketId, {
      type: 'started',
      from: ['assigned', 'rework'],
      to: 'in_progress',
      patch: { startedAt: toDate(row.startedAt) ?? now },
    });
    return (
      await this.decorateTickets([await this.loadTicketRow(ticketId)])
    )[0];
  }

  async finishTicket(
    principal: RepairPrincipal,
    ticketId: number,
    input: Record<string, unknown>,
  ): Promise<TicketDto> {
    const row = await this.loadTicketRow(ticketId);
    if (row.assigneeId !== principal.userId && principal.role !== 'admin') {
      throw new RepairError(
        'FORBIDDEN',
        'Only the assigned technician can submit for acceptance.',
      );
    }
    const faultCause = requireString(input.faultCause);
    const repairProcess = requireString(input.repairProcess);
    const categories = await this.evidenceCategories(ticketId);
    if (!categories.has('after')) {
      throw new RepairError(
        'MISSING_EVIDENCE',
        'At least one after-repair photo is required.',
      );
    }
    if (!categories.has('report')) {
      throw new RepairError(
        'MISSING_EVIDENCE',
        'At least one inspection report is required.',
      );
    }
    const laborCost = requireNonNegativeNumber(
      input.laborCost ?? 0,
      'Labor cost',
    );
    const now = new Date();
    await this.transition(principal, ticketId, {
      type: 'submitted',
      from: ['in_progress', 'assigned', 'rework'],
      to: 'pending_acceptance',
      remark: optionalString(input.remark),
      patch: { faultCause, repairProcess, laborCost, finishedAt: now },
    });
    return (
      await this.decorateTickets([await this.loadTicketRow(ticketId)])
    )[0];
  }

  private async evidenceCategories(ticketId: number): Promise<Set<string>> {
    const rows = (await this.query()
      .selectFrom('repairTicketFiles')
      .select(['category'])
      .where('ticketId', '=', ticketId)
      .execute()) as { category: string }[];
    return new Set(rows.map((row) => row.category));
  }

  async acceptTicket(
    principal: RepairPrincipal,
    ticketId: number,
    input: Record<string, unknown>,
  ): Promise<TicketDto> {
    const row = await this.loadTicketRow(ticketId);
    const isReporter = row.reporterId === principal.userId;
    if (!isReporter && !this.capabilities(principal).accept) {
      throw new RepairError('FORBIDDEN', 'You cannot accept this ticket.');
    }
    const now = new Date();
    await this.transition(principal, ticketId, {
      type: 'accepted',
      from: ['pending_acceptance'],
      to: 'completed',
      remark: optionalString(input.remark),
      patch: {
        acceptanceResult: 'passed',
        acceptanceRemark: optionalString(input.remark),
        acceptedAt: now,
        completedAt: now,
      },
    });
    return (
      await this.decorateTickets([await this.loadTicketRow(ticketId)])
    )[0];
  }

  async rejectTicket(
    principal: RepairPrincipal,
    ticketId: number,
    input: Record<string, unknown>,
  ): Promise<TicketDto> {
    const row = await this.loadTicketRow(ticketId);
    const isReporter = row.reporterId === principal.userId;
    if (!isReporter && !this.capabilities(principal).accept) {
      throw new RepairError('FORBIDDEN', 'You cannot reject this ticket.');
    }
    const remark = requireString(input.remark);
    const now = new Date();
    await this.transition(principal, ticketId, {
      type: 'rejected',
      from: ['pending_acceptance'],
      to: 'rework',
      remark,
      patch: {
        acceptanceResult: 'rejected',
        acceptanceRemark: remark,
        acceptedAt: now,
        reworkCount: toNumber(row.reworkCount) + 1,
      },
    });
    return (
      await this.decorateTickets([await this.loadTicketRow(ticketId)])
    )[0];
  }

  async cancelTicket(
    principal: RepairPrincipal,
    ticketId: number,
    input: Record<string, unknown>,
  ): Promise<TicketDto> {
    const row = await this.loadTicketRow(ticketId);
    const isReporter = row.reporterId === principal.userId;
    if (!isReporter && !this.capabilities(principal).cancel) {
      throw new RepairError('FORBIDDEN', 'You cannot cancel this ticket.');
    }
    if (isReporter && !this.capabilities(principal).cancel) {
      const allowed: TicketStatus[] = ['pending_dispatch', 'assigned'];
      if (!allowed.includes(row.status as TicketStatus)) {
        throw new RepairError(
          'INVALID_TRANSITION',
          'A reporter may only cancel before repair work starts.',
        );
      }
    }
    const reason = requireString(input.reason);
    await this.transition(principal, ticketId, {
      type: 'cancelled',
      from: [
        'pending_dispatch',
        'assigned',
        'in_progress',
        'pending_acceptance',
        'rework',
      ],
      to: 'cancelled',
      remark: reason,
      patch: { cancelReason: reason },
    });
    return (
      await this.decorateTickets([await this.loadTicketRow(ticketId)])
    )[0];
  }

  // ---- Materials -------------------------------------------------------

  async listTicketMaterials(
    principal: RepairPrincipal,
    ticketId: number,
  ): Promise<TicketMaterialDto[]> {
    const ticket = await this.loadTicketRow(ticketId);
    if (!this.canViewTicket(principal, ticket)) {
      throw new RepairError('FORBIDDEN', 'You cannot access this ticket.');
    }
    const rows = (await this.query()
      .selectFrom('repairTicketMaterials')
      .leftJoin('materials', 'materials.id', 'repairTicketMaterials.materialId')
      .select([
        'repairTicketMaterials.id as id',
        'repairTicketMaterials.materialId as materialId',
        'repairTicketMaterials.quantity as quantity',
        'repairTicketMaterials.unitPrice as unitPrice',
        'repairTicketMaterials.cost as cost',
        'repairTicketMaterials.status as status',
        'repairTicketMaterials.remark as remark',
        'repairTicketMaterials.requestedByName as requestedByName',
        'repairTicketMaterials.returnedAt as returnedAt',
        'repairTicketMaterials.createdAt as createdAt',
        'materials.name as materialName',
        'materials.unit as unit',
      ])
      .where('repairTicketMaterials.ticketId', '=', ticketId)
      .orderBy('repairTicketMaterials.id', 'asc')
      .execute()) as {
      id: number;
      materialId: number;
      quantity: unknown;
      unitPrice: unknown;
      cost: unknown;
      status: string;
      remark: string | null;
      requestedByName: string | null;
      returnedAt: unknown;
      createdAt: unknown;
      materialName: string | null;
      unit: string | null;
    }[];
    return rows.map((row) => ({
      id: row.id,
      materialId: row.materialId,
      materialName: row.materialName ?? `#${row.materialId}`,
      unit: row.unit ?? '',
      quantity: toNumber(row.quantity),
      unitPrice: toNumber(row.unitPrice),
      cost: toNumber(row.cost),
      status: row.status,
      remark: row.remark,
      requestedByName: row.requestedByName,
      returnedAt: toIso(row.returnedAt),
      createdAt: toIso(row.createdAt),
    }));
  }

  async consumeMaterial(
    principal: RepairPrincipal,
    ticketId: number,
    input: Record<string, unknown>,
  ): Promise<void> {
    const ticket = await this.loadTicketRow(ticketId);
    if (ticket.assigneeId !== principal.userId && principal.role !== 'admin') {
      throw new RepairError(
        'FORBIDDEN',
        'Only the assigned technician can consume materials.',
      );
    }
    if (!['assigned', 'in_progress', 'rework'].includes(ticket.status)) {
      throw new RepairError(
        'INVALID_TRANSITION',
        'Materials can only be consumed while the repair is open.',
      );
    }
    const materialId = toNumber(input.materialId);
    const quantity = requirePositiveNumber(input.quantity, 'Quantity');
    const now = new Date();
    await this.database.transaction(async (connection) => {
      const material = (await connection.query
        .selectFrom('materials')
        .selectAll()
        .where('id', '=', materialId)
        .executeTakeFirst()) as
        { id: number; stock: unknown; unitPrice: unknown } | undefined;
      if (!material) {
        throw new RepairError('NOT_FOUND', 'Material not found.');
      }
      const stock = toNumber(material.stock);
      if (stock < quantity) {
        throw new RepairError(
          'INSUFFICIENT_STOCK',
          `Insufficient stock: ${stock} available.`,
        );
      }
      const unitPrice = toNumber(material.unitPrice);
      const stockAfter = stock - quantity;
      await connection.query
        .updateTable('materials')
        .set({ stock: stockAfter, updatedAt: now })
        .where('id', '=', materialId)
        .execute();
      const inserted = await connection.query
        .insertInto('repairTicketMaterials')
        .values({
          ticketId,
          materialId,
          quantity,
          unitPrice,
          cost: Math.round(quantity * unitPrice * 100) / 100,
          status: 'consumed',
          requestedByName: principal.name,
          remark: optionalString(input.remark),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await connection.query
        .insertInto('repairMaterialTransactions')
        .values({
          materialId,
          type: 'out',
          quantity,
          stockAfter,
          ticketId,
          ticketMaterialId: Number(inserted.insertId),
          operatorName: principal.name,
          remark: optionalString(input.remark),
          createdAt: now,
        })
        .execute();
    });
  }

  async returnMaterial(
    principal: RepairPrincipal,
    usageId: number,
    input: Record<string, unknown>,
  ): Promise<{ alreadyReturned: boolean; stock: number }> {
    const usage = (await this.query()
      .selectFrom('repairTicketMaterials')
      .selectAll()
      .where('id', '=', usageId)
      .executeTakeFirst()) as
      | {
          id: number;
          ticketId: number;
          materialId: number;
          quantity: unknown;
          status: string;
        }
      | undefined;
    if (!usage) throw new RepairError('NOT_FOUND', 'Material usage not found.');
    const ticket = await this.loadTicketRow(usage.ticketId);
    if (
      ticket.assigneeId !== principal.userId &&
      !this.capabilities(principal).stockIn
    ) {
      throw new RepairError('FORBIDDEN', 'You cannot return this material.');
    }
    if (usage.status === 'returned') {
      const material = (await this.query()
        .selectFrom('materials')
        .select(['stock'])
        .where('id', '=', usage.materialId)
        .executeTakeFirst()) as { stock: unknown } | undefined;
      return { alreadyReturned: true, stock: toNumber(material?.stock) };
    }
    if (['completed', 'cancelled'].includes(ticket.status)) {
      throw new RepairError(
        'INVALID_TRANSITION',
        'Materials cannot be returned after the ticket is closed.',
      );
    }
    const now = new Date();
    const quantity = toNumber(usage.quantity);
    const stock = await this.database.transaction(async (connection) => {
      await connection.query
        .updateTable('repairTicketMaterials')
        .set({ status: 'returned', returnedAt: now, updatedAt: now })
        .where('id', '=', usageId)
        .where('status', '=', 'consumed')
        .execute();
      const material = (await connection.query
        .selectFrom('materials')
        .select(['stock'])
        .where('id', '=', usage.materialId)
        .executeTakeFirst()) as { stock: unknown } | undefined;
      const nextStock = toNumber(material?.stock) + quantity;
      await connection.query
        .updateTable('materials')
        .set({ stock: nextStock, updatedAt: now })
        .where('id', '=', usage.materialId)
        .execute();
      await connection.query
        .insertInto('repairMaterialTransactions')
        .values({
          materialId: usage.materialId,
          type: 'return',
          quantity,
          stockAfter: nextStock,
          ticketId: usage.ticketId,
          ticketMaterialId: usageId,
          operatorName: principal.name,
          remark: optionalString(input.remark),
          createdAt: now,
        })
        .execute();
      return nextStock;
    });
    return { alreadyReturned: false, stock };
  }

  async listMaterials(): Promise<
    {
      id: number;
      code: string;
      name: string;
      category: string | null;
      unit: string;
      unitPrice: number;
      stock: number;
      safetyStock: number;
      lowStock: boolean;
    }[]
  > {
    const rows = (await this.query()
      .selectFrom('materials')
      .selectAll()
      .orderBy('code', 'asc')
      .execute()) as {
      id: number;
      code: string;
      name: string;
      category: string | null;
      unit: string;
      unitPrice: unknown;
      stock: unknown;
      safetyStock: unknown;
    }[];
    return rows.map((row) => {
      const stock = toNumber(row.stock);
      const safetyStock = toNumber(row.safetyStock);
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        category: row.category,
        unit: row.unit,
        unitPrice: toNumber(row.unitPrice),
        stock,
        safetyStock,
        lowStock: stock <= safetyStock,
      };
    });
  }

  async stockInMaterial(
    principal: RepairPrincipal,
    materialId: number,
    input: Record<string, unknown>,
  ): Promise<{ stock: number }> {
    this.requireCapability(principal, 'stockIn', 'You cannot adjust stock.');
    const quantity = requirePositiveNumber(input.quantity, 'Quantity');
    const now = new Date();
    return this.database.transaction(async (connection) => {
      const material = (await connection.query
        .selectFrom('materials')
        .select(['id', 'stock'])
        .where('id', '=', materialId)
        .executeTakeFirst()) as { id: number; stock: unknown } | undefined;
      if (!material) throw new RepairError('NOT_FOUND', 'Material not found.');
      const nextStock = toNumber(material.stock) + quantity;
      await connection.query
        .updateTable('materials')
        .set({ stock: nextStock, updatedAt: now })
        .where('id', '=', materialId)
        .execute();
      await connection.query
        .insertInto('repairMaterialTransactions')
        .values({
          materialId,
          type: 'in',
          quantity,
          stockAfter: nextStock,
          operatorName: principal.name,
          remark: optionalString(input.remark),
          createdAt: now,
        })
        .execute();
      return { stock: nextStock };
    });
  }

  // ---- Settlement ------------------------------------------------------

  private async materialCostOf(ticketId: number): Promise<number> {
    const rows = (await this.query()
      .selectFrom('repairTicketMaterials')
      .select(['cost', 'status'])
      .where('ticketId', '=', ticketId)
      .execute()) as { cost: unknown; status: string }[];
    return (
      Math.round(
        rows
          .filter((row) => row.status !== 'returned')
          .reduce((total, row) => total + toNumber(row.cost), 0) * 100,
      ) / 100
    );
  }

  private async settlementRow(
    ticketId: number,
  ): Promise<SettlementRow | undefined> {
    return (await this.query()
      .selectFrom('repairSettlements')
      .selectAll()
      .where('ticketId', '=', ticketId)
      .executeTakeFirst()) as SettlementRow | undefined;
  }

  private async toSettlementDto(row: SettlementRow): Promise<SettlementDto> {
    const ticket = (await this.query()
      .selectFrom('repairTickets')
      .select(['ticketNo', 'title', 'buildingId'])
      .where('id', '=', row.ticketId)
      .executeTakeFirst()) as
      { ticketNo: string; title: string; buildingId: number } | undefined;
    let buildingName: string | null = null;
    if (ticket?.buildingId) {
      const building = (await this.query()
        .selectFrom('buildings')
        .select(['name'])
        .where('id', '=', ticket.buildingId)
        .executeTakeFirst()) as { name: string } | undefined;
      buildingName = building?.name ?? null;
    }
    return {
      id: row.id,
      settlementNo: row.settlementNo,
      ticketId: row.ticketId,
      ticketNo: ticket?.ticketNo ?? '',
      ticketTitle: ticket?.title ?? '',
      buildingName,
      materialCost: toNumber(row.materialCost),
      laborCost: toNumber(row.laborCost),
      totalAmount: toNumber(row.totalAmount),
      status: row.status,
      settledByName: row.settledByName,
      remark: row.remark,
      settledAt: toIso(row.settledAt),
    };
  }

  async getSettlementForTicket(
    ticketId: number,
  ): Promise<SettlementDto | null> {
    const row = await this.settlementRow(ticketId);
    return row ? this.toSettlementDto(row) : null;
  }

  async settleTicket(
    principal: RepairPrincipal,
    ticketId: number,
    input: Record<string, unknown>,
  ): Promise<SettlementDto> {
    this.requireCapability(principal, 'settle', 'You cannot settle tickets.');
    const ticket = await this.loadTicketRow(ticketId);
    if (ticket.status !== 'completed') {
      throw new RepairError(
        'NOT_SETTLEABLE',
        'Only an accepted ticket can be settled.',
      );
    }
    const laborCost = requireNonNegativeNumber(
      ticket.laborCost ?? 0,
      'Labor cost',
    );
    const materialCost = await this.materialCostOf(ticketId);
    const totalAmount = Math.round((laborCost + materialCost) * 100) / 100;
    const now = new Date();
    try {
      await this.query()
        .insertInto('repairSettlements')
        .values({
          settlementNo: `ST-${ticket.ticketNo}`,
          ticketId,
          materialCost,
          laborCost,
          totalAmount,
          status: 'settled',
          settledById: principal.userId,
          settledByName: principal.name,
          remark: optionalString(input.remark),
          settledAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await this.query()
        .updateTable('repairTickets')
        .set({ settledAt: now, updatedAt: now })
        .where('id', '=', ticketId)
        .execute();
      await this.recordEvent(
        { query: this.query() },
        {
          ticketId,
          type: 'settled',
          fromStatus: 'completed',
          toStatus: 'completed',
          remark: optionalString(input.remark),
          principal,
        },
      );
      const row = await this.settlementRow(ticketId);
      if (!row) throw new RepairError('NOT_FOUND', 'Settlement not found.');
      return this.toSettlementDto(row);
    } catch (error) {
      if (await this.settlementRow(ticketId)) {
        throw new RepairError(
          'SETTLEMENT_EXISTS',
          'This ticket has already been settled.',
        );
      }
      throw error;
    }
  }

  async listSettlements(
    principal: RepairPrincipal,
    filters: {
      keyword?: string;
      buildingId?: number;
      page?: number;
      pageSize?: number;
    },
  ): Promise<ListResult<SettlementDto>> {
    if (!this.capabilities(principal).viewAll) {
      throw new RepairError('FORBIDDEN', 'You cannot list settlements.');
    }
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    let query = this.query().selectFrom('repairSettlements');
    if (filters.keyword) {
      query = query.where('settlementNo', 'like', `%${filters.keyword}%`);
    }
    const rows = (await query
      .selectAll()
      .orderBy('settledAt', 'desc')
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .execute()) as unknown as SettlementRow[];
    let countQuery = this.query()
      .selectFrom('repairSettlements')
      .select((eb) => [eb.fn.count('id').as('count')]);
    if (filters.keyword) {
      countQuery = countQuery.where(
        'settlementNo',
        'like',
        `%${filters.keyword}%`,
      );
    }
    const countRows = (await countQuery.execute()) as { count?: unknown }[];
    const all = await Promise.all(rows.map((row) => this.toSettlementDto(row)));
    return {
      rows: filters.buildingId
        ? all.filter((row) => row.buildingName !== null)
        : all,
      total: Number(countRows[0]?.count ?? 0),
      page,
      pageSize,
    };
  }

  // ---- Assets ----------------------------------------------------------

  async listBuildings(): Promise<
    {
      id: number;
      code: string;
      name: string;
      address: string | null;
      floors: number | null;
      manager: string | null;
      roomCount: number;
    }[]
  > {
    const rows = (await this.query()
      .selectFrom('buildings')
      .selectAll()
      .orderBy('code', 'asc')
      .execute()) as {
      id: number;
      code: string;
      name: string;
      address: string | null;
      floors: number | null;
      manager: string | null;
    }[];
    const rooms = (await this.query()
      .selectFrom('rooms')
      .select(['id', 'buildingId'])
      .execute()) as { id: number; buildingId: number }[];
    return rows.map((row) => ({
      ...row,
      roomCount: rooms.filter((room) => room.buildingId === row.id).length,
    }));
  }

  async listRooms(): Promise<
    {
      id: number;
      buildingId: number;
      buildingName: string | null;
      roomNumber: string;
      floor: number | null;
      occupant: string | null;
      phone: string | null;
      area: number | null;
    }[]
  > {
    const rows = (await this.query()
      .selectFrom('rooms')
      .leftJoin('buildings', 'buildings.id', 'rooms.buildingId')
      .select([
        'rooms.id as id',
        'rooms.buildingId as buildingId',
        'rooms.roomNumber as roomNumber',
        'rooms.floor as floor',
        'rooms.occupant as occupant',
        'rooms.phone as phone',
        'rooms.area as area',
        'buildings.name as buildingName',
      ])
      .orderBy('rooms.buildingId', 'asc')
      .orderBy('rooms.roomNumber', 'asc')
      .execute()) as {
      id: number;
      buildingId: number;
      roomNumber: string;
      floor: number | null;
      occupant: string | null;
      phone: string | null;
      area: unknown;
      buildingName: string | null;
    }[];
    return rows.map((row) => ({ ...row, area: toNumber(row.area) }));
  }

  async listEquipment(filters: {
    buildingId?: number;
    roomId?: number;
    keyword?: string;
  }): Promise<
    {
      id: number;
      code: string;
      name: string;
      category: string;
      brand: string | null;
      model: string | null;
      serialNumber: string | null;
      status: string;
      buildingId: number | null;
      buildingName: string | null;
      roomId: number | null;
      roomNumber: string | null;
      manualFileId: string | null;
      repairCount: number;
    }[]
  > {
    let query = this.query()
      .selectFrom('equipment')
      .leftJoin('buildings', 'buildings.id', 'equipment.buildingId')
      .leftJoin('rooms', 'rooms.id', 'equipment.roomId')
      .select([
        'equipment.id as id',
        'equipment.code as code',
        'equipment.name as name',
        'equipment.category as category',
        'equipment.brand as brand',
        'equipment.model as model',
        'equipment.serialNumber as serialNumber',
        'equipment.status as status',
        'equipment.buildingId as buildingId',
        'equipment.roomId as roomId',
        'equipment.manualFileId as manualFileId',
        'buildings.name as buildingName',
        'rooms.roomNumber as roomNumber',
      ]);
    if (filters.buildingId) {
      query = query.where('equipment.buildingId', '=', filters.buildingId);
    }
    if (filters.roomId) {
      query = query.where('equipment.roomId', '=', filters.roomId);
    }
    if (filters.keyword) {
      query = query.where((eb) =>
        eb.or([
          eb('equipment.name', 'like', `%${filters.keyword}%`),
          eb('equipment.code', 'like', `%${filters.keyword}%`),
        ]),
      );
    }
    const rows = (await query.orderBy('equipment.code', 'asc').execute()) as {
      id: number;
      code: string;
      name: string;
      category: string;
      brand: string | null;
      model: string | null;
      serialNumber: string | null;
      status: string;
      buildingId: number | null;
      roomId: number | null;
      manualFileId: string | null;
      buildingName: string | null;
      roomNumber: string | null;
    }[];
    const tickets = (await this.query()
      .selectFrom('repairTickets')
      .select(['equipmentId'])
      .execute()) as { equipmentId: number | null }[];
    return rows.map((row) => ({
      ...row,
      repairCount: tickets.filter((ticket) => ticket.equipmentId === row.id)
        .length,
    }));
  }

  async getEquipmentDetail(
    principal: RepairPrincipal,
    equipmentId: number,
  ): Promise<{
    equipment: Awaited<ReturnType<RepairService['listEquipment']>>[number];
    history: TicketDto[];
    attachments: AttachmentDto[];
  }> {
    const rows = await this.listEquipment({});
    const equipment = rows.find((row) => row.id === equipmentId);
    if (!equipment) throw new RepairError('NOT_FOUND', 'Equipment not found.');
    const where = buildWhere([
      ...this.ticketScopeSpecs(principal),
      { kind: 'eq', column: 'equipmentId', value: equipmentId },
    ]);
    let historyQuery = this.query().selectFrom('repairTickets').selectAll();
    if (where) historyQuery = historyQuery.where(where);
    const tickets = (await historyQuery
      .orderBy('createdAt', 'desc')
      .execute()) as unknown as TicketRow[];
    const attachments: AttachmentDto[] = [];
    if (equipment.manualFileId) {
      attachments.push(
        ...(await this.listAttachmentsByFileIds([equipment.manualFileId])),
      );
    }
    return {
      equipment,
      history: await this.decorateTickets(tickets),
      attachments,
    };
  }

  // ---- Files -----------------------------------------------------------

  async listAttachments(ticketId: number): Promise<AttachmentDto[]> {
    const rows = (await this.query()
      .selectFrom('repairTicketFiles')
      .innerJoin('repairFiles', 'repairFiles.id', 'repairTicketFiles.fileId')
      .select([
        'repairTicketFiles.id as linkId',
        'repairTicketFiles.fileId as fileId',
        'repairTicketFiles.category as category',
        'repairTicketFiles.note as linkNote',
        'repairFiles.filename as filename',
        'repairFiles.ext as ext',
        'repairFiles.mimeType as mimeType',
        'repairFiles.size as size',
        'repairFiles.uploadedById as uploadedById',
        'repairFiles.uploadedByName as uploadedByName',
        'repairFiles.createdAt as createdAt',
      ])
      .where('repairTicketFiles.ticketId', '=', ticketId)
      .orderBy('repairTicketFiles.id', 'asc')
      .execute()) as {
      linkId: number;
      fileId: string;
      category: string;
      linkNote: string | null;
      filename: string;
      ext: string;
      mimeType: string;
      size: unknown;
      uploadedById: string | null;
      uploadedByName: string | null;
      createdAt: unknown;
    }[];
    return rows.map((row) => ({
      linkId: row.linkId,
      fileId: row.fileId,
      category: row.category,
      note: row.linkNote,
      filename: row.filename,
      ext: row.ext,
      mimeType: row.mimeType,
      size: toNumber(row.size),
      uploadedById: row.uploadedById,
      uploadedByName: row.uploadedByName,
      createdAt: toIso(row.createdAt),
    }));
  }

  private async listAttachmentsByFileIds(
    fileIds: readonly string[],
  ): Promise<AttachmentDto[]> {
    if (!fileIds.length) return [];
    const rows = (await this.query()
      .selectFrom('repairFiles')
      .selectAll()
      .where('id', 'in', [...fileIds])
      .execute()) as {
      id: string;
      filename: string;
      ext: string;
      mimeType: string;
      size: unknown;
      note: string | null;
      uploadedById: string | null;
      uploadedByName: string | null;
      createdAt: unknown;
    }[];
    // A file shown outside its ticket still carries the note edited on the ticket link; prefer it over the copy on
    // the file record so the Files page and the ticket detail agree.
    const links = (await this.query()
      .selectFrom('repairTicketFiles')
      .select(['fileId', 'note'])
      .where('fileId', 'in', [...fileIds])
      .execute()) as { fileId: string; note: string | null }[];
    const noteByFile = new Map<string, string>();
    for (const link of links) {
      if (link.note) noteByFile.set(link.fileId, link.note);
    }
    return rows.map((row) => ({
      linkId: 0,
      fileId: row.id,
      category: 'manual',
      note: noteByFile.get(row.id) ?? row.note,
      filename: row.filename,
      ext: row.ext,
      mimeType: row.mimeType,
      size: toNumber(row.size),
      uploadedById: row.uploadedById,
      uploadedByName: row.uploadedByName,
      createdAt: toIso(row.createdAt),
    }));
  }

  private async accessibleTicketIds(
    principal: RepairPrincipal,
  ): Promise<number[] | null> {
    if (this.capabilities(principal).viewAll) return null;
    const specs: FilterSpec[] =
      principal.role === 'technician'
        ? [{ kind: 'eq', column: 'assigneeId', value: principal.userId }]
        : [{ kind: 'eq', column: 'reporterId', value: principal.userId }];
    const where = buildWhere(specs);
    let query = this.query().selectFrom('repairTickets').select(['id']);
    if (where) query = query.where(where);
    const rows = (await query.execute()) as { id: number }[];
    return rows.map((row) => row.id);
  }

  /**
   * Answer whether the caller may read a file's bytes. Resolved on every request from current ticket access, so a
   * link that worked before a reassignment or acceptance change is refused afterwards.
   */
  async canAccessFile(
    principal: RepairPrincipal,
    fileId: string,
  ): Promise<'ok' | 'missing' | 'denied'> {
    const file = (await this.query()
      .selectFrom('repairFiles')
      .select(['id', 'uploadedById'])
      .where('id', '=', fileId)
      .executeTakeFirst()) as
      { id: string; uploadedById: string | null } | undefined;
    if (!file) return 'missing';
    const manual = await this.query()
      .selectFrom('equipment')
      .select(['id'])
      .where('manualFileId', '=', fileId)
      .executeTakeFirst();
    if (manual) return 'ok';
    const links = (await this.query()
      .selectFrom('repairTicketFiles')
      .select(['ticketId'])
      .where('fileId', '=', fileId)
      .execute()) as { ticketId: number }[];
    if (!links.length) {
      return file.uploadedById === principal.userId ? 'ok' : 'denied';
    }
    if (this.capabilities(principal).viewAll) return 'ok';
    const ticketIds = links.map((row) => row.ticketId);
    const tickets = (await this.query()
      .selectFrom('repairTickets')
      .select(['reporterId', 'assigneeId'])
      .where('id', 'in', ticketIds)
      .execute()) as { reporterId: string; assigneeId: string | null }[];
    return tickets.some((ticket) => this.canViewTicket(principal, ticket))
      ? 'ok'
      : 'denied';
  }

  async getFileRecord(fileId: string): Promise<{
    id: string;
    disk: string;
    key: string;
    filename: string;
    mimeType: string;
    size: number;
  } | null> {
    const row = (await this.query()
      .selectFrom('repairFiles')
      .selectAll()
      .where('id', '=', fileId)
      .executeTakeFirst()) as
      | {
          id: string;
          disk: string;
          key: string;
          filename: string;
          mimeType: string;
          size: unknown;
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      disk: row.disk,
      key: row.key,
      filename: row.filename,
      mimeType: row.mimeType,
      size: toNumber(row.size),
    };
  }

  async assertTicketWritable(
    principal: RepairPrincipal,
    ticketId: number,
  ): Promise<TicketRow> {
    const row = await this.loadTicketRow(ticketId);
    if (!this.canViewTicket(principal, row)) {
      throw new RepairError('FORBIDDEN', 'You cannot access this ticket.');
    }
    return row;
  }

  async linkFiles(
    principal: RepairPrincipal,
    ticketId: number,
    fileIds: readonly string[],
    category: AttachmentCategory,
    note: string | null,
  ): Promise<void> {
    if (!fileIds.length) {
      throw new RepairError('VALIDATION', 'At least one file is required.');
    }
    const now = new Date();
    await this.database.transaction(async (connection) => {
      for (const fileId of fileIds) {
        const existing = await connection.query
          .selectFrom('repairTicketFiles')
          .select(['id'])
          .where('ticketId', '=', ticketId)
          .where('fileId', '=', fileId)
          .executeTakeFirst();
        if (existing) {
          await connection.query
            .updateTable('repairTicketFiles')
            .set({ category, note })
            .where('id', '=', (existing as { id: number }).id)
            .execute();
          continue;
        }
        await connection.query
          .insertInto('repairTicketFiles')
          .values({
            ticketId,
            fileId,
            category,
            note,
            createdById: principal.userId,
            createdByName: principal.name,
            createdAt: now,
          })
          .execute();
      }
    });
  }

  async updateFileMeta(
    principal: RepairPrincipal,
    fileId: string,
    input: { filename?: unknown; note?: unknown },
  ): Promise<void> {
    const access = await this.canAccessFile(principal, fileId);
    if (access === 'missing') {
      throw new RepairError('NOT_FOUND', 'File not found.');
    }
    if (access === 'denied') {
      throw new RepairError('FORBIDDEN', 'You cannot change this file.');
    }
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.filename !== undefined) {
      const filename = requireString(input.filename);
      const ext = filename.includes('.')
        ? filename.slice(filename.lastIndexOf('.') + 1).toLowerCase()
        : '';
      patch.filename = filename;
      patch.ext = ext;
    }
    if (input.note !== undefined) {
      // `listAttachments` reads the note from the ticket link, not the file record, so the edit must land there.
      // The file record keeps a copy for listings that resolve a file without a link.
      patch.note = optionalString(input.note);
    }
    await this.database.transaction(async (connection) => {
      await connection.query
        .updateTable('repairFiles')
        .set(patch)
        .where('id', '=', fileId)
        .execute();
      if (input.note !== undefined) {
        await connection.query
          .updateTable('repairTicketFiles')
          .set({ note: optionalString(input.note) })
          .where('fileId', '=', fileId)
          .execute();
      }
    });
  }

  async unlinkAndDeleteFile(
    principal: RepairPrincipal,
    fileId: string,
  ): Promise<{ key: string; disk: string } | null> {
    const access = await this.canAccessFile(principal, fileId);
    if (access === 'missing') return null;
    if (access === 'denied') {
      throw new RepairError('FORBIDDEN', 'You cannot delete this file.');
    }
    const file = (await this.query()
      .selectFrom('repairFiles')
      .select(['id', 'key', 'disk'])
      .where('id', '=', fileId)
      .executeTakeFirst()) as
      { id: string; key: string; disk: string } | undefined;
    if (!file) return null;
    await this.database.transaction(async (connection) => {
      await connection.query
        .deleteFrom('repairTicketFiles')
        .where('fileId', '=', fileId)
        .execute();
      await connection.query
        .deleteFrom('repairFiles')
        .where('id', '=', fileId)
        .execute();
    });
    return { key: file.key, disk: file.disk };
  }

  async listAccessibleFiles(
    principal: RepairPrincipal,
    filters: { ticketId?: number; keyword?: string; limit?: number },
  ): Promise<AttachmentDto[]> {
    const limit = Math.min(200, Math.max(1, filters.limit ?? 100));
    const keyword = filters.keyword;
    if (filters.ticketId) {
      await this.assertTicketWritable(principal, filters.ticketId);
      const all = await this.listAttachments(filters.ticketId);
      return keyword
        ? all.filter((item) => item.filename.includes(keyword))
        : all;
    }
    const ticketIds = await this.accessibleTicketIds(principal);
    const fileIds = new Set<string>();
    if (ticketIds === null) {
      const rows = (await this.query()
        .selectFrom('repairFiles')
        .select(['id'])
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .execute()) as { id: string }[];
      for (const row of rows) fileIds.add(row.id);
    } else {
      if (ticketIds.length) {
        const links = (await this.query()
          .selectFrom('repairTicketFiles')
          .select(['fileId'])
          .where('ticketId', 'in', ticketIds)
          .execute()) as { fileId: string }[];
        for (const link of links) fileIds.add(link.fileId);
      }
      const own = (await this.query()
        .selectFrom('repairFiles')
        .select(['id'])
        .where('uploadedById', '=', principal.userId)
        .execute()) as { id: string }[];
      for (const row of own) fileIds.add(row.id);
      const manuals = (await this.query()
        .selectFrom('equipment')
        .select(['manualFileId'])
        .where('manualFileId', 'is not', null)
        .execute()) as { manualFileId: string | null }[];
      for (const row of manuals) {
        if (row.manualFileId) fileIds.add(row.manualFileId);
      }
    }
    const all = await this.listAttachmentsByFileIds([...fileIds]);
    const filtered = keyword
      ? all.filter((item) => item.filename.includes(keyword))
      : all;
    return filtered
      .sort((left, right) =>
        String(right.createdAt).localeCompare(String(left.createdAt)),
      )
      .slice(0, limit);
  }

  // ---- Dashboard -------------------------------------------------------

  async dashboard(principal: RepairPrincipal): Promise<{
    pendingDispatch: number;
    overdue: number;
    pendingAcceptance: number;
    inProgress: number;
    completedThisMonth: number;
    createdThisMonth: number;
    monthlyCompletionRate: number;
    monthlyRepairCost: number;
    statusBreakdown: { status: string; count: number }[];
  }> {
    const specs = this.ticketScopeSpecs(principal);
    const where = buildWhere(specs);
    let query = this.query()
      .selectFrom('repairTickets')
      .select([
        'id',
        'status',
        'dueAt',
        'createdAt',
        'completedAt',
        'settledAt',
      ]);
    if (where) query = query.where(where);
    const rows = (await query.execute()) as {
      id: number;
      status: string;
      dueAt: unknown;
      createdAt: unknown;
      completedAt: unknown;
      settledAt: unknown;
    }[];
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const thisMonth = (value: unknown): boolean => {
      const iso = toIso(value);
      return iso !== null && new Date(iso).getTime() >= monthStart.getTime();
    };
    const pendingDispatch = rows.filter(
      (row) => row.status === 'pending_dispatch',
    ).length;
    const pendingAcceptance = rows.filter(
      (row) => row.status === 'pending_acceptance',
    ).length;
    const inProgress = rows.filter(
      (row) => row.status === 'in_progress',
    ).length;
    const overdue = rows.filter((row) => isOverdue(row)).length;
    const createdThisMonth = rows.filter((row) =>
      thisMonth(row.createdAt),
    ).length;
    const completedThisMonth = rows.filter(
      (row) => row.status === 'completed' && thisMonth(row.completedAt),
    ).length;
    const completedIds = new Set(
      rows.filter((row) => row.status === 'completed').map((row) => row.id),
    );

    const settlements = (await this.query()
      .selectFrom('repairSettlements')
      .select(['ticketId', 'totalAmount', 'settledAt'])
      .execute()) as {
      ticketId: number;
      totalAmount: unknown;
      settledAt: unknown;
    }[];
    const monthlyRepairCost =
      Math.round(
        settlements
          .filter(
            (row) => thisMonth(row.settledAt) && completedIds.has(row.ticketId),
          )
          .reduce((total, row) => total + toNumber(row.totalAmount), 0) * 100,
      ) / 100;

    const statusCounts = new Map<string, number>();
    for (const row of rows) {
      statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);
    }
    return {
      pendingDispatch,
      overdue,
      pendingAcceptance,
      inProgress,
      completedThisMonth,
      createdThisMonth,
      monthlyCompletionRate: createdThisMonth
        ? Math.round((completedThisMonth / createdThisMonth) * 1000) / 10
        : 0,
      monthlyRepairCost,
      statusBreakdown: TICKET_STATUSES.map((status) => ({
        status,
        count: statusCounts.get(status) ?? 0,
      })),
    };
  }

  // ---- Reference data --------------------------------------------------

  async listTechnicians(): Promise<
    { userId: string; displayName: string; role: string }[]
  > {
    const rows = (await this.query()
      .selectFrom('repairMembers')
      .select(['userId', 'displayName', 'role'])
      .where('role', 'in', ['technician', 'admin'])
      .orderBy('userId', 'asc')
      .execute()) as {
      userId: string;
      displayName: string | null;
      role: string;
    }[];
    return rows.map((row) => ({
      userId: row.userId,
      displayName: row.displayName ?? `user-${row.userId}`,
      role: row.role,
    }));
  }
}
