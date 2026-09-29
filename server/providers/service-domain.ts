import { randomUUID } from 'node:crypto';

import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server';
import {
  notificationServiceToken,
  type NotificationService,
} from '@nocobase/app-plugin-notification/server';
import { workflowServiceToken } from '@nocobase/app-plugin-workflow/server';
import {
  defineSharingRule,
  type SharingRulesAuthorizationApi,
} from '@nocobase/authorization/sharing-rules';
import { selection } from '@nocobase/authorization/core';
import {
  databaseManagerToken,
  type DatabaseManager,
  type Repository,
} from '@nocobase/db';
import { loggingToken } from '@nocobase/app-server/logging';
import { QueueManager, Schedule } from '@nocobase/queue';
import type { Logger } from '@nocobase/logging';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceResolver,
  type ServiceToken,
} from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';

import {
  ACTIVITY_ACTIONS,
  ENGINEER_GROUPS,
  INSPECTION_STATUS,
  KNOWLEDGE_STATUS,
  SERVICE_DOMAIN_SERVICE_KEY,
  SERVICE_PERMISSION_SETS,
  SERVICE_SCHEDULE_KEYS,
  SERVICE_SCHEDULE_TARGETS,
  TRANSITIONS,
  type ServiceScheduleTarget,
  WORK_ORDER_PRIORITY,
  WORK_ORDER_SOURCE,
  WORK_ORDER_STATUS,
  WORK_ORDER_STATUS_LABELS,
  type ServiceRole,
  type TransitionName,
  type WorkOrderStatus,
} from '../service/constants.js';
import { serviceWorkOrders as serviceWorkOrdersDefinition } from '../service/resources.js';
import { asText } from '../service/text.js';
import {
  serviceCollections,
  serviceComposites,
  serviceRecordAccess,
} from '../service/resources.js';

type Row = Record<string, unknown>;
type Repo = Repository<Row>;

export interface OrderCreateInput {
  readonly title?: unknown;
  readonly description?: unknown;
  readonly customerId?: unknown;
  readonly deviceId?: unknown;
  readonly priority?: unknown;
  readonly assigneeId?: unknown;
  readonly dueAt?: unknown;
  readonly confidential?: unknown;
  readonly source?: unknown;
  readonly externalEventId?: unknown;
  readonly idempotencyKey?: unknown;
  readonly customerName?: unknown;
  readonly contactName?: unknown;
  readonly contactPhone?: unknown;
  readonly report?: unknown;
}

export interface OrderListFilter {
  readonly status?: string;
  readonly priority?: string;
  readonly keyword?: string;
  readonly assigneeId?: string;
  readonly group?: string;
  readonly overdue?: boolean;
  readonly page?: unknown;
  readonly pageSize?: unknown;
}

export interface TransitionInput {
  readonly resolution?: unknown;
  readonly note?: unknown;
}

export interface DashboardSummary {
  readonly role: string;
  readonly counts: Record<string, number>;
  readonly groups?: Array<{ group: string; total: number; open: number }>;
  readonly overdue: number;
}

export interface ServiceScheduleRun {
  readonly scheduleId: string;
  readonly key: string;
  readonly runCount: number;
}

/**
 * Whether an assistant answer is a real model reply or an honest degraded
 * state. The client renders the wording from `status` so both languages read
 * correctly; `answer` remains the server-side fallback text.
 */
export type AssistantStatus =
  'answered' | 'model_unavailable' | 'insufficient_evidence' | 'model_error';

export interface AssistantReference {
  readonly type: 'order' | 'knowledge' | 'manual';
  readonly id: string;
  readonly title: string;
  readonly detail?: string;
}

export interface AssistantAnswer {
  readonly status: AssistantStatus;
  readonly answer: string;
  readonly references: readonly AssistantReference[];
  readonly proposedAction?: {
    readonly type: 'create_work_order';
    readonly title: string;
    readonly deviceId?: string;
    readonly priority?: string;
  };
}

export class ServiceDomainError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'ServiceDomainError';
  }
}

export const SERVICE_DOMAIN_PERMISSION_SETS = SERVICE_PERMISSION_SETS;

/** Accept an explicit run day only when it is a real `YYYY-MM-DD` value. */
function validScheduleDate(config: unknown): string | undefined {
  const value = (config as { date?: unknown } | undefined)?.date;
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)
    ? value
    : undefined;
}

/** Numeric primary keys arrive as strings from routes; the column is an integer. */
function asId(value: unknown): string | number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number(value);
  }
  return asText(value);
}

/**
 * Compare two version labels such as `v1.2` and `v1.10`. Numeric segments
 * compare as numbers, so `v1.10` is newer than `v1.9`; anything that is not a
 * number falls back to a plain string comparison. A revision the supervisor
 * published without bumping the version still wins when its `updatedAt` is
 * later, which is how the manual editor records an edit.
 */
function isNewerManual(candidate: Row, current: Row): boolean {
  const left = asText(candidate.version);
  const right = asText(current.version);
  const leftParts = left.split(/[^0-9a-z]+/iu);
  const rightParts = right.split(/[^0-9a-z]+/iu);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const a = leftParts[index] ?? '';
    const b = rightParts[index] ?? '';
    if (a === b) {
      continue;
    }
    const aNumber = /^\d+$/u.test(a) ? Number(a) : undefined;
    const bNumber = /^\d+$/u.test(b) ? Number(b) : undefined;
    if (aNumber !== undefined && bNumber !== undefined) {
      return aNumber > bNumber;
    }
    return a > b;
  }
  return asText(candidate.updatedAt) > asText(current.updatedAt);
}

/** The newest version of each manual title, so an obsolete version cannot answer. */
function latestManualsByTitle(manuals: readonly Row[]): Row[] {
  const latest = new Map<string, Row>();
  for (const manual of manuals) {
    const title = asText(manual.title);
    const current = latest.get(title);
    if (!current || isNewerManual(manual, current)) {
      latest.set(title, manual);
    }
  }
  return [...latest.values()];
}

/**
 * Question words and generic procedure verbs. They are dropped before matching
 * so an out-of-scope question cannot score against a word every procedure
 * happens to contain (“更换”, “检查”, “how”, “change”). Topical nouns are kept.
 */
const ASSISTANT_STOP_TERMS = new Set([
  '如何',
  '怎么',
  '怎样',
  '应该',
  '需要',
  '什么',
  '哪些',
  '哪个',
  '可以',
  '能否',
  '是否',
  '帮我',
  '请问',
  '一下',
  '问题',
  '方法',
  '步骤',
  '流程',
  '处理',
  '排查',
  '检查',
  '更换',
  '维修',
  '故障',
  '原因',
  '解决',
  '相关',
  '资料',
  '内容',
  '情况',
  '创建',
  '新建',
  '报修',
  '建单',
  '开单',
  '工单',
  '加急',
  '紧急',
  '普通',
  'how',
  'what',
  'which',
  'when',
  'where',
  'why',
  'who',
  'should',
  'need',
  'can',
  'could',
  'please',
  'help',
  'problem',
  'issue',
  'method',
  'step',
  'steps',
  'guide',
  'about',
  'the',
  'and',
  'for',
  'with',
  'from',
  'into',
  'repair',
  'check',
  'change',
  'replace',
  'create',
  'new',
  'order',
  'work',
  'ticket',
]);

/**
 * Split a question into content-bearing terms. A question that shares no such
 * term with a document never cites it, which is what keeps an unrelated
 * question from being answered with an unrelated reference.
 */
function assistantQueryTerms(question: string): string[] {
  const terms = new Set<string>();
  for (const chunk of question
    .toLowerCase()
    .split(/[\s，。,.、；;：:！!？?（）()【】[\]"'“”]+/u)) {
    for (const word of chunk.match(/[a-z0-9]+/g) ?? []) {
      if (word.length >= 2 && !ASSISTANT_STOP_TERMS.has(word)) {
        terms.add(word);
      }
    }
    for (const run of chunk.match(/[\u4e00-\u9fff]+/g) ?? []) {
      if (run.length === 1) {
        continue;
      }
      const candidates = run.length <= 4 ? [run] : [];
      for (let index = 0; index + 2 <= run.length; index += 1) {
        candidates.push(run.slice(index, index + 2));
      }
      for (const candidate of candidates) {
        if (!ASSISTANT_STOP_TERMS.has(candidate)) {
          terms.add(candidate);
        }
      }
    }
  }
  return [...terms];
}

/** Read the text out of a langchain reply whose content may be string or blocks. */
function modelReplyText(response: unknown): string {
  if (typeof response === 'string') {
    return response;
  }
  const content = (response as { content?: unknown } | undefined)?.content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        const text = (part as { text?: unknown } | undefined)?.text;
        return typeof text === 'string' ? text : '';
      })
      .join('');
  }
  return '';
}

/** The instruction that keeps a model answer grounded in the cited evidence. */
const ASSISTANT_SYSTEM_PROMPT =
  '你是设备售后服务助手。只能依据用户消息中列出的“资料依据”回答，不要使用资料以外的知识。' +
  '引用依据时使用 [编号]。若资料不足以回答，请直接说明“现有资料不足”，不要猜测或编造。';

export class ServiceDomainService {
  public constructor(
    private readonly database: DatabaseManager,
    private readonly authorization: AppAuthorization,
    private readonly services: ServiceResolver,
    private readonly logger: Logger,
  ) {}

  private repo(name: string): Repo {
    return this.database.repository<Row>(name);
  }

  /**
   * Creates a row with explicit `createdAt`/`updatedAt`.
   *
   * The migration-declared `date` columns have no database default and the
   * repository does not fill them, so every application insert supplies both
   * (the framework's own stores do the same).
   */
  private async createRow(
    name: string,
    values: Record<string, unknown>,
  ): Promise<Row> {
    const now = new Date();
    const created = await this.repo(name).createOne({
      values: { createdAt: now, updatedAt: now, ...values },
    });
    return created.record;
  }

  // ------------------------------------------------------------------ roles

  public async roleOf(userId: string): Promise<ServiceRole> {
    const sets = await this.authorization.permissionSets.getEffective({
      principal: { type: 'user', id: userId },
    });
    const keys = new Set(sets.map((item) => item.key));
    // The root set has no service grant of its own; it is unrestricted and
    // behaves as the supervisor for every service capability.
    const supervisor =
      keys.has(SERVICE_PERMISSION_SETS.supervisor) || keys.has('root');
    return {
      supervisor,
      engineer: keys.has(SERVICE_PERMISSION_SETS.engineer),
      observer: keys.has(SERVICE_PERMISSION_SETS.observer),
      integration: keys.has(SERVICE_PERMISSION_SETS.integration),
      unrestricted: supervisor,
    };
  }

  private async sharedOrderIds(userId: string): Promise<Set<string>> {
    const shares = await this.repo('serviceWorkOrderShares').findMany({
      filter: { sharedWithId: userId },
    });
    return new Set(
      shares
        .filter((row) => !row.revokedAt)
        .map((row) => String(row.workOrderId)),
    );
  }

  /** Work orders the actor may read; `undefined` means every order. */
  public async readableOrderIds(
    userId: string,
    role: ServiceRole,
  ): Promise<Set<string> | undefined> {
    const orders = await this.repo('serviceWorkOrders').findMany({
      select: (select) =>
        select.fields('id', 'assigneeId', 'createdById', 'confidential'),
    });
    if (role.supervisor) {
      return undefined;
    }
    const shared = role.engineer
      ? await this.sharedOrderIds(userId)
      : new Set<string>();
    const ids = new Set<string>();
    for (const order of orders) {
      const id = String(order.id);
      if (role.engineer) {
        if (
          asText(order.assigneeId) === userId ||
          asText(order.createdById) === userId ||
          shared.has(id)
        ) {
          ids.add(id);
        }
        continue;
      }
      if (role.integration) {
        if (asText(order.createdById) === userId) {
          ids.add(id);
        }
        continue;
      }
      // Observer: non-confidential work only.
      if (!order.confidential) {
        ids.add(id);
      }
    }
    return ids;
  }

  public async canRead(
    userId: string,
    role: ServiceRole,
    orderId: string,
  ): Promise<boolean> {
    const readable = await this.readableOrderIds(userId, role);
    return readable === undefined || readable.has(String(orderId));
  }

  /**
   * Handling rights on one work order. A temporary share grants read-only
   * access, so only the supervisor or the assigned engineer may write, and a
   * closed order is final and accepts no further change. This is enforced in
   * the domain because the route's authorization decision is data-scoped, not
   * record-scoped, and a read-only share must not widen the write path.
   */
  private assertHandlingAllowed(
    userId: string,
    role: ServiceRole,
    order: Row,
  ): void {
    if (!role.supervisor && asText(order.assigneeId) !== userId) {
      throw new ServiceDomainError(
        'FORBIDDEN',
        '只有主管或工单负责人可以处理该工单。',
        403,
      );
    }
    if (order.status === WORK_ORDER_STATUS.closed) {
      throw new ServiceDomainError(
        'ORDER_CLOSED',
        '工单已关闭，不能再修改。',
        409,
      );
    }
  }

  /**
   * Check handling rights before a route does work (such as storing an upload)
   * that must not happen for a read-only shared or closed order.
   */
  public async assertWritable(
    userId: string,
    role: ServiceRole,
    orderId: string,
  ): Promise<void> {
    const order = await this.getWorkOrder(userId, role, orderId);
    if (!order) {
      throw new ServiceDomainError(
        'ORDER_NOT_FOUND',
        'Work order not found.',
        404,
      );
    }
    this.assertHandlingAllowed(userId, role, order);
  }

  // --------------------------------------------------------------- ordering

  private async nextOrderNo(now: Date): Promise<string> {
    const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
    const count = await this.repo('serviceWorkOrders').count({
      filter: (filter) => filter.string('orderNo').startsWith(`WO-${stamp}`),
    });
    return `WO-${stamp}-${String(count + 1).padStart(4, '0')}`;
  }

  private async logActivity(
    workOrderId: unknown,
    action: string,
    actorId: string | undefined,
    extra: {
      note?: string;
      fromStatus?: string;
      toStatus?: string;
      detail?: unknown;
    } = {},
  ): Promise<void> {
    await this.createRow('serviceWorkOrderActivities', {
      workOrderId: asId(workOrderId),
      action,
      actorId: actorId ?? null,
      note: extra.note ?? null,
      fromStatus: extra.fromStatus ?? null,
      toStatus: extra.toStatus ?? null,
      detail: extra.detail === undefined ? null : extra.detail,
    });
  }

  private async notifyInbox(input: {
    readonly key: string;
    readonly to: string;
    readonly title: string;
    readonly body: string;
    readonly path: string;
  }): Promise<void> {
    if (!this.services.has(notificationServiceToken)) {
      return;
    }
    try {
      const notification = this.services.resolve<NotificationService>(
        notificationServiceToken,
      );
      await notification.send({
        idempotencyKey: input.key,
        messages: {
          inbox: {
            to: input.to,
            title: input.title,
            body: input.body,
            target: { type: 'route', path: input.path },
          },
        },
      });
    } catch (error) {
      this.logger.warn(
        { err: error, key: input.key },
        'In-app notification could not be delivered; the delivery record keeps it for retry.',
      );
    }
  }

  private async supervisors(): Promise<string[]> {
    const assignments = await this.repo(
      'authorizationPermissionSetAssignments',
    ).findMany({
      filter: {
        permissionSetKey: SERVICE_PERMISSION_SETS.supervisor,
        subjectType: 'user',
      },
      select: (select) => select.fields('subjectId'),
    });
    return assignments.map((row) => String(row.subjectId));
  }

  // ------------------------------------------------------------- work orders

  public async createWorkOrder(
    actorId: string | undefined,
    input: OrderCreateInput,
    options: { readonly sourceFallback?: string } = {},
  ): Promise<Row> {
    const idempotencyKey = this.optionalString(input.idempotencyKey);
    if (idempotencyKey) {
      const existing = await this.repo('serviceWorkOrders').findOne({
        filter: { idempotencyKey },
      });
      if (existing) {
        return existing;
      }
    }
    const externalEventId = this.optionalString(input.externalEventId);
    if (externalEventId) {
      const existing = await this.repo('serviceWorkOrders').findOne({
        filter: { externalEventId },
      });
      if (existing) {
        return existing;
      }
    }

    let device: Row | undefined;
    if (
      input.deviceId !== undefined &&
      input.deviceId !== null &&
      input.deviceId !== ''
    ) {
      device = await this.repo('serviceDevices').findOne({
        filter: { id: asId(input.deviceId) },
      });
      if (!device) {
        throw new ServiceDomainError(
          'DEVICE_NOT_FOUND',
          'Device was not found.',
          404,
        );
      }
      if (device.enabled === false) {
        throw new ServiceDomainError(
          'DEVICE_DISABLED',
          'The device is disabled and cannot receive work orders.',
        );
      }
    }

    // A device is bound to one customer. Creating an order for a device under a
    // different customer would silently detach the two records, so it is refused.
    if (
      device &&
      input.customerId !== undefined &&
      input.customerId !== null &&
      input.customerId !== '' &&
      String(device.customerId) !== String(asId(input.customerId))
    ) {
      throw new ServiceDomainError(
        'CUSTOMER_DEVICE_MISMATCH',
        '所选设备不属于该客户，无法创建工单。',
        409,
      );
    }

    let customerId: unknown =
      input.customerId ?? device?.customerId ?? undefined;
    if (!customerId) {
      const customerName = this.optionalString(input.customerName);
      if (!customerName) {
        throw new ServiceDomainError(
          'CUSTOMER_REQUIRED',
          'Customer is required.',
        );
      }
      const customer = await this.findOrCreateCustomer({
        name: customerName,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
      });
      customerId = customer.id;
    }

    const assigneeId =
      this.optionalString(input.assigneeId) ??
      this.optionalString(
        device?.engineerId === undefined || device?.engineerId === null
          ? undefined
          : asText(device.engineerId),
      );

    const now = new Date();
    const orderNo = await this.nextOrderNo(now);
    const priority =
      input.priority === WORK_ORDER_PRIORITY.urgent
        ? WORK_ORDER_PRIORITY.urgent
        : WORK_ORDER_PRIORITY.normal;

    const created = await this.createRow('serviceWorkOrders', {
      orderNo,
      title: this.optionalString(input.title) ?? '设备售后服务工单',
      description:
        this.optionalString(input.description) ??
        this.optionalString(input.report) ??
        null,
      customerId: asId(customerId),
      deviceId: device ? asId(device.id) : null,
      priority,
      status: WORK_ORDER_STATUS.pendingAccept,
      source:
        input.source === WORK_ORDER_SOURCE.devicePlatform
          ? WORK_ORDER_SOURCE.devicePlatform
          : (options.sourceFallback ?? WORK_ORDER_SOURCE.manual),
      confidential: Boolean(input.confidential),
      assigneeId: assigneeId ?? null,
      createdById: actorId ?? null,
      dueAt:
        this.optionalString(input.dueAt) ?? this.defaultDueAt(now, priority),
      externalEventId: externalEventId ?? null,
      idempotencyKey: idempotencyKey ?? null,
      returnCount: 0,
    });
    const order = created;
    await this.logActivity(order.id, ACTIVITY_ACTIONS.created, actorId, {
      toStatus: WORK_ORDER_STATUS.pendingAccept,
      detail: { source: order.source },
    });
    if (externalEventId) {
      await this.createRow('serviceExternalEvents', {
        eventId: externalEventId,
        workOrderId: asId(order.id),
        payload: JSON.parse(JSON.stringify(input)) as object,
      });
    }

    // A new report stays 待受理. Acceptance is a supervisor action, so it runs
    // from `applyTransition('accept')` (which triggers the acceptance workflow)
    // rather than happening here behind the supervisor's back.
    return order;
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private defaultDueAt(now: Date, priority: string): string {
    const hours = priority === WORK_ORDER_PRIORITY.urgent ? 4 : 48;
    return new Date(now.getTime() + hours * 3600 * 1000).toISOString();
  }

  private async findOrCreateCustomer(input: {
    name: string;
    contactName?: unknown;
    contactPhone?: unknown;
  }): Promise<Row> {
    const existing = await this.repo('serviceCustomers').findOne({
      filter: { name: input.name },
    });
    if (existing) {
      return existing;
    }
    const created = await this.createRow('serviceCustomers', {
      name: input.name,
      contactName: this.optionalString(input.contactName) ?? null,
      contactPhone: this.optionalString(input.contactPhone) ?? null,
    });
    return created;
  }

  private async triggerAcceptanceWorkflow(
    workOrderId: string,
    priority: string,
  ): Promise<void> {
    if (!this.services.has(workflowServiceToken)) {
      return;
    }
    try {
      const workflow = this.services.resolve(workflowServiceToken);
      await workflow.trigger(
        'work-order-acceptance',
        { workOrderId, priority },
        { eventKey: `work-order-acceptance:${workOrderId}` },
      );
    } catch (error) {
      this.logger.warn(
        { err: error, workOrderId },
        'Acceptance workflow could not be triggered; direct acceptance covers it.',
      );
    }
  }

  /**
   * Move a fresh work order to 待处理 and notify its assignee. A repeat call is
   * a no-op, so the creation path and the Workflow both reach the same result.
   */
  public async acceptWorkOrder(
    orderId: string,
    actorId: string | undefined,
    options: { auto?: boolean; assigneeId?: string } = {},
  ): Promise<Row | undefined> {
    const order = await this.repo('serviceWorkOrders').findOne({
      filter: { id: asId(orderId) },
    });
    if (!order) {
      throw new ServiceDomainError(
        'ORDER_NOT_FOUND',
        'Work order not found.',
        404,
      );
    }
    if (order.status !== WORK_ORDER_STATUS.pendingAccept) {
      return order;
    }
    const assigneeId =
      options.assigneeId ??
      this.optionalString(order.assigneeId) ??
      (await this.defaultAssigneeFor(order.deviceId as number | null));
    const updated = await this.repo('serviceWorkOrders').updateOne({
      filter: {
        id: asId(orderId),
        status: WORK_ORDER_STATUS.pendingAccept,
      },
      values: {
        status: WORK_ORDER_STATUS.pendingProcess,
        assigneeId: assigneeId ?? null,
        acceptedById: actorId ?? null,
        acceptedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const record = updated.record;
    await this.logActivity(orderId, ACTIVITY_ACTIONS.accepted, actorId, {
      fromStatus: WORK_ORDER_STATUS.pendingAccept,
      toStatus: WORK_ORDER_STATUS.pendingProcess,
      detail: { auto: Boolean(options.auto) },
    });
    if (assigneeId) {
      const urgent = record.priority === WORK_ORDER_PRIORITY.urgent;
      await this.notifyInbox({
        key: `work-order:${orderId}:accepted`,
        to: assigneeId,
        title: urgent ? '加急工单已受理' : '新工单已受理',
        body: `工单 ${String(record.orderNo)}「${String(record.title)}」已受理，请及时处理。`,
        path: `/service/work-orders/${orderId}`,
      });
    }
    return record;
  }

  private async defaultAssigneeFor(
    deviceId: number | null,
  ): Promise<string | undefined> {
    if (!deviceId) {
      return undefined;
    }
    const device = await this.repo('serviceDevices').findOne({
      filter: { id: asId(deviceId) },
    });
    return device?.engineerId === undefined || device?.engineerId === null
      ? undefined
      : this.optionalString(asText(device.engineerId));
  }

  public async listWorkOrders(
    userId: string,
    role: ServiceRole,
    filter: OrderListFilter,
  ): Promise<{ rows: Row[]; total: number }> {
    const page = Math.max(1, Number(filter.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(filter.pageSize) || 20));
    const readable = await this.readableOrderIds(userId, role);
    const rows = await this.repo('serviceWorkOrders').findMany({
      filter: (builder) => {
        const conditions = [];
        if (filter.status) {
          conditions.push(builder.string('status').eq(filter.status));
        }
        if (filter.priority) {
          conditions.push(builder.string('priority').eq(filter.priority));
        }
        if (filter.assigneeId) {
          conditions.push(builder.string('assigneeId').eq(filter.assigneeId));
        }
        if (filter.overdue) {
          conditions.push(builder.date('dueAt').before(new Date()));
          conditions.push(
            builder.string('status').ne(WORK_ORDER_STATUS.closed),
          );
        }
        if (filter.keyword) {
          const keyword = filter.keyword;
          conditions.push(
            builder.or([
              builder
                .string('title')
                .includes(keyword, { mode: 'insensitive' }),
              builder
                .string('orderNo')
                .includes(keyword, { mode: 'insensitive' }),
            ]),
          );
        }
        return conditions.length ? builder.and(conditions) : builder.and([]);
      },
      sort: (sort) => [sort.field('createdAt').desc()],
    });
    let visible = rows;
    if (readable) {
      visible = visible.filter((row) => readable.has(String(row.id)));
    }
    if (filter.group) {
      const members = await this.repo('serviceTeamMembers').findMany({
        filter: { groupName: filter.group },
        select: (select) => select.fields('userId'),
      });
      const memberIds = new Set(members.map((row) => String(row.userId)));
      visible = visible.filter((row) => memberIds.has(String(row.assigneeId)));
    }
    const total = visible.length;
    return {
      rows: visible.slice((page - 1) * pageSize, page * pageSize),
      total,
    };
  }

  public async getWorkOrder(
    userId: string,
    role: ServiceRole,
    orderId: string,
  ): Promise<Row | undefined> {
    if (!(await this.canRead(userId, role, orderId))) {
      return undefined;
    }
    return this.repo('serviceWorkOrders').findOne({
      filter: { id: asId(orderId) },
    });
  }

  public async orderDetail(
    userId: string,
    role: ServiceRole,
    orderId: string,
  ): Promise<Row | undefined> {
    const order = await this.getWorkOrder(userId, role, orderId);
    if (!order) {
      return undefined;
    }
    const [allActivities, attachments, shares, device, customer] =
      await Promise.all([
        this.repo('serviceWorkOrderActivities').findMany({
          filter: { workOrderId: asId(orderId) },
          sort: (sort) => [sort.field('createdAt').asc()],
        }),
        this.repo('serviceWorkOrderAttachments').findMany({
          filter: { workOrderId: asId(orderId) },
          sort: (sort) => [sort.field('createdAt').asc()],
        }),
        this.repo('serviceWorkOrderShares').findMany({
          filter: { workOrderId: asId(orderId) },
        }),
        order.deviceId
          ? this.repo('serviceDevices').findOne({
              filter: { id: asId(order.deviceId) },
            })
          : undefined,
        order.customerId
          ? this.repo('serviceCustomers').findOne({
              filter: { id: asId(order.customerId) },
            })
          : undefined,
      ]);
    // An observer and the external integration account read the order as a
    // summary. The free-text remarks staff add through `comment` are internal
    // handling notes and stay with the supervisor and the assigned engineer.
    const activities =
      role.observer || role.integration
        ? allActivities.filter(
            (activity) => activity.action !== ACTIVITY_ACTIONS.commented,
          )
        : allActivities;
    // Attach the stored file metadata so the client can preview the real
    // content (PNG and DOCX) instead of only offering a download.
    const attachmentFiles = await Promise.all(
      attachments.map((attachment) =>
        this.repo('serviceWorkOrderFiles').findOne({
          filter: { id: asText(attachment.fileId) },
        }),
      ),
    );
    const attachmentRows = attachments.map((attachment, index) => {
      const file = attachmentFiles[index];
      return {
        ...attachment,
        filename: file ? asText(file.filename) : '',
        mimeType: file ? asText(file.mimeType) : '',
        ext: file ? asText(file.ext) : '',
        size: file ? file.size : 0,
      };
    });
    return {
      ...order,
      activities,
      attachments: attachmentRows,
      shares,
      device: device ?? null,
      customer: customer ?? null,
    };
  }

  public async applyTransition(
    userId: string,
    role: ServiceRole,
    action: TransitionName,
    orderId: string,
    input: TransitionInput,
  ): Promise<Row> {
    if (role.observer || role.integration) {
      throw new ServiceDomainError(
        'FORBIDDEN',
        'This identity cannot change the work order.',
        403,
      );
    }
    const transition = TRANSITIONS[action];
    const order = await this.getWorkOrder(userId, role, orderId);
    if (!order) {
      throw new ServiceDomainError(
        'ORDER_NOT_FOUND',
        'Work order not found.',
        404,
      );
    }
    this.assertHandlingAllowed(userId, role, order);
    if (
      !(transition.from as readonly string[]).includes(String(order.status))
    ) {
      throw new ServiceDomainError(
        'INVALID_STATE',
        `工单当前状态为 ${WORK_ORDER_STATUS_LABELS[order.status as WorkOrderStatus] ?? String(order.status)}，无法执行该操作。`,
        409,
      );
    }
    // A valid submit must carry the handling note; an empty resolution would
    // otherwise close the handling cycle without recording what was done.
    if (action === 'submit' && !asText(input.resolution).trim()) {
      throw new ServiceDomainError(
        'RESOLUTION_REQUIRED',
        '请填写处理说明后再提交确认。',
      );
    }
    const now = new Date();
    // 受理 has its own state writer: it assigns the engineer and notifies them.
    if (action === 'accept') {
      const accepted = await this.acceptWorkOrder(orderId, userId, {
        auto: false,
      });
      if (!accepted) {
        throw new ServiceDomainError(
          'ORDER_NOT_FOUND',
          'Work order not found.',
          404,
        );
      }
      // The acceptance itself is written above; the workflow run records the
      // step and its normal/urgent branch for inspection. It is idempotent, so
      // a replayed event does not accept or notify twice.
      await this.triggerAcceptanceWorkflow(
        orderId,
        this.optionalString(asText(order.priority)) ??
          WORK_ORDER_PRIORITY.normal,
      );
      return accepted;
    }
    const values: Record<string, string | number | Date | null> = {
      status: transition.to,
      updatedAt: now,
    };
    switch (action) {
      case 'start':
        values.startedAt = now;
        break;
      case 'submit':
        values.resolution = asText(input.resolution);
        values.submittedAt = now;
        break;
      case 'confirm':
        values.closedAt = now;
        break;
      case 'return':
        values.lastReturnReason = asText(input.note ?? input.resolution);
        values.returnCount = Number(order.returnCount ?? 0) + 1;
        break;
      default:
        break;
    }
    const updated = await this.repo('serviceWorkOrders').updateOne({
      filter: { id: asId(orderId), status: order.status as string },
      values,
    });
    await this.logActivity(orderId, action, userId, {
      note: this.optionalString(input.note),
      fromStatus: String(order.status),
      toStatus: transition.to,
      detail: input.resolution ? { resolution: input.resolution } : undefined,
    });
    const record = updated.record;
    const assignee =
      record.assigneeId === undefined || record.assigneeId === null
        ? undefined
        : asText(record.assigneeId);
    if (action === 'return' && assignee) {
      await this.notifyInbox({
        key: `work-order:${orderId}:returned:${String(record.returnCount)}`,
        to: assignee,
        title: '工单被退回',
        body: `工单 ${asText(record.orderNo)} 被退回：${asText(record.lastReturnReason)}`,
        path: `/service/work-orders/${orderId}`,
      });
    }
    if (action === 'submit') {
      for (const supervisor of await this.supervisors()) {
        await this.notifyInbox({
          key: `work-order:${orderId}:submitted:${supervisor}`,
          to: supervisor,
          title: '工单待确认',
          body: `工单 ${String(record.orderNo)} 已提交处理结果，等待确认。`,
          path: `/service/work-orders/${orderId}`,
        });
      }
    }
    return record;
  }

  public async addComment(
    userId: string,
    role: ServiceRole,
    orderId: string,
    note: string,
  ): Promise<void> {
    const order = await this.getWorkOrder(userId, role, orderId);
    if (!order) {
      throw new ServiceDomainError(
        'ORDER_NOT_FOUND',
        'Work order not found.',
        404,
      );
    }
    this.assertHandlingAllowed(userId, role, order);
    if (!note.trim()) {
      throw new ServiceDomainError(
        'NOTE_REQUIRED',
        'Comment must not be empty.',
      );
    }
    await this.logActivity(orderId, ACTIVITY_ACTIONS.commented, userId, {
      note,
    });
  }

  // ---------------------------------------------------------- collaboration

  public async shareWorkOrder(
    userId: string,
    role: ServiceRole,
    orderId: string,
    sharedWithId: string,
  ): Promise<Row> {
    if (!role.supervisor && !role.engineer) {
      throw new ServiceDomainError('FORBIDDEN', 'Not allowed to share.', 403);
    }
    const order = await this.getWorkOrder(userId, role, orderId);
    if (!order) {
      throw new ServiceDomainError(
        'ORDER_NOT_FOUND',
        'Work order not found.',
        404,
      );
    }
    this.assertHandlingAllowed(userId, role, order);
    if (order.confidential) {
      throw new ServiceDomainError('CONFIDENTIAL', '涉密工单不可共享。', 409);
    }
    if (String(order.assigneeId) === sharedWithId) {
      throw new ServiceDomainError(
        'ALREADY_ASSIGNED',
        '该工程师已是工单负责人。',
      );
    }
    const existing = await this.repo('serviceWorkOrderShares').findOne({
      filter: { workOrderId: asId(orderId), sharedWithId },
    });
    if (existing && !existing.revokedAt) {
      return existing;
    }
    const created = existing
      ? (
          await this.repo('serviceWorkOrderShares').updateOne({
            filter: { id: asId(existing.id) },
            values: {
              revokedAt: null,
              sharedById: userId,
              updatedAt: new Date(),
            },
          })
        ).record
      : await this.createRow('serviceWorkOrderShares', {
          workOrderId: asId(orderId),
          sharedWithId,
          sharedById: userId,
        });
    await this.logActivity(orderId, ACTIVITY_ACTIONS.shared, userId, {
      detail: { sharedWithId },
    });
    await this.createSharingRule(orderId, sharedWithId);
    await this.notifyInbox({
      key: `work-order:${orderId}:shared:${sharedWithId}`,
      to: sharedWithId,
      title: '工单已共享给你',
      body: `工单 ${String(order.orderNo)} 已临时只读共享给你。`,
      path: `/service/work-orders/${orderId}`,
    });
    return created;
  }

  private async createSharingRule(
    orderId: string,
    sharedWithId: string,
  ): Promise<void> {
    const authorization = this.authorization as AppAuthorization &
      Partial<SharingRulesAuthorizationApi>;
    if (!authorization.sharingRules) {
      return;
    }
    try {
      const rule = defineSharingRule(
        `service-work-order-${orderId}-${sharedWithId}`,
        serviceWorkOrdersDefinition.reference(),
      )
        .title('工单临时共享')
        .subjects({ type: 'user', id: sharedWithId })
        .scope('view', 'orders', selection.records([orderId]))
        .reason('Temporary read-only work order share')
        .build();
      await authorization.sharingRules.create(rule);
    } catch (error) {
      this.logger.warn(
        { err: error, orderId },
        'Sharing rule could not be written; the share row still scopes reads.',
      );
    }
  }

  private async removeSharingRule(
    orderId: string,
    sharedWithId: string,
  ): Promise<void> {
    const authorization = this.authorization as AppAuthorization &
      Partial<SharingRulesAuthorizationApi>;
    if (!authorization.sharingRules) {
      return;
    }
    const key = `service-work-order-${orderId}-${sharedWithId}`;
    try {
      await authorization.sharingRules.delete(key);
    } catch (error) {
      this.logger.warn(
        { err: error, orderId },
        'Sharing rule could not be removed; the revoked share row already blocks reads.',
      );
    }
  }

  public async unshareWorkOrder(
    userId: string,
    role: ServiceRole,
    orderId: string,
    sharedWithId: string,
  ): Promise<void> {
    const order = await this.getWorkOrder(userId, role, orderId);
    if (!order) {
      throw new ServiceDomainError(
        'ORDER_NOT_FOUND',
        'Work order not found.',
        404,
      );
    }
    this.assertHandlingAllowed(userId, role, order);
    const share = await this.repo('serviceWorkOrderShares').findOne({
      filter: { workOrderId: asId(orderId), sharedWithId },
    });
    if (!share || share.revokedAt) {
      return;
    }
    await this.repo('serviceWorkOrderShares').updateOne({
      filter: { id: asId(share.id) },
      values: { revokedAt: new Date(), updatedAt: new Date() },
    });
    await this.removeSharingRule(orderId, sharedWithId);
    await this.logActivity(orderId, ACTIVITY_ACTIONS.unshared, userId, {
      detail: { sharedWithId },
    });
  }

  // ------------------------------------------------------------ attachments

  public async attachFile(
    userId: string,
    role: ServiceRole,
    orderId: string,
    fileId: string,
    category: string,
  ): Promise<Row> {
    const order = await this.getWorkOrder(userId, role, orderId);
    if (!order) {
      throw new ServiceDomainError(
        'ORDER_NOT_FOUND',
        'Work order not found.',
        404,
      );
    }
    this.assertHandlingAllowed(userId, role, order);
    const file = await this.repo('serviceWorkOrderFiles').findOne({
      filter: { id: fileId },
    });
    if (!file) {
      throw new ServiceDomainError(
        'FILE_NOT_FOUND',
        'File was not found.',
        404,
      );
    }
    const mimeType = asText(file.mimeType);
    if (category === 'photo' && !mimeType.startsWith('image/png')) {
      throw new ServiceDomainError(
        'INVALID_FILE_TYPE',
        '照片仅支持 PNG 格式。',
      );
    }
    if (
      category === 'report' &&
      !(
        mimeType.includes('wordprocessingml') ||
        mimeType === 'application/msword' ||
        String(file.ext).toLowerCase() === 'docx'
      )
    ) {
      throw new ServiceDomainError(
        'INVALID_FILE_TYPE',
        '维修报告仅支持 DOCX 格式。',
      );
    }
    const existing = await this.repo('serviceWorkOrderAttachments').findOne({
      filter: { workOrderId: asId(orderId), fileId },
    });
    if (existing) {
      return existing;
    }
    const created = await this.createRow('serviceWorkOrderAttachments', {
      workOrderId: asId(orderId),
      fileId,
      category,
      uploadedById: userId,
    });
    await this.logActivity(orderId, ACTIVITY_ACTIONS.attached, userId, {
      detail: { fileId, category },
    });
    return created;
  }

  public async detachFile(
    userId: string,
    role: ServiceRole,
    orderId: string,
    attachmentId: string,
  ): Promise<void> {
    const order = await this.getWorkOrder(userId, role, orderId);
    if (!order) {
      throw new ServiceDomainError(
        'ORDER_NOT_FOUND',
        'Work order not found.',
        404,
      );
    }
    this.assertHandlingAllowed(userId, role, order);
    if (role.engineer && !role.supervisor && !role.observer) {
      const attachment = await this.repo('serviceWorkOrderAttachments').findOne(
        {
          filter: { id: asId(attachmentId), workOrderId: asId(orderId) },
        },
      );
      if (attachment && String(attachment.uploadedById) !== userId) {
        throw new ServiceDomainError(
          'FORBIDDEN',
          '只能删除自己上传的附件。',
          403,
        );
      }
    }
    await this.repo('serviceWorkOrderAttachments').deleteOne({
      filter: { id: asId(attachmentId), workOrderId: asId(orderId) },
    });
    await this.logActivity(orderId, ACTIVITY_ACTIONS.detached, userId, {
      detail: { attachmentId },
    });
  }

  public async getAttachmentFile(
    userId: string,
    role: ServiceRole,
    attachmentId: string,
  ): Promise<{ attachment: Row; file: Row } | undefined> {
    const attachment = await this.repo('serviceWorkOrderAttachments').findOne({
      filter: { id: asId(attachmentId) },
    });
    if (!attachment) {
      return undefined;
    }
    if (!(await this.canRead(userId, role, String(attachment.workOrderId)))) {
      return undefined;
    }
    const file = await this.repo('serviceWorkOrderFiles').findOne({
      filter: { id: String(attachment.fileId) },
    });
    if (!file) {
      return undefined;
    }
    return { attachment, file };
  }

  // ------------------------------------------------------------- inspections

  /** One inspection per enabled device due by `date`; same device same day dedups. */
  public async generateDailyInspections(date: string): Promise<number> {
    const devices = await this.repo('serviceDevices').findMany({
      filter: (filter) =>
        filter.and([
          filter.boolean('enabled').isTrue(),
          filter.date('nextInspectionDate').notAfter(date),
        ]),
    });
    let created = 0;
    for (const device of devices) {
      const existing = await this.repo('serviceInspections').findOne({
        filter: (filter) =>
          filter.and([
            filter.number('deviceId').eq(asId(device.id)),
            filter.date('plannedDate').on(date),
          ]),
      });
      if (existing) {
        continue;
      }
      await this.createRow('serviceInspections', {
        deviceId: asId(device.id),
        plannedDate: date,
        assigneeId: device.engineerId ?? null,
        status: INSPECTION_STATUS.pending,
      });
      created += 1;
    }
    return created;
  }

  /** Remind each assignee once per day about their overdue open orders. */
  public async sendOverdueReminders(date: string): Promise<number> {
    const orders = await this.repo('serviceWorkOrders').findMany({
      filter: (filter) =>
        filter.and([
          filter.date('dueAt').before(new Date(`${date}T23:59:59.999Z`)),
          filter.string('status').ne(WORK_ORDER_STATUS.closed),
        ]),
    });
    let sent = 0;
    for (const order of orders) {
      // An unassigned order has nobody to remind; an empty string must be treated
      // as absent, or the notification is rejected as a non-user recipient.
      if (!this.optionalString(order.assigneeId)) {
        continue;
      }
      await this.notifyInbox({
        key: `work-order:${String(order.id)}:overdue:${date}`,
        to: asText(order.assigneeId),
        title: '工单已超期',
        body: `工单 ${String(order.orderNo)} 已超期，请尽快处理。`,
        path: `/service/work-orders/${String(order.id)}`,
      });
      sent += 1;
    }
    return sent;
  }

  /**
   * Fire one of this application's schedules through the Scheduler itself.
   *
   * Resolving the materialized schedule and triggering it dispatches the same
   * `ScheduleDispatchJob` a cron tick uses, so the controlled run reaches the
   * registered target and records an occurrence in the Scheduler's own history.
   * A disabled or paused schedule is refused rather than run directly, which is
   * what keeps a stopped plan from producing new results.
   */
  public async runServiceSchedule(
    target: ServiceScheduleTarget,
    config: { readonly date?: string } = {},
  ): Promise<ServiceScheduleRun> {
    let connection: string | undefined;
    try {
      connection = QueueManager.getConfigResolver().getQueueAdapter('schedule');
    } catch {
      connection = undefined;
    }
    if (!connection) {
      throw new ServiceDomainError(
        'SCHEDULE_UNAVAILABLE',
        '计划调度器尚未就绪，无法执行。',
        503,
      );
    }
    const adapter = QueueManager.use(connection);
    const schedules = await Schedule.list({}, { adapter: () => adapter });
    const schedule = schedules.find((candidate) => {
      const payload = candidate.payload as
        { readonly target?: { readonly type?: unknown } } | undefined;
      return payload?.target?.type === target;
    });
    if (!schedule) {
      throw new ServiceDomainError(
        'SCHEDULE_NOT_FOUND',
        '未找到对应的计划，无法执行。',
        503,
      );
    }
    if (schedule.status !== 'active') {
      throw new ServiceDomainError(
        'SCHEDULE_DISABLED',
        '该计划已停用，不会产生新的执行结果。',
        409,
      );
    }

    const payload = schedule.payload as
      | {
          readonly target?: {
            readonly type?: unknown;
            readonly config?: Record<string, unknown>;
          };
        }
      | undefined;
    // A controlled run may name the day it runs for, which the target reads from
    // its config; without one the target uses the Shanghai day it fires in.
    const override =
      config.date && payload?.target
        ? {
            ...payload,
            target: {
              ...payload.target,
              config: { ...payload.target.config, date: config.date },
            },
          }
        : undefined;

    await schedule.trigger(override);
    return {
      scheduleId: schedule.id,
      key: SERVICE_SCHEDULE_KEYS[target],
      runCount: schedule.runCount,
    };
  }

  public async listInspections(
    userId: string,
    role: ServiceRole,
  ): Promise<Row[]> {
    const rows = await this.repo('serviceInspections').findMany({
      sort: (sort) => [sort.field('plannedDate').desc()],
    });
    if (role.supervisor) {
      return rows;
    }
    return rows.filter((row) => String(row.assigneeId) === userId);
  }

  public async completeInspection(
    userId: string,
    role: ServiceRole,
    inspectionId: string,
    result: string,
  ): Promise<Row> {
    const inspection = await this.repo('serviceInspections').findOne({
      filter: { id: asId(inspectionId) },
    });
    if (!inspection) {
      throw new ServiceDomainError(
        'INSPECTION_NOT_FOUND',
        '巡检任务不存在。',
        404,
      );
    }
    if (
      role.engineer &&
      !role.supervisor &&
      String(inspection.assigneeId) !== userId
    ) {
      throw new ServiceDomainError(
        'FORBIDDEN',
        '只能完成指派给自己的巡检。',
        403,
      );
    }
    const updated = await this.repo('serviceInspections').updateOne({
      filter: { id: asId(inspectionId) },
      values: {
        status: INSPECTION_STATUS.completed,
        result,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    return updated.record;
  }

  // --------------------------------------------------------------- dashboard

  public async dashboard(
    userId: string,
    role: ServiceRole,
  ): Promise<DashboardSummary> {
    const now = new Date();
    const openStatuses = [
      WORK_ORDER_STATUS.pendingProcess,
      WORK_ORDER_STATUS.processing,
    ];
    if (role.supervisor) {
      const counts: Record<string, number> = {};
      for (const status of Object.values(WORK_ORDER_STATUS)) {
        counts[status] = await this.repo('serviceWorkOrders').count({
          filter: { status },
        });
      }
      const overdue = await this.repo('serviceWorkOrders').count({
        filter: (filter) =>
          filter.and([
            filter.date('dueAt').before(now),
            filter.string('status').ne(WORK_ORDER_STATUS.closed),
          ]),
      });
      const groups: Array<{ group: string; total: number; open: number }> = [];
      for (const group of ENGINEER_GROUPS) {
        const members = await this.repo('serviceTeamMembers').findMany({
          filter: { groupName: group },
          select: (select) => select.fields('userId'),
        });
        let total = 0;
        let open = 0;
        for (const member of members) {
          const memberId = String(member.userId);
          total += await this.repo('serviceWorkOrders').count({
            filter: { assigneeId: memberId },
          });
          for (const status of openStatuses) {
            open += await this.repo('serviceWorkOrders').count({
              filter: { assigneeId: memberId, status },
            });
          }
        }
        groups.push({ group, total, open });
      }
      return {
        role: 'supervisor',
        counts: {
          pending_accept: counts[WORK_ORDER_STATUS.pendingAccept] ?? 0,
          pending_process: counts[WORK_ORDER_STATUS.pendingProcess] ?? 0,
          processing: counts[WORK_ORDER_STATUS.processing] ?? 0,
          pending_confirm: counts[WORK_ORDER_STATUS.pendingConfirm] ?? 0,
          closed: counts[WORK_ORDER_STATUS.closed] ?? 0,
        },
        groups,
        overdue,
      };
    }
    if (role.integration) {
      const total = await this.repo('serviceWorkOrders').count({
        filter: { createdById: userId },
      });
      return { role: 'integration', counts: { submitted: total }, overdue: 0 };
    }

    const counts: Record<string, number> = {};
    if (role.engineer) {
      for (const status of Object.values(WORK_ORDER_STATUS)) {
        counts[status] = await this.repo('serviceWorkOrders').count({
          filter: { assigneeId: userId, status },
        });
      }
    } else {
      for (const status of Object.values(WORK_ORDER_STATUS)) {
        counts[status] = await this.repo('serviceWorkOrders').count({
          filter: (filter) =>
            filter.and([
              filter.boolean('confidential').isFalse(),
              filter.string('status').eq(status),
            ]),
        });
      }
    }
    const overdue = await this.repo('serviceWorkOrders').count({
      filter: (filter) =>
        filter.and([
          ...(role.engineer
            ? [filter.string('assigneeId').eq(userId)]
            : [filter.boolean('confidential').isFalse()]),
          filter.date('dueAt').before(now),
          filter.string('status').ne(WORK_ORDER_STATUS.closed),
        ]),
    });
    if (role.engineer) {
      counts.pending_inspections = await this.repo('serviceInspections').count({
        filter: { assigneeId: userId, status: INSPECTION_STATUS.pending },
      });
    }
    return {
      role: role.engineer ? 'engineer' : 'observer',
      counts,
      overdue,
    };
  }

  // --------------------------------------------------------------- assistant

  public async askAssistant(
    userId: string,
    role: ServiceRole,
    question: string,
    workOrderId?: string,
  ): Promise<AssistantAnswer> {
    const terms = assistantQueryTerms(question);
    const matches = (text: unknown): number => {
      const value = asText(text).toLowerCase();
      return terms.reduce(
        (score, term) => (value.includes(term) ? score + 1 : score),
        0,
      );
    };

    const references: AssistantReference[] = [];
    const evidence: string[] = [];

    if (workOrderId) {
      const order = await this.getWorkOrder(userId, role, workOrderId);
      if (!order) {
        return {
          status: 'insufficient_evidence',
          answer: '未找到你有权查看的该工单，无法据此作答。',
          references: [],
        };
      }
      references.push({
        type: 'order',
        id: String(order.id),
        title: `工单 ${String(order.orderNo)} ${String(order.title)}`,
        detail:
          `${WORK_ORDER_STATUS_LABELS[order.status as WorkOrderStatus] ?? ''} ${asText(order.description)}`.trim(),
      });
      evidence.push(
        `工单 ${String(order.orderNo)} 当前状态为${WORK_ORDER_STATUS_LABELS[order.status as WorkOrderStatus] ?? order.status}。${asText(order.description)}`,
      );
    }

    const articles = await this.repo('serviceKnowledgeArticles').findMany({
      filter: { status: KNOWLEDGE_STATUS.published },
    });
    const scoredArticles = articles
      .map((article) => ({
        article,
        score:
          matches(article.title) * 3 +
          matches(article.summary) * 2 +
          matches(article.content),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 3);
    for (const { article } of scoredArticles) {
      references.push({
        type: 'knowledge',
        id: String(article.id),
        title: String(article.title),
        detail: asText(article.summary).slice(0, 160),
      });
      evidence.push(
        `知识《${String(article.title)}》：${asText(article.summary)} ${asText(article.content).slice(0, 400)}`,
      );
    }

    const manuals = await this.repo('serviceManuals').findMany({
      filter: { status: KNOWLEDGE_STATUS.published },
    });
    // Only the newest version of each manual answers. A manual the supervisor
    // revised is a new row, and an obsolete version left in the results would
    // answer from the procedure it replaced — a conversation started after the
    // revision must see the revision.
    const scoredManuals = latestManualsByTitle(manuals)
      .map((manual) => ({
        manual,
        score: matches(manual.title) * 3 + matches(manual.content),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 2);
    for (const { manual } of scoredManuals) {
      references.push({
        type: 'manual',
        id: String(manual.id),
        title: `${String(manual.title)} (${String(manual.version)})`,
        detail: String(manual.content).slice(0, 160),
      });
      evidence.push(
        `手册《${String(manual.title)}》${String(manual.version)}：${String(manual.content).slice(0, 400)}`,
      );
    }

    const proposedAction = /创建|新建|报修|建单|开单/.test(question)
      ? {
          type: 'create_work_order' as const,
          title: '创建维修工单',
          priority: /加急|紧急/.test(question) ? 'urgent' : 'normal',
        }
      : undefined;

    // Without a single relevant record there is nothing to ground an answer, so
    // the honest outcome is an explicit statement of insufficient evidence —
    // never a template answer over unrelated references.
    if (references.length === 0) {
      return {
        status: 'insufficient_evidence',
        answer:
          '当前授权的工单、维修知识和设备手册中没有找到能回答该问题的依据，无法作答。',
        references: [],
        proposedAction,
      };
    }

    const model = await this.assistantModelAnswer(question, evidence);
    if (model.status === 'answered') {
      return {
        status: 'answered',
        answer: model.answer,
        references,
        proposedAction,
      };
    }

    return {
      status: model.status,
      answer:
        model.status === 'model_unavailable'
          ? `当前未配置可用的 AI 模型，无法生成回答。以下为可核对的资料依据（共 ${references.length} 条）。`
          : '调用 AI 模型失败，未能生成回答。以下为可核对的资料依据。',
      references,
      proposedAction,
    };
  }

  /**
   * Ask the configured model to answer from the retrieved evidence. Returns a
   * degraded status rather than throwing when no model is configured or the
   * call fails, so the caller can report the real state instead of a template.
   */
  private async assistantModelAnswer(
    question: string,
    evidence: readonly string[],
  ): Promise<{ status: AssistantStatus; answer: string }> {
    if (!this.services.has(aiManagerToken)) {
      return { status: 'model_unavailable', answer: '' };
    }
    const ai = this.services.resolve(aiManagerToken);
    let model: Awaited<ReturnType<typeof ai.llmProviderManager.resolveModel>>;
    try {
      model = await ai.llmProviderManager.resolveModel();
    } catch {
      return { status: 'model_unavailable', answer: '' };
    }
    try {
      const { provider } = await ai.llmProviderManager.getLLMService(model);
      const response: unknown = await provider.invoke({
        messages: [
          { role: 'system', content: ASSISTANT_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `资料依据：\n${evidence
              .map((item, index) => `[${index + 1}] ${item}`)
              .join('\n')}\n\n问题：${question}`,
          },
        ],
      });
      const text = modelReplyText(response).trim();
      if (!text) {
        return { status: 'model_error', answer: '' };
      }
      return { status: 'answered', answer: text };
    } catch (error) {
      this.logger.warn({ err: error }, 'Assistant model call failed.');
      return { status: 'model_error', answer: '' };
    }
  }

  public async saveConversation(
    userId: string,
    conversationId: string | undefined,
    title: string,
    messages: unknown,
  ): Promise<Row> {
    const payload = JSON.parse(JSON.stringify(messages ?? [])) as object;
    if (conversationId && /^\d+$/.test(conversationId)) {
      const existing = await this.repo('serviceAssistantConversations').findOne(
        {
          filter: { id: asId(conversationId), userId },
        },
      );
      if (existing) {
        const updated = await this.repo(
          'serviceAssistantConversations',
        ).updateOne({
          filter: { id: asId(conversationId) },
          values: { title, messages: payload, updatedAt: new Date() },
        });
        return updated.record;
      }
    }
    const created = await this.createRow('serviceAssistantConversations', {
      userId,
      title,
      messages: payload,
    });
    return created;
  }

  public async listConversations(userId: string): Promise<Row[]> {
    return this.repo('serviceAssistantConversations').findMany({
      filter: { userId },
      sort: (sort) => [sort.field('updatedAt').desc()],
      limit: 50,
    });
  }

  // ------------------------------------------------------------ master data

  public async listCustomers(): Promise<Row[]> {
    return this.repo('serviceCustomers').findMany({
      sort: (sort) => [sort.field('name').asc()],
    });
  }

  public async listDevices(userId: string, role: ServiceRole): Promise<Row[]> {
    const rows = await this.repo('serviceDevices').findMany({
      sort: (sort) => [sort.field('serialNumber').asc()],
    });
    if (role.supervisor) {
      return rows;
    }
    if (role.engineer) {
      return rows.filter((row) => String(row.engineerId) === userId);
    }
    return rows;
  }

  public async listKnowledge(
    _userId: string,
    role: ServiceRole,
  ): Promise<Row[]> {
    const rows = await this.repo('serviceKnowledgeArticles').findMany({
      sort: (sort) => [sort.field('updatedAt').desc()],
    });
    if (role.supervisor) {
      return rows;
    }
    return rows.filter((row) => row.status === KNOWLEDGE_STATUS.published);
  }

  public async listManuals(): Promise<Row[]> {
    return this.repo('serviceManuals').findMany({
      filter: { status: KNOWLEDGE_STATUS.published },
      sort: (sort) => [sort.field('updatedAt').desc()],
    });
  }

  public async listEngineers(): Promise<
    Array<{ id: string; name: string; group?: string }>
  > {
    const members = await this.repo('serviceTeamMembers').findMany({
      sort: (sort) => [sort.field('displayName').asc()],
    });
    return members.map((member) => ({
      id: String(member.userId),
      name: String(member.displayName ?? member.userId),
      ...(member.groupName === undefined
        ? {}
        : { group: asText(member.groupName) }),
    }));
  }

  // ------------------------------------------------------ master maintenance

  private assertSupervisor(role: ServiceRole): void {
    if (!role.supervisor) {
      throw new ServiceDomainError(
        'FORBIDDEN',
        '只有主管可以维护这些基础数据。',
        403,
      );
    }
  }

  public async listTeamMembers(): Promise<Row[]> {
    return this.repo('serviceTeamMembers').findMany({
      sort: (sort) => [sort.field('displayName').asc()],
    });
  }

  private nullable(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  public async saveCustomer(
    _actorId: string,
    role: ServiceRole,
    input: Row,
  ): Promise<Row> {
    this.assertSupervisor(role);
    const values: Record<string, string | null> = {
      name: this.optionalString(input.name) ?? '',
      contactName: this.nullable(input.contactName),
      contactPhone: this.nullable(input.contactPhone),
      contactEmail: this.nullable(input.contactEmail),
      address: this.nullable(input.address),
      note: this.nullable(input.note),
    };
    if (input.id !== undefined && input.id !== null && input.id !== '') {
      const updated = await this.repo('serviceCustomers').updateOne({
        filter: { id: asId(input.id) },
        values: { ...values, updatedAt: new Date() },
      });
      return updated.record;
    }
    const created = await this.createRow('serviceCustomers', values);
    return created;
  }

  public async deleteCustomer(
    _actorId: string,
    role: ServiceRole,
    id: string,
  ): Promise<void> {
    this.assertSupervisor(role);
    const devices = await this.repo('serviceDevices').count({
      filter: { customerId: asId(id) },
    });
    if (devices > 0) {
      throw new ServiceDomainError(
        'CUSTOMER_IN_USE',
        '该客户下仍有设备，无法删除。',
        409,
      );
    }
    await this.repo('serviceCustomers').deleteOne({ filter: { id: asId(id) } });
  }

  public async saveDevice(
    _actorId: string,
    role: ServiceRole,
    input: Row,
  ): Promise<Row> {
    this.assertSupervisor(role);
    const serialNumber = this.optionalString(input.serialNumber);
    const name = this.optionalString(input.name);
    const hasCustomer =
      input.customerId !== undefined &&
      input.customerId !== null &&
      input.customerId !== '';
    // A device belongs to a customer and carries a unique number and a name.
    // Rejecting the missing fields here keeps the database NOT NULL constraint
    // from surfacing as an unhandled 500, and gives the operator a readable
    // reason beside the field instead.
    if (!serialNumber) {
      throw new ServiceDomainError(
        'DEVICE_SERIAL_REQUIRED',
        '请填写设备编号。',
      );
    }
    if (!name) {
      throw new ServiceDomainError('DEVICE_NAME_REQUIRED', '请填写设备名称。');
    }
    if (!hasCustomer) {
      throw new ServiceDomainError(
        'DEVICE_CUSTOMER_REQUIRED',
        '请选择所属客户。',
      );
    }
    const customerId = asId(input.customerId);
    const customer = await this.repo('serviceCustomers').findOne({
      filter: { id: customerId },
    });
    if (!customer) {
      throw new ServiceDomainError('CUSTOMER_NOT_FOUND', '客户不存在。', 404);
    }
    const values: Record<string, string | number | boolean | Date | null> = {
      serialNumber,
      name,
      model: this.nullable(input.model),
      customerId,
      engineerId: this.nullable(input.engineerId),
      enabled: input.enabled === undefined ? true : Boolean(input.enabled),
      installedAt: this.nullable(input.installedAt),
      nextInspectionDate: this.nullable(input.nextInspectionDate),
      location: this.nullable(input.location),
      note: this.nullable(input.note),
    };
    if (serialNumber) {
      const conflict = await this.repo('serviceDevices').findOne({
        filter: { serialNumber },
      });
      if (
        conflict &&
        (input.id === undefined ||
          input.id === null ||
          input.id === '' ||
          asText(conflict.id) !== asText(input.id))
      ) {
        throw this.duplicateSerialError(serialNumber);
      }
    }
    try {
      if (input.id !== undefined && input.id !== null && input.id !== '') {
        const updated = await this.repo('serviceDevices').updateOne({
          filter: { id: asId(input.id) },
          values: { ...values, updatedAt: new Date() },
        });
        return updated.record;
      }
      const created = await this.createRow('serviceDevices', values);
      return created;
    } catch (error) {
      // The unique index is the authority; a concurrent insert that got past the
      // check above still surfaces as a readable conflict instead of a 500.
      if (this.isUniqueViolation(error)) {
        throw this.duplicateSerialError(String(values.serialNumber));
      }
      throw error;
    }
  }

  private duplicateSerialError(serialNumber: string): ServiceDomainError {
    return new ServiceDomainError(
      'DEVICE_SERIAL_DUPLICATE',
      `设备编号 ${serialNumber} 已存在，请使用唯一编号。`,
      409,
    );
  }

  /**
   * Whether a repository error is a unique-constraint violation, across sqlite,
   * postgres and mysql. The driver may wrap the original error, so the cause
   * chain is walked rather than only the outermost message read.
   */
  private isUniqueViolation(error: unknown): boolean {
    const visited = new Set<unknown>();
    let current: unknown = error;
    while (current && typeof current === 'object' && !visited.has(current)) {
      visited.add(current);
      const record = current as Record<string, unknown>;
      const code = record.code;
      const number = record.errno ?? record.number ?? record.errorNum;
      if (
        record.errCode === -6602 ||
        code === '23505' ||
        code === 'ER_DUP_ENTRY' ||
        code === 'SQLITE_CONSTRAINT' ||
        code === 'SQLITE_CONSTRAINT_UNIQUE' ||
        code === 'SQLITE_CONSTRAINT_PRIMARYKEY' ||
        number === 1 ||
        number === 1062 ||
        number === 2601 ||
        number === 2627
      ) {
        return true;
      }
      current = record.cause ?? record.originalError;
    }
    return false;
  }

  public async deleteDevice(
    _actorId: string,
    role: ServiceRole,
    id: string,
  ): Promise<void> {
    this.assertSupervisor(role);
    await this.repo('serviceDevices').deleteOne({ filter: { id: asId(id) } });
  }

  public async saveKnowledge(
    actorId: string,
    role: ServiceRole,
    input: Row,
  ): Promise<Row> {
    this.assertSupervisor(role);
    const status =
      input.status === KNOWLEDGE_STATUS.published
        ? KNOWLEDGE_STATUS.published
        : KNOWLEDGE_STATUS.draft;
    const values: Record<string, string | Date | null> = {
      title: this.optionalString(input.title) ?? '',
      summary: this.nullable(input.summary),
      content: this.nullable(input.content),
      tags: this.nullable(input.tags),
      status,
      authorId: actorId,
      publishedAt:
        status === KNOWLEDGE_STATUS.published
          ? (this.nullable(input.publishedAt) ?? new Date().toISOString())
          : null,
    };
    if (input.id !== undefined && input.id !== null && input.id !== '') {
      const updated = await this.repo('serviceKnowledgeArticles').updateOne({
        filter: { id: asId(input.id) },
        values: { ...values, updatedAt: new Date() },
      });
      return updated.record;
    }
    const created = await this.createRow('serviceKnowledgeArticles', values);
    return created;
  }

  public async deleteKnowledge(
    _actorId: string,
    role: ServiceRole,
    id: string,
  ): Promise<void> {
    this.assertSupervisor(role);
    await this.repo('serviceKnowledgeArticles').deleteOne({
      filter: { id: asId(id) },
    });
  }

  public async saveManual(
    _actorId: string,
    role: ServiceRole,
    input: Row,
  ): Promise<Row> {
    this.assertSupervisor(role);
    const status =
      input.status === KNOWLEDGE_STATUS.published
        ? KNOWLEDGE_STATUS.published
        : KNOWLEDGE_STATUS.draft;
    const values: Record<string, string | null> = {
      title: this.optionalString(input.title) ?? '',
      version: this.optionalString(input.version) ?? 'v1',
      deviceModel: this.nullable(input.deviceModel),
      content: this.nullable(input.content),
      status,
    };
    if (input.id !== undefined && input.id !== null && input.id !== '') {
      const updated = await this.repo('serviceManuals').updateOne({
        filter: { id: asId(input.id) },
        values: { ...values, updatedAt: new Date() },
      });
      return updated.record;
    }
    const created = await this.createRow('serviceManuals', values);
    return created;
  }

  public async deleteManual(
    _actorId: string,
    role: ServiceRole,
    id: string,
  ): Promise<void> {
    this.assertSupervisor(role);
    await this.repo('serviceManuals').deleteOne({ filter: { id: asId(id) } });
  }

  public async saveTeamMember(
    _actorId: string,
    role: ServiceRole,
    input: Row,
  ): Promise<Row> {
    this.assertSupervisor(role);
    const values: Record<string, string> = {
      userId: this.optionalString(input.userId) ?? '',
      groupName: this.optionalString(input.groupName) ?? ENGINEER_GROUPS[0],
      displayName: this.optionalString(input.displayName) ?? '',
    };
    if (input.id !== undefined && input.id !== null && input.id !== '') {
      const updated = await this.repo('serviceTeamMembers').updateOne({
        filter: { id: asId(input.id) },
        values: { ...values, updatedAt: new Date() },
      });
      return updated.record;
    }
    const created = await this.createRow('serviceTeamMembers', values);
    return created;
  }

  public async deleteTeamMember(
    _actorId: string,
    role: ServiceRole,
    id: string,
  ): Promise<void> {
    this.assertSupervisor(role);
    await this.repo('serviceTeamMembers').deleteOne({
      filter: { id: asId(id) },
    });
  }

  // -------------------------------------------------------------------- files

  /** Persist the metadata of a file that has already been stored on a disk. */
  public async registerFile(input: {
    id: string;
    disk: string;
    key: string;
    filename: string;
    ext: string;
    mimeType: string;
    size: number;
  }): Promise<Row> {
    const created = await this.createRow('serviceWorkOrderFiles', {
      id: input.id,
      disk: input.disk,
      key: input.key,
      filename: input.filename,
      ext: input.ext,
      mimeType: input.mimeType,
      size: input.size,
    });
    return created;
  }

  public newFileId(): string {
    return randomUUID();
  }

  public async getFile(fileId: string): Promise<Row | undefined> {
    return this.repo('serviceWorkOrderFiles').findOne({
      filter: { id: fileId },
    });
  }

  public async purgeFile(fileId: string): Promise<void> {
    await this.repo('serviceWorkOrderFiles').deleteOne({
      filter: { id: fileId },
    });
  }

  public async getAttachmentById(
    attachmentId: string,
  ): Promise<Row | undefined> {
    return this.repo('serviceWorkOrderAttachments').findOne({
      filter: { id: asId(attachmentId) },
    });
  }
}

export const serviceDomainToken: ServiceToken<ServiceDomainService> =
  createServiceToken<ServiceDomainService>(SERVICE_DOMAIN_SERVICE_KEY);

export default class ServiceDomainProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/service-domain-provider';

  public override register(): void {
    this.app.container.singleton(serviceDomainToken, (container) => {
      const database = container.resolve(databaseManagerToken);
      const authorization = container.resolve(authorizationToken);
      const logger = container
        .resolve(loggingToken)
        .getLogger('service-domain');
      return new ServiceDomainService(
        database,
        authorization,
        container,
        logger,
      );
    });
    // Workflow Run modules are materialized from their Artifact and cannot
    // import this module, so they resolve the service through the engine's
    // `options.services` by the stable key the module carries. It resolves to
    // the same instance as the typed token above.
    this.app.container.singleton(
      SERVICE_DOMAIN_SERVICE_KEY as unknown as ServiceToken<ServiceDomainService>,
      (container) => container.resolve(serviceDomainToken),
    );
  }

  public override async boot(): Promise<void> {
    this.registerAuthorizationModel();
    this.registerSchedules();
    await this.enableAcceptanceWorkflow();
  }

  /**
   * Declares the business module on the installed authorization plugin.
   * Collections first: a composite data scope is checked against the
   * collection registry when it is defined.
   */
  private registerAuthorizationModel(): void {
    if (!this.app.container.has(authorizationToken)) {
      return;
    }
    const authz = this.app.container.resolve(authorizationToken);
    for (const collection of serviceCollections) {
      authz.database.collections.add({ name: collection, title: collection });
    }
    for (const access of serviceRecordAccess) {
      authz.recordAccess.define(access);
    }
    for (const composite of serviceComposites) {
      // Each composite resource is typed against its own action union, so a
      // heterogeneous list needs the assertion for the registrar to accept it.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      authz.compositeResources.define(composite as never);
    }
  }

  private currentShanghaiDate(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
    }).format(new Date());
  }

  private registerSchedules(): void {
    void import('@nocobase/app-plugin-scheduler/server/tokens')
      .then(({ schedulerServiceToken }) => {
        if (!this.app.container.has(schedulerServiceToken)) {
          return;
        }
        const scheduler = this.app.container.resolve(schedulerServiceToken);
        const requestedDay = (config: unknown): boolean =>
          (config as { date?: unknown } | undefined)?.date === undefined ||
          validScheduleDate(config) !== undefined;
        scheduler.registerTarget({
          type: SERVICE_SCHEDULE_TARGETS.dailyInspections,
          title: '生成设备巡检任务',
          validate: (config) =>
            requestedDay(config)
              ? { valid: true }
              : { valid: false, reason: 'date 必须是 YYYY-MM-DD。' },
          start: async (config) => {
            const service = this.app.container.resolve(serviceDomainToken);
            const date =
              validScheduleDate(config) ?? this.currentShanghaiDate();
            const created = await service.generateDailyInspections(date);
            return {
              state: 'completed' as const,
              outcome: 'succeeded' as const,
              result: { date, created },
            };
          },
        });
        scheduler.registerTarget({
          type: SERVICE_SCHEDULE_TARGETS.overdueReminders,
          title: '超期工单提醒',
          validate: (config) =>
            requestedDay(config)
              ? { valid: true }
              : { valid: false, reason: 'date 必须是 YYYY-MM-DD。' },
          start: async (config) => {
            const service = this.app.container.resolve(serviceDomainToken);
            const date =
              validScheduleDate(config) ?? this.currentShanghaiDate();
            const sent = await service.sendOverdueReminders(date);
            return {
              state: 'completed' as const,
              outcome: 'succeeded' as const,
              result: { date, sent },
            };
          },
        });
        scheduler.defineSchedule({
          key: SERVICE_SCHEDULE_KEYS[SERVICE_SCHEDULE_TARGETS.dailyInspections],
          title: '每日设备巡检任务生成',
          description: '按设备下次巡检日期为启用中的设备生成当天巡检任务。',
          schedule: { cron: '0 9 * * *', timezone: 'Asia/Shanghai' },
          target: {
            type: SERVICE_SCHEDULE_TARGETS.dailyInspections,
            config: {},
          },
        });
        scheduler.defineSchedule({
          key: SERVICE_SCHEDULE_KEYS[SERVICE_SCHEDULE_TARGETS.overdueReminders],
          title: '超期工单提醒',
          description: '每日对仍未关闭且已超过应完成时间的工单提醒负责人一次。',
          schedule: { cron: '0 9 * * *', timezone: 'Asia/Shanghai' },
          target: {
            type: SERVICE_SCHEDULE_TARGETS.overdueReminders,
            config: {},
          },
        });
      })
      .catch((error: unknown) => {
        this.app.container
          .resolve(loggingToken)
          .getLogger('service-domain')
          .warn(
            { err: error },
            'Scheduler is not available for service schedules.',
          );
      });
  }

  /**
   * Materialize the acceptance workflow from source and enable it. It stays
   * disabled until an administrator enables it, which is correct as a general
   * rule but not for the acceptance path this application defines.
   */
  private async enableAcceptanceWorkflow(): Promise<void> {
    if (!this.app.container.has(workflowServiceToken)) {
      return;
    }
    const logger = this.app.container
      .resolve(loggingToken)
      .getLogger('service-domain');
    try {
      const workflow = this.app.container.resolve(workflowServiceToken) as {
        discoverArtifacts?: () => Promise<
          readonly { key: string; digest: string }[]
        >;
        ensureArtifactMaterialized?: (hash: string) => Promise<unknown>;
      };
      if (!workflow.discoverArtifacts || !workflow.ensureArtifactMaterialized) {
        return;
      }
      const artifacts = await workflow.discoverArtifacts();
      const artifact = artifacts.find(
        (item) => item.key === 'work-order-acceptance',
      );
      if (!artifact) {
        return;
      }
      const workflowId = await workflow.ensureArtifactMaterialized(
        artifact.digest,
      );
      if (workflowId === undefined || workflowId === null) {
        return;
      }
      await this.app.container
        .resolve(databaseManagerToken)
        .repository<Record<string, unknown>>('workflows')
        .updateOne({
          filter: { id: workflowId as string | number },
          values: { enabled: true },
        });
    } catch (error) {
      logger.warn(
        { err: error },
        'Acceptance workflow could not be enabled; direct acceptance still covers the path.',
      );
    }
  }
}
