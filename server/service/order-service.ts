import type { DatabaseManager, DatabaseConnection } from '@nocobase/db';
import type { NotificationService } from '@nocobase/app-plugin-notification/server';
import type { WorkflowServiceContract } from '@nocobase/app-plugin-workflow/server';
import type { ServiceLogger } from './logger.js';
import { asText, rowOf } from './values.js';

export interface ServiceOrderActor {
  readonly userId: string;
  readonly profileId?: number | null;
  readonly role?: string;
}

export interface CreateOrderInput {
  title: string;
  customerId: number;
  deviceId: number;
  problemDescription?: string | null;
  priority: 'normal' | 'urgent';
  deadline?: Date | null;
  confidential?: boolean;
  /** The engineer the supervisor chose; defaults to the device's service engineer. */
  assigneeProfileId?: number | null;
  /** Stable identifier for an externally reported event; makes retries safe. */
  externalEventNo?: string | null;
  reporterId?: string | null;
}

export interface OrderTransitionResult {
  orderId: number;
  status: string;
  changed: boolean;
  reason?: string;
  runId?: string | null;
}

export class ServiceOrderError extends Error {
  constructor(
    readonly code:
      | 'ORDER_NOT_FOUND'
      | 'INVALID_INPUT'
      | 'INVALID_TRANSITION'
      | 'FORBIDDEN'
      | 'DEVICE_DISABLED'
      | 'DEVICE_CUSTOMER_MISMATCH',
    message: string,
  ) {
    super(message);
    this.name = 'ServiceOrderError';
  }
}

interface OrderRow {
  id: number;
  orderNo: string;
  status: string;
  priority: string;
  confidential: boolean;
  assigneeId: string | null;
  assigneeProfileId: number | null;
  customerId: number;
  deviceId: number;
  title: string;
}

interface DeviceRow {
  id: number;
  customerId: number;
  status: string;
  engineerProfileId: number | null;
}

const ACCEPTANCE_WORKFLOW_KEY = 'service-order-accept';

/**
 * The service order lifecycle. Every transition is a conditional status update
 * inside one transaction, so a repeated request leaves the order where it is
 * and reports the current state instead of advancing it a second time. The
 * acceptance path additionally writes an execution record with a unique
 * idempotency key and sends its notification under its own idempotency key.
 */
export class ServiceOrderService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly notifications: NotificationService,
    private readonly workflow: WorkflowServiceContract | undefined,
    private readonly logger: ServiceLogger,
  ) {}

  async getOrder(orderId: number): Promise<OrderRow> {
    const row = rowOf<OrderRow>(
      await this.database
        .query()
        .selectFrom('serviceOrders')
        .select([
          'id',
          'orderNo',
          'status',
          'priority',
          'confidential',
          'assigneeId',
          'assigneeProfileId',
          'customerId',
          'deviceId',
          'title',
        ])
        .where('id', '=', orderId)
        .executeTakeFirst(),
    );
    if (!row) {
      throw new ServiceOrderError(
        'ORDER_NOT_FOUND',
        `工单 ${orderId} 不存在。`,
      );
    }
    return row;
  }

  /** Registers a new order, or returns the existing one for a repeated event. */
  async createOrder(
    input: CreateOrderInput,
    actor: ServiceOrderActor,
  ): Promise<OrderRow> {
    const title = input.title?.trim();
    if (!title) {
      throw new ServiceOrderError('INVALID_INPUT', '工单标题必填。');
    }
    if (
      !Number.isInteger(input.customerId) ||
      !Number.isInteger(input.deviceId)
    ) {
      throw new ServiceOrderError('INVALID_INPUT', '客户与设备必填。');
    }
    const query = this.database.query();
    const device = rowOf<DeviceRow>(
      await query
        .selectFrom('devices')
        .select(['id', 'customerId', 'status', 'engineerProfileId'])
        .where('id', '=', input.deviceId)
        .executeTakeFirst(),
    );
    if (!device) {
      throw new ServiceOrderError('INVALID_INPUT', '所选设备不存在。');
    }
    if (device.customerId !== input.customerId) {
      throw new ServiceOrderError(
        'DEVICE_CUSTOMER_MISMATCH',
        '所选设备不属于该客户。',
      );
    }
    if (device.status === 'disabled') {
      throw new ServiceOrderError(
        'DEVICE_DISABLED',
        '停用设备不能用于新的报修。',
      );
    }

    const events = input.externalEventNo ? input.externalEventNo : null;
    if (events) {
      const existing = rowOf<OrderRow>(
        await query
          .selectFrom('serviceOrders')
          .select([
            'id',
            'orderNo',
            'status',
            'priority',
            'confidential',
            'assigneeId',
            'assigneeProfileId',
            'customerId',
            'deviceId',
            'title',
          ])
          .where('externalEventNo', '=', events)
          .executeTakeFirst(),
      );
      if (existing) {
        return existing;
      }
    }

    let profile: { userId: string | null; groupId: number | null } | null =
      null;
    const assigneeProfileId =
      input.assigneeProfileId != null &&
      Number.isInteger(input.assigneeProfileId)
        ? input.assigneeProfileId
        : device.engineerProfileId;
    if (assigneeProfileId != null) {
      const row = await query
        .selectFrom('engineerProfiles')
        .select(['userId', 'groupId'])
        .where('id', '=', assigneeProfileId)
        .executeTakeFirst();
      if (row) {
        profile = {
          userId: row.userId == null ? null : asText(row.userId),
          groupId: row.groupId == null ? null : Number(row.groupId),
        };
      }
    }

    const now = new Date();
    return this.database.transaction(async (connection) => {
      const inserted = await connection.query
        .insertInto('serviceOrders')
        .values({
          orderNo: `WO-TEMP-${crypto.randomUUID()}`,
          externalEventNo: events,
          title,
          customerId: input.customerId,
          deviceId: input.deviceId,
          problemDescription: input.problemDescription ?? null,
          priority: input.priority,
          status: 'pending_accept',
          source: events ? 'external' : 'internal',
          confidential: Boolean(input.confidential),
          deadline: input.deadline ?? null,
          assigneeId: profile?.userId ?? null,
          assigneeProfileId: assigneeProfileId ?? null,
          groupId: profile?.groupId ?? null,
          createdById: actor.userId,
          reporterId: input.reporterId ?? actor.userId,
          returnCount: 0,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      const id = Number(inserted.insertId);
      const orderNo = `WO-${now.getUTCFullYear()}-${String(id).padStart(4, '0')}`;
      await connection.query
        .updateTable('serviceOrders')
        .set({ orderNo })
        .where('id', '=', id)
        .execute();
      await connection.query
        .insertInto('serviceOrderEvents')
        .values({
          orderId: id,
          action: 'create',
          fromStatus: null,
          toStatus: 'pending_accept',
          operatorId: actor.userId,
          operatorRole: actor.role ?? null,
          comment: null,
          idempotencyKey: `service-order-create:${id}`,
          createdAt: now,
        })
        .execute();
      return {
        id,
        orderNo,
        status: 'pending_accept',
        priority: input.priority,
        confidential: Boolean(input.confidential),
        assigneeId: profile?.userId ?? null,
        assigneeProfileId: assigneeProfileId ?? null,
        customerId: input.customerId,
        deviceId: input.deviceId,
        title,
      };
    });
  }

  /**
   * Accepts an order. The acceptance workflow runs first when it is reachable;
   * when it is not, the application applies the same transition itself and
   * records a real failure so an operator can retry it once the workflow is
   * enabled.
   */
  async accept(
    orderId: number,
    actor: ServiceOrderActor,
  ): Promise<OrderTransitionResult> {
    const order = await this.getOrder(orderId);
    if (order.status !== 'pending_accept') {
      return {
        orderId,
        status: order.status,
        changed: false,
        reason: 'ALREADY_ACCEPTED',
      };
    }

    const eventKey = `service-order-accept:${orderId}`;
    const receipt = await this.triggerAcceptance(orderId, actor, eventKey);
    if (!receipt.accepted) {
      await this.applyAcceptanceLocally(
        orderId,
        actor,
        order.priority,
        receipt.reason,
      );
      return {
        orderId,
        status: 'pending_process',
        changed: true,
        reason: receipt.reason,
        runId: null,
      };
    }
    // The workflow advances the order asynchronously; report what it decided.
    const after = await this.waitForStatus(orderId);
    if (after !== null && after !== 'pending_accept') {
      return {
        orderId,
        status: after,
        changed: after === 'pending_process',
        runId: receipt.runId,
        reason: receipt.reason,
      };
    }
    // The run was accepted but never advanced the order: the instruction failed
    // after the trigger returned. Apply the same transition locally so the
    // acceptance still happens, and record the real reason for the operator.
    await this.applyAcceptanceLocally(
      orderId,
      actor,
      order.priority,
      'WORKFLOW_DID_NOT_RUN',
    );
    return {
      orderId,
      status: 'pending_process',
      changed: true,
      reason: 'WORKFLOW_DID_NOT_RUN',
      runId: receipt.runId ?? null,
    };
  }

  private async triggerAcceptance(
    orderId: number,
    actor: ServiceOrderActor,
    eventKey: string,
  ): Promise<{ accepted: boolean; runId?: string; reason?: string }> {
    if (!this.workflow) {
      return { accepted: false, reason: 'WORKFLOW_UNAVAILABLE' };
    }
    try {
      const receipt = await this.workflow.trigger(
        ACCEPTANCE_WORKFLOW_KEY,
        { orderId, operatorId: actor.userId },
        { force: true, eventKey },
      );
      if (receipt.status === 'accepted') {
        return { accepted: true, runId: receipt.runId };
      }
      return { accepted: false, reason: receipt.reason.toUpperCase() };
    } catch (error) {
      this.logger.warn('Service acceptance workflow trigger failed', {
        orderId,
        error,
      });
      return { accepted: false, reason: 'WORKFLOW_ERROR' };
    }
  }

  private async waitForStatus(
    orderId: number,
    attempts = 40,
  ): Promise<string | null> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const row = await this.database
        .query()
        .selectFrom('serviceOrders')
        .select('status')
        .where('id', '=', orderId)
        .executeTakeFirst();
      const status = row ? String(row.status) : undefined;
      if (status && status !== 'pending_accept') {
        return status;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return null;
  }

  /**
   * The application-owned acceptance path. It is the workflow's own logic,
   * executed after the workflow reported it could not run, and it writes the
   * same execution record so the history stays complete.
   */
  private async applyAcceptanceLocally(
    orderId: number,
    actor: ServiceOrderActor,
    priority: string,
    reason?: string,
  ): Promise<void> {
    const note =
      priority === 'urgent'
        ? '紧急工单：已优先安排处理，请尽快响应。'
        : '普通工单：按标准流程安排常规处理。';
    const now = new Date();
    const eventKey = `service-order-accept:${orderId}`;
    const outcome = await this.database.transaction(
      async (connection: Connection) => {
        const order = await connection.query
          .selectFrom('serviceOrders')
          .select(['id', 'status', 'assigneeId'])
          .where('id', '=', orderId)
          .executeTakeFirst();
        if (!order || order.status !== 'pending_accept') {
          return { changed: false, assigneeId: order?.assigneeId ?? null };
        }
        const existing = await connection.query
          .selectFrom('serviceOrderEvents')
          .select('id')
          .where('idempotencyKey', '=', eventKey)
          .executeTakeFirst();
        if (existing) {
          return { changed: false, assigneeId: order.assigneeId };
        }
        await connection.query
          .updateTable('serviceOrders')
          .set({
            status: 'pending_process',
            acceptanceNote: note,
            acceptedAt: now,
            updatedAt: now,
          })
          .where('id', '=', orderId)
          .where('status', '=', 'pending_accept')
          .execute();
        await connection.query
          .insertInto('serviceOrderEvents')
          .values({
            orderId,
            action: 'accept',
            fromStatus: 'pending_accept',
            toStatus: 'pending_process',
            operatorId: actor.userId,
            operatorRole: actor.role ?? 'supervisor',
            comment: reason
              ? `${note}（自动受理流程不可用：${reason}，改由应用服务执行）`
              : note,
            idempotencyKey: eventKey,
            createdAt: now,
          })
          .execute();
        return { changed: true, assigneeId: order.assigneeId };
      },
    );

    if (outcome.changed && outcome.assigneeId != null) {
      await this.notify(
        `service-order-accepted:${orderId}`,
        orderId,
        asText(outcome.assigneeId),
        '新的服务工单待处理',
        `工单 #${orderId} 已受理：${note}`,
      );
    }
  }

  /** Explicit retry of a failed acceptance after the workflow was fixed. */
  async retryAcceptance(
    orderId: number,
    actor: ServiceOrderActor,
  ): Promise<OrderTransitionResult> {
    const order = await this.getOrder(orderId);
    if (order.status !== 'pending_accept') {
      return {
        orderId,
        status: order.status,
        changed: false,
        reason: 'ALREADY_ACCEPTED',
      };
    }
    return this.accept(orderId, actor);
  }

  async startProcessing(
    orderId: number,
    actor: ServiceOrderActor,
    comment?: string,
  ): Promise<OrderTransitionResult> {
    return this.transition(orderId, actor, {
      from: ['pending_process'],
      to: 'processing',
      action: 'start',
      patch: { startedAt: new Date() },
      comment,
      requireAssignee: true,
    });
  }

  async submitForConfirmation(
    orderId: number,
    actor: ServiceOrderActor,
    resolution: string,
  ): Promise<OrderTransitionResult> {
    const text = resolution?.trim();
    if (!text) {
      throw new ServiceOrderError('INVALID_INPUT', '处理说明必填。');
    }
    const order = await this.getOrder(orderId);
    const result = await this.transition(orderId, actor, {
      from: ['processing'],
      to: 'pending_confirm',
      action: 'submit',
      patch: { resolution: text, submittedAt: new Date() },
      comment: text,
      requireAssignee: true,
    });
    if (result.changed) {
      await this.notifySupervisors(
        orderId,
        order.orderNo,
        `工单 ${order.orderNo} 已提交确认，请核对处理结果。`,
      );
    }
    return result;
  }

  async close(
    orderId: number,
    actor: ServiceOrderActor,
    note?: string,
  ): Promise<OrderTransitionResult> {
    return this.transition(orderId, actor, {
      from: ['pending_confirm', 'processing'],
      to: 'closed',
      action: 'close',
      patch: { closedAt: new Date() },
      comment: note,
      requireAssignee: false,
    });
  }

  async returnToProcessing(
    orderId: number,
    actor: ServiceOrderActor,
    reason: string,
  ): Promise<OrderTransitionResult> {
    const text = reason?.trim();
    if (!text) {
      throw new ServiceOrderError('INVALID_INPUT', '退回原因必填。');
    }
    return this.transition(orderId, actor, {
      from: ['pending_confirm'],
      to: 'processing',
      action: 'return',
      patch: { returnReason: text, returnCount: undefined },
      comment: text,
      requireAssignee: false,
      incrementReturnCount: true,
      notifyAssignee: true,
    });
  }

  private async transition(
    orderId: number,
    actor: ServiceOrderActor,
    options: {
      from: readonly string[];
      to: string;
      action: string;
      patch: Record<string, unknown>;
      comment?: string;
      requireAssignee: boolean;
      incrementReturnCount?: boolean;
      notifyAssignee?: boolean;
    },
  ): Promise<OrderTransitionResult> {
    const order = await this.getOrder(orderId);
    if (order.status === 'closed') {
      throw new ServiceOrderError('INVALID_TRANSITION', '已关闭工单为只读。');
    }
    if (order.status === options.to) {
      return {
        orderId,
        status: order.status,
        changed: false,
        reason: 'ALREADY_IN_STATE',
      };
    }
    if (!options.from.includes(order.status)) {
      throw new ServiceOrderError(
        'INVALID_TRANSITION',
        `当前状态 ${order.status} 不能执行该操作。`,
      );
    }
    if (options.requireAssignee && order.assigneeId !== actor.userId) {
      throw new ServiceOrderError('FORBIDDEN', '只有负责人可以执行该操作。');
    }

    const now = new Date();
    const changed = await this.database.transaction(async (connection) => {
      const currentRow = await connection.query
        .selectFrom('serviceOrders')
        .select('returnCount')
        .where('id', '=', orderId)
        .executeTakeFirst();
      const patch: Record<string, unknown> = {
        ...options.patch,
        status: options.to,
        updatedAt: now,
      };
      delete patch.returnCount;
      if (options.incrementReturnCount) {
        patch.returnCount = Number(currentRow?.returnCount ?? 0) + 1;
      }
      const result = await connection.query
        .updateTable('serviceOrders')
        .set(patch)
        .where('id', '=', orderId)
        .where('status', '=', order.status)
        .execute();
      if (Number(result.updatedCount ?? 0) === 0) {
        return false;
      }
      await connection.query
        .insertInto('serviceOrderEvents')
        .values({
          orderId,
          action: options.action,
          fromStatus: order.status,
          toStatus: options.to,
          operatorId: actor.userId,
          operatorRole: actor.role ?? null,
          comment: options.comment ?? null,
          idempotencyKey: `service-order-${options.action}:${orderId}:${now.getTime()}`,
          createdAt: now,
        })
        .execute();
      return true;
    });

    if (!changed) {
      const current = await this.getOrder(orderId);
      return {
        orderId,
        status: current.status,
        changed: false,
        reason: 'CONCURRENT_UPDATE',
      };
    }

    if (options.notifyAssignee && order.assigneeId) {
      const titles: Record<string, string> = {
        return: '工单被退回处理中',
      };
      await this.notify(
        `service-order-${options.action}:${orderId}`,
        orderId,
        order.assigneeId,
        titles[options.action] ?? '工单状态更新',
        `工单 ${order.orderNo} 已更新为 ${options.to}。${options.comment ?? ''}`,
      );
    }
    return { orderId, status: options.to, changed: true };
  }

  private async notify(
    idempotencyKey: string,
    orderId: number,
    userId: string,
    title: string,
    body: string,
  ): Promise<void> {
    try {
      await this.notifications.send({
        idempotencyKey,
        source: { type: 'service-order', referenceId: String(orderId) },
        messages: {
          inbox: {
            to: userId,
            title,
            body,
            target: { type: 'route', path: `/service/orders/${orderId}` },
          },
        },
      });
    } catch (error) {
      // A notification failure must not roll back an accepted transition.
      this.logger.warn('Service order notification could not be sent', {
        orderId,
        error,
      });
    }
  }

  /**
   * Notifies the supervisors that an order reached the confirmation step. The
   * recipients come from the profile table's role column, so no username is
   * hard-coded and a supervisor added later is notified too.
   */
  private async notifySupervisors(
    orderId: number,
    orderNo: string,
    body: string,
  ): Promise<void> {
    let supervisors: { userId: string | null }[];
    try {
      supervisors = (await this.database
        .query()
        .selectFrom('engineerProfiles')
        .select(['userId'])
        .where('appRole', '=', 'supervisor')
        .execute()) as unknown as { userId: string | null }[];
    } catch (error) {
      this.logger.warn('Service supervisor lookup failed', { orderId, error });
      return;
    }
    for (const supervisor of supervisors) {
      if (!supervisor.userId) {
        continue;
      }
      await this.notify(
        `service-order-submit:${orderId}:${supervisor.userId}`,
        orderId,
        supervisor.userId,
        '工单已提交确认',
        `${body}（${orderNo}）`,
      );
    }
  }
}

type Connection = DatabaseConnection;
