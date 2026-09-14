import type { DatabaseConnection, DatabaseManager, Row } from '@nocobase/db';

import {
  actorCapabilities,
  calculateHours,
  canAccessTeam,
  defectRate,
  ProductionError,
  validateDefectQuantities,
  validateReportQuantities,
  WORK_ORDER_STATUSES,
  DEFECT_REASONS,
  DEFECT_DISPOSITIONS,
  type Actor,
  type ActorCapabilities,
  type WorkOrderStatus,
} from './production-domain.js';

/** Reads the Permission Sets directly assigned to a user, so the authorization plugin stays the role source. */
export interface RoleAssignmentReader {
  listRoleKeys(userId: string): Promise<readonly string[]>;
}

interface StaffProfileRow extends Row {
  userId: string;
  role: string;
  teamId: number | null;
}

interface WorkOrderRow extends Row {
  id: number;
  code: string;
  productId: number;
  plannedQuantity: number;
  plannedStartDate: unknown;
  plannedEndDate: unknown;
  teamId: number;
  status: string;
  createdById: string | null;
  createdByName: string | null;
  createdAt: unknown;
  updatedAt: unknown;
}

interface ProcessRow extends Row {
  id: number;
  workOrderId: number;
  name: string;
  sequence: number;
  plannedQuantity: number;
}

interface ReportRow extends Row {
  id: number;
  workOrderId: number;
  processId: number;
  quantity: number;
  qualifiedQuantity: number;
  defectQuantity: number;
  hours: unknown;
  reporterId: string;
  reporterName: string | null;
  reportedAt: unknown;
}

interface DefectRow extends Row {
  id: number;
  workReportId: number;
  workOrderId: number;
  processId: number;
  quantity: number;
  reason: string;
  disposition: string;
  recordedById: string | null;
  recordedByName: string | null;
  createdAt: unknown;
}

export interface WorkOrderScope {
  readonly teamId: number | null;
  readonly all: boolean;
}

export interface CreateProductInput {
  readonly code: string;
  readonly name: string;
  readonly specification?: string | null;
  readonly unit?: string;
  readonly standardMinutes: number;
}

export interface CreateWorkOrderProcessInput {
  readonly name: string;
  readonly plannedQuantity: number;
  readonly sequence?: number;
}

export interface CreateWorkOrderInput {
  readonly code?: string;
  readonly productId: number;
  readonly plannedQuantity: number;
  readonly plannedStartDate?: string | null;
  readonly plannedEndDate?: string | null;
  readonly teamId: number;
  readonly status?: WorkOrderStatus;
  readonly processes: readonly CreateWorkOrderProcessInput[];
}

export interface CreateWorkReportInput {
  readonly processId: number;
  readonly quantity: number;
  readonly qualifiedQuantity: number;
  readonly defectQuantity: number;
  readonly reportedAt?: string | null;
}

export interface CreateDefectRecordInput {
  readonly workReportId: number;
  readonly quantity: number;
  readonly reason: string;
  readonly disposition: string;
}

export interface RegisterStaffInput {
  readonly name: string;
  readonly username: string;
  readonly email: string;
  readonly password: string;
  readonly role: string;
  readonly teamId: number | null;
}

function numberValue(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Coerces an untyped row value to text without ever stringifying an object. */
function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function integerValue(value: unknown): number {
  return Math.trunc(numberValue(value));
}

/**
 * SQLite stores datetime values as an epoch-millisecond text such as `1789372912893.0`, so a numeric
 * string is interpreted as an instant rather than as an unparseable date.
 */
function asDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  const raw = text(value);
  if (/^\d+(?:\.\d+)?$/.test(raw)) return new Date(Number(raw));
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateOnly(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = asDate(value);
  return parsed ? parsed.toISOString().slice(0, 10) : text(value).slice(0, 10);
}

function isoString(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = asDate(value);
  return parsed ? parsed.toISOString() : text(value);
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ProductionError('INVALID_INPUT', `${field} is required`);
  }
  return value.trim();
}

function requiredPositiveNumber(value: unknown, field: string): number {
  const parsed = numberValue(value);
  if (!(parsed > 0)) {
    throw new ProductionError(
      'INVALID_INPUT',
      `${field} must be greater than 0`,
    );
  }
  return parsed;
}

export class ProductionService {
  public constructor(
    private readonly database: DatabaseManager,
    private readonly roleAssignments: RoleAssignmentReader,
  ) {}

  /**
   * Builds the caller's identity from the authorization plugin's assignments and the application-owned
   * staff profile (which also carries team membership).
   */
  public async resolveActor(
    userId: string,
    displayName: string,
  ): Promise<Actor> {
    const [profile, assignedRoles] = await Promise.all([
      this.database
        .query()
        .selectFrom('staffProfiles')
        .selectAll()
        .where('userId', '=', userId)
        .executeTakeFirst<StaffProfileRow>(),
      this.roleAssignments.listRoleKeys(userId),
    ]);
    // Permission Sets are the authoritative role source, so a role the administrator changes in the
    // Users page takes effect. The staff profile carries team membership and the role chosen at
    // sign-up for display only.
    const roles = [...new Set(assignedRoles)];

    const teamId: number | null = profile?.teamId ?? null;
    let teamName: string | null = null;
    if (teamId !== null) {
      const team = await this.database
        .query()
        .selectFrom('teams')
        .select(['id', 'name'])
        .where('id', '=', teamId)
        .executeTakeFirst();
      teamName = team ? text(team.name) : null;
    }

    return {
      userId,
      name: displayName,
      roles,
      teamId,
      teamName,
    };
  }

  public async listProducts(): Promise<Row[]> {
    const rows = await this.database
      .query()
      .selectFrom('products')
      .selectAll()
      .orderBy('name', 'asc')
      .execute();
    return rows.map((row) => ({
      id: integerValue(row.id),
      code: text(row.code),
      name: text(row.name),
      specification: row.specification ?? null,
      unit: text(row.unit) || '件',
      standardMinutes: numberValue(row.standardMinutes),
    }));
  }

  public async createProduct(
    input: CreateProductInput,
  ): Promise<{ id: number }> {
    const code = requiredText(input.code, 'code');
    const name = requiredText(input.name, 'name');
    const standardMinutes = requiredPositiveNumber(
      input.standardMinutes,
      'standardMinutes',
    );
    const unit =
      typeof input.unit === 'string' && input.unit.trim()
        ? input.unit.trim()
        : '件';
    const existing = await this.database
      .query()
      .selectFrom('products')
      .select(['id'])
      .where('code', '=', code)
      .executeTakeFirst();
    if (existing) {
      throw new ProductionError(
        'CODE_CONFLICT',
        'Product code already exists',
        409,
      );
    }
    const now = new Date();
    const inserted = await this.database
      .query()
      .insertInto('products')
      .values({
        code,
        name,
        specification: input.specification?.trim() || null,
        unit,
        standardMinutes,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return { id: Number(inserted.insertId) };
  }

  public async listTeams(): Promise<Row[]> {
    const rows = await this.database
      .query()
      .selectFrom('teams')
      .selectAll()
      .orderBy('name', 'asc')
      .execute();
    return rows.map((row) => ({
      id: integerValue(row.id),
      code: text(row.code),
      name: text(row.name),
    }));
  }

  public scopeFor(actor: Actor): WorkOrderScope {
    const capabilities = actorCapabilities(actor);
    return {
      teamId: actor.teamId,
      all: capabilities.canReadAllWorkOrders,
    };
  }

  private workOrderQuery(scope: WorkOrderScope) {
    let query = this.database.query().selectFrom('workOrders').selectAll();
    if (!scope.all) {
      if (scope.teamId === null) {
        query = query.where('id', '=', -1);
      } else {
        query = query.where('teamId', '=', scope.teamId);
      }
    }
    return query;
  }

  private async productMap(): Promise<Map<number, Row>> {
    const rows = await this.database
      .query()
      .selectFrom('products')
      .selectAll()
      .execute();
    return new Map(rows.map((row) => [integerValue(row.id), row]));
  }

  private async teamMap(): Promise<Map<number, Row>> {
    const rows = await this.database
      .query()
      .selectFrom('teams')
      .selectAll()
      .execute();
    return new Map(rows.map((row) => [integerValue(row.id), row]));
  }

  public async listWorkOrders(scope: WorkOrderScope): Promise<Row[]> {
    const orders = await this.workOrderQuery(scope)
      .orderBy('createdAt', 'desc')
      .execute<WorkOrderRow>();
    if (orders.length === 0) return [];
    const [products, teams, reports] = await Promise.all([
      this.productMap(),
      this.teamMap(),
      this.database
        .query()
        .selectFrom('workReports')
        .selectAll()
        .where(
          'workOrderId',
          'in',
          orders.map((order) => integerValue(order.id)),
        )
        .execute<ReportRow>(),
    ]);
    const progress = new Map<
      number,
      { reported: number; qualified: number; defect: number }
    >();
    for (const report of reports) {
      const key = integerValue(report.workOrderId);
      const current = progress.get(key) ?? {
        reported: 0,
        qualified: 0,
        defect: 0,
      };
      current.reported += integerValue(report.quantity);
      current.qualified += integerValue(report.qualifiedQuantity);
      current.defect += integerValue(report.defectQuantity);
      progress.set(key, current);
    }
    return orders.map((order) =>
      this.toWorkOrderSummary(order, products, teams, progress),
    );
  }

  private toWorkOrderSummary(
    order: WorkOrderRow,
    products: Map<number, Row>,
    teams: Map<number, Row>,
    progress: Map<
      number,
      { reported: number; qualified: number; defect: number }
    >,
  ): Row {
    const id = integerValue(order.id);
    const planned = integerValue(order.plannedQuantity);
    const current = progress.get(id) ?? {
      reported: 0,
      qualified: 0,
      defect: 0,
    };
    return {
      id,
      code: text(order.code),
      productId: integerValue(order.productId),
      productName: products.get(integerValue(order.productId))?.name ?? null,
      productUnit: products.get(integerValue(order.productId))?.unit ?? '件',
      teamId: integerValue(order.teamId),
      teamName: teams.get(integerValue(order.teamId))?.name ?? null,
      plannedQuantity: planned,
      plannedStartDate: dateOnly(order.plannedStartDate),
      plannedEndDate: dateOnly(order.plannedEndDate),
      status: text(order.status),
      createdByName: order.createdByName ?? null,
      createdAt: isoString(order.createdAt),
      reportedQuantity: current.reported,
      qualifiedQuantity: current.qualified,
      defectQuantity: current.defect,
      completion:
        planned > 0 ? Math.round((current.reported / planned) * 100) : 0,
    };
  }

  private async findWorkOrderOrThrow(id: number): Promise<WorkOrderRow> {
    const order = await this.database
      .query()
      .selectFrom('workOrders')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst<WorkOrderRow>();
    if (!order) {
      throw new ProductionError('NOT_FOUND', 'Work order not found', 404);
    }
    return order;
  }

  public assertCanAccessWorkOrder(actor: Actor, order: WorkOrderRow): void {
    const capabilities = actorCapabilities(actor);
    if (
      !canAccessTeam(capabilities, actor.teamId, integerValue(order.teamId))
    ) {
      throw new ProductionError(
        'FORBIDDEN',
        'You are not allowed to access this work order',
        403,
      );
    }
  }

  public async getWorkOrderDetail(id: number, actor: Actor): Promise<Row> {
    const order = await this.findWorkOrderOrThrow(id);
    this.assertCanAccessWorkOrder(actor, order);

    const [products, teams, processes, reports, defects] = await Promise.all([
      this.productMap(),
      this.teamMap(),
      this.database
        .query()
        .selectFrom('workOrderProcesses')
        .selectAll()
        .where('workOrderId', '=', id)
        .orderBy('sequence', 'asc')
        .execute<ProcessRow>(),
      this.database
        .query()
        .selectFrom('workReports')
        .selectAll()
        .where('workOrderId', '=', id)
        .orderBy('reportedAt', 'desc')
        .execute<ReportRow>(),
      this.database
        .query()
        .selectFrom('defectRecords')
        .selectAll()
        .where('workOrderId', '=', id)
        .orderBy('createdAt', 'desc')
        .execute<DefectRow>(),
    ]);

    const progress = new Map<
      number,
      { reported: number; qualified: number; defect: number }
    >();
    for (const report of reports) {
      const key = integerValue(report.processId);
      const current = progress.get(key) ?? {
        reported: 0,
        qualified: 0,
        defect: 0,
      };
      current.reported += integerValue(report.quantity);
      current.qualified += integerValue(report.qualifiedQuantity);
      current.defect += integerValue(report.defectQuantity);
      progress.set(key, current);
    }
    const total = reports.reduce(
      (accumulator, report) => ({
        reported: accumulator.reported + integerValue(report.quantity),
        qualified:
          accumulator.qualified + integerValue(report.qualifiedQuantity),
        defect: accumulator.defect + integerValue(report.defectQuantity),
      }),
      { reported: 0, qualified: 0, defect: 0 },
    );

    const processName = new Map(
      processes.map((process) => [
        integerValue(process.id),
        text(process.name),
      ]),
    );
    const defectByReport = new Map<number, number>();
    for (const defect of defects) {
      const key = integerValue(defect.workReportId);
      defectByReport.set(
        key,
        (defectByReport.get(key) ?? 0) + integerValue(defect.quantity),
      );
    }

    return {
      ...this.toWorkOrderSummary(
        order,
        products,
        teams,
        new Map([[integerValue(order.id), total]]),
      ),
      processes: processes.map((process) => {
        const current = progress.get(integerValue(process.id)) ?? {
          reported: 0,
          qualified: 0,
          defect: 0,
        };
        const planned = integerValue(process.plannedQuantity);
        return {
          id: integerValue(process.id),
          name: text(process.name),
          sequence: integerValue(process.sequence),
          plannedQuantity: planned,
          reportedQuantity: current.reported,
          qualifiedQuantity: current.qualified,
          defectQuantity: current.defect,
          remainingQuantity: planned - current.reported,
          completion:
            planned > 0 ? Math.round((current.reported / planned) * 100) : 0,
        };
      }),
      reports: reports.map((report) => ({
        id: integerValue(report.id),
        processId: integerValue(report.processId),
        processName: processName.get(integerValue(report.processId)) ?? null,
        quantity: integerValue(report.quantity),
        qualifiedQuantity: integerValue(report.qualifiedQuantity),
        defectQuantity: integerValue(report.defectQuantity),
        hours: numberValue(report.hours),
        reporterName: report.reporterName ?? null,
        reportedAt: isoString(report.reportedAt),
        registeredDefectQuantity:
          defectByReport.get(integerValue(report.id)) ?? 0,
      })),
      defects: defects.map((defect) => ({
        id: integerValue(defect.id),
        workReportId: integerValue(defect.workReportId),
        processId: integerValue(defect.processId),
        processName: processName.get(integerValue(defect.processId)) ?? null,
        quantity: integerValue(defect.quantity),
        reason: text(defect.reason),
        disposition: text(defect.disposition),
        recordedByName: defect.recordedByName ?? null,
        createdAt: isoString(defect.createdAt),
      })),
    };
  }

  public async createWorkOrder(
    input: CreateWorkOrderInput,
    actor: Actor,
  ): Promise<{ id: number; code: string }> {
    const capabilities = actorCapabilities(actor);
    if (!capabilities.canManageWorkOrders) {
      throw new ProductionError(
        'FORBIDDEN',
        'Only a production supervisor can create work orders',
        403,
      );
    }
    const product = await this.database
      .query()
      .selectFrom('products')
      .select(['id'])
      .where('id', '=', integerValue(input.productId))
      .executeTakeFirst();
    if (!product) {
      throw new ProductionError('PRODUCT_NOT_FOUND', 'Product not found', 404);
    }
    const team = await this.database
      .query()
      .selectFrom('teams')
      .select(['id'])
      .where('id', '=', integerValue(input.teamId))
      .executeTakeFirst();
    if (!team) {
      throw new ProductionError('TEAM_NOT_FOUND', 'Team not found', 404);
    }
    const plannedQuantity = requiredPositiveNumber(
      input.plannedQuantity,
      'plannedQuantity',
    );
    if (input.processes.length === 0) {
      throw new ProductionError(
        'INVALID_INPUT',
        'A work order needs at least one process',
      );
    }
    const processes = input.processes.map((process, index) => ({
      name: requiredText(process.name, 'process name'),
      plannedQuantity: requiredPositiveNumber(
        process.plannedQuantity,
        'process plannedQuantity',
      ),
      sequence:
        typeof process.sequence === 'number' &&
        Number.isFinite(process.sequence)
          ? Math.trunc(process.sequence)
          : index + 1,
    }));
    processes.sort((left, right) => left.sequence - right.sequence);

    const requestedCode =
      typeof input.code === 'string' && input.code.trim()
        ? input.code.trim()
        : null;

    return this.database.transaction(async (connection) => {
      const code = requestedCode ?? (await this.nextWorkOrderCode(connection));
      const existing = await connection.query
        .selectFrom('workOrders')
        .select(['id'])
        .where('code', '=', code)
        .executeTakeFirst();
      if (existing) {
        throw new ProductionError(
          'CODE_CONFLICT',
          'Work order code already exists',
          409,
        );
      }
      const now = new Date();
      const inserted = await connection.query
        .insertInto('workOrders')
        .values({
          code,
          productId: integerValue(input.productId),
          plannedQuantity,
          plannedStartDate: input.plannedStartDate || null,
          plannedEndDate: input.plannedEndDate || null,
          teamId: integerValue(input.teamId),
          status: this.normalizeStatus(input.status) ?? 'pending',
          createdById: actor.userId,
          createdByName: actor.name,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      const workOrderId = Number(inserted.insertId);
      let sequence = 1;
      for (const process of processes) {
        await connection.query
          .insertInto('workOrderProcesses')
          .values({
            workOrderId,
            name: process.name,
            sequence,
            plannedQuantity: process.plannedQuantity,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        sequence += 1;
      }
      return { id: workOrderId, code };
    });
  }

  private normalizeStatus(value: unknown): WorkOrderStatus | null {
    if (typeof value !== 'string') return null;
    return (WORK_ORDER_STATUSES as readonly string[]).includes(value)
      ? (value as WorkOrderStatus)
      : null;
  }

  private async nextWorkOrderCode(
    connection: DatabaseConnection,
  ): Promise<string> {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const suffix = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      const code = `WO-${stamp}-${suffix}`;
      const existing = await connection.query
        .selectFrom('workOrders')
        .select(['id'])
        .where('code', '=', code)
        .executeTakeFirst();
      if (!existing) return code;
    }
    throw new ProductionError(
      'CODE_CONFLICT',
      'Unable to allocate a work order code',
      500,
    );
  }

  public async updateWorkOrderStatus(
    id: number,
    status: unknown,
    actor: Actor,
  ): Promise<void> {
    const capabilities = actorCapabilities(actor);
    if (!capabilities.canManageWorkOrders) {
      throw new ProductionError(
        'FORBIDDEN',
        'Only a production supervisor can change a work order',
        403,
      );
    }
    const normalized = this.normalizeStatus(status);
    if (!normalized) {
      throw new ProductionError('INVALID_INPUT', 'Unknown work order status');
    }
    await this.findWorkOrderOrThrow(id);
    await this.database
      .query()
      .updateTable('workOrders')
      .set({ status: normalized, updatedAt: new Date() })
      .where('id', '=', id)
      .execute();
  }

  public async createWorkReport(
    workOrderId: number,
    input: CreateWorkReportInput,
    actor: Actor,
  ): Promise<Row> {
    const capabilities = actorCapabilities(actor);
    if (!capabilities.canReport) {
      throw new ProductionError(
        'FORBIDDEN',
        'You are not allowed to submit work reports',
        403,
      );
    }
    const order = await this.findWorkOrderOrThrow(workOrderId);
    this.assertCanAccessWorkOrder(actor, order);

    const product = await this.database
      .query()
      .selectFrom('products')
      .selectAll()
      .where('id', '=', integerValue(order.productId))
      .executeTakeFirst();
    if (!product) {
      throw new ProductionError('PRODUCT_NOT_FOUND', 'Product not found', 404);
    }
    const standardMinutes = numberValue(product.standardMinutes);

    return this.database.transaction(async (connection) => {
      const process = await connection.query
        .selectFrom('workOrderProcesses')
        .selectAll()
        .where('id', '=', integerValue(input.processId))
        .where('workOrderId', '=', workOrderId)
        .executeTakeFirst<ProcessRow>();
      if (!process) {
        throw new ProductionError(
          'PROCESS_NOT_FOUND',
          'Process not found',
          404,
        );
      }
      const reported = await connection.query
        .selectFrom('workReports')
        .select(({ fn }) => [fn.sum('quantity').as('total')])
        .where('processId', '=', integerValue(process.id))
        .executeTakeFirst();
      const reportedSoFar = integerValue(reported?.total);
      const remaining = integerValue(process.plannedQuantity) - reportedSoFar;

      const quantities = validateReportQuantities(input, remaining);
      const hours = calculateHours(quantities.quantity, standardMinutes);
      const reportedAt = input.reportedAt
        ? new Date(input.reportedAt)
        : new Date();
      if (Number.isNaN(reportedAt.getTime())) {
        throw new ProductionError(
          'INVALID_INPUT',
          'reportedAt is not a valid date',
        );
      }
      const now = new Date();
      const inserted = await connection.query
        .insertInto('workReports')
        .values({
          workOrderId,
          processId: integerValue(process.id),
          quantity: quantities.quantity,
          qualifiedQuantity: quantities.qualifiedQuantity,
          defectQuantity: quantities.defectQuantity,
          hours,
          reporterId: actor.userId,
          reporterName: actor.name,
          reportedAt,
          createdAt: now,
          updatedAt: now,
        })
        .execute();

      if (text(order.status) === 'pending') {
        await connection.query
          .updateTable('workOrders')
          .set({ status: 'in_production', updatedAt: now })
          .where('id', '=', workOrderId)
          .execute();
      }

      return {
        id: Number(inserted.insertId),
        workOrderId,
        processId: integerValue(process.id),
        quantity: quantities.quantity,
        qualifiedQuantity: quantities.qualifiedQuantity,
        defectQuantity: quantities.defectQuantity,
        hours,
        reporterName: actor.name,
        reportedAt: reportedAt.toISOString(),
      };
    });
  }

  public async createDefectRecord(
    workOrderId: number,
    input: CreateDefectRecordInput,
    actor: Actor,
  ): Promise<Row> {
    const capabilities = actorCapabilities(actor);
    if (!capabilities.canManageDefects) {
      throw new ProductionError(
        'FORBIDDEN',
        'You are not allowed to register defect records',
        403,
      );
    }
    const order = await this.findWorkOrderOrThrow(workOrderId);
    this.assertCanAccessWorkOrder(actor, order);

    const reason = requiredText(input.reason, 'reason');
    const disposition = requiredText(input.disposition, 'disposition');
    if (!(DEFECT_REASONS as readonly string[]).includes(reason)) {
      throw new ProductionError('INVALID_INPUT', 'Unknown defect reason');
    }
    if (!(DEFECT_DISPOSITIONS as readonly string[]).includes(disposition)) {
      throw new ProductionError('INVALID_INPUT', 'Unknown defect disposition');
    }

    return this.database.transaction(async (connection) => {
      const report = await connection.query
        .selectFrom('workReports')
        .selectAll()
        .where('id', '=', integerValue(input.workReportId))
        .where('workOrderId', '=', workOrderId)
        .executeTakeFirst<ReportRow>();
      if (!report) {
        throw new ProductionError(
          'REPORT_NOT_FOUND',
          'Work report not found',
          404,
        );
      }
      const registeredForReport = await connection.query
        .selectFrom('defectRecords')
        .select(({ fn }) => [fn.sum('quantity').as('total')])
        .where('workReportId', '=', integerValue(report.id))
        .executeTakeFirst();
      const remainingInReport =
        integerValue(report.defectQuantity) -
        integerValue(registeredForReport?.total);

      const processReported = await connection.query
        .selectFrom('workReports')
        .select(({ fn }) => [fn.sum('quantity').as('total')])
        .where('processId', '=', integerValue(report.processId))
        .executeTakeFirst();
      const registeredForProcess = await connection.query
        .selectFrom('defectRecords')
        .select(({ fn }) => [fn.sum('quantity').as('total')])
        .where('processId', '=', integerValue(report.processId))
        .executeTakeFirst();

      const quantity = validateDefectQuantities(
        input,
        remainingInReport,
        integerValue(processReported?.total),
        integerValue(registeredForProcess?.total),
      );

      const now = new Date();
      const inserted = await connection.query
        .insertInto('defectRecords')
        .values({
          workReportId: integerValue(report.id),
          workOrderId,
          processId: integerValue(report.processId),
          quantity,
          reason,
          disposition,
          recordedById: actor.userId,
          recordedByName: actor.name,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      return {
        id: Number(inserted.insertId),
        workReportId: integerValue(report.id),
        processId: integerValue(report.processId),
        quantity,
        reason,
        disposition,
        recordedByName: actor.name,
        createdAt: now.toISOString(),
      };
    });
  }

  public async listDefectRecords(scope: WorkOrderScope): Promise<Row[]> {
    const orders = await this.workOrderQuery(scope).execute<WorkOrderRow>();
    if (orders.length === 0) return [];
    const orderById = new Map(
      orders.map((order) => [integerValue(order.id), order]),
    );
    const defects = await this.database
      .query()
      .selectFrom('defectRecords')
      .selectAll()
      .where(
        'workOrderId',
        'in',
        orders.map((order) => integerValue(order.id)),
      )
      .orderBy('createdAt', 'desc')
      .execute<DefectRow>();
    const [products, teams, processes] = await Promise.all([
      this.productMap(),
      this.teamMap(),
      this.database
        .query()
        .selectFrom('workOrderProcesses')
        .selectAll()
        .execute<ProcessRow>(),
    ]);
    const processById = new Map(
      processes.map((process) => [integerValue(process.id), process]),
    );
    return defects.map((defect) => {
      const order = orderById.get(integerValue(defect.workOrderId));
      const productId = order ? integerValue(order.productId) : null;
      return {
        id: integerValue(defect.id),
        workOrderId: integerValue(defect.workOrderId),
        workOrderCode: order ? text(order.code) : null,
        productName:
          productId !== null ? (products.get(productId)?.name ?? null) : null,
        teamName: order
          ? (teams.get(integerValue(order.teamId))?.name ?? null)
          : null,
        processId: integerValue(defect.processId),
        processName:
          processById.get(integerValue(defect.processId))?.name ?? null,
        quantity: integerValue(defect.quantity),
        reason: text(defect.reason),
        disposition: text(defect.disposition),
        recordedByName: defect.recordedByName ?? null,
        createdAt: isoString(defect.createdAt),
      };
    });
  }

  public async getStatistics(scope: WorkOrderScope): Promise<Row> {
    const orders = await this.workOrderQuery(scope).execute<WorkOrderRow>();
    const [products, teams] = await Promise.all([
      this.productMap(),
      this.teamMap(),
    ]);
    const inProductionCount = orders.filter(
      (order) => text(order.status) === 'in_production',
    ).length;
    if (orders.length === 0) {
      return {
        byTeam: [],
        byProduct: [],
        inProductionCount,
        totals: {
          reportedQuantity: 0,
          qualifiedQuantity: 0,
          defectQuantity: 0,
          defectRate: 0,
        },
      };
    }
    const orderById = new Map(
      orders.map((order) => [integerValue(order.id), order]),
    );
    const reports = await this.database
      .query()
      .selectFrom('workReports')
      .selectAll()
      .where(
        'workOrderId',
        'in',
        orders.map((order) => integerValue(order.id)),
      )
      .execute<ReportRow>();

    const byTeam = new Map<
      number,
      { qualified: number; defect: number; count: number }
    >();
    const byProduct = new Map<
      number,
      { qualified: number; defect: number; count: number }
    >();
    const totals = { reported: 0, qualified: 0, defect: 0 };
    for (const report of reports) {
      const order = orderById.get(integerValue(report.workOrderId));
      if (!order) continue;
      const qualified = integerValue(report.qualifiedQuantity);
      const defect = integerValue(report.defectQuantity);
      totals.reported += integerValue(report.quantity);
      totals.qualified += qualified;
      totals.defect += defect;

      const teamKey = integerValue(order.teamId);
      const productKey = integerValue(order.productId);
      const teamEntry = byTeam.get(teamKey) ?? {
        qualified: 0,
        defect: 0,
        count: 0,
      };
      teamEntry.qualified += qualified;
      teamEntry.defect += defect;
      teamEntry.count += 1;
      byTeam.set(teamKey, teamEntry);

      const productEntry = byProduct.get(productKey) ?? {
        qualified: 0,
        defect: 0,
        count: 0,
      };
      productEntry.qualified += qualified;
      productEntry.defect += defect;
      productEntry.count += 1;
      byProduct.set(productKey, productEntry);
    }

    return {
      byTeam: [...byTeam.entries()].map(([teamId, entry]) => ({
        teamId,
        teamName: teams.get(teamId)?.name ?? null,
        qualifiedQuantity: entry.qualified,
        defectQuantity: entry.defect,
        defectRate: defectRate(entry.defect, entry.qualified),
        reportCount: entry.count,
      })),
      byProduct: [...byProduct.entries()].map(([productId, entry]) => ({
        productId,
        productName: products.get(productId)?.name ?? null,
        qualifiedQuantity: entry.qualified,
        defectQuantity: entry.defect,
        defectRate: defectRate(entry.defect, entry.qualified),
        reportCount: entry.count,
      })),
      inProductionCount,
      totals: {
        reportedQuantity: totals.reported,
        qualifiedQuantity: totals.qualified,
        defectQuantity: totals.defect,
        defectRate: defectRate(totals.defect, totals.qualified),
      },
    };
  }

  public capabilitiesFor(actor: Actor): ActorCapabilities {
    return actorCapabilities(actor);
  }

  public async assertTeamExists(teamId: number): Promise<void> {
    const team = await this.database
      .query()
      .selectFrom('teams')
      .select(['id'])
      .where('id', '=', teamId)
      .executeTakeFirst();
    if (!team) {
      throw new ProductionError('TEAM_NOT_FOUND', 'Team not found', 404);
    }
  }

  /** Writes the application-owned staff profile that carries the role and team of a self-registered user. */
  public async insertStaffProfile(
    connection: DatabaseConnection,
    userId: string,
    role: string,
    teamId: number | null,
  ): Promise<void> {
    const now = new Date();
    const existing = await connection.query
      .selectFrom('staffProfiles')
      .select(['id'])
      .where('userId', '=', userId)
      .executeTakeFirst();
    if (existing) {
      await connection.query
        .updateTable('staffProfiles')
        .set({ role, teamId, updatedAt: now })
        .where('userId', '=', userId)
        .execute();
      return;
    }
    await connection.query
      .insertInto('staffProfiles')
      .values({ userId, role, teamId, createdAt: now, updatedAt: now })
      .execute();
  }
}
