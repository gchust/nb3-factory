/**
 * Application domain facade for the after-sales service module.
 *
 * Everything below is business logic and nothing else: no Hono context, no
 * HTTP status codes, no response envelopes. Routes translate the errors thrown
 * here (`ServiceError`) into responses, and the `capabilities` block of every
 * work-order view is what the browser uses to decide which buttons to show.
 *
 * Two rules are enforced here rather than in a middleware because they are
 * record-level business rules, not request-level ones:
 *
 * 1. **Capacity is derived from the actor's roles and their relationship to the
 *    record** (manager / assignee / shared collaborator / observer / external
 *    integrator). An engineer sees their own work orders; an observer sees only
 *    the ordinary work orders a supervisor explicitly shared with them, and
 *    never the internal notes of those.
 * 2. **Every state change is a compare-and-set.** `updateMany({ filter: { id,
 *    status: expected } })` either flips exactly one row — the caller's
 *    expectation held — or none, in which case the caller lost a race or asked
 *    for a transition the record is not in. Nothing advances twice, and nothing
 *    advances from a stale read.
 */
import type {
  DatabaseManager,
  FilterNode,
  Repository,
  RepositoryFilter,
} from '@nocobase/db';

import type { ServiceAccess } from './access.js';
import { badRequest, conflict, notFound } from './errors.js';
import {
  SCHEDULE_KEYS,
  type ApiKeyPort,
  type NotificationPort,
  type KnowledgeIndexPort,
  type ScheduledJob,
  type SchedulerPort,
  type ServiceLogger,
  type WorkflowPort,
} from './ports.js';
import { SERVICE_PAGE_IDS } from './tokens.js';
import {
  bool,
  firstRole,
  INSPECTION_STATUSES,
  isoDate,
  num,
  recordId,
  str,
  toDate,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_STATUSES,
  type AttachmentCategory,
  type InspectionStatus,
  type ServiceActor,
  type WorkOrderPriority,
  type WorkOrderStatus,
} from './types.js';

type Row = Record<string, unknown>;

/** The subset of the repository filter builder this module uses. */
interface FilterOps {
  and: (nodes?: readonly FilterNode[]) => FilterNode;
  or: (nodes?: readonly FilterNode[]) => FilterNode;
  number: (path: string) => {
    eq(value: number): FilterNode;
    ne(value: number): FilterNode;
    gt(value: number): FilterNode;
    gte(value: number): FilterNode;
    lt(value: number): FilterNode;
    lte(value: number): FilterNode;
    empty(): FilterNode;
    notEmpty(): FilterNode;
  };
  string: (path: string) => {
    eq(value: string): FilterNode;
    ne(value: string): FilterNode;
    includes(
      value: string,
      options?: { mode?: 'default' | 'insensitive' },
    ): FilterNode;
    startsWith(value: string): FilterNode;
    empty(): FilterNode;
    notEmpty(): FilterNode;
  };
  text: (path: string) => {
    includes(
      value: string,
      options?: { mode?: 'default' | 'insensitive' },
    ): FilterNode;
  };
  boolean: (path: string) => { isTrue(): FilterNode; isFalse(): FilterNode };
  date: (path: string) => {
    before(value: Date | string): FilterNode;
    after(value: Date | string): FilterNode;
    notBefore(value: Date | string): FilterNode;
    notAfter(value: Date | string): FilterNode;
    on(value: Date | string): FilterNode;
    empty(): FilterNode;
    notEmpty(): FilterNode;
  };
}

type FilterFn = (filter: FilterOps) => FilterNode;

const WORK_ORDER_COLLECTION = 'serviceWorkOrders';
const SHARE_COLLECTION = 'serviceWorkOrderShares';
const EVENT_COLLECTION = 'serviceWorkOrderEvents';
const INSPECTION_COLLECTION = 'serviceInspectionTasks';
const CUSTOMER_COLLECTION = 'serviceCustomers';
const EQUIPMENT_COLLECTION = 'serviceEquipment';
const MEMBER_COLLECTION = 'serviceEngineerMembers';
const GROUP_COLLECTION = 'serviceEngineerGroups';
const KNOWLEDGE_COLLECTION = 'serviceKnowledgeArticles';
const MANUAL_COLLECTION = 'serviceManuals';
const EXTERNAL_EVENT_COLLECTION = 'serviceExternalEvents';
const FILE_COLLECTION = 'serviceWorkOrderFiles';

export const ACCEPTANCE_WORKFLOW_KEY = 'work-order-acceptance';

/** The file extensions each attachment category accepts. */
export const ATTACHMENT_EXTENSIONS: Record<
  AttachmentCategory,
  readonly string[]
> = {
  photo: ['png', 'jpg', 'jpeg'],
  report: ['docx'],
};

/** Where a device-platform submission is recorded against an order. */
export const EXTERNAL_SOURCE = 'device-platform';

/**
 * The acceptance note for an order, chosen by priority.
 *
 * Kept here as a pure, exported function because the application writes the
 * note itself rather than letting a Workflow `run` module do it: a run module
 * executes from the immutable Artifact copy in production and cannot resolve an
 * application-owned service. The text is derived only from the acceptance event
 * payload, so a retry or a replayed trigger always produces the same note.
 */
export function acceptanceNote(
  priority: string,
  input: Record<string, unknown>,
): string {
  const orderNo = str(input.orderNo) || `#${num(input.workOrderId) ?? 0}`;
  const engineer = str(input.assigneeName) || '负责工程师';
  const customer = str(input.customerName) || '客户';
  const equipment = str(input.equipmentName) || '设备';
  return priority === 'urgent'
    ? `加急工单 ${orderNo} 自动受理：${customer} / ${equipment}，已指派 ${engineer}，4 小时内响应。 / Urgent work order ${orderNo} automatically accepted: ${customer} / ${equipment}, assigned to ${engineer}, response within 4 hours.`
    : `工单 ${orderNo} 自动受理：${customer} / ${equipment}，已指派 ${engineer}，24 小时内响应。 / Work order ${orderNo} automatically accepted: ${customer} / ${equipment}, assigned to ${engineer}, response within 24 hours.`;
}

export interface ServiceOperationsOptions {
  readonly database: DatabaseManager;
  readonly access: ServiceAccess;
  readonly logger: ServiceLogger;
  readonly publicBasePath: string;
  readonly notification?: NotificationPort;
  readonly workflow?: WorkflowPort;
  readonly knowledgeIndex?: KnowledgeIndexPort;
  readonly scheduler?: SchedulerPort;
  readonly apiKeys?: ApiKeyPort;
}

/** The page whose `access` grant additionally gates each job's manual run. */
const SCHEDULE_PAGES: Record<ScheduledJob, string> = {
  'daily-inspections': SERVICE_PAGE_IDS.inspections,
  'overdue-reminders': SERVICE_PAGE_IDS.workOrders,
};

/** What a supervisor is asking for, used in the refusal when they may not. */
const SCHEDULE_OPERATIONS: Record<ScheduledJob, string> = {
  'daily-inspections': 'generate inspection tasks',
  'overdue-reminders': 'send overdue reminders',
};

function isScheduledJob(value: string): value is ScheduledJob {
  return value === 'daily-inspections' || value === 'overdue-reminders';
}

/** One plan and what its executions actually did, ready for the supervisor. */
export interface ScheduleOverview {
  readonly job: ScheduledJob;
  readonly registered: boolean;
  readonly scheduleId: string;
  readonly title: string;
  readonly cron: string;
  readonly timezone: string;
  readonly enabled: boolean;
  readonly runCount: number;
  readonly completedCount: number;
  readonly nextRunAt: string | null;
  readonly lastRunAt: string | null;
  readonly occurrences: readonly ScheduleOccurrenceOverview[];
}

export interface ScheduleOccurrenceOverview {
  readonly id: string;
  readonly status: string;
  readonly reason: string | null;
  readonly executionCount: number;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly result: Record<string, unknown> | null;
}

/** The receipt of a supervisor asking one plan to run now. */
export interface ScheduledJobRunResult {
  readonly job: ScheduledJob;
  readonly mode: 'scheduler' | 'direct';
  readonly scheduleId: string;
  readonly title: string;
  readonly timezone: string;
  readonly enabled: boolean;
  readonly status: string;
  readonly reason: string | null;
  readonly result: Record<string, unknown> | null;
}

export interface AttachmentRecordView {
  readonly id: string;
  readonly filename: string;
  readonly ext: string | null;
  readonly mimeType: string | null;
  readonly size: number;
  readonly category: AttachmentCategory;
  readonly createdAt: string | null;
  readonly contentUrl: string;
}

export interface ListResult<T> {
  readonly rows: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export function pageParams(
  params: { page?: number; pageSize?: number },
  fallbackSize = 20,
): { page: number; pageSize: number } {
  const page =
    Number.isFinite(params.page) && (params.page as number) > 0
      ? Math.floor(params.page as number)
      : 1;
  const requested =
    Number.isFinite(params.pageSize) && (params.pageSize as number) > 0
      ? Math.floor(params.pageSize as number)
      : fallbackSize;
  return { page, pageSize: Math.min(requested, 200) };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/** The filter builder calls are typed by the repository, so the view is a cast. */
function asFilter(fn: FilterFn): RepositoryFilter<Row> {
  return fn as unknown as RepositoryFilter<Row>;
}

/** A `YYYY-MM-DD` plan date in the team's timezone (Asia/Shanghai). */
function shanghaiDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export class ServiceOperations {
  private readonly deps: ServiceOperationsOptions;

  constructor(deps: ServiceOperationsOptions) {
    this.deps = deps;
  }

  /**
   * Resolve the signed-in user into a domain actor.
   *
   * The HTTP session belongs to the route layer, so routes hand the session's
   * user here rather than reaching into the access service themselves.
   */
  async resolveActor(
    user: { id?: unknown; name?: unknown; email?: unknown } | null | undefined,
  ): Promise<ServiceActor> {
    return this.deps.access.resolveActor(
      user && typeof user.id === 'string' ? { ...user, id: user.id } : null,
    );
  }

  // ---------------------------------------------------------------- utilities

  private repo(name: string): Repository<Row, Row, Row> {
    return this.deps.database.repository<Row, Row, Row>(name);
  }

  private get logger(): ServiceLogger {
    return this.deps.logger;
  }

  private async nextNumber(
    collection: string,
    field: string,
    prefix: string,
    width: number,
  ): Promise<string> {
    const rows = await this.repo(collection).findMany({
      filter: (filter) =>
        (filter as unknown as FilterOps).string(field).startsWith(prefix),
      sort: (sort) => sort.field(field).desc(),
      limit: 1,
    });
    const last = rows[0] ? str(rows[0][field]) : '';
    const tail = last.startsWith(prefix)
      ? Number.parseInt(last.slice(prefix.length), 10)
      : 0;
    const next = Number.isFinite(tail) && tail > 0 ? tail + 1 : 1;
    return `${prefix}${String(next).padStart(width, '0')}`;
  }

  private yearPrefix(prefix: string): string {
    return `${prefix}${new Date().getUTCFullYear()}-`;
  }

  private async insertEvent(
    workOrderId: number,
    type: string,
    options: {
      eventKey?: string | null;
      actorId?: string | null;
      message?: string | null;
      detail?: Row | null;
      runId?: string | null;
    } = {},
  ): Promise<boolean> {
    const eventKey = options.eventKey ?? null;
    if (eventKey) {
      const existing = await this.repo(EVENT_COLLECTION).findOne({
        filter: (filter) =>
          (filter as unknown as FilterOps).string('eventKey').eq(eventKey),
      });
      if (existing) {
        return false;
      }
    }
    await this.repo(EVENT_COLLECTION).createOne({
      values: {
        workOrderId,
        type,
        eventKey,
        actorId: options.actorId ?? null,
        message: options.message ?? null,
        detail: options.detail ?? null,
        runId: options.runId ?? null,
        createdAt: new Date(),
      },
    });
    return true;
  }

  private async activeSharesFor(
    workOrderIds: readonly number[],
  ): Promise<Row[]> {
    if (workOrderIds.length === 0) {
      return [];
    }
    return this.repo(SHARE_COLLECTION).findMany({
      filter: asFilter((filter) =>
        filter.and([
          filter.or(
            workOrderIds.map((id) => filter.number('workOrderId').eq(id)),
          ),
          filter.date('revokedAt').empty(),
        ]),
      ),
    });
  }

  /** Work orders an engineer or observer is an explicit collaborator on. */
  private async sharedWorkOrderIds(actor: ServiceActor): Promise<number[]> {
    if (actor.memberId === null) {
      return [];
    }
    const shares = await this.repo(SHARE_COLLECTION).findMany({
      filter: asFilter((filter) =>
        filter.and([
          filter.number('engineerMemberId').eq(actor.memberId as number),
          filter.date('revokedAt').empty(),
        ]),
      ),
      limit: 500,
    });
    return shares
      .map((row) => num(row.workOrderId))
      .filter((id): id is number => id !== null);
  }

  /**
   * The record-level scope of the work-order collection for one actor.
   * `null` means unrestricted.
   */
  private async orderScope(actor: ServiceActor): Promise<FilterFn | null> {
    if (actor.roles.includes('manager')) {
      return null;
    }
    if (actor.roles.includes('engineer')) {
      const shared = await this.sharedWorkOrderIds(actor);
      const memberId = actor.memberId ?? -1;
      return (filter) =>
        shared.length === 0
          ? filter.number('assigneeId').eq(memberId)
          : filter.or([
              filter.number('assigneeId').eq(memberId),
              ...shared.map((id) => filter.number('id').eq(id)),
            ]);
    }
    if (actor.roles.includes('observer')) {
      const shared = await this.sharedWorkOrderIds(actor);
      return (filter) =>
        shared.length === 0
          ? filter.number('id').eq(-1)
          : filter.or(shared.map((id) => filter.number('id').eq(id)));
    }
    if (actor.roles.includes('integrator')) {
      return (filter) =>
        filter.and([
          filter.string('createdById').eq(actor.userId),
          filter.string('source').eq('external'),
        ]);
    }
    return (filter) => filter.number('id').eq(-1);
  }

  private async requireManager(
    actor: ServiceActor,
    pageId: string,
    operation: string,
  ): Promise<void> {
    this.deps.access.requireRole(actor, operation, 'manager');
    await this.deps.access.requirePage(actor, pageId, operation);
  }

  private async requirePageAccess(
    actor: ServiceActor,
    pageId: string,
    operation: string,
  ): Promise<void> {
    if (actor.roles.includes('manager')) {
      return;
    }
    await this.deps.access.requirePage(actor, pageId, operation);
  }

  private async mustRow(
    collection: string,
    id: number,
    label: string,
  ): Promise<Row> {
    const row = await this.repo(collection).findOne({
      filter: (filter) => (filter as unknown as FilterOps).number('id').eq(id),
    });
    if (!row) {
      throw notFound(`${label} #${id} was not found`);
    }
    return row;
  }

  /**
   * Read access to one work order, including the record-level scope rules.
   * Returns `null` for both "missing" and "not yours".
   */
  async assertWorkOrderRead(
    actor: ServiceActor,
    id: number,
  ): Promise<Row | null> {
    const row = await this.repo(WORK_ORDER_COLLECTION).findOne({
      filter: (filter) => (filter as unknown as FilterOps).number('id').eq(id),
    });
    if (!row) {
      return null;
    }
    if (actor.roles.includes('manager')) {
      return row;
    }
    if (actor.roles.includes('engineer')) {
      if (actor.memberId !== null && num(row.assigneeId) === actor.memberId) {
        return row;
      }
      const shared = await this.sharedWorkOrderIds(actor);
      return shared.includes(id) ? row : null;
    }
    if (actor.roles.includes('observer')) {
      const shared = await this.sharedWorkOrderIds(actor);
      return shared.includes(id) ? row : null;
    }
    if (actor.roles.includes('integrator')) {
      return str(row.createdById) === actor.userId &&
        str(row.source) === 'external'
        ? row
        : null;
    }
    return null;
  }

  // --------------------------------------------------------------- references

  private async referenceMaps(rows: readonly Row[]): Promise<{
    customers: Map<number, Row>;
    equipment: Map<number, Row>;
    members: Map<number, Row>;
    groups: Map<number, Row>;
  }> {
    const customerIds = new Set<number>();
    const equipmentIds = new Set<number>();
    const memberIds = new Set<number>();
    for (const row of rows) {
      const customerId = num(row.customerId);
      if (customerId !== null) customerIds.add(customerId);
      const equipmentId = num(row.equipmentId);
      if (equipmentId !== null) equipmentIds.add(equipmentId);
      const assigneeId = num(row.assigneeId);
      if (assigneeId !== null) memberIds.add(assigneeId);
      const engineerMemberId = num(row.engineerMemberId);
      if (engineerMemberId !== null) memberIds.add(engineerMemberId);
    }
    const [customers, equipment, members] = await Promise.all([
      customerIds.size === 0
        ? Promise.resolve([] as Row[])
        : this.repo(CUSTOMER_COLLECTION).findMany({
            filter: asFilter((filter) =>
              filter.or(
                [...customerIds].map((id) => filter.number('id').eq(id)),
              ),
            ),
          }),
      equipmentIds.size === 0
        ? Promise.resolve([] as Row[])
        : this.repo(EQUIPMENT_COLLECTION).findMany({
            filter: asFilter((filter) =>
              filter.or(
                [...equipmentIds].map((id) => filter.number('id').eq(id)),
              ),
            ),
          }),
      memberIds.size === 0
        ? Promise.resolve([] as Row[])
        : this.repo(MEMBER_COLLECTION).findMany({
            filter: asFilter((filter) =>
              filter.or([...memberIds].map((id) => filter.number('id').eq(id))),
            ),
          }),
    ]);
    const groupIds = new Set<number>();
    for (const member of members) {
      const groupId = num(member.groupId);
      if (groupId !== null) groupIds.add(groupId);
    }
    const groups =
      groupIds.size === 0
        ? []
        : await this.repo(GROUP_COLLECTION).findMany({
            filter: asFilter((filter) =>
              filter.or([...groupIds].map((id) => filter.number('id').eq(id))),
            ),
          });
    return {
      customers: new Map(
        customers.map((row) => [num(row.id) ?? -1, row] as const),
      ),
      equipment: new Map(
        equipment.map((row) => [num(row.id) ?? -1, row] as const),
      ),
      members: new Map(members.map((row) => [num(row.id) ?? -1, row] as const)),
      groups: new Map(groups.map((row) => [num(row.id) ?? -1, row] as const)),
    };
  }

  private memberView(
    member: Row | undefined,
    groups: Map<number, Row>,
  ): Row | null {
    if (!member) {
      return null;
    }
    const groupId = num(member.groupId);
    const group = groupId === null ? undefined : groups.get(groupId);
    return {
      id: num(member.id),
      ref: str(member.ref) || null,
      name: str(member.name) || null,
      kind: str(member.kind) || null,
      email: str(member.email) || null,
      groupId,
      groupName: group ? str(group.name) || null : null,
      userId: str(member.userId) || null,
      enabled: bool(member.enabled),
    };
  }

  // ------------------------------------------------------------ projections

  /**
   * Public projection of a work order.
   *
   * Internal notes are removed for anybody who is neither the supervisor nor the
   * assignee — an observer and a temporary collaborator get the summary they are
   * there for, and no way to read the internal notes back out of a list
   * response either.
   */
  private orderView(
    actor: ServiceActor,
    row: Row,
    refs: {
      customers: Map<number, Row>;
      equipment: Map<number, Row>;
      members: Map<number, Row>;
      groups: Map<number, Row>;
    },
    options: { sharedWith?: readonly Row[] } = {},
  ): Row {
    const customerId = num(row.customerId);
    const equipmentId = num(row.equipmentId);
    const assigneeId = num(row.assigneeId);
    const customer =
      customerId === null ? undefined : refs.customers.get(customerId);
    const equipment =
      equipmentId === null ? undefined : refs.equipment.get(equipmentId);
    const status = str(row.status) as WorkOrderStatus;
    const isManager = actor.roles.includes('manager');
    const isAssignee = actor.memberId !== null && assigneeId === actor.memberId;
    const internal = isManager || isAssignee;
    const shareRows = options.sharedWith ?? [];
    const view: Row = {
      id: num(row.id),
      orderNo: str(row.orderNo) || null,
      title: str(row.title) || null,
      problem: str(row.problem) || null,
      priority: str(row.priority) || null,
      status,
      source: str(row.source) || 'manual',
      confidential: bool(row.confidential),
      deadline: isoDate(row.deadline),
      createdAt: isoDate(row.createdAt),
      updatedAt: isoDate(row.updatedAt),
      acceptedAt: isoDate(row.acceptedAt),
      processingStartedAt: isoDate(row.processingStartedAt),
      resolutionAt: isoDate(row.resolutionAt),
      closedAt: isoDate(row.closedAt),
      acceptNoteStatus: str(row.acceptNoteStatus) || 'pending',
      acceptanceNote: internal ? str(row.acceptanceNote) || null : null,
      resolution: internal ? str(row.resolution) || null : null,
      lastRejectReason: internal ? str(row.lastRejectReason) || null : null,
      rejectCount: num(row.rejectCount) ?? 0,
      customerId,
      customer: customer
        ? {
            id: num(customer.id),
            name: str(customer.name) || null,
            contactName: str(customer.contactName) || null,
            contactPhone: str(customer.contactPhone) || null,
            address: str(customer.address) || null,
          }
        : null,
      equipmentId,
      equipment: equipment
        ? {
            id: num(equipment.id),
            code: str(equipment.code) || null,
            name: str(equipment.name) || null,
            model: str(equipment.model) || null,
            location: str(equipment.location) || null,
            enabled: bool(equipment.enabled),
            nextInspectionDate: isoDate(equipment.nextInspectionDate),
          }
        : null,
      assignee: this.memberView(
        assigneeId === null ? undefined : refs.members.get(assigneeId),
        refs.groups,
      ),
      capabilities: this.capabilities(actor, row, isManager, isAssignee),
    };
    if (isManager) {
      view.createdById = str(row.createdById) || null;
      view.acceptanceRunId = str(row.acceptanceRunId) || null;
      view.sharedWith = shareRows.map((share) => ({
        id: num(share.id),
        engineerMemberId: num(share.engineerMemberId),
        engineer: this.memberView(
          num(share.engineerMemberId) === null
            ? undefined
            : refs.members.get(num(share.engineerMemberId) as number),
          refs.groups,
        ),
        grantedAt: isoDate(share.grantedAt),
        revokedAt: isoDate(share.revokedAt),
        note: str(share.note) || null,
      }));
    }
    return view;
  }

  private capabilities(
    _actor: ServiceActor,
    row: Row,
    isManager: boolean,
    isAssignee: boolean,
  ): Row {
    const status = str(row.status);
    const handler = isManager || isAssignee;
    return {
      canAccept: isManager && status === 'pending_acceptance',
      canRetryAcceptance: isManager && str(row.acceptanceNote).length === 0,
      canStart: handler && status === 'pending_processing',
      canSubmitResolution: handler && status === 'processing',
      canClose: isManager && status === 'pending_confirmation',
      canReject: isManager && status === 'pending_confirmation',
      canShare: isManager && !bool(row.confidential) && status !== 'closed',
      canUploadAttachment: handler && status !== 'closed',
      // A closed work order is read-only history; the server refuses these
      // transitions too, so the flags are a convenience, not the enforcement.
      canViewInternalNotes: isManager || isAssignee,
      canEditCatalog: isManager,
      canMaintainKnowledge: isManager,
      canMaintainManuals: isManager,
      canManageShares: isManager,
      canManageInspections: isManager,
    };
  }

  private async buildOrderViews(
    actor: ServiceActor,
    rows: readonly Row[],
  ): Promise<Row[]> {
    if (rows.length === 0) {
      return [];
    }
    const refs = await this.referenceMaps(rows);
    const isManager = actor.roles.includes('manager');
    const shares = isManager
      ? await this.activeSharesFor(
          rows
            .map((row) => num(row.id))
            .filter((id): id is number => id !== null),
        )
      : [];
    const sharesByOrder = new Map<number, Row[]>();
    for (const share of shares) {
      const orderId = num(share.workOrderId);
      if (orderId === null) continue;
      const list = sharesByOrder.get(orderId) ?? [];
      list.push(share);
      sharesByOrder.set(orderId, list);
    }
    return rows.map((row) => {
      const orderId = num(row.id);
      return this.orderView(actor, row, refs, {
        sharedWith: orderId === null ? [] : (sharesByOrder.get(orderId) ?? []),
      });
    });
  }

  // ---------------------------------------------------------------- catalogue

  /**
   * Customers the actor may see.
   *
   * A supervisor sees the ledger. Everybody else sees only the customers their
   * own engagements reference: an engineer gets the contact detail for the call
   * they are on, not the company's customer list, and an observer gets only what
   * the work order they were shown already carries.
   */
  async listCustomers(
    actor: ServiceActor,
    params: { search?: string; page?: number; pageSize?: number } = {},
  ): Promise<ListResult<Row>> {
    await this.requirePageAccess(
      actor,
      SERVICE_PAGE_IDS.customers,
      'list customers',
    );
    const { page, pageSize } = pageParams(params);
    const scope = await this.catalogScope(actor);
    const search = str(params.search).trim();
    const filter = asFilter((builder) => {
      const nodes: FilterNode[] = [];
      if (scope.customers !== null) {
        nodes.push(
          scope.customers.length === 0
            ? builder.number('id').eq(-1)
            : builder.or(
                scope.customers.map((id) => builder.number('id').eq(id)),
              ),
        );
      }
      if (search) {
        nodes.push(
          builder.or([
            builder.string('name').includes(search, { mode: 'insensitive' }),
            builder
              .string('contactName')
              .includes(search, { mode: 'insensitive' }),
            builder
              .string('contactPhone')
              .includes(search, { mode: 'insensitive' }),
            builder.string('address').includes(search, { mode: 'insensitive' }),
          ]),
        );
      }
      return nodes.length === 0
        ? builder.and([])
        : nodes.length === 1
          ? nodes[0]
          : builder.and(nodes);
    });
    const repository = this.repo(CUSTOMER_COLLECTION);
    const total = await repository.count({ filter });
    const rows =
      total === 0
        ? []
        : await repository.findMany({
            filter,
            sort: (sort) => sort.field('id').asc(),
            limit: pageSize,
            offset: (page - 1) * pageSize,
          });
    return {
      rows: rows.map((row) => ({
        id: num(row.id),
        name: str(row.name) || null,
        contactName: str(row.contactName) || null,
        contactPhone: str(row.contactPhone) || null,
        address: str(row.address) || null,
        createdAt: isoDate(row.createdAt),
        updatedAt: isoDate(row.updatedAt),
      })),
      total,
      page,
      pageSize,
    };
  }

  /** The customer and equipment ids a non-supervisor may see. `null` is unrestricted. */
  private async catalogScope(
    actor: ServiceActor,
  ): Promise<{ customers: number[] | null; equipment: number[] | null }> {
    if (actor.roles.includes('manager')) {
      return { customers: null, equipment: null };
    }
    const orders = await this.scopedOrderRows(actor);
    const customers = new Set<number>();
    const equipment = new Set<number>();
    for (const order of orders) {
      const customerId = num(order.customerId);
      if (customerId !== null) customers.add(customerId);
      const equipmentId = num(order.equipmentId);
      if (equipmentId !== null) equipment.add(equipmentId);
    }
    if (actor.roles.includes('engineer') && actor.memberId !== null) {
      const tasks = await this.repo(INSPECTION_COLLECTION).findMany({
        filter: asFilter((builder) =>
          builder.number('engineerMemberId').eq(actor.memberId as number),
        ),
        limit: 500,
      });
      for (const task of tasks) {
        const customerId = num(task.customerId);
        if (customerId !== null) customers.add(customerId);
        const equipmentId = num(task.equipmentId);
        if (equipmentId !== null) equipment.add(equipmentId);
      }
    }
    return { customers: [...customers], equipment: [...equipment] };
  }

  private async scopedOrderRows(actor: ServiceActor): Promise<Row[]> {
    const scope = await this.orderScope(actor);
    return this.repo(WORK_ORDER_COLLECTION).findMany({
      ...(scope ? { filter: asFilter(scope) } : {}),
      limit: 500,
    });
  }

  async createCustomer(actor: ServiceActor, input: Row): Promise<Row> {
    await this.requireManager(
      actor,
      SERVICE_PAGE_IDS.customers,
      'create a customer',
    );
    const name = str(input.name).trim();
    if (name.length === 0) {
      throw badRequest('Customer name is required');
    }
    const existing = await this.repo(CUSTOMER_COLLECTION).findOne({
      filter: (filter) =>
        (filter as unknown as FilterOps).string('name').eq(name),
    });
    if (existing) {
      throw conflict(`Customer "${name}" already exists`);
    }
    const now = new Date();
    const created = await this.repo(CUSTOMER_COLLECTION).createOne({
      values: {
        name,
        contactName: str(input.contactName).trim() || null,
        contactPhone: str(input.contactPhone).trim() || null,
        address: str(input.address).trim() || null,
        createdAt: now,
        updatedAt: now,
      },
    });
    return this.mustRow(
      CUSTOMER_COLLECTION,
      num(created.record.id) as number,
      'Customer',
    );
  }

  async updateCustomer(
    actor: ServiceActor,
    id: number,
    input: Row,
  ): Promise<Row> {
    await this.requireManager(
      actor,
      SERVICE_PAGE_IDS.customers,
      'edit a customer',
    );
    await this.mustRow(CUSTOMER_COLLECTION, id, 'Customer');
    if ('name' in input) {
      const name = str(input.name).trim();
      if (name.length === 0) {
        throw badRequest('Customer name is required');
      }
      const duplicate = await this.repo(CUSTOMER_COLLECTION).findOne({
        filter: asFilter((filter) =>
          filter.and([
            filter.string('name').eq(name),
            filter.number('id').ne(id),
          ]),
        ),
      });
      if (duplicate) {
        throw conflict(`Customer "${name}" already exists`);
      }
    }
    const values: Row = { updatedAt: new Date() };
    for (const field of ['name', 'contactName', 'contactPhone', 'address']) {
      if (field in input) {
        values[field] = str(input[field]).trim() || null;
      }
    }
    await this.repo(CUSTOMER_COLLECTION).updateMany({
      filter: (filter) => (filter as unknown as FilterOps).number('id').eq(id),
      values,
    });
    return this.mustRow(CUSTOMER_COLLECTION, id, 'Customer');
  }

  async listEquipment(
    actor: ServiceActor,
    params: {
      search?: string;
      customerId?: number;
      enabled?: boolean;
      page?: number;
      pageSize?: number;
    } = {},
  ): Promise<ListResult<Row>> {
    await this.requirePageAccess(
      actor,
      SERVICE_PAGE_IDS.equipment,
      'list equipment',
    );
    const { page, pageSize } = pageParams(params, 50);
    const scope = await this.catalogScope(actor);
    const search = str(params.search).trim();
    const filter = asFilter((builder) => {
      const nodes: FilterNode[] = [];
      if (scope.equipment !== null) {
        nodes.push(
          scope.equipment.length === 0
            ? builder.number('id').eq(-1)
            : builder.or(
                scope.equipment.map((id) => builder.number('id').eq(id)),
              ),
        );
      }
      if (params.customerId !== undefined) {
        nodes.push(builder.number('customerId').eq(params.customerId));
      }
      if (params.enabled !== undefined) {
        nodes.push(
          params.enabled
            ? builder.boolean('enabled').isTrue()
            : builder.boolean('enabled').isFalse(),
        );
      }
      if (search) {
        nodes.push(
          builder.or([
            builder.string('code').includes(search, { mode: 'insensitive' }),
            builder.string('name').includes(search, { mode: 'insensitive' }),
            builder.string('model').includes(search, { mode: 'insensitive' }),
            builder
              .string('location')
              .includes(search, { mode: 'insensitive' }),
          ]),
        );
      }
      return nodes.length === 0
        ? builder.and([])
        : nodes.length === 1
          ? nodes[0]
          : builder.and(nodes);
    });
    const repository = this.repo(EQUIPMENT_COLLECTION);
    const total = await repository.count({ filter });
    const rows =
      total === 0
        ? []
        : await repository.findMany({
            filter,
            sort: (sort) => sort.field('code').asc(),
            limit: pageSize,
            offset: (page - 1) * pageSize,
          });
    const refs = await this.referenceMaps(rows);
    return {
      rows: rows.map((row) => {
        const customerId = num(row.customerId);
        const customer =
          customerId === null ? undefined : refs.customers.get(customerId);
        return {
          id: num(row.id),
          code: str(row.code) || null,
          name: str(row.name) || null,
          model: str(row.model) || null,
          location: str(row.location) || null,
          enabled: bool(row.enabled),
          nextInspectionDate: isoDate(row.nextInspectionDate),
          customerId,
          customer: customer
            ? {
                id: customerId,
                ref: str(customer.ref) || null,
                name: str(customer.name) || null,
                contactName: str(customer.contactName) || null,
                contactPhone: str(customer.contactPhone) || null,
              }
            : null,
          engineerMemberId: num(row.engineerMemberId),
          serviceEngineer: this.memberView(
            refs.members.get(num(row.engineerMemberId) ?? -1),
            refs.groups,
          ),
          note: str(row.note) || null,
          createdAt: isoDate(row.createdAt),
          updatedAt: isoDate(row.updatedAt),
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  async getEquipment(actor: ServiceActor, id: number): Promise<Row> {
    const list = await this.listEquipment(actor, { page: 1, pageSize: 200 });
    const found = list.rows.find((row) => row.id === id);
    if (!found) {
      throw notFound(`Equipment #${id} was not found`);
    }
    return found;
  }

  private async assertEquipmentInput(
    input: Row,
    currentId?: number,
  ): Promise<Row> {
    const values: Row = {};
    if (currentId === undefined || 'code' in input) {
      const code = str(input.code).trim();
      if (code.length === 0) {
        throw badRequest('Equipment number is required');
      }
      const duplicate = await this.repo(EQUIPMENT_COLLECTION).findOne({
        filter: asFilter((filter) =>
          currentId === undefined
            ? filter.string('code').eq(code)
            : filter.and([
                filter.string('code').eq(code),
                filter.number('id').ne(currentId),
              ]),
        ),
      });
      if (duplicate) {
        throw conflict(`Equipment number "${code}" already exists`);
      }
      values.code = code;
    }
    for (const field of ['name', 'model', 'location']) {
      if (field in input) {
        values[field] = str(input[field]).trim() || null;
      }
    }
    if (currentId === undefined || 'customerId' in input) {
      const customerId = recordId(input.customerId);
      if (customerId === null) {
        throw badRequest('Equipment must belong to a customer');
      }
      await this.mustRow(CUSTOMER_COLLECTION, customerId, 'Customer');
      values.customerId = customerId;
    }
    if ('engineerMemberId' in input) {
      const engineerMemberId = recordId(input.engineerMemberId);
      if (engineerMemberId !== null) {
        const member = await this.mustRow(
          MEMBER_COLLECTION,
          engineerMemberId,
          'Engineer',
        );
        if (str(member.kind) !== 'engineer') {
          throw badRequest('Equipment can only be assigned to an engineer');
        }
      }
      values.engineerMemberId = engineerMemberId;
    }
    if ('nextInspectionDate' in input) {
      values.nextInspectionDate = toDate(input.nextInspectionDate);
    }
    if ('enabled' in input) {
      values.enabled = Boolean(input.enabled);
    } else if (currentId === undefined) {
      values.enabled = true;
    }
    return values;
  }

  async createEquipment(actor: ServiceActor, input: Row): Promise<Row> {
    await this.requireManager(
      actor,
      SERVICE_PAGE_IDS.equipment,
      'create equipment',
    );
    const values = await this.assertEquipmentInput(input);
    const code = str(values.code);
    const now = new Date();
    const created = await this.repo(EQUIPMENT_COLLECTION).createOne({
      values: { ...values, createdAt: now, updatedAt: now },
    });
    await this.recordCatalogEvent(
      actor,
      'equipment_created',
      `新增设备 ${code} / Equipment ${code} created`,
      { code },
    );
    return this.getEquipment(actor, num(created.record.id) as number);
  }

  async updateEquipment(
    actor: ServiceActor,
    id: number,
    input: Row,
  ): Promise<Row> {
    await this.requireManager(
      actor,
      SERVICE_PAGE_IDS.equipment,
      'edit equipment',
    );
    const current = await this.mustRow(EQUIPMENT_COLLECTION, id, 'Equipment');
    const values = await this.assertEquipmentInput(input, id);
    if (Object.keys(values).length > 0) {
      await this.repo(EQUIPMENT_COLLECTION).updateMany({
        filter: (filter) =>
          (filter as unknown as FilterOps).number('id').eq(id),
        values: { ...values, updatedAt: new Date() },
      });
    }
    if (
      'enabled' in values &&
      Boolean(values.enabled) !== bool(current.enabled)
    ) {
      await this.recordCatalogEvent(
        actor,
        'equipment_status',
        bool(values.enabled)
          ? `设备 ${str(current.code)} 已启用 / Equipment ${str(current.code)} enabled`
          : `设备 ${str(current.code)} 已停用 / Equipment ${str(current.code)} disabled`,
        { code: str(current.code), enabled: Boolean(values.enabled) },
      );
    }
    return this.getEquipment(actor, id);
  }

  /** Engineer seats, their group and their current open load. */
  async listEngineers(actor: ServiceActor): Promise<Row[]> {
    await this.requirePageAccess(
      actor,
      SERVICE_PAGE_IDS.workOrders,
      'list engineers',
    );
    const members = await this.repo(MEMBER_COLLECTION).findMany({
      filter: asFilter((filter) => filter.string('kind').eq('engineer')),
      sort: (sort) => sort.field('id').asc(),
    });
    const refs = await this.referenceMaps(members);
    const openOrders = await this.repo(WORK_ORDER_COLLECTION).findMany({
      filter: asFilter((filter) =>
        filter.or([
          filter.string('status').eq('pending_processing'),
          filter.string('status').eq('processing'),
          filter.string('status').eq('pending_confirmation'),
        ]),
      ),
      limit: 1000,
    });
    const load = new Map<number, number>();
    for (const order of openOrders) {
      const assigneeId = num(order.assigneeId);
      if (assigneeId === null) continue;
      load.set(assigneeId, (load.get(assigneeId) ?? 0) + 1);
    }
    return members.map((member) => ({
      ...(this.memberView(member, refs.groups) as Row),
      openWorkOrders: load.get(num(member.id) ?? -1) ?? 0,
    }));
  }

  private async recordCatalogEvent(
    actor: ServiceActor,
    type: string,
    message: string,
    detail: Row,
  ): Promise<void> {
    // Catalogue changes are audit-trail only here; work-order history carries
    // its own event stream.
    this.logger.info(`service catalogue ${type}`, {
      actorId: actor.userId,
      message,
      ...detail,
    });
  }

  // -------------------------------------------------------------- work orders

  async listWorkOrders(
    actor: ServiceActor,
    params: {
      search?: string;
      status?: string;
      assigneeId?: number;
      customerId?: number;
      equipmentId?: number;
      priority?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ): Promise<ListResult<Row>> {
    await this.requirePageAccess(
      actor,
      SERVICE_PAGE_IDS.workOrders,
      'list work orders',
    );
    const { page, pageSize } = pageParams(params);
    const scope = await this.orderScope(actor);
    const search = str(params.search).trim();
    const filter = asFilter((builder) => {
      const nodes: FilterNode[] = [];
      if (scope) {
        nodes.push(scope(builder));
      }
      const status = str(params.status);
      if (status) {
        if (!WORK_ORDER_STATUSES.includes(status as WorkOrderStatus)) {
          throw badRequest(`Unknown work-order status "${status}"`);
        }
        nodes.push(builder.string('status').eq(status));
      }
      if (params.assigneeId !== undefined) {
        nodes.push(builder.number('assigneeId').eq(params.assigneeId));
      }
      if (params.customerId !== undefined) {
        nodes.push(builder.number('customerId').eq(params.customerId));
      }
      if (params.equipmentId !== undefined) {
        nodes.push(builder.number('equipmentId').eq(params.equipmentId));
      }
      if (params.priority !== undefined) {
        const priority = str(params.priority);
        if (priority) {
          if (!WORK_ORDER_PRIORITIES.includes(priority as WorkOrderPriority)) {
            throw badRequest(`Unknown work-order priority "${priority}"`);
          }
          nodes.push(builder.string('priority').eq(priority));
        }
      }
      if (search) {
        nodes.push(
          builder.or([
            builder.string('orderNo').includes(search, { mode: 'insensitive' }),
            builder.string('title').includes(search, { mode: 'insensitive' }),
            builder.string('problem').includes(search, { mode: 'insensitive' }),
          ]),
        );
      }
      return nodes.length === 0
        ? builder.and([])
        : nodes.length === 1
          ? nodes[0]
          : builder.and(nodes);
    });
    const repository = this.repo(WORK_ORDER_COLLECTION);
    const total = await repository.count({ filter });
    const rows =
      total === 0
        ? []
        : await repository.findMany({
            filter,
            sort: (sort) => [sort.field('id').desc()],
            limit: pageSize,
            offset: (page - 1) * pageSize,
          });
    return {
      rows: await this.buildOrderViews(actor, rows),
      total,
      page,
      pageSize,
    };
  }

  async getWorkOrder(actor: ServiceActor, id: number): Promise<Row> {
    const row = await this.assertWorkOrderRead(actor, id);
    if (!row) {
      // The same answer for "does not exist" and "not yours", so the endpoint
      // cannot be used to enumerate other people's work orders.
      throw notFound(`Work order #${id} was not found`);
    }
    const [view] = await this.buildOrderViews(actor, [row]);
    const internal =
      actor.roles.includes('manager') ||
      (actor.memberId !== null && num(row.assigneeId) === actor.memberId);
    const events = await this.repo(EVENT_COLLECTION).findMany({
      filter: (filter) =>
        (filter as unknown as FilterOps).number('workOrderId').eq(id),
      sort: (sort) => [sort.field('id').asc()],
      limit: 200,
    });
    view.events = events.map((event) => ({
      id: num(event.id),
      type: str(event.type) || null,
      message: internal
        ? str(event.message) || null
        : this.summarizeEvent(event),
      actorId: internal ? str(event.actorId) || null : null,
      runId: internal ? str(event.runId) || null : null,
      createdAt: isoDate(event.createdAt),
    }));
    view.attachments = await this.listAttachments(actor, id);
    view.shares = actor.roles.includes('manager')
      ? await this.listShares(actor, id)
      : [];
    return view;
  }

  /**
   * What an observer or temporary collaborator may read from the event stream:
   * the state and the outcome, never an internal note.
   */
  private summarizeEvent(event: Row): string | null {
    const type = str(event.type);
    const status = str((event.detail as Row | null)?.status);
    if (type === 'state_change' && status) {
      return `状态变更：${status} / Status changed to ${status}`;
    }
    if (type === 'accepted') {
      return '工单已受理 / Work order accepted';
    }
    if (type === 'resolved') {
      return '已提交处理结果 / Resolution submitted';
    }
    if (type === 'closed') {
      return '工单已关闭 / Work order closed';
    }
    if (type === 'created') {
      return '报修已登记 / Repair request registered';
    }
    return null;
  }

  async createWorkOrder(actor: ServiceActor, input: Row): Promise<Row> {
    await this.requireManager(
      actor,
      SERVICE_PAGE_IDS.workOrders,
      'register a repair request',
    );
    const title = str(input.title).trim();
    const problem = str(input.problem).trim();
    if (title.length === 0) {
      throw badRequest('Repair title is required');
    }
    if (problem.length === 0) {
      throw badRequest('Problem description is required');
    }
    const customerId = recordId(input.customerId);
    if (customerId === null) {
      throw badRequest('Customer is required');
    }
    await this.mustRow(CUSTOMER_COLLECTION, customerId, 'Customer');
    const equipmentId = recordId(input.equipmentId);
    if (equipmentId === null) {
      throw badRequest('Equipment is required');
    }
    const equipment = await this.mustRow(
      EQUIPMENT_COLLECTION,
      equipmentId,
      'Equipment',
    );
    // The equipment must belong to the chosen customer.
    if (num(equipment.customerId) !== customerId) {
      throw badRequest(
        'The selected equipment does not belong to the selected customer',
      );
    }
    // A new repair request cannot target retired equipment. Work orders that
    // already reference it stay readable.
    if (!bool(equipment.enabled)) {
      throw badRequest(
        `Equipment ${str(equipment.code)} is disabled and cannot receive new repair requests`,
      );
    }
    const assigneeId = recordId(input.assigneeId);
    if (assigneeId === null) {
      throw badRequest('An assigned engineer is required');
    }
    const assignee = await this.mustRow(
      MEMBER_COLLECTION,
      assigneeId,
      'Engineer',
    );
    if (str(assignee.kind) !== 'engineer') {
      throw badRequest('Work orders can only be assigned to an engineer');
    }
    const priority = str(input.priority) || 'normal';
    if (!WORK_ORDER_PRIORITIES.includes(priority as WorkOrderPriority)) {
      throw badRequest(`Unknown priority "${priority}"`);
    }
    const order = await this.createOrderRow({
      title,
      problem,
      customerId,
      equipmentId,
      assigneeId,
      priority,
      deadline: toDate(input.deadline),
      confidential: Boolean(input.confidential),
      source: 'manual',
      createdById: actor.userId,
    });
    await this.insertEvent(num(order.id) as number, 'created', {
      actorId: actor.userId,
      message: '主管登记报修 / Supervisor registered the repair request',
      detail: { priority, confidential: Boolean(input.confidential) },
    });
    return this.getWorkOrder(actor, num(order.id) as number);
  }

  private async createOrderRow(input: {
    title: string;
    problem: string;
    customerId: number;
    equipmentId: number;
    assigneeId: number;
    priority: string;
    deadline: Date | null;
    confidential: boolean;
    source: 'manual' | 'external';
    createdById: string;
  }): Promise<Row> {
    const prefix = this.yearPrefix('WO-');
    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const orderNo = await this.nextNumber(
        WORK_ORDER_COLLECTION,
        'orderNo',
        prefix,
        4,
      );
      const now = new Date();
      try {
        const created = await this.repo(WORK_ORDER_COLLECTION).createOne({
          values: {
            orderNo,
            title: input.title,
            problem: input.problem,
            priority: input.priority,
            status: 'pending_acceptance',
            customerId: input.customerId,
            equipmentId: input.equipmentId,
            assigneeId: input.assigneeId,
            confidential: input.confidential,
            deadline: input.deadline,
            source: input.source,
            createdById: input.createdById,
            rejectCount: 0,
            acceptNoteStatus: 'pending',
            createdAt: now,
            updatedAt: now,
          },
        });
        return created.record;
      } catch (error) {
        lastError = error;
      }
    }
    throw conflict(
      `Could not allocate a work-order number: ${errorMessage(lastError)}`,
    );
  }

  /** One compare-and-set; a lost race is reported as a conflict, not retried. */
  private async transition(
    id: number,
    expected: WorkOrderStatus,
    next: WorkOrderStatus,
    values: Row = {},
  ): Promise<void> {
    const result = await this.repo(WORK_ORDER_COLLECTION).updateMany({
      filter: asFilter((filter) =>
        filter.and([
          filter.number('id').eq(id),
          filter.string('status').eq(expected),
        ]),
      ),
      values: { ...values, status: next, updatedAt: new Date() },
    });
    if (result.updatedCount !== 1) {
      throw conflict(`Work order #${id} is no longer in status "${expected}"`);
    }
  }

  private async recordStateChange(
    id: number,
    actor: ServiceActor | null,
    from: WorkOrderStatus,
    to: WorkOrderStatus,
    message: string,
  ): Promise<void> {
    await this.insertEvent(id, 'state_change', {
      actorId: actor ? actor.userId : null,
      message,
      detail: { from, to, status: to },
    });
  }

  /**
   * Supervisor accepts a repair request.
   *
   * The state change and the acceptance note are one operation: the note is
   * written here, before the durable Workflow record is triggered, so a
   * Workflow outage can never leave the order accepted without its note. The
   * workflow is triggered under an event key derived from the order. Repeating
   * the call — a double click, a retried request, the same trigger delivered
   * twice — finds the recorded acceptance event and replays the stored result
   * instead of advancing anything or sending a second message.
   */
  async acceptWorkOrder(actor: ServiceActor, id: number): Promise<Row> {
    await this.requireManager(
      actor,
      SERVICE_PAGE_IDS.workOrders,
      'accept a work order',
    );
    const row = await this.mustRow(WORK_ORDER_COLLECTION, id, 'Work order');
    const eventKey = `accept:${id}`;
    const existing = await this.repo(EVENT_COLLECTION).findOne({
      filter: (filter) =>
        (filter as unknown as FilterOps).string('eventKey').eq(eventKey),
    });
    if (existing) {
      return this.getWorkOrder(actor, id);
    }
    if (str(row.status) !== 'pending_acceptance') {
      throw conflict(
        `Work order ${str(row.orderNo)} is in status "${str(row.status)}" and cannot be accepted`,
      );
    }
    await this.transition(id, 'pending_acceptance', 'pending_processing', {
      acceptedAt: new Date(),
    });
    await this.insertEvent(id, 'accepted', {
      eventKey,
      actorId: actor.userId,
      message: '主管已受理工单 / Supervisor accepted the work order',
      detail: { priority: str(row.priority) },
    });
    await this.recordStateChange(
      id,
      actor,
      'pending_acceptance',
      'pending_processing',
      '状态：待受理 → 待处理 / Status: pending acceptance → pending processing',
    );
    await this.runAcceptance(id);
    return this.getWorkOrder(actor, id);
  }

  /**
   * Retry acceptance for an order whose automatic acceptance has not finished.
   *
   * The supervisor's acceptance is idempotent, so a retry never rewrites the
   * note or re-notifies. What it does do is start a *new* durable Workflow run:
   * the plugin deduplicates a trigger by its event key, and the first attempt
   * already persisted `acceptance:<id>`, so a retry deliberately uses a fresh
   * key to get a real second attempt against the definition this build
   * deployed.
   */
  async retryAcceptance(actor: ServiceActor, id: number): Promise<Row> {
    await this.requireManager(
      actor,
      SERVICE_PAGE_IDS.workOrders,
      'retry the acceptance workflow',
    );
    const row = await this.mustRow(WORK_ORDER_COLLECTION, id, 'Work order');
    if (str(row.status) === 'pending_acceptance') {
      throw conflict(
        'The work order has not been accepted yet; accept it instead of retrying',
      );
    }
    const eventKey = `acceptance:${id}:retry:${Date.now()}`;
    await this.insertEvent(id, 'acceptance_retried', {
      eventKey: `acceptance-retried:${eventKey}`,
      actorId: actor.userId,
      message:
        '主管重新触发自动受理 / Supervisor retried the automatic acceptance',
      detail: { workflow: ACCEPTANCE_WORKFLOW_KEY },
    });
    await this.runAcceptance(id, { eventKey });
    return this.getWorkOrder(actor, id);
  }

  /**
   * The acceptance business effect: write the acceptance note and notify the
   * assigned engineer.
   *
   * The application calls it as part of the supervisor's acceptance, before the
   * Workflow is triggered, because a Workflow `run` module executes from the
   * immutable Artifact copy in production and cannot resolve an
   * application-owned service. This is the only place the acceptance becomes
   * business state. It is idempotent on `acceptance-completed:<id>` so a retried
   * request, a replayed trigger or two branches converging write once. It takes
   * no actor because a trigger has no signed-in user; the supervisor's
   * acceptance already happened in `acceptWorkOrder`.
   */
  async completeAcceptance(
    id: number,
    input: { note?: unknown; runId?: unknown } = {},
  ): Promise<Row> {
    const note = str(input.note).trim();
    if (note.length === 0) {
      throw badRequest('An acceptance note is required');
    }
    const row = await this.mustRow(WORK_ORDER_COLLECTION, id, 'Work order');
    const eventKey = `acceptance-completed:${id}`;
    const existing = await this.repo(EVENT_COLLECTION).findOne({
      filter: (filter) =>
        (filter as unknown as FilterOps).string('eventKey').eq(eventKey),
    });
    if (existing) {
      return {
        workOrderId: id,
        orderNo: str(row.orderNo) || null,
        note: str(row.acceptanceNote) || note,
        status: 'accepted',
        notified: false,
        alreadyDone: true,
      };
    }
    const runId =
      input.runId === undefined
        ? str(row.acceptanceRunId) || null
        : str(input.runId) || null;
    await this.repo(WORK_ORDER_COLLECTION).updateMany({
      filter: (filter) => (filter as unknown as FilterOps).number('id').eq(id),
      values: {
        acceptanceNote: note,
        acceptNoteStatus: 'accepted',
        acceptanceRunId: runId,
        updatedAt: new Date(),
      },
    });
    await this.insertEvent(id, 'acceptance_completed', {
      eventKey,
      message: `自动受理完成：${note} / Automatic acceptance completed`,
      detail: { note },
      runId,
    });
    const assigneeId = num(row.assigneeId);
    const assignee =
      assigneeId === null
        ? null
        : await this.repo(MEMBER_COLLECTION).findOne({
            filter: (filter) =>
              (filter as unknown as FilterOps).number('id').eq(assigneeId),
          });
    const notified = Boolean(assignee && str(assignee.userId));
    await this.notifyAssignee(assigneeId, {
      idempotencyKey: `work-order.accepted:${id}`,
      title: `工单已受理 ${str(row.orderNo)} / Work order accepted`,
      body: `${note} / ${str(row.title)}`,
      path: `/service/work-orders/${id}`,
      sourceType: 'service-work-order',
      referenceId: String(id),
    });
    return {
      workOrderId: id,
      orderNo: str(row.orderNo) || null,
      note,
      status: 'accepted',
      notified,
      alreadyDone: false,
    };
  }

  /**
   * Trigger the source-managed acceptance workflow and record what happened.
   *
   * The business effect is written by `completeAcceptance` first, so the note
   * and notification do not depend on the Workflow being reachable. What
   * remains here is the durable record: a trigger that is skipped or throws is
   * kept as an event so an operator can see it and retry, and the state change
   * already made by the caller is never rolled back. Because the effect is
   * already committed, a workflow failure never downgrades `acceptNoteStatus`.
   */
  private async runAcceptance(
    id: number,
    options: { eventKey?: string } = {},
  ): Promise<{
    status: 'accepted' | 'skipped' | 'unavailable';
    reason?: string;
  }> {
    const row = await this.mustRow(WORK_ORDER_COLLECTION, id, 'Work order');
    const input = await this.acceptanceInput(id, row);
    try {
      await this.completeAcceptance(id, {
        note: acceptanceNote(str(input.priority), input),
      });
    } catch (error) {
      const reason = errorMessage(error);
      await this.recordAcceptanceFailure(id, reason);
      this.logger.error(
        `Acceptance could not be recorded for work order #${id}: ${reason}`,
      );
      return { status: 'skipped', reason };
    }
    const workflow = this.deps.workflow;
    if (!workflow) {
      return { status: 'accepted' };
    }
    let receipt;
    try {
      receipt = await workflow.trigger(ACCEPTANCE_WORKFLOW_KEY, input, {
        eventKey: options.eventKey ?? `acceptance:${id}`,
        sourceType: 'service-work-order',
        sourceId: String(id),
        // The supervisor's acceptance is a business fact that already
        // happened; it must not depend on the definition staying enabled, so
        // the trigger bypasses the enabled-state check.
        force: true,
      });
    } catch (error) {
      const reason = errorMessage(error);
      await this.recordAcceptanceTriggerFailure(id, reason);
      this.logger.error(
        `Acceptance workflow ${ACCEPTANCE_WORKFLOW_KEY} failed for work order #${id}: ${reason}`,
      );
      return { status: 'accepted', reason };
    }
    if (receipt.status === 'accepted') {
      const runId = receipt.runId === undefined ? null : String(receipt.runId);
      await this.repo(WORK_ORDER_COLLECTION).updateMany({
        filter: (filter) =>
          (filter as unknown as FilterOps).number('id').eq(id),
        values: { acceptanceRunId: runId, updatedAt: new Date() },
      });
      return { status: 'accepted' };
    }
    const reason = receipt.reason ?? 'unknown';
    await this.recordAcceptanceTriggerFailure(id, reason);
    return { status: 'accepted', reason };
  }

  /**
   * Record that the acceptance was written but the Workflow record could not be
   * produced. The note is already committed, so this never downgrades
   * `acceptNoteStatus`; it leaves a visible event so an operator can retry.
   */
  private async recordAcceptanceTriggerFailure(
    id: number,
    reason: string,
  ): Promise<void> {
    await this.insertEvent(id, 'acceptance_failed', {
      eventKey: `acceptance-failed:${id}:${reason}`,
      message: `自动受理已记录，但流程未能启动：${reason} / Acceptance recorded, but the workflow could not start: ${reason}`,
      detail: { reason, workflow: ACCEPTANCE_WORKFLOW_KEY },
    });
  }

  private async recordAcceptanceFailure(
    id: number,
    reason: string,
  ): Promise<void> {
    await this.repo(WORK_ORDER_COLLECTION).updateMany({
      filter: (filter) => (filter as unknown as FilterOps).number('id').eq(id),
      values: { acceptNoteStatus: 'failed', updatedAt: new Date() },
    });
    await this.insertEvent(id, 'acceptance_failed', {
      eventKey: `acceptance-failed:${id}:${reason}`,
      message: `自动受理未完成：${reason} / Automatic acceptance did not complete: ${reason}`,
      detail: { reason, workflow: ACCEPTANCE_WORKFLOW_KEY },
    });
  }

  private async acceptanceInput(id: number, row: Row): Promise<Row> {
    const refs = await this.referenceMaps([row]);
    const customer = refs.customers.get(num(row.customerId) ?? -1);
    const equipment = refs.equipment.get(num(row.equipmentId) ?? -1);
    const assignee = refs.members.get(num(row.assigneeId) ?? -1);
    return {
      workOrderId: id,
      orderNo: str(row.orderNo),
      title: str(row.title),
      priority: str(row.priority) || 'normal',
      assigneeId: num(row.assigneeId),
      assigneeUserId: assignee ? str(assignee.userId) || null : null,
      assigneeName: assignee ? str(assignee.name) || null : null,
      customerName: customer ? str(customer.name) || null : null,
      equipmentName: equipment ? str(equipment.name) || null : null,
      deadline: isoDate(row.deadline),
    };
  }

  /** The assignee (or the supervisor) starts the repair. */
  async startWorkOrder(actor: ServiceActor, id: number): Promise<Row> {
    const row = await this.mustRow(WORK_ORDER_COLLECTION, id, 'Work order');
    await this.assertHandler(actor, row, 'start work');
    if (str(row.status) !== 'pending_processing') {
      throw conflict(
        `Work order ${str(row.orderNo)} is in status "${str(row.status)}" and cannot be started`,
      );
    }
    await this.transition(id, 'pending_processing', 'processing', {
      processingStartedAt: new Date(),
    });
    await this.insertEvent(id, 'processing_started', {
      actorId: actor.userId,
      message: '开始处理 / Processing started',
    });
    await this.recordStateChange(
      id,
      actor,
      'pending_processing',
      'processing',
      '状态：待处理 → 处理中 / Status: pending processing → processing',
    );
    return this.getWorkOrder(actor, id);
  }

  /** The assignee submits a resolution for the supervisor to confirm. */
  async submitResolution(
    actor: ServiceActor,
    id: number,
    resolution: string,
  ): Promise<Row> {
    const text = str(resolution).trim();
    if (text.length === 0) {
      throw badRequest('A resolution is required');
    }
    const row = await this.mustRow(WORK_ORDER_COLLECTION, id, 'Work order');
    await this.assertHandler(actor, row, 'submit a resolution');
    if (str(row.status) !== 'processing') {
      throw conflict(
        `Work order ${str(row.orderNo)} is in status "${str(row.status)}" and cannot receive a resolution`,
      );
    }
    await this.transition(id, 'processing', 'pending_confirmation', {
      resolution: text,
      resolutionAt: new Date(),
      resolutionSubmittedById: actor.userId,
    });
    await this.insertEvent(id, 'resolved', {
      actorId: actor.userId,
      message: '已提交处理结果 / Resolution submitted',
      detail: { resolution: text },
    });
    await this.recordStateChange(
      id,
      actor,
      'processing',
      'pending_confirmation',
      '状态：处理中 → 待确认 / Status: processing → pending confirmation',
    );
    // The supervisor owns the next step, so the submission has to reach them.
    // The reject count keeps the key stable within one cycle but lets a fresh
    // submission after a rejection notify the supervisor again.
    await this.notifyManagers({
      idempotencyKey: `work-order.resolution-submitted:${id}:${num(row.rejectCount) ?? 0}`,
      title: `工单待确认 ${str(row.orderNo)} / Work order awaiting confirmation`,
      body: text,
      path: `/service/work-orders/${id}`,
      sourceType: 'service-work-order',
      referenceId: String(id),
    });
    return this.getWorkOrder(actor, id);
  }

  /** Supervisor confirms and closes; closing makes the order read-only. */
  async closeWorkOrder(
    actor: ServiceActor,
    id: number,
    note = '',
  ): Promise<Row> {
    await this.requireManager(
      actor,
      SERVICE_PAGE_IDS.workOrders,
      'close a work order',
    );
    const row = await this.mustRow(WORK_ORDER_COLLECTION, id, 'Work order');
    if (str(row.status) !== 'pending_confirmation') {
      throw conflict(
        `Work order ${str(row.orderNo)} is in status "${str(row.status)}" and cannot be closed`,
      );
    }
    const text = str(note).trim();
    await this.transition(id, 'pending_confirmation', 'closed', {
      closedAt: new Date(),
      closedById: actor.userId,
    });
    await this.insertEvent(id, 'closed', {
      actorId: actor.userId,
      message: text
        ? `主管已关闭工单：${text} / Supervisor closed the work order: ${text}`
        : '主管已关闭工单 / Supervisor closed the work order',
      detail: { note: text || null },
    });
    await this.recordStateChange(
      id,
      actor,
      'pending_confirmation',
      'closed',
      '状态：待确认 → 已关闭 / Status: pending confirmation → closed',
    );
    return this.getWorkOrder(actor, id);
  }

  /** Supervisor rejects the resolution and sends the order back to processing. */
  async rejectWorkOrder(
    actor: ServiceActor,
    id: number,
    reason: string,
  ): Promise<Row> {
    await this.requireManager(
      actor,
      SERVICE_PAGE_IDS.workOrders,
      'reject a resolution',
    );
    const text = str(reason).trim();
    if (text.length === 0) {
      throw badRequest('A rejection reason is required');
    }
    const row = await this.mustRow(WORK_ORDER_COLLECTION, id, 'Work order');
    if (str(row.status) !== 'pending_confirmation') {
      throw conflict(
        `Work order ${str(row.orderNo)} is in status "${str(row.status)}" and cannot be rejected`,
      );
    }
    await this.transition(id, 'pending_confirmation', 'processing', {
      resolution: null,
      resolutionAt: null,
      lastRejectReason: text,
      rejectCount: (num(row.rejectCount) ?? 0) + 1,
    });
    await this.insertEvent(id, 'rejected', {
      actorId: actor.userId,
      message: `处理结果被退回：${text} / Resolution rejected: ${text}`,
      detail: { reason: text },
    });
    await this.recordStateChange(
      id,
      actor,
      'pending_confirmation',
      'processing',
      '状态：待确认 → 处理中（已退回）/ Status: pending confirmation → processing (rejected)',
    );
    // Rejecting sends the order back to its engineer, so they are told why.
    await this.notifyAssignee(num(row.assigneeId), {
      idempotencyKey: `work-order.rejected:${id}:${(num(row.rejectCount) ?? 0) + 1}`,
      title: `工单已退回 ${str(row.orderNo)} / Work order returned`,
      body: text,
      path: `/service/work-orders/${id}`,
      sourceType: 'service-work-order',
      referenceId: String(id),
    });
    return this.getWorkOrder(actor, id);
  }

  private async assertHandler(
    actor: ServiceActor,
    row: Row,
    operation: string,
  ): Promise<void> {
    const isManager = actor.roles.includes('manager');
    const isAssignee =
      actor.memberId !== null && num(row.assigneeId) === actor.memberId;
    if (!isManager && !isAssignee) {
      throw notFound(`Work order #${num(row.id)} was not found`);
    }
    if (str(row.status) === 'closed' && !isManager) {
      throw conflict('A closed work order is read-only');
    }
    await this.requirePageAccess(actor, SERVICE_PAGE_IDS.workOrders, operation);
  }

  // ------------------------------------------------------- temporary sharing

  /**
   * Ordinary work orders a supervisor made visible to one other engineer.
   *
   * A confidential order can never be shared this way: the share is refused at
   * creation, and a confidential order never appears through the share scope
   * because the sharing engineer was not its assignee.
   */
  async listShares(actor: ServiceActor, workOrderId: number): Promise<Row[]> {
    await this.requireManager(
      actor,
      SERVICE_PAGE_IDS.workOrders,
      'list work-order shares',
    );
    const shares = await this.repo(SHARE_COLLECTION).findMany({
      filter: (filter) =>
        (filter as unknown as FilterOps).number('workOrderId').eq(workOrderId),
      sort: (sort) => [sort.field('id').asc()],
    });
    const refs = await this.referenceMaps(shares);
    return shares.map((share) => ({
      id: num(share.id),
      workOrderId: num(share.workOrderId),
      engineerMemberId: num(share.engineerMemberId),
      engineer: this.memberView(
        refs.members.get(num(share.engineerMemberId) ?? -1),
        refs.groups,
      ),
      grantedAt: isoDate(share.grantedAt),
      grantedById: str(share.grantedById) || null,
      note: str(share.note) || null,
      revokedAt: isoDate(share.revokedAt),
      active: !str(share.revokedAt),
    }));
  }

  async createShare(
    actor: ServiceActor,
    workOrderId: number,
    input: { engineerMemberId?: unknown; note?: unknown },
  ): Promise<Row> {
    await this.requireManager(
      actor,
      SERVICE_PAGE_IDS.workOrders,
      'share a work order',
    );
    const order = await this.mustRow(
      WORK_ORDER_COLLECTION,
      workOrderId,
      'Work order',
    );
    if (bool(order.confidential)) {
      throw conflict(
        'A confidential work order cannot be shared through temporary collaboration',
      );
    }
    if (str(order.status) === 'closed') {
      throw conflict('A closed work order cannot be shared');
    }
    const engineerMemberId = recordId(input.engineerMemberId);
    if (engineerMemberId === null) {
      throw badRequest('An engineer is required');
    }
    const engineer = await this.mustRow(
      MEMBER_COLLECTION,
      engineerMemberId,
      'Engineer',
    );
    if (str(engineer.kind) !== 'engineer') {
      throw badRequest('Work orders can only be shared with an engineer');
    }
    if (num(order.assigneeId) === engineerMemberId) {
      throw badRequest(
        'The assignee already has full access to this work order',
      );
    }
    const existing = await this.repo(SHARE_COLLECTION).findOne({
      filter: asFilter((filter) =>
        filter.and([
          filter.number('workOrderId').eq(workOrderId),
          filter.number('engineerMemberId').eq(engineerMemberId),
        ]),
      ),
    });
    const note = str(input.note).trim() || null;
    const now = new Date();
    if (existing && !str(existing.revokedAt)) {
      return this.getWorkOrder(actor, workOrderId);
    }
    if (existing) {
      await this.repo(SHARE_COLLECTION).updateMany({
        filter: asFilter((filter) =>
          filter.number('id').eq(num(existing.id) as number),
        ),
        values: {
          grantedById: actor.userId,
          grantedAt: now,
          revokedAt: null,
          note,
        },
      });
    } else {
      await this.repo(SHARE_COLLECTION).createOne({
        values: {
          workOrderId,
          engineerMemberId,
          grantedById: actor.userId,
          grantedAt: now,
          note,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
    await this.insertEvent(workOrderId, 'share_granted', {
      actorId: actor.userId,
      message: `临时共享给 ${str(engineer.name)} / Temporarily shared with ${str(engineer.name)}`,
      detail: { engineerMemberId, note },
    });
    return this.getWorkOrder(actor, workOrderId);
  }

  async revokeShare(
    actor: ServiceActor,
    workOrderId: number,
    shareId: number,
  ): Promise<Row> {
    await this.requireManager(
      actor,
      SERVICE_PAGE_IDS.workOrders,
      'revoke a work-order share',
    );
    const share = await this.repo(SHARE_COLLECTION).findOne({
      filter: asFilter((filter) =>
        filter.and([
          filter.number('id').eq(shareId),
          filter.number('workOrderId').eq(workOrderId),
        ]),
      ),
    });
    if (!share) {
      throw notFound(
        `Share #${shareId} was not found on work order #${workOrderId}`,
      );
    }
    if (str(share.revokedAt)) {
      return this.getWorkOrder(actor, workOrderId);
    }
    const now = new Date();
    await this.repo(SHARE_COLLECTION).updateMany({
      filter: asFilter((filter) =>
        filter.and([
          filter.number('id').eq(shareId),
          filter.date('revokedAt').empty(),
        ]),
      ),
      values: { revokedAt: now, updatedAt: now },
    });
    const engineer = await this.mustRow(
      MEMBER_COLLECTION,
      num(share.engineerMemberId) as number,
      'Engineer',
    );
    await this.insertEvent(workOrderId, 'share_revoked', {
      actorId: actor.userId,
      message: `已撤销对 ${str(engineer.name)} 的临时共享 / Temporary share to ${str(engineer.name)} revoked`,
      detail: { engineerMemberId: num(share.engineerMemberId) },
    });
    return this.getWorkOrder(actor, workOrderId);
  }

  // -------------------------------------------------------------- inspections

  async listInspections(
    actor: ServiceActor,
    params: {
      status?: string;
      engineerMemberId?: number;
      equipmentId?: number;
      page?: number;
      pageSize?: number;
    } = {},
  ): Promise<ListResult<Row>> {
    await this.requirePageAccess(
      actor,
      SERVICE_PAGE_IDS.inspections,
      'list inspection tasks',
    );
    const { page, pageSize } = pageParams(params, 50);
    const isManager = actor.roles.includes('manager');
    const filter = asFilter((builder) => {
      const nodes: FilterNode[] = [];
      if (!isManager) {
        nodes.push(builder.number('engineerMemberId').eq(actor.memberId ?? -1));
      }
      const status = str(params.status);
      if (status) {
        if (!INSPECTION_STATUSES.includes(status as InspectionStatus)) {
          throw badRequest(`Unknown inspection status "${status}"`);
        }
        nodes.push(builder.string('status').eq(status));
      }
      if (params.engineerMemberId !== undefined) {
        nodes.push(
          builder.number('engineerMemberId').eq(params.engineerMemberId),
        );
      }
      if (params.equipmentId !== undefined) {
        nodes.push(builder.number('equipmentId').eq(params.equipmentId));
      }
      return nodes.length === 0
        ? builder.and([])
        : nodes.length === 1
          ? nodes[0]
          : builder.and(nodes);
    });
    const repository = this.repo(INSPECTION_COLLECTION);
    const total = await repository.count({ filter });
    const rows =
      total === 0
        ? []
        : await repository.findMany({
            filter,
            sort: (sort) => [
              sort.field('planDate').asc(),
              sort.field('id').asc(),
            ],
            limit: pageSize,
            offset: (page - 1) * pageSize,
          });
    return {
      rows: await this.inspectionViews(rows),
      total,
      page,
      pageSize,
    };
  }

  private async inspectionViews(rows: readonly Row[]): Promise<Row[]> {
    const refs = await this.referenceMaps(rows);
    return rows.map((row) => {
      const equipment = refs.equipment.get(num(row.equipmentId) ?? -1);
      const customer = refs.customers.get(num(row.customerId) ?? -1);
      return {
        id: num(row.id),
        taskNo: str(row.taskNo) || null,
        status: str(row.status) || null,
        planDate: isoDate(row.planDate),
        dueAt: isoDate(row.dueAt),
        completedAt: isoDate(row.completedAt),
        result: str(row.result) || null,
        autoGenerated: str(row.occurrenceKey).startsWith('auto:'),
        occurrenceKey: str(row.occurrenceKey) || null,
        equipment: equipment
          ? {
              id: num(equipment.id),
              code: str(equipment.code) || null,
              name: str(equipment.name) || null,
              model: str(equipment.model) || null,
              nextInspectionDate: isoDate(equipment.nextInspectionDate),
            }
          : null,
        customer: customer
          ? { id: num(customer.id), name: str(customer.name) || null }
          : null,
        engineer: this.memberView(
          refs.members.get(num(row.engineerMemberId) ?? -1),
          refs.groups,
        ),
        createdAt: isoDate(row.createdAt),
      };
    });
  }

  async startInspection(actor: ServiceActor, id: number): Promise<Row> {
    await this.requirePageAccess(
      actor,
      SERVICE_PAGE_IDS.inspections,
      'start an inspection',
    );
    const row = await this.mustRow(
      INSPECTION_COLLECTION,
      id,
      'Inspection task',
    );
    this.assertInspectionHandler(actor, row);
    if (!['pending', 'overdue'].includes(str(row.status))) {
      throw conflict(
        `Inspection task ${str(row.taskNo)} is in status "${str(row.status)}" and cannot be started`,
      );
    }
    const result = await this.repo(INSPECTION_COLLECTION).updateMany({
      filter: asFilter((filter) =>
        filter.and([
          filter.number('id').eq(id),
          filter.or([
            filter.string('status').eq('pending'),
            filter.string('status').eq('overdue'),
          ]),
        ]),
      ),
      values: { status: 'in_progress', updatedAt: new Date() },
    });
    if (result.updatedCount !== 1) {
      throw conflict(`Inspection task #${id} was changed by another request`);
    }
    return (
      await this.inspectionViews([
        await this.mustRow(INSPECTION_COLLECTION, id, 'Inspection task'),
      ])
    )[0];
  }

  async completeInspection(
    actor: ServiceActor,
    id: number,
    result: string,
  ): Promise<Row> {
    await this.requirePageAccess(
      actor,
      SERVICE_PAGE_IDS.inspections,
      'complete an inspection',
    );
    const text = str(result).trim();
    if (text.length === 0) {
      throw badRequest('An inspection result is required');
    }
    const row = await this.mustRow(
      INSPECTION_COLLECTION,
      id,
      'Inspection task',
    );
    this.assertInspectionHandler(actor, row);
    if (str(row.status) === 'done') {
      throw conflict(`Inspection task ${str(row.taskNo)} is already completed`);
    }
    const updated = await this.repo(INSPECTION_COLLECTION).updateMany({
      filter: asFilter((filter) =>
        filter.and([
          filter.number('id').eq(id),
          filter.string('status').eq(str(row.status)),
        ]),
      ),
      values: {
        status: 'done',
        result: text,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    if (updated.updatedCount !== 1) {
      throw conflict(`Inspection task #${id} was changed by another request`);
    }
    return (
      await this.inspectionViews([
        await this.mustRow(INSPECTION_COLLECTION, id, 'Inspection task'),
      ])
    )[0];
  }

  private assertInspectionHandler(actor: ServiceActor, row: Row): void {
    const isManager = actor.roles.includes('manager');
    const isOwner =
      actor.memberId !== null && num(row.engineerMemberId) === actor.memberId;
    if (!isManager && !isOwner) {
      throw notFound(`Inspection task #${num(row.id)} was not found`);
    }
  }

  /**
   * The daily Scheduler target.
   *
   * Every enabled device whose supervisor-maintained next-inspection date has
   * arrived gets exactly one task for that plan date. The occurrence key makes a
   * second run on the same day — a restart, a retry, a reconciliation — a no-op
   * instead of a second task.
   */
  /**
   * The execution plans behind inspections and reminders, as the Scheduler
   * holds them.
   *
   * A supervisor has to be able to read the plan's name, timezone, on/off state
   * and what its executions actually did, so this reads the Scheduler instead of
   * restating the definition: the title, the cron and the timezone come from the
   * materialized plan and the outcomes are the Scheduler's own occurrences.
   * `registered` is false when the Scheduler has no plan under the key, so the
   * page can say the plan is missing rather than showing an empty row that reads
   * as "nothing is scheduled".
   */
  async getSchedules(
    actor: ServiceActor,
  ): Promise<{ jobs: ScheduleOverview[] }> {
    await this.requireManager(
      actor,
      SERVICE_PAGE_IDS.inspections,
      'view the execution schedules',
    );
    const scheduler = this.deps.scheduler;
    const plans = scheduler ? await scheduler.list() : [];
    const jobs: ScheduleOverview[] = [];
    for (const job of Object.keys(SCHEDULE_KEYS) as ScheduledJob[]) {
      const plan = plans.find((item) => item.job === job);
      const occurrences =
        scheduler && plan ? await scheduler.occurrences(plan.scheduleId) : [];
      jobs.push({
        job,
        registered: Boolean(plan),
        scheduleId: plan?.scheduleId ?? '',
        title: plan?.title ?? '',
        cron: plan?.cron ?? '',
        timezone: plan?.timezone ?? '',
        enabled: plan?.enabled ?? false,
        runCount: plan?.runCount ?? 0,
        completedCount: plan?.completedCount ?? 0,
        nextRunAt: plan?.nextRunAt ?? null,
        lastRunAt: plan?.lastRunAt ?? null,
        occurrences: occurrences.map((item) => ({
          id: item.id,
          status: item.status,
          reason: item.reason ?? null,
          executionCount: item.executionCount,
          startedAt: item.startedAt,
          finishedAt: item.finishedAt ?? null,
          result: item.result ?? null,
        })),
      });
    }
    return { jobs };
  }

  /**
   * Run one of the plans now, on a supervisor's request.
   *
   * The request goes through the plan's own registration, so the run produces
   * the same occurrence a scheduled firing would and appears in the same
   * execution records; the receipt says whether it succeeded, failed, or had not
   * finished when the request returned. Asking twice creates two occurrences but
   * no duplicate business rows, because the operations the targets call are
   * idempotent per device, plan date and task.
   *
   * Without the Scheduler the same operation runs directly and the receipt says
   * `direct`: that is real work, but it is not a scheduled execution and the page
   * must not present it as one.
   */
  async runScheduledJob(
    actor: ServiceActor,
    job: string,
  ): Promise<ScheduledJobRunResult> {
    if (!isScheduledJob(job)) {
      throw badRequest(`Unknown scheduled job "${job}"`);
    }
    await this.requireManager(
      actor,
      SCHEDULE_PAGES[job],
      SCHEDULE_OPERATIONS[job],
    );
    const receipt = this.deps.scheduler
      ? await this.deps.scheduler.run(job)
      : null;
    if (receipt) {
      return {
        job,
        mode: 'scheduler',
        scheduleId: receipt.scheduleId,
        title: receipt.title,
        timezone: receipt.timezone,
        enabled: receipt.enabled,
        status: receipt.status,
        reason: receipt.reason ?? null,
        result: receipt.result ?? null,
      };
    }
    const result =
      job === 'daily-inspections'
        ? await this.generateDailyInspections({})
        : await this.sendOverdueReminders({});
    return {
      job,
      mode: 'direct',
      scheduleId: '',
      title: '',
      timezone: '',
      enabled: false,
      status: 'succeeded',
      reason: null,
      result,
    };
  }

  async generateDailyInspections(
    options: { planDate?: string } = {},
  ): Promise<Row> {
    const planDate = options.planDate ?? shanghaiDate(new Date());
    const equipment = await this.repo(EQUIPMENT_COLLECTION).findMany({
      filter: asFilter((filter) =>
        filter.and([
          filter.boolean('enabled').isTrue(),
          filter.date('nextInspectionDate').notEmpty(),
          // `nextInspectionDate` is a date, so the bound is a date too. The
          // task list is "everything due by the plan date": a datetime bound
          // would be refused, and a strict `before` would skip a device due
          // exactly today.
          filter.date('nextInspectionDate').notAfter(planDate),
        ]),
      ),
      sort: (sort) => sort.field('code').asc(),
      limit: 1000,
    });
    const dueAt = new Date(`${planDate}T18:00:00+08:00`);
    let created = 0;
    let skipped = 0;
    const unassigned: string[] = [];
    const notes: string[] = [];
    for (const item of equipment) {
      const equipmentId = num(item.id);
      if (equipmentId === null) continue;
      const occurrenceKey = `auto:${equipmentId}:${planDate}`;
      const existing = await this.repo(INSPECTION_COLLECTION).findOne({
        filter: asFilter((filter) =>
          filter.string('occurrenceKey').eq(occurrenceKey),
        ),
      });
      if (existing) {
        skipped += 1;
        continue;
      }
      const engineerMemberId = num(item.engineerMemberId);
      if (engineerMemberId === null) {
        // The task table requires an accountable engineer; rather than invent
        // one, the run reports the device as unschedulable so the supervisor can
        // assign it and a later run picks it up.
        unassigned.push(str(item.code));
        skipped += 1;
        continue;
      }
      const taskNo = await this.nextNumber(
        INSPECTION_COLLECTION,
        'taskNo',
        this.yearPrefix('INSP-'),
        4,
      );
      const now = new Date();
      const createdTask = await this.repo(INSPECTION_COLLECTION).createOne({
        values: {
          taskNo,
          equipmentId,
          customerId: num(item.customerId),
          engineerMemberId,
          planDate,
          dueAt,
          status: 'pending',
          occurrenceKey,
          createdAt: now,
          updatedAt: now,
        },
      });
      const taskId = num(createdTask.record.id);
      created += 1;
      notes.push(
        `为 ${str(item.code)} 生成巡检任务 ${taskNo} / Created inspection task ${taskNo} for ${str(item.code)}`,
      );
      await this.notifyAssignee(engineerMemberId, {
        idempotencyKey: `inspection.created:${taskId}`,
        title: `巡检任务 ${taskNo} / Inspection task ${taskNo}`,
        body: `设备 ${str(item.name) || str(item.code)} 需要在 ${planDate} 前完成巡检。 / Equipment ${str(item.name) || str(item.code)} is due for inspection by ${planDate}.`,
        path: `/service/inspections`,
        sourceType: 'service-inspection-task',
        referenceId: String(taskId),
      });
    }
    this.logger.info('generated daily inspection tasks', {
      planDate,
      created,
      skipped,
      equipment: equipment.length,
    });
    return { planDate, created, skipped, unassigned, notes };
  }

  /**
   * The daily overdue reminder target.
   *
   * The dashboard calls a work order overdue when it is not closed and its
   * deadline has passed, and this sends the assignee at most one in-app message
   * per work order per day. The notification's idempotency key is
   * `work-order.overdue:<id>:<day>`, so a second firing of the plan on the same
   * day is deduplicated by the notification service instead of repeating the
   * message. Nothing about the work order changes: being overdue is derived from
   * its deadline and status, not a state it moves into.
   *
   * Inspection tasks have their own due date and are reminded in the same pass,
   * because one `overdue-reminders` plan owns both and a supervisor reading its
   * result should see everything it did.
   */
  async sendOverdueReminders(options: { now?: Date } = {}): Promise<Row> {
    const now = options.now ?? new Date();
    const day = shanghaiDate(now);

    const workOrders = await this.repo(WORK_ORDER_COLLECTION).findMany({
      filter: asFilter((filter) =>
        filter.and([
          filter.string('status').ne('closed'),
          filter.date('deadline').before(now),
        ]),
      ),
      limit: 500,
    });
    let workOrderReminders = 0;
    for (const row of workOrders) {
      const id = num(row.id);
      if (id === null) continue;
      const delivered = await this.notifyAssignee(num(row.assigneeId), {
        idempotencyKey: `work-order.overdue:${id}:${day}`,
        title: `工单逾期 ${str(row.orderNo)} / Work order overdue`,
        body: `工单 ${str(row.orderNo)} 已于 ${isoDate(row.deadline)} 逾期且尚未关闭，请尽快处理。 / Work order ${str(row.orderNo)} was due at ${isoDate(row.deadline)} and is still open.`,
        path: `/service/work-orders/${id}`,
        sourceType: 'service-work-order',
        referenceId: String(id),
      });
      if (delivered) workOrderReminders += 1;
    }

    // The inspection half keeps its existing compare-and-set: moving the task to
    // `overdue` is what makes a second run on the same day a no-op.
    const overdue = await this.repo(INSPECTION_COLLECTION).findMany({
      filter: asFilter((filter) =>
        filter.and([
          filter.or([
            filter.string('status').eq('pending'),
            filter.string('status').eq('in_progress'),
          ]),
          filter.date('dueAt').before(now),
        ]),
      ),
      limit: 500,
    });
    let inspectionReminders = 0;
    for (const task of overdue) {
      const id = num(task.id);
      if (id === null) continue;
      const updated = await this.repo(INSPECTION_COLLECTION).updateMany({
        filter: asFilter((filter) =>
          filter.and([
            filter.number('id').eq(id),
            filter.or([
              filter.string('status').eq('pending'),
              filter.string('status').eq('in_progress'),
            ]),
            filter.date('dueAt').before(now),
          ]),
        ),
        values: { status: 'overdue', updatedAt: new Date() },
      });
      if (updated.updatedCount !== 1) {
        continue;
      }
      await this.notifyAssignee(num(task.engineerMemberId), {
        idempotencyKey: `inspection.overdue:${id}:${day}`,
        title: `巡检任务逾期 / Inspection task overdue`,
        body: `任务 ${str(task.taskNo)} 已于 ${isoDate(task.dueAt)} 逾期，请尽快完成。 / Task ${str(task.taskNo)} was due at ${isoDate(task.dueAt)} and is overdue.`,
        path: `/service/inspections`,
        sourceType: 'service-inspection-task',
        referenceId: String(id),
      });
      inspectionReminders += 1;
    }

    const reminded = workOrderReminders + inspectionReminders;
    this.logger.info('sent overdue reminders', {
      day,
      reminded,
      workOrders: workOrderReminders,
      inspections: inspectionReminders,
      overdueWorkOrders: workOrders.length,
    });
    return {
      day,
      reminded,
      workOrders: workOrderReminders,
      inspections: inspectionReminders,
      overdueWorkOrders: workOrders.length,
    };
  }

  /** Send one in-app message to every supervisor seat linked to a user. */
  private async notifyManagers(input: {
    idempotencyKey: string;
    title: string;
    body: string;
    path: string;
    sourceType: string;
    referenceId: string;
  }): Promise<void> {
    const managers = await this.repo(MEMBER_COLLECTION).findMany({
      filter: (filter) =>
        (filter as unknown as FilterOps).string('kind').eq('manager'),
      sort: (sort) => [sort.field('id').asc()],
    });
    for (const manager of managers) {
      const userId = str(manager.userId);
      if (!userId) continue;
      await this.notify({
        ...input,
        idempotencyKey: `${input.idempotencyKey}:${str(manager.id)}`,
        to: userId,
      });
    }
  }

  private async notifyAssignee(
    engineerMemberId: number | null,
    input: {
      idempotencyKey: string;
      title: string;
      body: string;
      path: string;
      sourceType: string;
      referenceId: string;
    },
  ): Promise<boolean> {
    if (engineerMemberId === null) {
      return false;
    }
    const member = await this.repo(MEMBER_COLLECTION).findOne({
      filter: (filter) =>
        (filter as unknown as FilterOps).number('id').eq(engineerMemberId),
    });
    const userId = member ? str(member.userId) : '';
    if (!userId) {
      this.logger.warn(
        'in-app notification skipped: seat is not linked to a user',
        {
          engineerMemberId,
          idempotencyKey: input.idempotencyKey,
        },
      );
      return false;
    }
    return this.notify({
      ...input,
      to: userId,
    });
  }

  /** Send one in-app message. Delivery is best-effort; the log keeps the truth. */
  private async notify(input: {
    idempotencyKey: string;
    to: string;
    title: string;
    body: string;
    path: string;
    sourceType: string;
    referenceId: string;
  }): Promise<boolean> {
    const notification = this.deps.notification;
    if (!notification) {
      this.logger.warn(
        'notification service is not available; message dropped',
        {
          idempotencyKey: input.idempotencyKey,
        },
      );
      return false;
    }
    try {
      const result = await notification.send({
        idempotencyKey: input.idempotencyKey,
        source: { type: input.sourceType, referenceId: input.referenceId },
        messages: {
          inbox: {
            to: input.to,
            title: input.title,
            body: input.body,
            target: { type: 'route', path: input.path },
          },
        },
      });
      if (result.deduplicated) {
        this.logger.info('in-app message deduplicated', {
          idempotencyKey: input.idempotencyKey,
        });
      }
      return !result.deduplicated;
    } catch (error) {
      this.logger.error(
        `In-app notification ${input.idempotencyKey} failed: ${errorMessage(error)}`,
      );
      return false;
    }
  }

  // ---------------------------------------------------------------- knowledge

  /**
   * Repair knowledge.
   *
   * Reading published content is the default for anybody who can reach the page;
   * drafts exist only for the supervisor. The rule is enforced through the
   * authorization service's own decision for the knowledge page, so an
   * application with the read capability withheld genuinely loses the access
   * even to published articles.
   */
  async listKnowledge(
    actor: ServiceActor,
    params: {
      search?: string;
      published?: boolean;
      page?: number;
      pageSize?: number;
    } = {},
  ): Promise<ListResult<Row>> {
    await this.requirePageAccess(
      actor,
      SERVICE_PAGE_IDS.knowledge,
      'read repair knowledge',
    );
    const { page, pageSize } = pageParams(params, 50);
    const isManager = actor.roles.includes('manager');
    const search = str(params.search).trim();
    const filter = asFilter((builder) => {
      const nodes: FilterNode[] = [];
      if (!isManager || params.published === true) {
        nodes.push(builder.boolean('published').isTrue());
      } else if (params.published === false) {
        nodes.push(builder.boolean('published').isFalse());
      }
      if (search) {
        nodes.push(
          builder.or([
            builder.string('title').includes(search, { mode: 'insensitive' }),
            builder.text('body').includes(search, { mode: 'insensitive' }),
          ]),
        );
      }
      return nodes.length === 0
        ? builder.and([])
        : nodes.length === 1
          ? nodes[0]
          : builder.and(nodes);
    });
    const repository = this.repo(KNOWLEDGE_COLLECTION);
    const total = await repository.count({ filter });
    const rows =
      total === 0
        ? []
        : await repository.findMany({
            filter,
            sort: (sort) => [sort.field('id').desc()],
            limit: pageSize,
            offset: (page - 1) * pageSize,
          });
    return {
      rows: rows.map((row) => this.knowledgeView(row)),
      total,
      page,
      pageSize,
    };
  }

  async getKnowledge(actor: ServiceActor, id: number): Promise<Row> {
    const row = await this.mustRow(
      KNOWLEDGE_COLLECTION,
      id,
      'Knowledge article',
    );
    if (!bool(row.published)) {
      await this.requireManager(
        actor,
        SERVICE_PAGE_IDS.knowledge,
        'read a draft article',
      );
    } else {
      await this.requirePageAccess(
        actor,
        SERVICE_PAGE_IDS.knowledge,
        'read repair knowledge',
      );
    }
    return this.knowledgeView(row);
  }

  private knowledgeView(row: Row): Row {
    return {
      id: num(row.id),
      title: str(row.title) || null,
      body: str(row.body) || null,
      published: bool(row.published),
      authorId: str(row.authorId) || null,
      createdAt: isoDate(row.createdAt),
      updatedAt: isoDate(row.updatedAt),
    };
  }

  async createKnowledge(actor: ServiceActor, input: Row): Promise<Row> {
    await this.requireManager(
      actor,
      SERVICE_PAGE_IDS.knowledge,
      'publish repair knowledge',
    );
    const title = str(input.title).trim();
    const body = str(input.body).trim();
    if (title.length === 0) {
      throw badRequest('Article title is required');
    }
    if (body.length === 0) {
      throw badRequest('Article body is required');
    }
    const now = new Date();
    const created = await this.repo(KNOWLEDGE_COLLECTION).createOne({
      values: {
        title,
        body,
        published: Boolean(input.published),
        authorId: actor.userId,
        createdAt: now,
        updatedAt: now,
      },
    });
    return this.mustRow(
      KNOWLEDGE_COLLECTION,
      num(created.record.id) as number,
      'Knowledge article',
    );
  }

  async updateKnowledge(
    actor: ServiceActor,
    id: number,
    input: Row,
  ): Promise<Row> {
    await this.requireManager(
      actor,
      SERVICE_PAGE_IDS.knowledge,
      'edit repair knowledge',
    );
    await this.mustRow(KNOWLEDGE_COLLECTION, id, 'Knowledge article');
    const values: Row = { updatedAt: new Date() };
    if ('title' in input) {
      const title = str(input.title).trim();
      if (title.length === 0) {
        throw badRequest('Article title is required');
      }
      values.title = title;
    }
    if ('body' in input) {
      const body = str(input.body).trim();
      if (body.length === 0) {
        throw badRequest('Article body is required');
      }
      values.body = body;
    }
    if ('published' in input) {
      values.published = Boolean(input.published);
    }
    await this.repo(KNOWLEDGE_COLLECTION).updateMany({
      filter: (filter) => (filter as unknown as FilterOps).number('id').eq(id),
      values,
    });
    return this.mustRow(KNOWLEDGE_COLLECTION, id, 'Knowledge article');
  }

  // ------------------------------------------------------------------ manuals

  async listManuals(
    actor: ServiceActor,
    params: { search?: string; page?: number; pageSize?: number } = {},
  ): Promise<ListResult<Row>> {
    await this.requirePageAccess(
      actor,
      SERVICE_PAGE_IDS.manuals,
      'list equipment manuals',
    );
    const { page, pageSize } = pageParams(params, 50);
    const search = str(params.search).trim();
    const filter = asFilter((builder) => {
      if (!search) {
        return builder.and([]);
      }
      return builder.or([
        builder.string('title').includes(search, { mode: 'insensitive' }),
        builder
          .string('equipmentModel')
          .includes(search, { mode: 'insensitive' }),
      ]);
    });
    const repository = this.repo(MANUAL_COLLECTION);
    const total = await repository.count({ filter });
    const rows =
      total === 0
        ? []
        : await repository.findMany({
            filter,
            sort: (sort) => [sort.field('id').asc()],
            limit: pageSize,
            offset: (page - 1) * pageSize,
          });
    const refreshed = await this.refreshManualStatuses(rows);
    return { rows: refreshed, total, page, pageSize };
  }

  async getManual(actor: ServiceActor, id: number): Promise<Row> {
    await this.requirePageAccess(
      actor,
      SERVICE_PAGE_IDS.manuals,
      'read an equipment manual',
    );
    const row = await this.mustRow(MANUAL_COLLECTION, id, 'Manual');
    const [view] = await this.refreshManualStatuses([row]);
    return view;
  }

  private async manualView(row: Row): Promise<Row> {
    const sourceFileId = str(row.sourceFileId);
    const file = sourceFileId
      ? await this.repo(FILE_COLLECTION).findOne({
          filter: (filter) =>
            (filter as unknown as FilterOps).string('id').eq(sourceFileId),
        })
      : null;
    return {
      id: num(row.id),
      title: str(row.title) || null,
      equipmentModel: str(row.equipmentModel) || null,
      summary: str(row.summary) || null,
      sourceFileId: sourceFileId || null,
      sourceFile: file
        ? {
            id: str(file.id),
            filename: str(file.filename) || null,
            ext: str(file.ext) || null,
            mimeType: str(file.mimeType) || null,
            size: num(file.size),
          }
        : null,
      indexStatus: str(row.indexStatus) || 'not_indexed',
      indexMessage: str(row.indexMessage) || null,
      indexedAt: isoDate(row.indexedAt),
      createdAt: isoDate(row.createdAt),
      updatedAt: isoDate(row.updatedAt),
    };
  }

  /** Ask the knowledge base for the real indexing state of the listed manuals. */
  private async refreshManualStatuses(rows: readonly Row[]): Promise<Row[]> {
    const index = this.deps.knowledgeIndex;
    const views: Row[] = [];
    for (const row of rows) {
      if (index && str(row.indexStatus) === 'pending') {
        try {
          const state = await index.status(str(row.id));
          if (state.status !== 'pending') {
            await this.repo(MANUAL_COLLECTION).updateMany({
              filter: (filter) =>
                (filter as unknown as FilterOps)
                  .number('id')
                  .eq(num(row.id) as number),
              values: {
                indexStatus: state.status,
                indexMessage: state.message ?? null,
                indexedAt: state.status === 'indexed' ? new Date() : null,
                updatedAt: new Date(),
              },
            });
            row.indexStatus = state.status;
            row.indexMessage = state.message ?? null;
            row.indexedAt = state.status === 'indexed' ? new Date() : null;
          }
        } catch (error) {
          this.logger.warn(
            `Could not read manual indexing state: ${errorMessage(error)}`,
          );
        }
      }
      views.push(await this.manualView(row));
    }
    return views;
  }

  // -------------------------------------------------------- external platform

  /**
   * A repair submitted by the external device platform.
   *
   * The platform's `eventId` is the idempotency boundary: a retry with the same
   * id returns the recorded outcome instead of creating a second work order.
   * The order is attributed to the integration account, so it is visible to that
   * account and to the supervisors and to nobody else.
   */
  async submitExternalRepair(
    actor: ServiceActor,
    input: {
      eventId?: unknown;
      equipmentNo?: unknown;
      title?: unknown;
      problem?: unknown;
      priority?: unknown;
    },
  ): Promise<Row> {
    this.deps.access.requireRole(
      actor,
      'submit an external device event',
      'integrator',
    );
    const eventId = str(input.eventId).trim();
    if (eventId.length === 0) {
      throw badRequest('eventId is required');
    }

    const existing = await this.findExternalEvent(eventId);
    if (existing) {
      return this.externalEventResult(actor, existing, true);
    }

    const now = new Date();
    let event: Row;
    try {
      const created = await this.repo(EXTERNAL_EVENT_COLLECTION).createOne({
        values: {
          eventId,
          source: EXTERNAL_SOURCE,
          payload: input as Row,
          status: 'received',
          message: null,
          workOrderId: null,
          createdAt: now,
          updatedAt: now,
        },
      });
      event = created.record;
    } catch (error) {
      const raced = await this.findExternalEvent(eventId);
      if (raced) {
        return this.externalEventResult(actor, raced, true);
      }
      throw error;
    }

    const eventRowId = num(event.id) as number;
    try {
      const equipment = await this.mustEquipmentByCode(
        str(input.equipmentNo).trim(),
      );
      if (!bool(equipment.enabled)) {
        throw badRequest(
          `Equipment ${str(equipment.code)} is disabled and cannot receive new repair requests`,
        );
      }
      const assigneeId = await this.resolveIntakeAssignee(equipment);
      const title =
        str(input.title).trim() || `外部报修 ${str(equipment.code)}`;
      const problem =
        str(input.problem).trim() ||
        '外部设备平台未提供描述 / No description supplied';
      const priority = str(input.priority) === 'urgent' ? 'urgent' : 'normal';
      const order = await this.createOrderRow({
        title,
        problem,
        customerId: num(equipment.customerId) as number,
        equipmentId: num(equipment.id) as number,
        assigneeId,
        priority,
        deadline: null,
        confidential: false,
        source: 'external',
        createdById: actor.userId,
      });
      const orderId = num(order.id) as number;
      await this.insertEvent(orderId, 'created', {
        actorId: actor.userId,
        message:
          '来自设备平台的外部报修请求 / Repair submitted by the external device platform',
        detail: { eventId, code: str(equipment.code) },
      });
      await this.repo(EXTERNAL_EVENT_COLLECTION).updateMany({
        filter: (filter) =>
          (filter as unknown as FilterOps).number('id').eq(eventRowId),
        values: {
          status: 'accepted',
          workOrderId: orderId,
          updatedAt: new Date(),
        },
      });
      const recorded = await this.mustRow(
        EXTERNAL_EVENT_COLLECTION,
        eventRowId,
        'External event',
      );
      return this.externalEventResult(actor, recorded, false);
    } catch (error) {
      await this.repo(EXTERNAL_EVENT_COLLECTION).updateMany({
        filter: (filter) =>
          (filter as unknown as FilterOps).number('id').eq(eventRowId),
        values: {
          status: 'rejected',
          message: errorMessage(error),
          updatedAt: new Date(),
        },
      });
      throw error;
    }
  }

  private async findExternalEvent(eventId: string): Promise<Row | undefined> {
    return this.repo(EXTERNAL_EVENT_COLLECTION).findOne({
      filter: (filter) =>
        (filter as unknown as FilterOps).string('eventId').eq(eventId),
    });
  }

  private async externalEventResult(
    actor: ServiceActor,
    event: Row,
    deduplicated: boolean,
  ): Promise<Row> {
    const workOrderId = num(event.workOrderId);
    return {
      deduplicated,
      event: this.externalEventView(event),
      workOrder:
        workOrderId === null
          ? null
          : await this.getWorkOrder(actor, workOrderId),
    };
  }

  private externalEventView(event: Row): Row {
    return {
      id: num(event.id),
      eventId: str(event.eventId) || null,
      source: str(event.source) || EXTERNAL_SOURCE,
      status: str(event.status) || null,
      message: str(event.message) || null,
      workOrderId: num(event.workOrderId),
      createdAt: isoDate(event.createdAt),
      updatedAt: isoDate(event.updatedAt),
    };
  }

  private async mustEquipmentByCode(code: string): Promise<Row> {
    if (code.length === 0) {
      throw badRequest('equipmentNo is required');
    }
    const equipment = await this.repo(EQUIPMENT_COLLECTION).findOne({
      filter: (filter) =>
        (filter as unknown as FilterOps).string('code').eq(code),
    });
    if (!equipment) {
      throw notFound(`Equipment ${code} was not found`);
    }
    return equipment;
  }

  /**
   * The engineer seat that receives a submitted repair when the equipment has
   * no assigned engineer. A supervisor seat is the fallback, so the request is
   * never left unattached.
   */
  private async resolveIntakeAssignee(equipment: Row): Promise<number> {
    const engineerId = num(equipment.engineerMemberId);
    if (engineerId !== null) {
      return engineerId;
    }
    const manager = await this.repo(MEMBER_COLLECTION).findOne({
      filter: (filter) =>
        (filter as unknown as FilterOps).string('kind').eq('manager'),
      sort: (sort) => [sort.field('id').asc()],
    });
    const managerId = manager ? num(manager.id) : null;
    if (managerId === null) {
      throw conflict(
        'No engineer seat is available to receive the submitted repair',
      );
    }
    return managerId;
  }

  // ------------------------------------------------------------- integration

  async listExternalEvents(
    actor: ServiceActor,
    params: { page?: number; pageSize?: number; status?: string } = {},
  ): Promise<ListResult<Row>> {
    await this.requirePageAccess(
      actor,
      SERVICE_PAGE_IDS.integration,
      'list external events',
    );
    const { page, pageSize } = pageParams(params, 20);
    const status = str(params.status).trim();
    const isManager = actor.roles.includes('manager');
    let orderIds: number[] | null = null;
    if (!isManager) {
      const scoped = await this.scopedOrderRows(actor);
      orderIds = scoped
        .map((row) => num(row.id))
        .filter((id): id is number => id !== null);
    }
    const filter = asFilter((builder) => {
      const nodes: FilterNode[] = [];
      if (status.length > 0) {
        nodes.push(builder.string('status').eq(status));
      }
      if (orderIds !== null) {
        nodes.push(
          orderIds.length === 0
            ? builder.number('id').eq(-1)
            : builder.or(
                orderIds.map((id) => builder.number('workOrderId').eq(id)),
              ),
        );
      }
      return builder.and(nodes);
    });
    const repository = this.repo(EXTERNAL_EVENT_COLLECTION);
    const total = await repository.count({ filter });
    const rows =
      total === 0
        ? []
        : await repository.findMany({
            filter,
            sort: (sort) => [sort.field('id').desc()],
            limit: pageSize,
            offset: (page - 1) * pageSize,
          });
    return {
      rows: rows.map((row) => this.externalEventView(row)),
      total,
      page,
      pageSize,
    };
  }

  /** A snapshot of everything that could be misconfigured for the integration. */
  async integrationStatus(actor: ServiceActor): Promise<Row> {
    await this.requirePageAccess(
      actor,
      SERVICE_PAGE_IDS.integration,
      'read integration status',
    );
    const statuses = ['received', 'duplicate', 'accepted', 'rejected'] as const;
    const counts: Row = {};
    for (const status of statuses) {
      counts[status] = await this.repo(EXTERNAL_EVENT_COLLECTION).count({
        filter: asFilter((filter) => filter.string('status').eq(status)),
      });
    }
    const recent = await this.repo(EXTERNAL_EVENT_COLLECTION).findMany({
      sort: (sort) => [sort.field('id').desc()],
      limit: 10,
    });
    return {
      externalSource: EXTERNAL_SOURCE,
      knowledgeIndexConfigured: Boolean(this.deps.knowledgeIndex),
      notificationConfigured: Boolean(this.deps.notification),
      workflowConfigured: Boolean(this.deps.workflow),
      eventStatuses: statuses.map((status) => ({
        status,
        count: num(counts[status]) ?? 0,
      })),
      recentEvents: recent.map((row) => this.externalEventView(row)),
    };
  }

  /**
   * The account the device platform submits as.
   *
   * The seat is the application's record of that account, so its `userId` is the
   * owner any integration key belongs to. Resolving it here is what lets a
   * supervisor issue a key for the integration account without knowing its id.
   */
  private async integrationSeat(): Promise<Row | null> {
    const seat = await this.repo(MEMBER_COLLECTION).findOne({
      filter: (filter) =>
        (filter as unknown as FilterOps).string('kind').eq('integrator'),
      sort: (sort) => [sort.field('id').asc()],
    });
    return seat ?? null;
  }

  private async integrationAccount(): Promise<Row | null> {
    const seat = await this.integrationSeat();
    const userId = seat ? str(seat.userId) : '';
    if (!seat || !userId) {
      return null;
    }
    return {
      id: num(seat.id),
      ref: str(seat.ref) || null,
      name: str(seat.name) || null,
      email: str(seat.email) || null,
      userId,
      enabled: bool(seat.enabled),
    };
  }

  /**
   * The integration account and the keys issued for it.
   *
   * A key created from an administrator's own API Keys page authenticates as
   * the administrator, whose account holds no `service-integrator` role, so the
   * external endpoint rejects it. This is the supervisor's path to a key that
   * belongs to the integration account itself.
   */
  async integrationAccountStatus(actor: ServiceActor): Promise<Row> {
    await this.requireManager(
      actor,
      SERVICE_PAGE_IDS.integration,
      'manage the integration account',
    );
    const account = await this.integrationAccount();
    const apiKeys = this.deps.apiKeys;
    const keys =
      account && apiKeys
        ? await apiKeys.list(str(account.userId))
        : ([] as readonly unknown[]);
    return {
      account,
      apiKeys: keys,
      keysAvailable: Boolean(apiKeys),
      configId: apiKeys?.configId ?? null,
    };
  }

  /** Issue one API key for the integration account. The secret is shown once. */
  async createIntegrationApiKey(
    actor: ServiceActor,
    input: { name?: unknown; expiresInDays?: unknown } = {},
  ): Promise<Row> {
    await this.requireManager(
      actor,
      SERVICE_PAGE_IDS.integration,
      'create an integration API key',
    );
    const apiKeys = this.deps.apiKeys;
    if (!apiKeys) {
      throw conflict(
        'API key management is not available in this installation',
      );
    }
    const account = await this.integrationAccount();
    if (!account) {
      throw conflict(
        'The integration account has not been provisioned yet; no API key can be issued',
      );
    }
    const name = str(input.name).trim() || 'device-platform';
    const days = num(input.expiresInDays);
    const expiresIn =
      days !== null && days > 0 ? Math.floor(days) * 24 * 60 * 60 : null;
    const created = await apiKeys.create({
      userId: str(account.userId),
      name,
      expiresIn,
    });
    this.logger.info('issued an integration API key', {
      account: str(account.ref) || str(account.userId),
      name,
    });
    return { account, apiKey: created.key, secret: created.secret };
  }

  /**
   * Revoke one key, but only one that belongs to the integration account: an id
   * from anywhere else is refused rather than deleted.
   */
  async revokeIntegrationApiKey(actor: ServiceActor, id: string): Promise<Row> {
    await this.requireManager(
      actor,
      SERVICE_PAGE_IDS.integration,
      'revoke an integration API key',
    );
    const apiKeys = this.deps.apiKeys;
    if (!apiKeys) {
      throw conflict(
        'API key management is not available in this installation',
      );
    }
    const account = await this.integrationAccount();
    if (!account) {
      throw notFound('The integration account was not found');
    }
    const owned = (await apiKeys.list(str(account.userId))).some(
      (key) => key.id === id,
    );
    if (!owned) {
      throw notFound(`API key ${id} was not found for the integration account`);
    }
    await apiKeys.remove(id);
    this.logger.info('revoked an integration API key', { id });
    return { id, revoked: true };
  }

  /**
   * The state of one repair as the device platform that submitted it may read.
   *
   * The event is found by its own work-order link, and the caller's record scope
   * is the same one the external submit writes under, so a platform can only
   * read repairs it created. `assertWorkOrderRead` returns `null` for "missing"
   * and "not yours" alike, so the endpoint cannot enumerate other repairs.
   */
  async readExternalRepair(actor: ServiceActor, id: number): Promise<Row> {
    this.deps.access.requireRole(
      actor,
      'read an external device repair',
      'integrator',
    );
    const row = await this.assertWorkOrderRead(actor, id);
    if (!row) {
      throw notFound(`Repair #${id} was not found`);
    }
    const event = await this.repo(EXTERNAL_EVENT_COLLECTION).findOne({
      filter: asFilter((filter) =>
        filter.and([
          filter.number('workOrderId').eq(id),
          filter.string('source').eq(EXTERNAL_SOURCE),
        ]),
      ),
      sort: (sort) => [sort.field('id').desc()],
    });
    const events = await this.repo(EVENT_COLLECTION).findMany({
      filter: (filter) =>
        (filter as unknown as FilterOps).number('workOrderId').eq(id),
      sort: (sort) => [sort.field('id').asc()],
      limit: 200,
    });
    return {
      id: num(row.id),
      orderNo: str(row.orderNo) || null,
      title: str(row.title) || null,
      problem: str(row.problem) || null,
      status: str(row.status) || null,
      priority: str(row.priority) || null,
      source: str(row.source) || EXTERNAL_SOURCE,
      deadline: isoDate(row.deadline),
      createdAt: isoDate(row.createdAt),
      updatedAt: isoDate(row.updatedAt),
      closedAt: isoDate(row.closedAt),
      externalEvent: event ? this.externalEventView(event) : null,
      timeline: events.map((item) => ({
        type: str(item.type) || null,
        message: this.summarizeEvent(item),
        createdAt: isoDate(item.createdAt),
      })),
    };
  }

  // --------------------------------------------------------------- dashboard

  /**
   * The numbers behind the work-order dashboard.
   *
   * Every figure is computed from the same record-level scope the list uses, so
   * a click on a number and the corresponding filtered list agree.
   */
  async dashboard(actor: ServiceActor): Promise<Row> {
    await this.requirePageAccess(
      actor,
      SERVICE_PAGE_IDS.dashboard,
      'read the dashboard',
    );
    const rows = await this.scopedOrderRows(actor);
    const now = Date.now();
    const statuses: Row = {};
    for (const status of WORK_ORDER_STATUSES) {
      statuses[status] = 0;
    }
    let open = 0;
    let overdue = 0;
    let urgent = 0;
    const perMember = new Map<number, { total: number; open: number }>();
    for (const row of rows) {
      const status = str(row.status);
      statuses[status] = (num(statuses[status]) ?? 0) + 1;
      const isOpen = status !== 'closed';
      if (isOpen) {
        open += 1;
      }
      const deadline = toDate(row.deadline);
      if (isOpen && deadline !== null && deadline.getTime() < now) {
        overdue += 1;
      }
      if (isOpen && str(row.priority) === 'urgent') {
        urgent += 1;
      }
      const assigneeId = num(row.assigneeId);
      if (assigneeId !== null) {
        const entry = perMember.get(assigneeId) ?? { total: 0, open: 0 };
        entry.total += 1;
        if (isOpen) {
          entry.open += 1;
        }
        perMember.set(assigneeId, entry);
      }
    }
    const isManager = actor.roles.includes('manager');
    const groups = isManager
      ? await this.engineerLoad(perMember)
      : actor.memberId === null
        ? []
        : await this.engineerLoad(
            new Map([
              [
                actor.memberId,
                perMember.get(actor.memberId) ?? { total: 0, open: 0 },
              ],
            ]),
          );
    return {
      scope: isManager ? 'manager' : firstRole(actor.roles),
      generatedAt: new Date().toISOString(),
      totals: {
        total: rows.length,
        open,
        overdue,
        urgent,
        pendingAcceptance: num(statuses.pending_acceptance) ?? 0,
        pendingConfirmation: num(statuses.pending_confirmation) ?? 0,
      },
      statuses: WORK_ORDER_STATUSES.map((status) => ({
        status,
        count: num(statuses[status]) ?? 0,
      })),
      groups,
      mine:
        actor.memberId === null
          ? null
          : (perMember.get(actor.memberId) ?? { total: 0, open: 0 }),
    };
  }

  /** The per-engineer load grouped by engineer group. */
  private async engineerLoad(
    counts: Map<number, { total: number; open: number }>,
  ): Promise<Row[]> {
    const memberIds = [...counts.keys()];
    if (memberIds.length === 0) {
      return [];
    }
    const members = await this.repo(MEMBER_COLLECTION).findMany({
      filter: asFilter((filter) =>
        filter.or(memberIds.map((id) => filter.number('id').eq(id))),
      ),
    });
    const groupIds = new Set<number>();
    for (const member of members) {
      const groupId = num(member.groupId);
      if (groupId !== null) {
        groupIds.add(groupId);
      }
    }
    const groups =
      groupIds.size === 0
        ? []
        : await this.repo(GROUP_COLLECTION).findMany({
            filter: asFilter((filter) =>
              filter.or([...groupIds].map((id) => filter.number('id').eq(id))),
            ),
          });
    const groupById = new Map(
      groups.map((group) => [num(group.id) ?? -1, group] as const),
    );
    const buckets = new Map<
      number,
      {
        id: number;
        name: string;
        engineers: Row[];
        total: number;
        open: number;
      }
    >();
    for (const member of members) {
      const id = num(member.id);
      if (id === null) {
        continue;
      }
      const groupId = num(member.groupId);
      const group = groupId === null ? undefined : groupById.get(groupId);
      const key = groupId ?? -1;
      const bucket = buckets.get(key) ?? {
        id: key,
        name: group ? str(group.name) : '未分组 / Ungrouped',
        engineers: [],
        total: 0,
        open: 0,
      };
      const count = counts.get(id) ?? { total: 0, open: 0 };
      bucket.engineers.push({
        id,
        ref: str(member.ref) || null,
        name: str(member.name) || null,
        groupId,
        groupName: group ? str(group.name) : null,
        total: count.total,
        open: count.open,
      });
      bucket.total += count.total;
      bucket.open += count.open;
      buckets.set(key, bucket);
    }
    return [...buckets.values()].sort((left, right) => left.id - right.id);
  }

  // -------------------------------------------------------------- attachments

  /**
   * The files attached to one work order.
   *
   * Reading them follows work-order read access exactly: whoever may read the
   * order may read its attachments, and a request for an order the actor cannot
   * see returns nothing rather than revealing that a file exists.
   */
  async listAttachments(
    actor: ServiceActor,
    workOrderId: number,
  ): Promise<AttachmentRecordView[]> {
    const order = await this.assertWorkOrderRead(actor, workOrderId);
    if (!order) {
      return [];
    }
    const files = await this.repo(FILE_COLLECTION).findMany({
      filter: (filter) =>
        (filter as unknown as FilterOps).number('workOrderId').eq(workOrderId),
      sort: (sort) => [sort.field('createdAt').asc()],
    });
    return files.map((file) => this.attachmentView(file));
  }

  private attachmentView(file: Row): AttachmentRecordView {
    const id = str(file.id);
    const category: AttachmentCategory =
      str(file.category) === 'photo' ? 'photo' : 'report';
    return {
      id,
      filename: str(file.filename),
      ext: str(file.ext) || null,
      mimeType: str(file.mimeType) || null,
      size: num(file.size) ?? 0,
      category,
      createdAt: isoDate(file.createdAt),
      contentUrl: `${this.deps.publicBasePath}/api/service/attachments/${encodeURIComponent(id)}/content`,
    };
  }

  private async mustFile(fileId: string): Promise<Row> {
    const file = await this.repo(FILE_COLLECTION).findOne({
      filter: (filter) =>
        (filter as unknown as FilterOps).string('id').eq(fileId),
    });
    if (!file) {
      throw notFound('The uploaded file was not found');
    }
    return file;
  }

  /**
   * Attach an uploaded file to a work order.
   *
   * Who may attach evidence is exactly who may handle the order: the assigned
   * engineer or a supervisor. The upload is attributed to whoever performed it
   * (`uploaderId`), so a supervisor linking a customer's photo is recorded as
   * their own action rather than the engineer's. The extension is checked
   * against the category so a renamed file is refused before it is linked.
   */
  async registerAttachment(
    actor: ServiceActor,
    workOrderId: number,
    input: { fileId?: unknown; category?: unknown },
  ): Promise<AttachmentRecordView> {
    const order = await this.assertWorkOrderRead(actor, workOrderId);
    // Who may attach evidence is exactly who may handle the order: the assigned
    // engineer or a supervisor. This mirrors `capabilities().canUploadAttachment`
    // so the button the page shows and the rule the domain enforces agree.
    const isAssignee =
      order !== null &&
      actor.memberId !== null &&
      num(order.assigneeId) === actor.memberId;
    const isManager = actor.roles.includes('manager');
    if (!order || (!isAssignee && !isManager)) {
      throw notFound(`Work order #${workOrderId} was not found`);
    }
    await this.requirePageAccess(
      actor,
      SERVICE_PAGE_IDS.workOrders,
      'attach a file',
    );
    if (str(order.status) === 'closed') {
      throw conflict('A closed work order is read-only');
    }
    const category: AttachmentCategory =
      str(input.category) === 'photo' ? 'photo' : 'report';
    const fileId = str(input.fileId).trim();
    if (fileId.length === 0) {
      throw badRequest('fileId is required');
    }
    const file = await this.mustFile(fileId);
    const ext = str(file.ext).toLowerCase().replace(/^\./, '');
    const allowed = ATTACHMENT_EXTENSIONS[category];
    if (!allowed.includes(ext)) {
      throw badRequest(
        `A ${category} attachment must be one of: ${allowed.join(', ')}`,
      );
    }
    const current = num(file.workOrderId);
    if (current !== null && current !== workOrderId) {
      throw conflict('The file is already attached to another work order');
    }
    await this.repo(FILE_COLLECTION).updateMany({
      filter: (filter) =>
        (filter as unknown as FilterOps).string('id').eq(fileId),
      values: {
        workOrderId,
        category,
        uploaderId: str(file.uploaderId) || actor.userId,
        updatedAt: new Date(),
      },
    });
    await this.insertEvent(workOrderId, 'attachment_added', {
      actorId: actor.userId,
      message: `上传附件 ${str(file.filename)} / Attachment uploaded`,
      detail: { fileId, category, filename: str(file.filename) },
    });
    return this.attachmentView(await this.mustFile(fileId));
  }

  /** Remove one attachment association. A supervisor may moderate any order. */
  async detachAttachment(
    actor: ServiceActor,
    workOrderId: number,
    fileId: string,
  ): Promise<{ removed: boolean }> {
    const order = await this.assertWorkOrderRead(actor, workOrderId);
    const isManager = actor.roles.includes('manager');
    const isAssignee =
      order !== null &&
      actor.memberId !== null &&
      num(order.assigneeId) === actor.memberId;
    if (!order || (!isManager && !isAssignee)) {
      throw notFound(`Work order #${workOrderId} was not found`);
    }
    await this.requirePageAccess(
      actor,
      SERVICE_PAGE_IDS.workOrders,
      'remove an attachment',
    );
    if (str(order.status) === 'closed' && !isManager) {
      throw conflict('A closed work order is read-only');
    }
    const file = await this.mustFile(fileId);
    if (num(file.workOrderId) !== workOrderId) {
      throw notFound('The attachment was not found on this work order');
    }
    await this.repo(FILE_COLLECTION).deleteMany({
      filter: (filter) =>
        (filter as unknown as FilterOps).string('id').eq(fileId),
    });
    await this.insertEvent(workOrderId, 'attachment_removed', {
      actorId: actor.userId,
      message: `移除附件 ${str(file.filename)} / Attachment removed`,
      detail: { fileId, filename: str(file.filename) },
    });
    return { removed: true };
  }

  /**
   * The file row a content request may read.
   *
   * It is a separate entry point from `listAttachments` because the download
   * route resolves a file id without an order id; the file must be checked
   * against the work order it belongs to.
   *
   * A file with no work order is one of two things: an upload the caller made
   * but has not attached yet, or a manual's source document. The first is the
   * uploader's own or a supervisor's to read, and the second is readable by
   * anyone allowed to read manuals — an engineer consulting a manual has to be
   * able to open the document the manual is based on.
   */
  async assertAttachmentRead(
    actor: ServiceActor,
    fileId: string,
  ): Promise<Row | null> {
    const file = await this.repo(FILE_COLLECTION).findOne({
      filter: (filter) =>
        (filter as unknown as FilterOps).string('id').eq(fileId),
    });
    if (!file) {
      return null;
    }
    const workOrderId = num(file.workOrderId);
    if (workOrderId === null) {
      if (actor.roles.includes('manager')) {
        return file;
      }
      if (str(file.uploaderId) === actor.userId) {
        return file;
      }
      const manual = await this.repo(MANUAL_COLLECTION).findOne({
        filter: (filter) =>
          (filter as unknown as FilterOps).string('sourceFileId').eq(fileId),
      });
      if (
        manual &&
        (await this.deps.access.canPage(actor, SERVICE_PAGE_IDS.manuals))
      ) {
        return file;
      }
      return null;
    }
    const order = await this.assertWorkOrderRead(actor, workOrderId);
    return order ? file : null;
  }

  // ------------------------------------------------------------------ manuals

  /**
   * Add an equipment manual. Only a supervisor maintains the manual library;
   * an engineer can read it but never upload or delete a document.
   */
  async createManual(actor: ServiceActor, input: Row): Promise<Row> {
    await this.requireManager(
      actor,
      SERVICE_PAGE_IDS.manuals,
      'add an equipment manual',
    );
    const title = str(input.title).trim();
    if (title.length === 0) {
      throw badRequest('Manual title is required');
    }
    const sourceFileId = str(input.sourceFileId).trim();
    if (sourceFileId.length > 0) {
      await this.mustFile(sourceFileId);
    }
    const now = new Date();
    const created = await this.repo(MANUAL_COLLECTION).createOne({
      values: {
        title,
        equipmentModel: str(input.equipmentModel).trim() || null,
        summary: str(input.summary).trim() || null,
        sourceFileId: sourceFileId || null,
        indexStatus: 'not_indexed',
        indexMessage: null,
        indexedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    });
    const id = num(created.record.id) as number;
    await this.submitManualForIndex(id);
    return this.getManual(actor, id);
  }

  async updateManual(
    actor: ServiceActor,
    id: number,
    input: Row,
  ): Promise<Row> {
    await this.requireManager(
      actor,
      SERVICE_PAGE_IDS.manuals,
      'edit an equipment manual',
    );
    await this.mustRow(MANUAL_COLLECTION, id, 'Manual');
    const values: Row = { updatedAt: new Date() };
    let contentChanged = false;
    if ('title' in input) {
      const title = str(input.title).trim();
      if (title.length === 0) {
        throw badRequest('Manual title is required');
      }
      values.title = title;
      contentChanged = true;
    }
    if ('equipmentModel' in input) {
      values.equipmentModel = str(input.equipmentModel).trim() || null;
      contentChanged = true;
    }
    if ('summary' in input) {
      values.summary = str(input.summary).trim() || null;
      contentChanged = true;
    }
    if ('sourceFileId' in input) {
      const sourceFileId = str(input.sourceFileId).trim();
      if (sourceFileId.length > 0) {
        await this.mustFile(sourceFileId);
      }
      values.sourceFileId = sourceFileId || null;
      contentChanged = true;
    }
    await this.repo(MANUAL_COLLECTION).updateMany({
      filter: (filter) => (filter as unknown as FilterOps).number('id').eq(id),
      values,
    });
    if (contentChanged) {
      await this.submitManualForIndex(id);
    }
    return this.getManual(actor, id);
  }

  /** Ask the knowledge base to index the manual again. */
  async reindexManual(actor: ServiceActor, id: number): Promise<Row> {
    await this.requireManager(
      actor,
      SERVICE_PAGE_IDS.manuals,
      're-index an equipment manual',
    );
    await this.mustRow(MANUAL_COLLECTION, id, 'Manual');
    await this.submitManualForIndex(id);
    return this.getManual(actor, id);
  }

  async deleteManual(
    actor: ServiceActor,
    id: number,
  ): Promise<{ id: number; deleted: boolean }> {
    await this.requireManager(
      actor,
      SERVICE_PAGE_IDS.manuals,
      'delete an equipment manual',
    );
    await this.mustRow(MANUAL_COLLECTION, id, 'Manual');
    const index = this.deps.knowledgeIndex;
    if (index) {
      try {
        await index.remove(String(id));
      } catch (error) {
        this.logger.warn(
          `Could not remove manual #${id} from the knowledge base: ${errorMessage(error)}`,
        );
      }
    }
    await this.repo(MANUAL_COLLECTION).deleteMany({
      filter: (filter) => (filter as unknown as FilterOps).number('id').eq(id),
    });
    return { id, deleted: true };
  }

  /**
   * Submit one manual to the knowledge base and record the real outcome.
   *
   * When no indexing service is configured the status stays `not_indexed`, which
   * the interface shows as "indexing not finished" rather than pretending the
   * document is searchable.
   */
  private async submitManualForIndex(id: number): Promise<void> {
    const index = this.deps.knowledgeIndex;
    if (!index) {
      await this.repo(MANUAL_COLLECTION).updateMany({
        filter: (filter) =>
          (filter as unknown as FilterOps).number('id').eq(id),
        values: {
          indexStatus: 'not_indexed',
          indexMessage:
            '未配置知识库索引服务 / No knowledge-base indexing service is configured',
          indexedAt: null,
          updatedAt: new Date(),
        },
      });
      return;
    }
    const row = await this.mustRow(MANUAL_COLLECTION, id, 'Manual');
    await this.repo(MANUAL_COLLECTION).updateMany({
      filter: (filter) => (filter as unknown as FilterOps).number('id').eq(id),
      values: {
        indexStatus: 'pending',
        indexMessage: null,
        updatedAt: new Date(),
      },
    });
    try {
      const state = await index.submit({
        referenceId: String(id),
        title: str(row.title),
        equipmentModel: str(row.equipmentModel) || null,
        summary: str(row.summary) || null,
        fileId: str(row.sourceFileId) || null,
      });
      await this.repo(MANUAL_COLLECTION).updateMany({
        filter: (filter) =>
          (filter as unknown as FilterOps).number('id').eq(id),
        values: {
          indexStatus: state.status,
          indexMessage: state.message ?? null,
          indexedAt: state.status === 'indexed' ? new Date() : null,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      await this.repo(MANUAL_COLLECTION).updateMany({
        filter: (filter) =>
          (filter as unknown as FilterOps).number('id').eq(id),
        values: {
          indexStatus: 'failed',
          indexMessage: errorMessage(error),
          updatedAt: new Date(),
        },
      });
    }
  }
}
