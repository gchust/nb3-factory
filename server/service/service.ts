/**
 * The after-sales service domain.
 *
 * Every method reads and writes through the Repository, taking the
 * `RepositoryPolicy` the route bound from the caller's business grants, so a
 * service method can never widen access: the caller may only reach the rows,
 * fields and relations the policy allows. The service knows nothing about HTTP,
 * Hono or status codes.
 */

import { randomUUID } from 'node:crypto';
import type {
  DatabaseManager,
  FilterBuilder,
  FilterNode,
  RepositoryOperations,
  RepositoryPolicy,
} from '@nocobase/db';

import {
  ATTACHMENT_EXTENSIONS,
  ASSISTANT_REASONS,
  COLLECTIONS,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PERMISSION_SET_KEYS,
  RUN_KEYS,
} from './constants.js';
import {
  allowedActions as stateAllowedActions,
  isWorkOrderStatus,
  overdueSince,
  validateTransition,
  type WorkOrderAction,
  type WorkOrderStatus,
} from './domain.js';
import {
  reachableOrderIds,
  sharedOrderIds,
  type Customer,
  type Device,
  type DeviceManual,
  type InspectionTask,
  type OverdueReminder,
  type RepairNote,
  type ScheduledRun,
  type ServiceGroup,
  type ServiceGroupMember,
  type WorkOrder,
  type WorkOrderExecution,
  type WorkOrderFileRow,
  type WorkOrderShare,
} from './resources.js';
import { TASK_DEFINITIONS, taskDefinition } from './tasks.js';
import type {
  AssistantStatusView,
  AttachmentStorage,
  AttachmentView,
  CustomerView,
  DeviceView,
  ExternalTicketAcceptedView,
  ExternalTicketView,
  InspectionTaskView,
  ManualView,
  OverdueReminderView,
  OverviewView,
  Paged,
  RepairNoteView,
  ScheduledRunView,
  ServiceGroupView,
  ShareTargetView,
  TaskListView,
  TaskRunResultView,
  WorkOrderDetailView,
  WorkOrderExecutionView,
  WorkOrderShareView,
  WorkOrderView,
} from './views.js';

export interface ServiceContext {
  readonly principalId?: string | null;
  readonly policies?: Readonly<Record<string, RepositoryPolicy>>;
  /** Lifecycle actions the route already authorized for this caller. */
  readonly permittedActions?: readonly WorkOrderAction[];
}

export interface ListQuery {
  readonly page?: number;
  readonly pageSize?: number;
  readonly search?: string;
  readonly status?: string;
  readonly assigneeId?: string;
  readonly groupId?: string;
}

export interface OverviewQuery {
  readonly recentLimit?: number;
}

function repo<T extends object>(
  database: DatabaseManager,
  collection: string,
  context?: ServiceContext,
): RepositoryOperations<T> {
  const base = database.repository<T>(collection);
  const policy = context?.policies?.[collection];
  if (!policy) return base;
  return base.withPolicy(policy as never);
}

function nowIso(clock: () => Date): string {
  return clock().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function pageBounds(query: ListQuery | undefined): {
  page: number;
  pageSize: number;
  offset: number;
} {
  const page = Math.max(1, Math.floor(query?.page ?? 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(query?.pageSize ?? DEFAULT_PAGE_SIZE)),
  );
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function iso(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return null;
}

/** Reads one stored file column as text, never rendering a non-scalar. */
function fileText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return fallback;
}

function isoRequired(value: unknown): string {
  return iso(value) ?? '';
}

function dayString(clock: () => Date): string {
  return clock().toISOString().slice(0, 10);
}

/**
 * The bytes a stored attachment must actually begin with.
 *
 * The extension is a claim; the signature is the file. Checking it turns a
 * truncated or renamed upload into a real failure at upload time instead of a
 * broken preview the reader has to discover later.
 */
const ATTACHMENT_SIGNATURES: Readonly<
  Record<'photo' | 'report', readonly number[]>
> = {
  // The PNG magic number.
  photo: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  // A DOCX is a ZIP archive, and every ZIP begins `PK`.
  report: [0x50, 0x4b],
};

async function assertAttachmentContent(
  file: File,
  category: 'photo' | 'report',
): Promise<void> {
  const signature = ATTACHMENT_SIGNATURES[category];
  const header = new Uint8Array(
    await file.slice(0, signature.length).arrayBuffer(),
  );
  const valid = signature.every((byte, index) => header[index] === byte);
  if (!valid) {
    throw new WorkOrderError(
      'INVALID_FILE_CONTENT',
      `The uploaded file is not a valid ${
        category === 'photo' ? 'PNG image' : 'DOCX document'
      }`,
      400,
    );
  }
}

function toScheduledRunView(
  row: ScheduledRun | undefined,
): ScheduledRunView | null {
  if (!row) return null;
  const status =
    row.status === 'succeeded' || row.status === 'failed'
      ? row.status
      : 'running';
  return {
    id: row.id,
    taskKey: row.taskKey,
    runDate: String(row.runDate).slice(0, 10),
    status,
    summary: row.summary ?? null,
    failureReason: row.failureReason ?? null,
    finishedAt: iso(row.finishedAt),
    createdAt: isoRequired(row.createdAt),
  };
}

/**
 * Write one ledger row per `(taskKey, runDate)`, updating it in place when the
 * same day's task runs again. The unique constraint is what makes the second
 * run in a day a no-op for the business work; the ledger then records the retry.
 */
async function recordScheduledRun(
  database: DatabaseManager,
  taskKey: string,
  runDate: string,
  outcome: {
    readonly status: 'succeeded' | 'failed';
    readonly summary?: string;
    readonly failureReason?: string;
  },
): Promise<void> {
  const now = new Date();
  const existing = await database
    .query()
    .selectFrom('scheduledRuns')
    .select('id')
    .where('taskKey', '=', taskKey)
    .where('runDate', '=', runDate)
    .executeTakeFirst();
  const values = {
    status: outcome.status,
    summary: outcome.summary ?? null,
    failureReason: outcome.failureReason ?? null,
    finishedAt: now,
  };
  if (existing) {
    await database
      .query()
      .updateTable('scheduledRuns')
      .set(values)
      .where('id', '=', existing.id)
      .execute();
    return;
  }
  await database
    .query()
    .insertInto('scheduledRuns')
    .values({
      id: `run-${randomUUID()}`,
      taskKey,
      runDate,
      createdAt: now,
      ...values,
    })
    .execute();
}

/** What the assistant can be told about the LLM service and vector store in use. */
export interface AssistantSettings {
  readonly model: {
    readonly configured: boolean;
    readonly provider: string | null;
    readonly model: string | null;
  };
  readonly knowledgeBase: {
    readonly configured: boolean;
    readonly vectorDatabase: string | null;
    readonly manifestCount: number;
  };
}

/** One file the File plugin's Repository stored for this application. */
export interface StoredFile {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
}

export interface ServiceDeps {
  readonly database: DatabaseManager;
  readonly clock?: () => Date;
  readonly orderNoPrefix?: string;
  /** Reported by the assistant-status route; omitted, the assistant says it is unconfigured. */
  readonly assistant?: () => Promise<AssistantSettings>;
  /**
   * Stores one uploaded file and creates its `serviceFiles` record.
   *
   * Supplied by the File plugin's Server Repository. Omitted when the plugin is
   * not registered, in which case uploading an attachment answers `UNAVAILABLE`
   * rather than storing bytes nothing can serve later.
   */
  readonly storeFile?: (file: File) => Promise<StoredFile>;
  /** Mount path prefix for stored file URLs, such as `/main`. */
  readonly publicBasePath?: string;
}

export class WorkOrderError extends Error {
  public readonly reason: string;
  public readonly status: number;

  constructor(reason: string, message: string, status = 400) {
    super(message);
    this.name = 'WorkOrderError';
    this.reason = reason;
    this.status = status;
  }
}

export function createService(deps: ServiceDeps) {
  const database = deps.database;
  const clock = deps.clock ?? (() => new Date());
  const orderNoPrefix = deps.orderNoPrefix ?? 'WO';
  // A content URL is fetched by the browser, so it carries the mount path the
  // application is served under; the File plugin's route itself is at the root.
  const basePath = (deps.publicBasePath ?? '').replace(/\/$/, '');

  async function distinctOrderNo(): Promise<string> {
    const stamp = clock().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = randomUUID().slice(0, 6).toUpperCase();
    return `${orderNoPrefix}-${stamp}-${suffix}`;
  }

  /**
   * Refuses an attachment write from a caller who can only see the order
   * through a temporary share.
   *
   * A share is read-only: it opens the order and its files to someone outside
   * the team, never lets them change what the team recorded. Ownership is the
   * same set the `service.orderAttachments` scope names, so this agrees with
   * the grant an engineer set carries while also holding for an installation
   * whose permission set was provisioned before that scope existed.
   */
  async function assertOrderWritable(
    orderId: string,
    context: ServiceContext,
  ): Promise<void> {
    const principalId = context.principalId;
    if (!principalId) return;
    const shared = await sharedOrderIds(database, principalId);
    if (!shared.includes(orderId)) return;
    const owned = await reachableOrderIds(database, principalId, false);
    if (owned.includes(orderId)) return;
    throw new WorkOrderError(
      'WORK_ORDER_NOT_FOUND',
      'Work order not found',
      404,
    );
  }

  async function userNameMap(
    ids: readonly (string | null | undefined)[],
  ): Promise<Map<string, { name: string; email: string | null }>> {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    const map = new Map<string, { name: string; email: string | null }>();
    if (!unique.length) return map;
    const rows = await database
      .query()
      .selectFrom('user')
      .select(['id', 'name', 'email'])
      .where('id', 'in', unique as unknown as readonly string[])
      .execute();
    for (const row of rows) {
      map.set(String(row.id), {
        name: String(row.name ?? row.email ?? row.id),
        email: (row.email as string | null) ?? null,
      });
    }
    return map;
  }

  async function customerMap(
    ids: readonly (string | null)[],
  ): Promise<Map<string, Customer>> {
    const unique = [
      ...new Set(ids.filter((id): id is string => typeof id === 'string')),
    ];
    const map = new Map<string, Customer>();
    if (!unique.length) return map;
    const rows = await database
      .repository<Customer>(COLLECTIONS.customers)
      .findMany({
        filter: (f) => f.or(unique.map((id) => f.string('id').eq(id))),
      });
    for (const row of rows) map.set(row.id, row);
    return map;
  }

  async function deviceMap(
    ids: readonly (string | null)[],
  ): Promise<Map<string, Device>> {
    const unique = [
      ...new Set(ids.filter((id): id is string => typeof id === 'string')),
    ];
    const map = new Map<string, Device>();
    if (!unique.length) return map;
    const rows = await database
      .repository<Device>(COLLECTIONS.devices)
      .findMany({
        filter: (f) => f.or(unique.map((id) => f.string('id').eq(id))),
      });
    for (const row of rows) map.set(row.id, row);
    return map;
  }

  async function groupMap(
    ids: readonly (string | null)[],
  ): Promise<Map<string, ServiceGroup>> {
    const unique = [
      ...new Set(ids.filter((id): id is string => typeof id === 'string')),
    ];
    const map = new Map<string, ServiceGroup>();
    if (!unique.length) return map;
    const rows = await database
      .repository<ServiceGroup>(COLLECTIONS.serviceGroups)
      .findMany({
        filter: (f) => f.or(unique.map((id) => f.string('id').eq(id))),
      });
    for (const row of rows) map.set(row.id, row);
    return map;
  }

  async function openOrderCounts(
    deviceIds: readonly string[],
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (!deviceIds.length) return map;
    const rows = await database
      .repository<WorkOrder>(COLLECTIONS.workOrders)
      .findMany({
        filter: (f) =>
          f.and([
            f.or(deviceIds.map((id) => f.string('deviceId').eq(id))),
            f.string('status').ne('closed'),
          ]),
      });
    for (const row of rows) {
      if (!row.deviceId) continue;
      map.set(row.deviceId, (map.get(row.deviceId) ?? 0) + 1);
    }
    return map;
  }

  async function toWorkOrderViews(
    rows: readonly WorkOrder[],
  ): Promise<WorkOrderView[]> {
    const users = await userNameMap([
      ...rows.map((r) => r.assigneeId),
      ...rows.map((r) => r.createdById),
    ]);
    const customers = await customerMap(rows.map((r) => r.customerId));
    const devices = await deviceMap(rows.map((r) => r.deviceId));
    const groups = await groupMap(rows.map((r) => r.groupId));
    const ids = rows.map((r) => r.id);
    const fileCounts = new Map<string, number>();
    if (ids.length) {
      const files = await database
        .repository<WorkOrderFileRow>(COLLECTIONS.workOrderFiles)
        .findMany({
          filter: (f) => f.or(ids.map((id) => f.string('workOrderId').eq(id))),
        });
      for (const file of files) {
        fileCounts.set(
          file.workOrderId,
          (fileCounts.get(file.workOrderId) ?? 0) + 1,
        );
      }
    }
    return rows.map((row) => ({
      id: row.id,
      orderNo: row.orderNo,
      title: row.title,
      description: row.description,
      status: isWorkOrderStatus(row.status) ? row.status : 'pending_acceptance',
      priority: row.priority === 'urgent' ? 'urgent' : 'normal',
      confidential: Boolean(row.confidential),
      source: row.source === 'external' ? 'external' : 'manual',
      externalEventNo: row.externalEventNo,
      faultCategory: row.faultCategory,
      customerId: row.customerId,
      customerName: row.customerId
        ? (customers.get(row.customerId)?.name ?? null)
        : null,
      deviceId: row.deviceId,
      deviceCode: row.deviceId
        ? (devices.get(row.deviceId)?.code ?? null)
        : null,
      deviceName: row.deviceId
        ? (devices.get(row.deviceId)?.name ?? null)
        : null,
      groupId: row.groupId,
      groupName: row.groupId ? (groups.get(row.groupId)?.name ?? null) : null,
      assigneeId: row.assigneeId,
      assigneeName: row.assigneeId
        ? (users.get(row.assigneeId)?.name ?? null)
        : null,
      createdById: row.createdById,
      createdByName: row.createdById
        ? (users.get(row.createdById)?.name ?? null)
        : null,
      acceptedAt: iso(row.acceptedAt),
      processingAt: iso(row.processingAt),
      submittedAt: iso(row.submittedAt),
      confirmedAt: iso(row.confirmedAt),
      closedAt: iso(row.closedAt),
      closeSummary: row.closeSummary,
      failureReason: row.failureReason,
      reopenCount: Number(row.reopenCount ?? 0),
      overdueSince:
        overdueSince(row.priority, row.status, row.updatedAt) ?? null,
      lastActivityAt: isoRequired(row.updatedAt),
      attachmentCount: fileCounts.get(row.id) ?? 0,
      createdAt: isoRequired(row.createdAt),
      updatedAt: isoRequired(row.updatedAt),
    }));
  }

  async function toExecutionViews(
    rows: readonly WorkOrderExecution[],
  ): Promise<WorkOrderExecutionView[]> {
    const users = await userNameMap(rows.map((r) => r.operatorId));
    return rows.map((row) => ({
      id: row.id,
      workOrderId: row.workOrderId,
      action: row.action,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      operatorId: row.operatorId,
      operatorName: row.operatorId
        ? (users.get(row.operatorId)?.name ?? null)
        : null,
      idempotencyKey: row.idempotencyKey,
      result: row.result,
      failureReason: row.failureReason,
      detail: row.detail,
      attempt: Number(row.attempt ?? 1),
      createdAt: isoRequired(row.createdAt),
    }));
  }

  async function toShareViews(
    rows: readonly WorkOrderShare[],
  ): Promise<WorkOrderShareView[]> {
    const users = await userNameMap([
      ...rows.map((r) => r.sharedWithId),
      ...rows.map((r) => r.sharedById),
    ]);
    const now = clock().getTime();
    return rows.map((row) => {
      const expires = row.expiresAt ? new Date(row.expiresAt).getTime() : null;
      return {
        id: row.id,
        workOrderId: row.workOrderId,
        sharedWithId: row.sharedWithId,
        sharedWithName: users.get(row.sharedWithId)?.name ?? null,
        sharedById: row.sharedById,
        sharedByName: row.sharedById
          ? (users.get(row.sharedById)?.name ?? null)
          : null,
        note: row.note,
        expiresAt: iso(row.expiresAt),
        active: Boolean(row.active) && (expires === null || expires > now),
        readOnly: true as const,
        createdAt: isoRequired(row.createdAt),
      };
    });
  }

  async function toAttachmentViews(
    rows: readonly WorkOrderFileRow[],
  ): Promise<AttachmentView[]> {
    if (!rows.length) return [];
    const fileIds = [...new Set(rows.map((r) => r.fileId))];
    const files = await database
      .query()
      .selectFrom(COLLECTIONS.serviceFiles)
      .select(['id', 'filename', 'ext', 'mimeType', 'size'])
      .where('id', 'in', fileIds)
      .execute();
    const byId = new Map(files.map((file) => [String(file.id), file] as const));
    const users = await userNameMap(rows.map((r) => r.uploadedById));
    return rows.map((row) => {
      const file = byId.get(row.fileId);
      const ext = fileText(file?.ext);
      const contentUrl = `${basePath}/api/workOrders/${
        row.workOrderId
      }/attachments/${row.id}/content`;
      return {
        id: row.id,
        workOrderId: row.workOrderId,
        fileId: row.fileId,
        category: row.category === 'report' ? 'report' : 'photo',
        filename: fileText(file?.filename, row.fileId),
        ext,
        mimeType: fileText(file?.mimeType, 'application/octet-stream'),
        size: Number(file?.size ?? 0),
        uploadedById: row.uploadedById,
        uploadedByName: row.uploadedById
          ? (users.get(row.uploadedById)?.name ?? null)
          : null,
        contentUrl,
        createdAt: isoRequired(row.createdAt),
      };
    });
  }

  async function toCustomerViews(
    rows: readonly Customer[],
  ): Promise<CustomerView[]> {
    const ids = rows.map((r) => r.id);
    const deviceCounts = new Map<string, number>();
    const openCounts = new Map<string, number>();
    if (ids.length) {
      const devices = await database
        .repository<Device>(COLLECTIONS.devices)
        .findMany({
          filter: (f) => f.or(ids.map((id) => f.string('customerId').eq(id))),
        });
      for (const device of devices) {
        deviceCounts.set(
          device.customerId,
          (deviceCounts.get(device.customerId) ?? 0) + 1,
        );
      }
      const orders = await database
        .repository<WorkOrder>(COLLECTIONS.workOrders)
        .findMany({
          filter: (f) =>
            f.and([
              f.or(ids.map((id) => f.string('customerId').eq(id))),
              f.string('status').ne('closed'),
            ]),
        });
      for (const order of orders) {
        if (!order.customerId) continue;
        openCounts.set(
          order.customerId,
          (openCounts.get(order.customerId) ?? 0) + 1,
        );
      }
    }
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      contactName: row.contactName,
      contactPhone: row.contactPhone,
      contactEmail: row.contactEmail,
      address: row.address,
      level: row.level,
      note: row.note,
      deviceCount: deviceCounts.get(row.id) ?? 0,
      openOrderCount: openCounts.get(row.id) ?? 0,
      createdAt: isoRequired(row.createdAt),
      updatedAt: isoRequired(row.updatedAt),
    }));
  }

  async function toDeviceViews(rows: readonly Device[]): Promise<DeviceView[]> {
    const users = await userNameMap(rows.map((r) => r.serviceEngineerId));
    const customers = await customerMap(rows.map((r) => r.customerId));
    const groups = await groupMap(rows.map((r) => r.groupId));
    const counts = await openOrderCounts(rows.map((r) => r.id));
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      model: row.model,
      serialNumber: row.serialNumber,
      customerId: row.customerId,
      customerName: customers.get(row.customerId)?.name ?? null,
      serviceEngineerId: row.serviceEngineerId,
      serviceEngineerName: row.serviceEngineerId
        ? (users.get(row.serviceEngineerId)?.name ?? null)
        : null,
      groupId: row.groupId,
      groupName: row.groupId ? (groups.get(row.groupId)?.name ?? null) : null,
      location: row.location,
      installDate: iso(row.installDate),
      warrantyUntil: iso(row.warrantyUntil),
      nextInspectionDate: iso(row.nextInspectionDate),
      inspectionCycleDays: Number(row.inspectionCycleDays ?? 90),
      enabled: Boolean(row.enabled),
      note: row.note,
      openOrderCount: counts.get(row.id) ?? 0,
      createdAt: isoRequired(row.createdAt),
      updatedAt: isoRequired(row.updatedAt),
    }));
  }

  async function toInspectionViews(
    rows: readonly InspectionTask[],
  ): Promise<InspectionTaskView[]> {
    const devices = await deviceMap(rows.map((r) => r.deviceId));
    const customers = await customerMap(
      rows.map((r) => devices.get(r.deviceId)?.customerId ?? null),
    );
    const users = await userNameMap(rows.map((r) => r.assigneeId));
    return rows.map((row) => {
      const device = devices.get(row.deviceId);
      return {
        id: row.id,
        deviceId: row.deviceId,
        deviceCode: device?.code ?? null,
        deviceName: device?.name ?? null,
        customerName: device
          ? (customers.get(device.customerId)?.name ?? null)
          : null,
        assigneeId: row.assigneeId,
        assigneeName: row.assigneeId
          ? (users.get(row.assigneeId)?.name ?? null)
          : null,
        planDate: isoRequired(row.planDate),
        status:
          row.status === 'completed' || row.status === 'skipped'
            ? row.status
            : 'pending',
        result: row.result,
        remark: row.remark,
        completedAt: iso(row.completedAt),
        createdAt: isoRequired(row.createdAt),
        updatedAt: isoRequired(row.updatedAt),
      };
    });
  }

  const service = {
    // ---------------------------------------------------------------- customers
    async listCustomers(
      query: ListQuery | undefined,
      context: ServiceContext,
    ): Promise<Paged<CustomerView>> {
      const { page, pageSize, offset } = pageBounds(query);
      const where = query?.search
        ? (f: FilterBuilder<Customer>) =>
            f.or([
              f.string('name').includes(query.search!, { mode: 'insensitive' }),
              f.string('code').includes(query.search!, { mode: 'insensitive' }),
              f
                .string('contactName')
                .includes(query.search!, { mode: 'insensitive' }),
            ])
        : undefined;
      const records = repo<Customer>(database, COLLECTIONS.customers, context);
      const [rows, total] = await Promise.all([
        records.findMany({
          filter: where,
          sort: (s) => s.field('createdAt').desc(),
          limit: pageSize,
          offset,
        }),
        records.count({ filter: where }),
      ]);
      return {
        data: await toCustomerViews(rows),
        meta: { page, pageSize, total },
      };
    },

    async listServiceGroups(
      _query: ListQuery | undefined,
      context: ServiceContext,
    ): Promise<Paged<ServiceGroupView>> {
      const rows = await repo<ServiceGroup>(
        database,
        COLLECTIONS.serviceGroups,
        context,
      ).findMany({ sort: (s) => s.field('name').asc() });
      const members = await database
        .repository<ServiceGroupMember>(COLLECTIONS.serviceGroupMembers)
        .findMany({});
      const counts = new Map<string, number>();
      for (const member of members) {
        if (!member.active) continue;
        counts.set(member.groupId, (counts.get(member.groupId) ?? 0) + 1);
      }
      return {
        data: rows.map((row) => ({
          id: row.id,
          name: row.name,
          code: row.code,
          description: row.description ?? null,
          active: Boolean(row.active),
          memberCount: counts.get(row.id) ?? 0,
        })),
        meta: { page: 1, pageSize: rows.length, total: rows.length },
      };
    },

    async getCustomer(
      id: string,
      context: ServiceContext,
    ): Promise<CustomerView | undefined> {
      const row = await repo<Customer>(
        database,
        COLLECTIONS.customers,
        context,
      ).findOne({ filter: { id } });
      if (!row) return undefined;
      const [view] = await toCustomerViews([row]);
      return view;
    },

    async createCustomer(
      values: Partial<Customer>,
      context: ServiceContext,
    ): Promise<CustomerView> {
      const now = nowIso(clock);
      const { record } = await repo<Customer>(
        database,
        COLLECTIONS.customers,
        context,
      ).createOne({
        values: {
          id: newId('cust'),
          level: 'normal',
          ...values,
          createdAt: now,
          updatedAt: now,
        },
      });
      const [view] = await toCustomerViews([record]);
      return view;
    },

    async updateCustomer(
      id: string,
      values: Partial<Customer>,
      context: ServiceContext,
    ): Promise<CustomerView> {
      const { record } = await repo<Customer>(
        database,
        COLLECTIONS.customers,
        context,
      ).updateOne({
        filter: { id },
        values: { ...values, updatedAt: nowIso(clock) },
      });
      const [view] = await toCustomerViews([record]);
      return view;
    },

    // ------------------------------------------------------------------ devices
    async listDevices(
      query: ListQuery | undefined,
      context: ServiceContext,
    ): Promise<Paged<DeviceView>> {
      const { page, pageSize, offset } = pageBounds(query);
      const where = query?.search
        ? (f: FilterBuilder<Device>) =>
            f.or([
              f.string('name').includes(query.search!, { mode: 'insensitive' }),
              f.string('code').includes(query.search!, { mode: 'insensitive' }),
              f
                .string('model')
                .includes(query.search!, { mode: 'insensitive' }),
              f
                .string('serialNumber')
                .includes(query.search!, { mode: 'insensitive' }),
            ])
        : undefined;
      const records = repo<Device>(database, COLLECTIONS.devices, context);
      const [rows, total] = await Promise.all([
        records.findMany({
          filter: where,
          sort: (s) => s.field('createdAt').desc(),
          limit: pageSize,
          offset,
        }),
        records.count({ filter: where }),
      ]);
      return {
        data: await toDeviceViews(rows),
        meta: { page, pageSize, total },
      };
    },

    async getDevice(
      id: string,
      context: ServiceContext,
    ): Promise<DeviceView | undefined> {
      const row = await repo<Device>(
        database,
        COLLECTIONS.devices,
        context,
      ).findOne({ filter: { id } });
      if (!row) return undefined;
      const [view] = await toDeviceViews([row]);
      return view;
    },

    async createDevice(
      values: Partial<Device>,
      context: ServiceContext,
    ): Promise<DeviceView> {
      const now = nowIso(clock);
      const { record } = await repo<Device>(
        database,
        COLLECTIONS.devices,
        context,
      ).createOne({
        values: {
          id: newId('dev'),
          inspectionCycleDays: 90,
          enabled: true,
          ...values,
          createdAt: now,
          updatedAt: now,
        },
      });
      const [view] = await toDeviceViews([record]);
      return view;
    },

    async updateDevice(
      id: string,
      values: Partial<Device>,
      context: ServiceContext,
    ): Promise<DeviceView> {
      const { record } = await repo<Device>(
        database,
        COLLECTIONS.devices,
        context,
      ).updateOne({
        filter: { id },
        values: { ...values, updatedAt: nowIso(clock) },
      });
      const [view] = await toDeviceViews([record]);
      return view;
    },

    // --------------------------------------------------------------- work orders
    async listWorkOrders(
      query: ListQuery | undefined,
      context: ServiceContext,
    ): Promise<Paged<WorkOrderView>> {
      const { page, pageSize, offset } = pageBounds(query);
      const where = (f: FilterBuilder<WorkOrder>) => {
        const items: FilterNode[] = [];
        if (query?.status && isWorkOrderStatus(query.status)) {
          items.push(f.string('status').eq(query.status));
        }
        if (query?.assigneeId) {
          items.push(f.string('assigneeId').eq(query.assigneeId));
        }
        if (query?.groupId) {
          items.push(f.string('groupId').eq(query.groupId));
        }
        if (query?.search) {
          items.push(
            f.or([
              f
                .string('orderNo')
                .includes(query.search, { mode: 'insensitive' }),
              f.string('title').includes(query.search, { mode: 'insensitive' }),
              f
                .string('externalEventNo')
                .includes(query.search, { mode: 'insensitive' }),
            ]),
          );
        }
        if (!items.length) return f.and([]);
        return items.length === 1 ? items[0] : f.and(items);
      };
      const records = repo<WorkOrder>(
        database,
        COLLECTIONS.workOrders,
        context,
      );
      const [rows, total] = await Promise.all([
        records.findMany({
          filter: where,
          sort: (s) => [s.field('createdAt').desc()],
          limit: pageSize,
          offset,
        }),
        records.count({ filter: where }),
      ]);
      return {
        data: await toWorkOrderViews(rows),
        meta: { page, pageSize, total },
      };
    },

    async getWorkOrderDetail(
      id: string,
      context: ServiceContext,
    ): Promise<WorkOrderDetailView | undefined> {
      const row = await repo<WorkOrder>(
        database,
        COLLECTIONS.workOrders,
        context,
      ).findOne({ filter: { id } });
      if (!row) return undefined;
      const [order] = await toWorkOrderViews([row]);
      // A caller who may only read the order — an observer, or an unassigned
      // engineer — sees the summary the order body carries and none of the
      // internal trail: execution remarks, share list and attachments.
      const permitted =
        context.permittedActions ?? stateAllowedActions(order.status);
      const readsOnly = permitted.length === 0;
      const executions = readsOnly
        ? []
        : await database
            .repository<WorkOrderExecution>(COLLECTIONS.workOrderExecutions)
            .findMany({
              filter: { workOrderId: id },
              sort: (s) => [s.field('createdAt').asc()],
            });
      const shares = readsOnly
        ? []
        : await database
            .repository<WorkOrderShare>(COLLECTIONS.workOrderShares)
            .findMany({
              filter: { workOrderId: id },
              sort: (s) => [s.field('createdAt').desc()],
            });
      const files = readsOnly
        ? []
        : await database
            .repository<WorkOrderFileRow>(COLLECTIONS.workOrderFiles)
            .findMany({
              filter: { workOrderId: id },
              sort: (s) => [s.field('createdAt').desc()],
            });
      const allowed = stateAllowedActions(order.status).filter((action) =>
        permitted.includes(action),
      );
      return {
        order,
        allowedActions: allowed,
        executions: await toExecutionViews(executions),
        shares: await toShareViews(shares),
        attachments: await toAttachmentViews(files),
      };
    },

    async createWorkOrder(
      values: Partial<WorkOrder>,
      context: ServiceContext,
    ): Promise<WorkOrderView> {
      const now = nowIso(clock);
      const status = isWorkOrderStatus(String(values.status))
        ? (values.status as WorkOrderStatus)
        : 'pending_acceptance';
      const { record } = await repo<WorkOrder>(
        database,
        COLLECTIONS.workOrders,
        context,
      ).createOne({
        values: {
          id: newId('wo'),
          orderNo: await distinctOrderNo(),
          status,
          priority: 'normal',
          confidential: false,
          source: 'manual',
          createdById: context.principalId ?? null,
          // `reopenCount` is not in the create field allowlist; the column's own
          // default (0) applies.
          ...values,
          createdAt: now,
          updatedAt: now,
        } as Partial<WorkOrder>,
      });
      await database
        .repository<WorkOrderExecution>(COLLECTIONS.workOrderExecutions)
        .createOne({
          values: {
            id: newId('exec'),
            workOrderId: record.id,
            action: 'create',
            fromStatus: null,
            toStatus: record.status,
            operatorId: context.principalId ?? null,
            result: 'succeeded',
            attempt: 1,
            createdAt: now,
          } as Partial<WorkOrderExecution>,
        });
      const [view] = await toWorkOrderViews([record]);
      return view;
    },

    /**
     * Apply one lifecycle action. The whole read-check-write runs in a single
     * transaction and is guarded by the execution log's unique idempotency key,
     * so a retried request produces no second transition.
     */
    async transitionWorkOrder(
      id: string,
      action: WorkOrderAction,
      input:
        | {
            readonly idempotencyKey?: string | null;
            readonly closeSummary?: string | null;
            readonly failureReason?: string | null;
            readonly remark?: string | null;
            readonly assigneeId?: string | null;
          }
        | undefined,
      context: ServiceContext,
    ): Promise<WorkOrderDetailView> {
      const idempotencyKey = input?.idempotencyKey ?? null;
      if (idempotencyKey) {
        // The key identifies one attempt at one order, so it is scoped to the
        // order: a client that reuses a key elsewhere must not be answered with
        // another order's detail.
        const existing = await database
          .repository<WorkOrderExecution>(COLLECTIONS.workOrderExecutions)
          .findOne({ filter: { idempotencyKey, workOrderId: id } });
        if (existing) {
          const detail = await service.getWorkOrderDetail(
            existing.workOrderId,
            context,
          );
          if (detail) return detail;
        }
      }

      // A temporary share is read-only, so a recipient may open the order but
      // never move it through its lifecycle. This runs before the transaction:
      // the guard reads through the plain `database`, and a second connection
      // requested while the transaction holds the pool's only one deadlocks.
      await assertOrderWritable(id, context);

      await database.transaction(async (connection) => {
        const base = connection.repository<WorkOrder>(COLLECTIONS.workOrders);
        const policy = context.policies?.[COLLECTIONS.workOrders];
        const records = policy
          ? base.withPolicy(policy as never)
          : (base as unknown as RepositoryOperations<WorkOrder>);
        const current = await records.findOne({ filter: { id } });
        if (!current) {
          throw new WorkOrderError(
            'WORK_ORDER_NOT_FOUND',
            'Work order not found',
            404,
          );
        }
        const status = isWorkOrderStatus(current.status)
          ? current.status
          : 'pending_acceptance';
        const verdict = validateTransition(status, action, {
          closeSummary: input?.closeSummary,
          failureReason: input?.failureReason,
          remark: input?.remark,
        });
        if (!verdict.ok) {
          throw new WorkOrderError(
            verdict.reason.code,
            verdict.reason.code,
            400,
          );
        }
        const now = nowIso(clock);
        const patch: Partial<WorkOrder> = {
          status: verdict.to,
          updatedAt: now,
        };
        if (action === 'accept') {
          patch.acceptedAt = now;
          patch.assigneeId =
            input?.assigneeId ??
            current.assigneeId ??
            context.principalId ??
            null;
        }
        if (action === 'start') patch.processingAt = now;
        if (action === 'submit') patch.submittedAt = now;
        if (action === 'confirm') patch.confirmedAt = now;
        if (action === 'close') {
          patch.closedAt = now;
          patch.closeSummary = input?.closeSummary ?? null;
        }
        if (action === 'reject')
          patch.failureReason = input?.failureReason ?? null;
        if (action === 'reopen') {
          patch.reopenCount = Number(current.reopenCount ?? 0) + 1;
          patch.closedAt = null;
          patch.confirmedAt = null;
        }
        await records.updateOne({ filter: { id }, values: patch });
        await connection
          .repository<WorkOrderExecution>(COLLECTIONS.workOrderExecutions)
          .createOne({
            values: {
              id: newId('exec'),
              workOrderId: id,
              action,
              fromStatus: status,
              toStatus: verdict.to,
              operatorId: context.principalId ?? null,
              idempotencyKey,
              result: 'succeeded',
              failureReason: input?.failureReason ?? null,
              detail: input?.remark ?? null,
              attempt: 1,
              createdAt: now,
            } as Partial<WorkOrderExecution>,
          });
      });

      const detail = await service.getWorkOrderDetail(id, context);
      if (!detail) {
        throw new WorkOrderError(
          'WORK_ORDER_NOT_FOUND',
          'Work order not found',
          404,
        );
      }
      return detail;
    },

    // ------------------------------------------------------------------- shares
    async createShare(
      orderId: string,
      input: {
        readonly sharedWithId: string;
        readonly note?: string | null;
        readonly expiresAt?: string | null;
      },
      context: ServiceContext,
    ): Promise<WorkOrderShareView> {
      const now = nowIso(clock);
      // The grant that permits sharing names the orders it applies to, so the
      // order is read through the caller's policy: an order outside it is 404.
      const order = await repo<WorkOrder>(
        database,
        COLLECTIONS.workOrders,
        context,
      ).findOne({ filter: { id: orderId } });
      if (!order) {
        throw new WorkOrderError(
          'WORK_ORDER_NOT_FOUND',
          'Work order not found',
          404,
        );
      }
      // A confidential order is handled by its supervisor and assignee only.
      // Temporary collaboration is not a second door into it.
      if (order.confidential) {
        throw new WorkOrderError(
          'CONFIDENTIAL_ORDER_NOT_SHAREABLE',
          'A confidential work order cannot be shared',
          400,
        );
      }
      const shares = repo<WorkOrderShare>(
        database,
        COLLECTIONS.workOrderShares,
        context,
      );
      const existing = await shares.findOne({
        filter: { workOrderId: orderId, sharedWithId: input.sharedWithId },
      });
      let row: WorkOrderShare;
      if (existing) {
        // Reviving a share the caller previously revoked may not touch
        // `sharedById` or `sharedWithId`: the share write grant allows only
        // `active`, `expiresAt`, `note` and `updatedAt` on update, and a value
        // outside that list is refused with `FIELD_WRITE_FORBIDDEN`. The
        // original sharer stays on the row, which is what it recorded.
        const { record } = await shares.updateOne({
          filter: { id: existing.id },
          values: {
            active: true,
            note: input.note ?? null,
            expiresAt: input.expiresAt ?? null,
            updatedAt: now,
          } as Partial<WorkOrderShare>,
        });
        row = record;
      } else {
        const { record } = await shares.createOne({
          values: {
            id: newId('share'),
            workOrderId: orderId,
            sharedWithId: input.sharedWithId,
            sharedById: context.principalId ?? null,
            note: input.note ?? null,
            expiresAt: input.expiresAt ?? null,
            active: true,
            createdAt: now,
            updatedAt: now,
          } as Partial<WorkOrderShare>,
        });
        row = record;
      }
      const [view] = await toShareViews([row]);
      return view;
    },

    async revokeShare(
      orderId: string,
      shareId: string,
      context: ServiceContext,
    ): Promise<void> {
      const order = await repo<WorkOrder>(
        database,
        COLLECTIONS.workOrders,
        context,
      ).findOne({ filter: { id: orderId } });
      if (!order) {
        throw new WorkOrderError(
          'WORK_ORDER_NOT_FOUND',
          'Work order not found',
          404,
        );
      }
      await repo<WorkOrderShare>(
        database,
        COLLECTIONS.workOrderShares,
        context,
      ).updateOne({
        filter: { id: shareId, workOrderId: orderId },
        values: {
          active: false,
          updatedAt: nowIso(clock),
        } as Partial<WorkOrderShare>,
      });
    },

    async listShareTargets(search?: string): Promise<ShareTargetView[]> {
      const query = database
        .query()
        .selectFrom('user')
        .select(['id', 'name', 'email', 'disabled_at'])
        .limit(50);
      const rows = search
        ? await query
            .where((eb) =>
              eb.or([
                eb('name', 'like', `%${search}%`),
                eb('email', 'like', `%${search}%`),
              ]),
            )
            .execute()
        : await query.execute();
      return rows.map((row) => ({
        id: String(row.id),
        name: String(row.name ?? row.email ?? row.id),
        email: (row.email as string | null) ?? null,
        disabled: Boolean(row.disabled_at),
      }));
    },

    // -------------------------------------------------------------- attachments
    async addAttachment(
      orderId: string,
      input: { readonly fileId: string; readonly category: 'photo' | 'report' },
      context: ServiceContext,
    ): Promise<AttachmentView> {
      // The order is read through the caller's work-order policy first, so an
      // attachment can only be added to an order the caller may see at all.
      const order = await repo<WorkOrder>(
        database,
        COLLECTIONS.workOrders,
        context,
      ).findOne({ filter: { id: orderId } });
      if (!order) {
        throw new WorkOrderError(
          'WORK_ORDER_NOT_FOUND',
          'Work order not found',
          404,
        );
      }
      await assertOrderWritable(orderId, context);
      const files = repo<WorkOrderFileRow>(
        database,
        COLLECTIONS.workOrderFiles,
        context,
      );
      const existing = await files.findOne({
        filter: { workOrderId: orderId, fileId: input.fileId },
      });
      if (existing) {
        const [view] = await toAttachmentViews([existing]);
        return view;
      }
      const { record } = await files.createOne({
        values: {
          id: newId('wof'),
          workOrderId: orderId,
          fileId: input.fileId,
          category: input.category,
          uploadedById: context.principalId ?? null,
          createdAt: nowIso(clock),
        } as Partial<WorkOrderFileRow>,
      });
      const [view] = await toAttachmentViews([record]);
      return view;
    },

    async removeAttachment(
      orderId: string,
      attachmentId: string,
      context: ServiceContext,
    ): Promise<void> {
      await assertOrderWritable(orderId, context);
      await repo<WorkOrderFileRow>(
        database,
        COLLECTIONS.workOrderFiles,
        context,
      ).deleteOne({ filter: { id: attachmentId, workOrderId: orderId } });
    },

    /**
     * Resolves one attachment to the storage its bytes live in, but only for a
     * caller who may read the order it belongs to.
     *
     * The File plugin's own content route is deliberately not used: it serves
     * anyone holding the file UUID and is unaffected by any policy. Reading the
     * order through the caller's work-order policy first is what makes the
     * attachment URL an authorization check rather than a secret. A file whose
     * link was copied to someone outside the order therefore fails here.
     */
    async getAttachmentStorage(
      orderId: string,
      attachmentId: string,
      context: ServiceContext,
    ): Promise<AttachmentStorage> {
      const order = await repo<WorkOrder>(
        database,
        COLLECTIONS.workOrders,
        context,
      ).findOne({ filter: { id: orderId } });
      if (!order) {
        throw new WorkOrderError(
          'WORK_ORDER_NOT_FOUND',
          'Work order not found',
          404,
        );
      }
      const row = await repo<WorkOrderFileRow>(
        database,
        COLLECTIONS.workOrderFiles,
        context,
      ).findOne({ filter: { id: attachmentId, workOrderId: orderId } });
      if (!row) {
        throw new WorkOrderError(
          'ATTACHMENT_NOT_FOUND',
          'Attachment not found',
          404,
        );
      }
      const file = await database
        .query()
        .selectFrom(COLLECTIONS.serviceFiles)
        .select(['id', 'disk', 'key', 'filename', 'ext', 'mimeType', 'size'])
        .where('id', '=', row.fileId)
        .executeTakeFirst();
      if (!file) {
        throw new WorkOrderError(
          'ATTACHMENT_NOT_FOUND',
          'Attachment not found',
          404,
        );
      }
      return {
        id: row.id,
        workOrderId: row.workOrderId,
        filename: fileText(file.filename, row.fileId),
        ext: fileText(file.ext),
        mimeType: fileText(file.mimeType, 'application/octet-stream'),
        size: Number(file.size ?? 0),
        disk: fileText(file.disk),
        key: fileText(file.key),
      };
    },

    /**
     * Stores an uploaded file and links it to one work order.
     *
     * The bytes are written by the File plugin's Repository, so the record it
     * creates is what the file plugin's own content route serves. The caller's
     * permission over the order is checked first, through the same policy the
     * link write uses, so a file is never stored for an order the caller cannot
     * see.
     */
    async uploadAttachment(
      orderId: string,
      file: File,
      category: 'photo' | 'report',
      context: ServiceContext,
    ): Promise<AttachmentView> {
      if (!deps.storeFile) {
        throw new WorkOrderError(
          'FILE_STORAGE_UNAVAILABLE',
          'File storage is not available',
          503,
        );
      }
      const ext = (file.name.split('.').pop() ?? '').toLowerCase();
      if (!ATTACHMENT_EXTENSIONS[category].includes(ext)) {
        throw new WorkOrderError(
          'INVALID_FILE_TYPE',
          `A ${category} must be one of: ${ATTACHMENT_EXTENSIONS[category]
            .map((item) => `.${item}`)
            .join(', ')}`,
          400,
        );
      }
      await assertAttachmentContent(file, category);
      const stored = await deps.storeFile(file);
      return service.addAttachment(
        orderId,
        { fileId: stored.id, category },
        context,
      );
    },

    // -------------------------------------------------------------- repair notes
    async listRepairNotes(
      query: ListQuery | undefined,
      context: ServiceContext,
    ): Promise<Paged<RepairNoteView>> {
      const { page, pageSize, offset } = pageBounds(query);
      const where = (f: FilterBuilder<RepairNote>) => {
        const items: FilterNode[] = [];
        if (query?.status) items.push(f.string('status').eq(query.status));
        if (query?.search) {
          items.push(
            f.or([
              f.string('title').includes(query.search, { mode: 'insensitive' }),
              f.string('body').includes(query.search, { mode: 'insensitive' }),
              f
                .string('deviceModel')
                .includes(query.search, { mode: 'insensitive' }),
            ]),
          );
        }
        if (!items.length) return f.and([]);
        return items.length === 1 ? items[0] : f.and(items);
      };
      const records = repo<RepairNote>(
        database,
        COLLECTIONS.repairNotes,
        context,
      );
      const [rows, total] = await Promise.all([
        records.findMany({
          filter: where,
          sort: (s) => [s.field('createdAt').desc()],
          limit: pageSize,
          offset,
        }),
        records.count({ filter: where }),
      ]);
      const users = await userNameMap(rows.map((r) => r.authorId));
      return {
        data: rows.map((row) => ({
          id: row.id,
          title: row.title,
          body: row.body,
          deviceModel: row.deviceModel,
          faultCategory: row.faultCategory,
          authorId: row.authorId,
          authorName: row.authorId
            ? (users.get(row.authorId)?.name ?? null)
            : null,
          status: row.status === 'published' ? 'published' : 'draft',
          publishedAt: iso(row.publishedAt),
          createdAt: isoRequired(row.createdAt),
          updatedAt: isoRequired(row.updatedAt),
        })),
        meta: { page, pageSize, total },
      };
    },

    async createRepairNote(
      values: Partial<RepairNote>,
      context: ServiceContext,
    ): Promise<RepairNoteView> {
      const now = nowIso(clock);
      const published = values.status === 'published';
      const { record } = await repo<RepairNote>(
        database,
        COLLECTIONS.repairNotes,
        context,
      ).createOne({
        values: {
          id: newId('note'),
          status: 'draft',
          authorId: context.principalId ?? null,
          ...values,
          publishedAt: published ? now : null,
          createdAt: now,
          updatedAt: now,
        } as Partial<RepairNote>,
      });
      const users = await userNameMap([record.authorId]);
      return {
        id: record.id,
        title: record.title,
        body: record.body,
        deviceModel: record.deviceModel,
        faultCategory: record.faultCategory,
        authorId: record.authorId,
        authorName: record.authorId
          ? (users.get(record.authorId)?.name ?? null)
          : null,
        status: record.status === 'published' ? 'published' : 'draft',
        publishedAt: iso(record.publishedAt),
        createdAt: isoRequired(record.createdAt),
        updatedAt: isoRequired(record.updatedAt),
      };
    },

    async publishRepairNote(
      id: string,
      context: ServiceContext,
    ): Promise<RepairNoteView> {
      const now = nowIso(clock);
      const { record } = await repo<RepairNote>(
        database,
        COLLECTIONS.repairNotes,
        context,
      ).updateOne({
        filter: { id },
        values: {
          status: 'published',
          publishedAt: now,
          updatedAt: now,
        } as Partial<RepairNote>,
      });
      const users = await userNameMap([record.authorId]);
      return {
        id: record.id,
        title: record.title,
        body: record.body,
        deviceModel: record.deviceModel,
        faultCategory: record.faultCategory,
        authorId: record.authorId,
        authorName: record.authorId
          ? (users.get(record.authorId)?.name ?? null)
          : null,
        status: 'published',
        publishedAt: iso(record.publishedAt),
        createdAt: isoRequired(record.createdAt),
        updatedAt: isoRequired(record.updatedAt),
      };
    },

    // ------------------------------------------------------------------ manuals
    async listManuals(
      query: ListQuery | undefined,
      context: ServiceContext,
    ): Promise<Paged<ManualView>> {
      const { page, pageSize, offset } = pageBounds(query);
      const where = query?.search
        ? (f: FilterBuilder<DeviceManual>) =>
            f.or([
              f
                .string('title')
                .includes(query.search!, { mode: 'insensitive' }),
              f
                .string('modelName')
                .includes(query.search!, { mode: 'insensitive' }),
              f
                .string('docNo')
                .includes(query.search!, { mode: 'insensitive' }),
            ])
        : undefined;
      const records = repo<DeviceManual>(
        database,
        COLLECTIONS.deviceManuals,
        context,
      );
      const [rows, total] = await Promise.all([
        records.findMany({
          filter: where,
          sort: (s) => [s.field('createdAt').desc()],
          limit: pageSize,
          offset,
        }),
        records.count({ filter: where }),
      ]);
      return {
        data: rows.map((row) => ({
          id: row.id,
          title: row.title,
          modelName: row.modelName,
          version: row.version,
          docNo: row.docNo,
          summary: row.summary,
          fileName: row.fileName,
          status:
            row.status === 'published' ||
            row.status === 'indexed' ||
            row.status === 'failed'
              ? row.status
              : 'draft',
          indexMessage: row.indexMessage,
          publishedAt: iso(row.publishedAt),
          createdAt: isoRequired(row.createdAt),
          updatedAt: isoRequired(row.updatedAt),
        })),
        meta: { page, pageSize, total },
      };
    },

    async createManual(
      values: Partial<DeviceManual>,
      context: ServiceContext,
    ): Promise<ManualView> {
      const now = nowIso(clock);
      const { record } = await repo<DeviceManual>(
        database,
        COLLECTIONS.deviceManuals,
        context,
      ).createOne({
        values: {
          id: newId('manual'),
          status: 'draft',
          ...values,
          createdAt: now,
          updatedAt: now,
        } as Partial<DeviceManual>,
      });
      return {
        id: record.id,
        title: record.title,
        modelName: record.modelName,
        version: record.version,
        docNo: record.docNo,
        summary: record.summary,
        fileName: record.fileName,
        status: 'draft',
        indexMessage: record.indexMessage,
        publishedAt: iso(record.publishedAt),
        createdAt: isoRequired(record.createdAt),
        updatedAt: isoRequired(record.updatedAt),
      };
    },

    async publishManual(
      id: string,
      context: ServiceContext,
    ): Promise<ManualView> {
      const now = nowIso(clock);
      const { record } = await repo<DeviceManual>(
        database,
        COLLECTIONS.deviceManuals,
        context,
      ).updateOne({
        filter: { id },
        values: {
          status: 'published',
          publishedAt: now,
          updatedAt: now,
        } as Partial<DeviceManual>,
      });
      return {
        id: record.id,
        title: record.title,
        modelName: record.modelName,
        version: record.version,
        docNo: record.docNo,
        summary: record.summary,
        fileName: record.fileName,
        status: 'published',
        indexMessage: record.indexMessage,
        publishedAt: iso(record.publishedAt),
        createdAt: isoRequired(record.createdAt),
        updatedAt: isoRequired(record.updatedAt),
      };
    },

    // -------------------------------------------------------------- inspections
    async listInspectionTasks(
      query: ListQuery | undefined,
      context: ServiceContext,
    ): Promise<Paged<InspectionTaskView>> {
      const { page, pageSize, offset } = pageBounds(query);
      const where = (f: FilterBuilder<InspectionTask>) => {
        const items: FilterNode[] = [];
        if (query?.status) items.push(f.string('status').eq(query.status));
        if (!items.length) return f.and([]);
        return items.length === 1 ? items[0] : f.and(items);
      };
      const records = repo<InspectionTask>(
        database,
        COLLECTIONS.inspectionTasks,
        context,
      );
      const [rows, total] = await Promise.all([
        records.findMany({
          filter: where,
          sort: (s) => [s.field('planDate').asc()],
          limit: pageSize,
          offset,
        }),
        records.count({ filter: where }),
      ]);
      return {
        data: await toInspectionViews(rows),
        meta: { page, pageSize, total },
      };
    },

    async completeInspection(
      id: string,
      input: {
        readonly result: 'normal' | 'abnormal';
        readonly remark?: string | null;
      },
      context: ServiceContext,
    ): Promise<InspectionTaskView> {
      const now = nowIso(clock);
      const { record } = await repo<InspectionTask>(
        database,
        COLLECTIONS.inspectionTasks,
        context,
      ).updateOne({
        filter: { id },
        values: {
          status: 'completed',
          result: input.result,
          remark: input.remark ?? null,
          completedAt: now,
          updatedAt: now,
        } as Partial<InspectionTask>,
      });
      const [view] = await toInspectionViews([record]);
      return view;
    },

    // ----------------------------------------------------------------- overview
    async overview(
      query: OverviewQuery | undefined,
      context: ServiceContext,
    ): Promise<OverviewView> {
      const orders = repo<WorkOrder>(database, COLLECTIONS.workOrders, context);
      const inspections = repo<InspectionTask>(
        database,
        COLLECTIONS.inspectionTasks,
        context,
      );
      const recentLimit = Math.min(20, Math.max(1, query?.recentLimit ?? 8));
      const today = dayString(clock);

      const allOpen = await orders.findMany({
        filter: (f) => f.string('status').ne('closed'),
        sort: (s) => [s.field('updatedAt').desc()],
      });
      const recentRows = await orders.findMany({
        sort: (s) => [s.field('createdAt').desc()],
        limit: recentLimit,
      });
      const todayRows = await inspections.findMany({
        filter: (f) => f.date('planDate').on(today),
        sort: (s) => [s.field('planDate').asc()],
        limit: recentLimit,
      });
      const pendingInspections = await inspections.count({
        filter: (f) => f.string('status').eq('pending'),
      });
      const devices = await repo<Device>(
        database,
        COLLECTIONS.devices,
        context,
      ).count();
      const customers = await repo<Customer>(
        database,
        COLLECTIONS.customers,
        context,
      ).count();
      const publishedNotes = await repo<RepairNote>(
        database,
        COLLECTIONS.repairNotes,
        context,
      ).count({ filter: (f) => f.string('status').eq('published') });

      const byStatus = new Map<string, number>();
      const groupCounts = new Map<string, { groupId: string; openOrders: number }>();
      let pendingAcceptance = 0;
      let pendingConfirmation = 0;
      let overdue = 0;
      let urgentOpen = 0;
      for (const row of allOpen) {
        byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + 1);
        if (row.groupId) {
          const current = groupCounts.get(row.groupId);
          if (current) current.openOrders += 1;
          else groupCounts.set(row.groupId, { groupId: row.groupId, openOrders: 1 });
        }
        if (row.status === 'pending_acceptance') pendingAcceptance += 1;
        if (row.status === 'pending_confirmation') pendingConfirmation += 1;
        if (overdueSince(row.priority, row.status, row.updatedAt)) overdue += 1;
        if (row.priority === 'urgent') urgentOpen += 1;
      }
      const groups = await groupMap([...groupCounts.keys()]);

      return {
        totals: {
          openOrders: allOpen.length,
          pendingAcceptance,
          pendingConfirmation,
          overdueOrders: overdue,
          urgentOpenOrders: urgentOpen,
          todayInspections: todayRows.length,
          pendingInspections,
          devices,
          customers,
          publishedNotes,
        },
        byStatus: [
          'pending_acceptance',
          'pending_processing',
          'processing',
          'pending_confirmation',
          'closed',
        ].map((status) => ({
          status: status as WorkOrderStatus,
          count: byStatus.get(status) ?? 0,
        })),
        groupWorkload: [...groupCounts.values()].map((entry) => ({
          groupId: entry.groupId,
          groupName: groups.get(entry.groupId)?.name ?? null,
          openOrders: entry.openOrders,
        })),
        urgentQueue: await toWorkOrderViews(
          allOpen
            .filter((row) => row.priority === 'urgent')
            .slice(0, recentLimit),
        ),
        recentOrders: await toWorkOrderViews(recentRows),
        myTodayInspections: await toInspectionViews(
          todayRows.filter(
            (row) =>
              !context.principalId || row.assigneeId === context.principalId,
          ),
        ),
      };
    },

    // --------------------------------------------------------- external platform
    async submitExternalTicket(input: {
      readonly externalEventNo: string;
      readonly title: string;
      readonly description?: string | null;
      readonly priority?: string;
      readonly faultCategory?: string | null;
      readonly deviceCode?: string | null;
      readonly customerCode?: string | null;
    }): Promise<ExternalTicketAcceptedView> {
      const existing = await database
        .repository<WorkOrder>(COLLECTIONS.workOrders)
        .findOne({ filter: { externalEventNo: input.externalEventNo } });
      if (existing) {
        return {
          workOrderId: existing.id,
          orderNo: existing.orderNo,
          externalEventNo: existing.externalEventNo,
          status: isWorkOrderStatus(existing.status)
            ? existing.status
            : 'pending_acceptance',
          priority: existing.priority === 'urgent' ? 'urgent' : 'normal',
          created: false,
        };
      }
      const device = input.deviceCode
        ? await database
            .repository<Device>(COLLECTIONS.devices)
            .findOne({ filter: { code: input.deviceCode } })
        : undefined;
      const customer = input.customerCode
        ? await database
            .repository<Customer>(COLLECTIONS.customers)
            .findOne({ filter: { code: input.customerCode } })
        : undefined;
      const now = nowIso(clock);
      const priority = input.priority === 'urgent' ? 'urgent' : 'normal';
      const { record } = await database
        .repository<WorkOrder>(COLLECTIONS.workOrders)
        .createOne({
          values: {
            id: newId('wo'),
            orderNo: await distinctOrderNo(),
            title: input.title,
            description: input.description ?? null,
            status: 'pending_acceptance',
            priority,
            confidential: false,
            source: 'external',
            externalEventNo: input.externalEventNo,
            faultCategory: input.faultCategory ?? null,
            customerId: customer?.id ?? device?.customerId ?? null,
            deviceId: device?.id ?? null,
            groupId: device?.groupId ?? null,
            createdById: null,
            reopenCount: 0,
            createdAt: now,
            updatedAt: now,
          } as Partial<WorkOrder>,
        });
      await database
        .repository<WorkOrderExecution>(COLLECTIONS.workOrderExecutions)
        .createOne({
          values: {
            id: newId('exec'),
            workOrderId: record.id,
            action: 'create',
            fromStatus: null,
            toStatus: record.status,
            operatorId: null,
            result: 'succeeded',
            detail: 'external',
            attempt: 1,
            createdAt: now,
          } as Partial<WorkOrderExecution>,
        });
      return {
        workOrderId: record.id,
        orderNo: record.orderNo,
        externalEventNo: record.externalEventNo,
        status: 'pending_acceptance',
        priority,
        created: true,
      };
    },

    async getExternalTicket(
      externalEventNo: string,
    ): Promise<ExternalTicketView | undefined> {
      const row = await database
        .repository<WorkOrder>(COLLECTIONS.workOrders)
        .findOne({ filter: { externalEventNo } });
      if (!row) return undefined;
      const users = await userNameMap([row.assigneeId]);
      const status = isWorkOrderStatus(row.status)
        ? row.status
        : 'pending_acceptance';
      return {
        orderNo: row.orderNo,
        externalEventNo: row.externalEventNo,
        status,
        priority: row.priority === 'urgent' ? 'urgent' : 'normal',
        accepted: status !== 'pending_acceptance',
        closed: status === 'closed',
        assigneeName: row.assigneeId
          ? (users.get(row.assigneeId)?.name ?? null)
          : null,
        createdAt: isoRequired(row.createdAt),
        updatedAt: isoRequired(row.updatedAt),
      };
    },

    // ------------------------------------------------------------------- tasks
    /**
     * Create one inspection task per device whose plan date has arrived.
     * Idempotent: the `(deviceId, planDate)` unique key makes a second run a
     * no-op.
     */
    async runDailyInspections(date?: string): Promise<{
      readonly created: number;
      readonly date: string;
    }> {
      const planDate = date ?? dayString(clock);
      const devices = await database
        .repository<Device>(COLLECTIONS.devices)
        .findMany({ filter: (f) => f.boolean('enabled').isTrue() });
      const existing = await database
        .repository<InspectionTask>(COLLECTIONS.inspectionTasks)
        .findMany({ filter: (f) => f.date('planDate').on(planDate) });
      const covered = new Set(existing.map((row) => row.deviceId));
      let created = 0;
      for (const device of devices) {
        if (covered.has(device.id)) continue;
        if (
          device.nextInspectionDate &&
          String(device.nextInspectionDate).slice(0, 10) > planDate
        ) {
          continue;
        }
        await database
          .repository<InspectionTask>(COLLECTIONS.inspectionTasks)
          .createOne({
            values: {
              id: newId('insp'),
              deviceId: device.id,
              assigneeId: device.serviceEngineerId,
              planDate,
              status: 'pending',
              createdAt: nowIso(clock),
              updatedAt: nowIso(clock),
            } as Partial<InspectionTask>,
          });
        created += 1;
      }
      return { created, date: planDate };
    },

    /**
     * Find every open overdue order and record one reminder per order per day.
     * Idempotent through the `(workOrderId, sentDate)` unique key.
     */
    async runOverdueReminders(date?: string): Promise<{
      readonly reminded: number;
      readonly date: string;
    }> {
      const sentDate = date ?? dayString(clock);
      const orders = await database
        .repository<WorkOrder>(COLLECTIONS.workOrders)
        .findMany({ filter: (f) => f.string('status').ne('closed') });
      const warned = orders.filter((row) =>
        overdueSince(row.priority, row.status, row.updatedAt),
      );
      let reminded = 0;
      for (const order of warned) {
        const existing = await database
          .query()
          .selectFrom('overdueReminders')
          .select('id')
          .where('workOrderId', '=', order.id)
          .where('sentDate', '=', sentDate)
          .executeTakeFirst();
        if (existing) continue;
        await database
          .query()
          .insertInto('overdueReminders')
          .values({
            id: newId('rem'),
            workOrderId: order.id,
            recipientId: order.assigneeId ?? order.createdById ?? null,
            sentDate,
            channel: 'inbox',
            createdAt: new Date(clock()),
          })
          .execute();
        reminded += 1;
      }
      return { reminded, date: sentDate };
    },

    /** Counts used by the scheduler run ledger. */
    async scheduledTaskSummary(): Promise<{
      readonly pendingInspections: number;
      readonly overdueOrders: number;
    }> {
      const pendingInspections = await database
        .repository<InspectionTask>(COLLECTIONS.inspectionTasks)
        .count({ filter: (f) => f.string('status').eq('pending') });
      const open = await database
        .repository<WorkOrder>(COLLECTIONS.workOrders)
        .findMany({ filter: (f) => f.string('status').ne('closed') });
      const overdueOrders = open.filter((row) =>
        overdueSince(row.priority, row.status, row.updatedAt),
      ).length;
      return { pendingInspections, overdueOrders };
    },

    /**
     * The scheduled tasks this application registers, each with its most recent
     * ledger row, so the operations page can show whether a task has actually run.
     */
    async listTaskDefinitions(): Promise<TaskListView> {
      const runs = await database
        .repository<ScheduledRun>(COLLECTIONS.scheduledRuns)
        .findMany({ sort: (s) => s.field('createdAt').desc() });
      const latest = new Map<string, ScheduledRun>();
      for (const run of runs) {
        if (!latest.has(run.taskKey)) latest.set(run.taskKey, run);
      }
      return {
        tasks: TASK_DEFINITIONS.map((definition) => ({
          key: definition.key,
          titleKey: definition.titleKey,
          descriptionKey: definition.descriptionKey,
          scheduleKey: definition.scheduleKey,
          targetType: definition.targetType,
          cron: definition.cron,
          timezone: definition.timezone,
          lastRun: toScheduledRunView(latest.get(definition.key)),
        })),
      };
    },
    /** The scheduled-run ledger, most recent first. */
    async listScheduledRuns(
      query: ListQuery | undefined,
      context: ServiceContext,
    ): Promise<Paged<ScheduledRunView>> {
      const { page, pageSize, offset } = pageBounds(query);
      const where = query?.status ? { taskKey: query.status } : undefined;
      const records = repo<ScheduledRun>(
        database,
        COLLECTIONS.scheduledRuns,
        context,
      );
      const [rows, total] = await Promise.all([
        records.findMany({
          filter: where,
          sort: (s) => s.field('createdAt').desc(),
          limit: pageSize,
          offset,
        }),
        records.count({ filter: where }),
      ]);
      return {
        data: rows.map((row) => toScheduledRunView(row)!),
        meta: { page, pageSize, total },
      };
    },

    /** The overdue-reminder ledger, which is also the proof a reminder went out once. */
    async listOverdueReminders(
      query: ListQuery | undefined,
      context: ServiceContext,
    ): Promise<Paged<OverdueReminderView>> {
      const { page, pageSize, offset } = pageBounds(query);
      const records = repo<OverdueReminder>(
        database,
        COLLECTIONS.overdueReminders,
        context,
      );
      const [rows, total] = await Promise.all([
        records.findMany({
          sort: (s) => s.field('createdAt').desc(),
          limit: pageSize,
          offset,
        }),
        records.count(),
      ]);
      const orderIds = [...new Set(rows.map((row) => row.workOrderId))];
      const orders = orderIds.length
        ? await database
            .repository<WorkOrder>(COLLECTIONS.workOrders)
            .findMany({
              filter: (f) =>
                f.or(orderIds.map((orderId) => f.string('id').eq(orderId))),
            })
        : [];
      const ordersById = new Map(orders.map((order) => [order.id, order]));
      const users = await userNameMap(rows.map((row) => row.recipientId));
      return {
        data: rows.map((row) => {
          const order = ordersById.get(row.workOrderId);
          const recipient = row.recipientId ? users.get(row.recipientId) : null;
          return {
            id: row.id,
            workOrderId: row.workOrderId,
            orderNo: order?.orderNo ?? null,
            orderTitle: order?.title ?? null,
            recipientId: row.recipientId,
            recipientName: recipient?.name ?? null,
            sentDate: String(row.sentDate).slice(0, 10),
            channel: row.channel,
            createdAt: isoRequired(row.createdAt),
          };
        }),
        meta: { page, pageSize, total },
      };
    },

    /**
     * Run one of this application's scheduled tasks by hand.
     *
     * The work itself is idempotent per calendar day, so running a task twice
     * never duplicates an inspection or a reminder; the ledger row records who
     * ran it and when.
     */
    async runTask(key: string, date?: string): Promise<TaskRunResultView> {
      const definition = taskDefinition(key);
      if (!definition) {
        throw new WorkOrderError(
          'UNKNOWN_TASK',
          `No scheduled task is registered under ${key}.`,
          404,
        );
      }
      const runDate = date ?? dayString(clock);
      let createdCount: number;
      try {
        if (key === RUN_KEYS.dailyInspections) {
          const result = await this.runDailyInspections(runDate);
          createdCount = result.created;
        } else {
          const result = await this.runOverdueReminders(runDate);
          createdCount = result.reminded;
        }
      } catch (error) {
        await recordScheduledRun(database, key, runDate, {
          status: 'failed',
          failureReason: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
      const summary = await this.scheduledTaskSummary();
      await recordScheduledRun(database, key, runDate, {
        status: 'succeeded',
        summary: JSON.stringify({ createdCount, ...summary }),
      });
      return { key, runDate, createdCount, summary };
    },

    /**
     * Whether the order assistant can actually answer from the manuals.
     *
     * Reported honestly rather than assumed: an application without an LLM
     * service or a vector database says so here instead of failing at the first
     * question.
     */
    async assistantStatus(): Promise<AssistantStatusView> {
      const manuals = await database
        .repository<DeviceManual>(COLLECTIONS.deviceManuals)
        .findMany({ filter: (f) => f.string('status').ne('draft') });
      const settings = (await deps.assistant?.()) ?? {
        model: { configured: false, provider: null, model: null },
        knowledgeBase: {
          configured: false,
          vectorDatabase: null,
          manifestCount: 0,
        },
      };
      const indexedManualCount = manuals.filter(
        (row) => row.status === 'indexed',
      ).length;
      const available =
        settings.model.configured && settings.knowledgeBase.configured;
      return {
        available,
        reason: available
          ? null
          : settings.model.configured
            ? ASSISTANT_REASONS.notConfigured
            : ASSISTANT_REASONS.noModel,
        model: settings.model,
        knowledgeBase: settings.knowledgeBase,
        manualCount: manuals.length,
        indexedManualCount,
      };
    },

    /**
     * Whether the caller's own policy can see one record at all.
     *
     * Used by the routes before an operation the policy cannot express as an
     * update filter (publishing a note, completing an inspection): the record is
     * read through the caller's policy, so no row means 404 rather than a write
     * that silently affects nothing.
     */
    async ensureVisible(
      collection: string,
      id: string,
      context: ServiceContext,
    ): Promise<boolean> {
      const row = await repo<Record<string, unknown>>(
        database,
        collection,
        context,
      ).findOne({ filter: { id } });
      return !!row;
    },

    permissionSetKeys: PERMISSION_SET_KEYS,
  };

  return service;
}

export type Service = ReturnType<typeof createService>;
