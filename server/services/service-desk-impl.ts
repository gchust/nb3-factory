import type {
  FilterBuilder,
  FilterNode,
  RepositoryFilter,
} from '@nocobase/repository-input';

import { forbidden, notFound, conflict, badRequest } from './errors.js';
import { SERVICE_ROLE, type ServiceAccess } from './access.js';
import type {
  CustomerInput,
  DeviceInput,
  FaultInput,
  InspectionInput,
  KnowledgeInput,
  ManualInput,
  ServiceDesk,
  ServiceDeskDependencies,
  WorkOrderInput,
  WorkOrderTransitionInput,
  AttachmentInput,
  ExternalActor,
} from './service-desk.js';
import {
  WORK_ORDER_STATUS,
  WORK_ORDER_TRANSITIONS,
  isOpenStatus,
  type WorkOrderTransitionAction,
} from '../business/work-order-state.js';
import type {
  CustomerRow,
  DeviceRow,
  WorkOrderRow,
  WorkOrderEventRow,
  WorkOrderShareRow,
  WorkOrderAttachmentRow,
  WorkOrderFileRow,
  InspectionRow,
  KnowledgeArticleRow,
  DeviceManualRow,
  DeviceIntegrationEventRow,
} from '../business/resources.js';

const MAX_LIST = 200;
const EMPTY_UUID = '00000000-0000-0000-0000-000000000000';

type WorkOrderScope = (filter: FilterBuilder<WorkOrderRow>) => FilterNode;

interface OverdueReminderRow {
  id: string;
  workOrderId: string;
  assigneeId: string | null;
  reminderDate: string;
  createdAt: Date;
}

function alwaysTrue<T extends object>(): (
  filter: FilterBuilder<T>,
) => FilterNode {
  return (filter) => filter.string('id').notEmpty();
}

function never<T extends object>(): (filter: FilterBuilder<T>) => FilterNode {
  return (filter) => filter.string('id').eq(EMPTY_UUID);
}

export class ServiceDeskImplementation implements ServiceDesk {
  private readonly database: ServiceDeskDependencies['database'];
  private readonly notifications: ServiceDeskDependencies['notifications'];
  private readonly automation: ServiceDeskDependencies['automation'];
  private readonly translator: ServiceDeskDependencies['translator'];
  private readonly now: () => Date;
  private readonly newId: () => string;

  public constructor(dependencies: ServiceDeskDependencies) {
    this.database = dependencies.database;
    this.notifications = dependencies.notifications;
    this.automation = dependencies.automation;
    this.translator = dependencies.translator;
    this.now = dependencies.now ?? (() => new Date());
    this.newId = dependencies.newId ?? (() => crypto.randomUUID());
  }

  private repo<T extends object>(name: string) {
    return this.database.repository<T>(name);
  }

  // ---- Customers -------------------------------------------------------

  public async listCustomers(access: ServiceAccess): Promise<unknown[]> {
    this.requireRead(access);
    const rows = await this.repo<CustomerRow>('customers').findMany({
      limit: MAX_LIST,
      sort: (sort) => sort.field('name').asc(),
    });
    return rows;
  }

  public async getCustomer(
    access: ServiceAccess,
    id: string,
  ): Promise<unknown> {
    this.requireRead(access);
    const row = await this.repo<CustomerRow>('customers').findOne({
      filter: (filter) => filter.string('id').eq(id),
    });
    if (!row) throw notFound('Customer not found');
    return row;
  }

  public async createCustomer(
    access: ServiceAccess,
    input: CustomerInput,
  ): Promise<unknown> {
    this.requireAdmin(access);
    this.assertText(input.name, 'name');
    const now = this.now();
    const { record } = await this.repo<CustomerRow>('customers').createOne({
      values: {
        id: this.newId(),
        name: input.name.trim(),
        contactName: input.contactName ?? null,
        contactPhone: input.contactPhone ?? null,
        notes: input.notes ?? null,
        createdAt: now,
        updatedAt: now,
      },
    });
    return record;
  }

  public async updateCustomer(
    access: ServiceAccess,
    id: string,
    input: Partial<CustomerInput>,
  ): Promise<unknown> {
    this.requireAdmin(access);
    await this.getCustomer(access, id);
    const { record } = await this.repo<CustomerRow>('customers').updateOne({
      filter: (filter) => filter.string('id').eq(id),
      values: {
        ...(input.name === undefined ? {} : { name: input.name.trim() }),
        ...(input.contactName === undefined
          ? {}
          : { contactName: input.contactName }),
        ...(input.contactPhone === undefined
          ? {}
          : { contactPhone: input.contactPhone }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
        updatedAt: this.now(),
      },
    });
    return record;
  }

  public async deleteCustomer(
    access: ServiceAccess,
    id: string,
  ): Promise<void> {
    this.requireAdmin(access);
    await this.getCustomer(access, id);
    await this.repo<CustomerRow>('customers').deleteOne({
      filter: (filter) => filter.string('id').eq(id),
    });
  }

  // ---- Devices ---------------------------------------------------------

  public async listDevices(access: ServiceAccess): Promise<unknown[]> {
    this.requireRead(access);
    const rows = await this.repo<DeviceRow>('devices').findMany({
      limit: MAX_LIST,
      sort: (sort) => sort.field('code').asc(),
    });
    return rows;
  }

  public async getDevice(access: ServiceAccess, id: string): Promise<unknown> {
    this.requireRead(access);
    const row = await this.repo<DeviceRow>('devices').findOne({
      filter: (filter) => filter.string('id').eq(id),
    });
    if (!row) throw notFound('Device not found');
    return row;
  }

  public async createDevice(
    access: ServiceAccess,
    input: DeviceInput,
  ): Promise<unknown> {
    this.requireAdmin(access);
    this.assertText(input.code, 'code');
    this.assertText(input.name, 'name');
    this.assertText(input.customerId, 'customerId');
    // The collection has a unique constraint on `code`; checking first turns the
    // database's raw constraint failure into a clear 409 instead of a 500.
    await this.assertDeviceCodeAvailable(input.code.trim());
    await this.getCustomer(access, input.customerId);
    const now = this.now();
    const { record } = await this.repo<DeviceRow>('devices').createOne({
      values: {
        id: this.newId(),
        code: input.code.trim(),
        name: input.name.trim(),
        customerId: input.customerId,
        serviceEngineerId: input.serviceEngineerId ?? null,
        enabled: input.enabled ?? true,
        nextInspectionAt: this.toDate(input.nextInspectionAt),
        notes: input.notes ?? null,
        createdAt: now,
        updatedAt: now,
      },
    });
    return record;
  }

  public async updateDevice(
    access: ServiceAccess,
    id: string,
    input: Partial<DeviceInput>,
  ): Promise<unknown> {
    this.requireAdmin(access);
    await this.getDevice(access, id);
    if (input.code !== undefined) {
      this.assertText(input.code, 'code');
      await this.assertDeviceCodeAvailable(input.code.trim(), id);
    }
    if (input.customerId !== undefined) {
      await this.getCustomer(access, input.customerId);
    }
    const { record } = await this.repo<DeviceRow>('devices').updateOne({
      filter: (filter) => filter.string('id').eq(id),
      values: {
        ...(input.code === undefined ? {} : { code: input.code.trim() }),
        ...(input.name === undefined ? {} : { name: input.name.trim() }),
        ...(input.customerId === undefined
          ? {}
          : { customerId: input.customerId }),
        ...(input.serviceEngineerId === undefined
          ? {}
          : { serviceEngineerId: input.serviceEngineerId }),
        ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
        ...(input.nextInspectionAt === undefined
          ? {}
          : { nextInspectionAt: this.toDate(input.nextInspectionAt) }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
        updatedAt: this.now(),
      },
    });
    return record;
  }

  public async deleteDevice(access: ServiceAccess, id: string): Promise<void> {
    this.requireAdmin(access);
    await this.getDevice(access, id);
    await this.repo<DeviceRow>('devices').deleteOne({
      filter: (filter) => filter.string('id').eq(id),
    });
  }

  // ---- Work orders -----------------------------------------------------

  private async sharedWorkOrderIds(userId: string): Promise<string[]> {
    const shares = await this.repo<WorkOrderShareRow>(
      'workOrderShares',
    ).findMany({
      filter: (filter) =>
        filter.and([
          filter.string('engineerId').eq(userId),
          filter.date('revokedAt').empty(),
        ]),
      limit: MAX_LIST,
    });
    return shares.map((share) => share.workOrderId);
  }

  private workOrderScope(
    access: ServiceAccess,
    sharedIds: readonly string[],
  ): WorkOrderScope {
    if (access.isAdmin()) return alwaysTrue();
    if (access.isIntegrator()) return never();
    if (access.isEngineer()) {
      return (filter) =>
        filter.or([
          filter.string('assigneeId').eq(access.principal.id),
          ...sharedIds.map((id) => filter.string('id').eq(id)),
        ]);
    }
    // Observers only see non-confidential summaries.
    return (filter) => filter.boolean('confidential').isFalse();
  }

  private workOrderView(
    row: WorkOrderRow,
    access: ServiceAccess,
  ): Record<string, unknown> {
    const base: Record<string, unknown> = {
      id: row.id,
      code: row.code,
      title: row.title,
      customerId: row.customerId,
      deviceId: row.deviceId,
      problem: row.problem,
      priority: row.priority,
      status: row.status,
      dueAt: row.dueAt,
      assigneeId: row.assigneeId,
      confidential: row.confidential,
      acceptedAt: row.acceptedAt,
      startedAt: row.startedAt,
      submittedAt: row.submittedAt,
      closedAt: row.closedAt,
      submitCount: row.submitCount,
      createdById: row.createdById,
      source: row.source,
      externalEventNo: row.externalEventNo,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
    // Internal handling notes are hidden from observers.
    if (!access.isObserver() || access.isAdmin()) {
      base.acceptanceNote = row.acceptanceNote;
      base.resolution = row.resolution;
      base.rejectionReason = row.rejectionReason;
    }
    return base;
  }

  public async listWorkOrders(access: ServiceAccess): Promise<unknown[]> {
    this.requireRead(access);
    const sharedIds = access.isEngineer()
      ? await this.sharedWorkOrderIds(access.principal.id)
      : [];
    const rows = await this.repo<WorkOrderRow>('workOrders').findMany({
      filter: this.workOrderScope(access, sharedIds),
      limit: MAX_LIST,
      sort: (sort) => sort.field('createdAt').desc(),
    });
    return rows.map((row) => this.workOrderView(row, access));
  }

  private async findWorkOrder(
    access: ServiceAccess,
    id: string,
  ): Promise<WorkOrderRow> {
    const row = await this.repo<WorkOrderRow>('workOrders').findOne({
      filter: (filter) => filter.string('id').eq(id),
    });
    if (!row) throw notFound('Work order not found');
    if (access.isAdmin()) return row;
    if (row.confidential && access.isObserver()) {
      throw notFound('Work order not found');
    }
    if (access.isEngineer()) {
      if (row.assigneeId === access.principal.id) return row;
      const shared = await this.repo<WorkOrderShareRow>(
        'workOrderShares',
      ).findOne({
        filter: (filter) =>
          filter.and([
            filter.string('workOrderId').eq(id),
            filter.string('engineerId').eq(access.principal.id),
            filter.date('revokedAt').empty(),
          ]),
      });
      if (shared) return row;
      throw notFound('Work order not found');
    }
    if (access.isObserver()) return row;
    throw notFound('Work order not found');
  }

  public async getWorkOrder(
    access: ServiceAccess,
    id: string,
  ): Promise<unknown> {
    this.requireRead(access);
    const row = await this.findWorkOrder(access, id);
    const [events, shares] = await Promise.all([
      this.repo<WorkOrderEventRow>('workOrderEvents').findMany({
        filter: (filter) => filter.string('workOrderId').eq(id),
        sort: (sort) => sort.field('createdAt').asc(),
        limit: MAX_LIST,
      }),
      access.isAdmin()
        ? this.repo<WorkOrderShareRow>('workOrderShares').findMany({
            filter: (filter) =>
              filter.and([
                filter.string('workOrderId').eq(id),
                filter.date('revokedAt').empty(),
              ]),
            limit: MAX_LIST,
          })
        : Promise.resolve([]),
    ]);
    return {
      ...this.workOrderView(row, access),
      events,
      shares,
    };
  }

  public async createWorkOrder(
    access: ServiceAccess,
    input: WorkOrderInput,
  ): Promise<unknown> {
    if (!access.isAdmin() && !access.isEngineer()) {
      throw forbidden('Only supervisors and engineers may raise a work order');
    }
    this.assertText(input.title, 'title');
    this.assertText(input.customerId, 'customerId');
    this.assertText(input.deviceId, 'deviceId');
    this.assertText(input.problem, 'problem');
    // A work order must name an existing device that belongs to the selected
    // customer, and a new repair may not use a disabled device. Historical
    // orders keep working because only creation is checked here.
    await this.getCustomer(access, input.customerId);
    const device = await this.repo<DeviceRow>('devices').findOne({
      filter: (filter) => filter.string('id').eq(input.deviceId),
    });
    if (!device) throw notFound('Device not found');
    if (device.customerId !== input.customerId) {
      throw badRequest('The device does not belong to the selected customer');
    }
    if (device.enabled === false) {
      throw conflict('A disabled device cannot be used for a new work order');
    }
    const now = this.now();
    const status = input.assigneeId
      ? WORK_ORDER_STATUS.pendingHandle
      : WORK_ORDER_STATUS.pendingAccept;
    const { record } = await this.repo<WorkOrderRow>('workOrders').createOne({
      values: {
        id: this.newId(),
        code: await this.nextWorkOrderCode(),
        title: input.title.trim(),
        customerId: input.customerId,
        deviceId: input.deviceId,
        problem: input.problem,
        priority: input.priority ?? 'normal',
        status,
        dueAt: this.toDate(input.dueAt),
        assigneeId: input.assigneeId ?? null,
        confidential: input.confidential ?? false,
        submitCount: 0,
        createdById:
          access.principal.type === 'user' ? access.principal.id : null,
        source: 'internal',
        createdAt: now,
        updatedAt: now,
      },
    });
    await this.recordEvent(record.id, 'created', access.principal.id, null);
    if (record.assigneeId) {
      await this.notify(
        `work-order:${record.id}:assigned:${record.assigneeId}`,
        record.assigneeId,
        `新工单 ${record.code}`,
        '有一张工单已指派给你',
        `/work-orders/${record.id}`,
      );
    }
    return this.workOrderView(record, access);
  }

  public async updateWorkOrder(
    access: ServiceAccess,
    id: string,
    input: Partial<WorkOrderInput>,
  ): Promise<unknown> {
    const existing = await this.findWorkOrder(access, id);
    if (!access.isAdmin()) {
      if (!access.isEngineer() || existing.assigneeId !== access.principal.id) {
        throw forbidden('Only the assigned engineer may edit this work order');
      }
      if (!isOpenStatus(existing.status)) {
        throw conflict('A closed work order cannot be edited');
      }
    }
    const { record } = await this.repo<WorkOrderRow>('workOrders').updateOne({
      filter: (filter) => filter.string('id').eq(id),
      values: {
        ...(input.title === undefined ? {} : { title: input.title.trim() }),
        ...(input.problem === undefined ? {} : { problem: input.problem }),
        ...(input.priority === undefined ? {} : { priority: input.priority }),
        ...(input.dueAt === undefined
          ? {}
          : { dueAt: this.toDate(input.dueAt) }),
        ...(input.assigneeId === undefined
          ? {}
          : { assigneeId: input.assigneeId }),
        ...(input.confidential === undefined
          ? {}
          : { confidential: input.confidential }),
        updatedAt: this.now(),
      },
    });
    return this.workOrderView(record, access);
  }

  public async transitionWorkOrder(
    access: ServiceAccess,
    id: string,
    input: WorkOrderTransitionInput,
  ): Promise<unknown> {
    const action = input.action;
    const transition = WORK_ORDER_TRANSITIONS[action];
    if (!transition) throw badRequest(`Unknown action ${action}`);
    const existing = await this.findWorkOrder(access, id);
    // Authorize before revealing or acting on the persisted state, so a caller
    // without the role is denied even when the action would also conflict with
    // the current status.
    this.assertTransitionAllowed(access, action, existing);
    if (!(transition.from as readonly string[]).includes(existing.status)) {
      throw conflict(
        `Work order ${existing.code} cannot ${action} from ${existing.status}`,
      );
    }

    const now = this.now();
    const values: Record<string, unknown> = {
      status: transition.to,
      updatedAt: now,
    };
    switch (action) {
      case 'accept':
        values.acceptedAt = now;
        if (input.assigneeId) values.assigneeId = input.assigneeId;
        if (input.note !== undefined) values.acceptanceNote = input.note;
        break;
      case 'start':
        values.startedAt = now;
        break;
      case 'submit':
        this.assertText(input.resolution, 'resolution');
        values.submittedAt = now;
        values.submitCount = (existing.submitCount ?? 0) + 1;
        values.resolution = (input.resolution as string).trim();
        break;
      case 'reject':
        values.rejectionReason = input.rejectionReason ?? input.note ?? '';
        break;
      case 'close':
        values.closedAt = now;
        break;
      default:
        break;
    }
    const { record } = await this.repo<WorkOrderRow>('workOrders').updateOne({
      filter: (filter) =>
        filter.and([
          filter.string('id').eq(id),
          filter.string('status').eq(existing.status),
        ]),
      values,
    });
    await this.recordEvent(
      id,
      transition.event,
      access.principal.id,
      input.note ?? input.resolution ?? input.rejectionReason ?? null,
    );

    if (action === 'submit' && record.createdById) {
      await this.notify(
        `work-order:${id}:submitted:${record.submitCount}`,
        record.createdById,
        `工单 ${record.code} 待确认`,
        '工程师已提交处理结果，请确认。',
        `/work-orders/${id}`,
      );
    }
    if (action === 'reject' && record.assigneeId) {
      await this.notify(
        `work-order:${id}:rejected:${now.toISOString()}`,
        record.assigneeId,
        `工单 ${record.code} 已退回`,
        '提交的处理结果被退回，请重新处理。',
        `/work-orders/${id}`,
      );
    }
    if (action === 'close' && record.assigneeId) {
      await this.notify(
        `work-order:${id}:closed`,
        record.assigneeId,
        `工单 ${record.code} 已完成`,
        '工单已确认完成。',
        `/work-orders/${id}`,
      );
    }
    if (action === 'accept') {
      await this.registerAcceptance(record, now);
    }
    return this.workOrderView(record, access);
  }

  /**
   * Acceptance is registered by the `work-order-auto-accept` workflow, which
   * records the priority-specific note and notifies the assignee. The trigger is
   * best-effort: a disabled or unavailable workflow must not fail the state
   * change, so the service sends the notice itself in that case. The two paths
   * use different idempotency keys, so a workflow that starts after the fallback
   * would still be visible as a run rather than silently dropped.
   */
  private async registerAcceptance(
    record: WorkOrderRow,
    now: Date,
  ): Promise<void> {
    const trigger = await this.automation?.trigger({
      workOrderId: record.id,
      attempt: record.submitCount ?? 0,
      eventKey: `work-order:${record.id}:accept:${now.toISOString()}`,
    });
    if (trigger?.status === 'accepted') return;
    const urgent = record.priority === 'urgent';
    await this.notify(
      `work-order:${record.id}:accepted:${record.assigneeId ?? 'unassigned'}`,
      record.assigneeId,
      urgent ? '紧急工单已受理' : '工单已受理',
      urgent
        ? '您的紧急工单已受理，请尽快处理。'
        : '您的工单已受理，请按计划处理。',
      `/work-orders/${record.id}`,
    );
  }

  private assertTransitionAllowed(
    access: ServiceAccess,
    action: WorkOrderTransitionAction,
    existing: WorkOrderRow,
  ): void {
    if (access.isAdmin()) return;
    if (!access.isEngineer()) {
      throw forbidden('You may not change the work-order state');
    }
    const isAssignee = existing.assigneeId === access.principal.id;
    switch (action) {
      case 'accept':
        // An unassigned order can be claimed by an engineer; reassigning a
        // colleague's order is a supervisory action.
        if (!isAssignee && existing.assigneeId) {
          throw forbidden('This work order is assigned to another engineer');
        }
        return;
      case 'start':
      case 'submit':
        if (!isAssignee) {
          throw forbidden('Only the assigned engineer may handle this order');
        }
        return;
      default:
        throw forbidden('Only a supervisor may reject or close a work order');
    }
  }

  public async shareWorkOrder(
    access: ServiceAccess,
    id: string,
    engineerId: string,
  ): Promise<unknown> {
    this.requireAdmin(access);
    const order = await this.findWorkOrder(access, id);
    this.assertText(engineerId, 'engineerId');
    // Confidential orders must not reach a non-assignee through temporary
    // collaboration; the supervisor and the original assignee still work on it.
    if (order.confidential && order.assigneeId !== engineerId) {
      throw forbidden(
        'A confidential work order cannot be shared with a non-assignee',
      );
    }
    const now = this.now();
    const { record } = await this.repo<WorkOrderShareRow>(
      'workOrderShares',
    ).createOne({
      values: {
        id: this.newId(),
        workOrderId: id,
        engineerId,
        sharedById: access.principal.id,
        createdAt: now,
        updatedAt: now,
      },
    });
    await this.recordEvent(id, 'shared', access.principal.id, null);
    await this.notify(
      `work-order:${id}:shared:${engineerId}`,
      engineerId,
      '有工单共享给你',
      '你可以查看并协同处理该工单。',
      `/work-orders/${id}`,
    );
    return record;
  }

  public async revokeShare(
    access: ServiceAccess,
    id: string,
    shareId: string,
  ): Promise<void> {
    this.requireAdmin(access);
    await this.repo<WorkOrderShareRow>('workOrderShares').updateOne({
      filter: (filter) =>
        filter.and([
          filter.string('id').eq(shareId),
          filter.string('workOrderId').eq(id),
        ]),
      values: { revokedAt: this.now(), updatedAt: this.now() },
    });
  }

  // ---- Attachments -----------------------------------------------------

  public async listAttachments(
    access: ServiceAccess,
    workOrderId: string,
  ): Promise<unknown[]> {
    this.requireRead(access);
    await this.findWorkOrder(access, workOrderId);
    const links = await this.repo<WorkOrderAttachmentRow>(
      'workOrderAttachments',
    ).findMany({
      filter: (filter) => filter.string('workOrderId').eq(workOrderId),
      sort: (sort) => sort.field('createdAt').asc(),
      limit: MAX_LIST,
    });
    const attachments: unknown[] = [];
    for (const link of links) {
      const file = await this.repo<WorkOrderFileRow>('workOrderFiles').findOne({
        filter: (filter) => filter.string('id').eq(link.fileId),
      });
      if (!file) continue;
      attachments.push({
        id: link.id,
        workOrderId: link.workOrderId,
        fileId: link.fileId,
        category: link.category,
        createdAt: link.createdAt,
        filename: file.filename,
        ext: file.ext,
        mimeType: file.mimeType,
        size: file.size,
      });
    }
    return attachments;
  }

  public async linkAttachment(
    access: ServiceAccess,
    workOrderId: string,
    input: AttachmentInput,
  ): Promise<unknown> {
    const order = await this.findWorkOrder(access, workOrderId);
    if (!access.isAdmin() && order.assigneeId !== access.principal.id) {
      throw forbidden('You may not attach files to this work order');
    }
    this.assertText(input.fileId, 'fileId');
    const file = await this.repo<WorkOrderFileRow>('workOrderFiles').findOne({
      filter: (filter) => filter.string('id').eq(input.fileId),
    });
    if (!file) throw notFound('File not found');
    const now = this.now();
    const { record } = await this.repo<WorkOrderAttachmentRow>(
      'workOrderAttachments',
    ).createOne({
      values: {
        id: this.newId(),
        workOrderId,
        fileId: input.fileId,
        category: input.category ?? 'photo',
        createdAt: now,
      },
    });
    await this.recordEvent(
      workOrderId,
      'attached',
      access.principal.id,
      file.filename,
    );
    return {
      id: record.id,
      workOrderId,
      fileId: file.id,
      category: record.category,
      createdAt: now,
      filename: file.filename,
      ext: file.ext,
      mimeType: file.mimeType,
      size: file.size,
    };
  }

  public async unlinkAttachment(
    access: ServiceAccess,
    workOrderId: string,
    attachmentId: string,
  ): Promise<void> {
    const order = await this.findWorkOrder(access, workOrderId);
    if (!access.isAdmin() && order.assigneeId !== access.principal.id) {
      throw forbidden('You may not remove files from this work order');
    }
    await this.repo<WorkOrderAttachmentRow>('workOrderAttachments').deleteOne({
      filter: (filter) =>
        filter.and([
          filter.string('id').eq(attachmentId),
          filter.string('workOrderId').eq(workOrderId),
        ]),
    });
    await this.recordEvent(
      workOrderId,
      'attachment_removed',
      access.principal.id,
      null,
    );
  }

  public async getAttachmentFile(
    access: ServiceAccess,
    workOrderId: string,
    attachmentId: string,
  ): Promise<unknown> {
    this.requireRead(access);
    await this.findWorkOrder(access, workOrderId);
    const link = await this.repo<WorkOrderAttachmentRow>(
      'workOrderAttachments',
    ).findOne({
      filter: (filter) =>
        filter.and([
          filter.string('id').eq(attachmentId),
          filter.string('workOrderId').eq(workOrderId),
        ]),
    });
    if (!link) throw notFound('Attachment not found');
    const file = await this.repo<WorkOrderFileRow>('workOrderFiles').findOne({
      filter: (filter) => filter.string('id').eq(link.fileId),
    });
    if (!file) throw notFound('File not found');
    return file;
  }

  private async nextWorkOrderCode(): Promise<string> {
    const now = this.now();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const suffix = this.newId().replace(/-/g, '').slice(0, 6).toUpperCase();
      const code = `WO-${stamp}-${suffix}`;
      const existing = await this.repo<WorkOrderRow>('workOrders').count({
        filter: (filter) => filter.string('code').eq(code),
      });
      if (existing === 0) return code;
    }
    throw conflict('Unable to allocate a work-order code');
  }

  private async recordEvent(
    workOrderId: string,
    type: string,
    actorId: string | null,
    note: string | null,
    data?: unknown,
  ): Promise<void> {
    await this.repo<WorkOrderEventRow>('workOrderEvents').createOne({
      values: {
        id: this.newId(),
        workOrderId,
        type,
        actorId,
        note,
        data: data ?? null,
        createdAt: this.now(),
      },
    });
  }

  // ---- Inspections -----------------------------------------------------

  public async listInspections(access: ServiceAccess): Promise<unknown[]> {
    this.requireRead(access);
    const filter: RepositoryFilter<InspectionRow> = access.isEngineer()
      ? (builder) => builder.string('assigneeId').eq(access.principal.id)
      : access.isIntegrator()
        ? never()
        : alwaysTrue();
    const rows = await this.repo<InspectionRow>('inspections').findMany({
      filter,
      limit: MAX_LIST,
      sort: (sort) => sort.field('plannedDate').asc(),
    });
    return rows;
  }

  public async createInspection(
    access: ServiceAccess,
    input: InspectionInput,
  ): Promise<unknown> {
    if (!access.isAdmin() && !access.isEngineer()) {
      throw forbidden('Only supervisors and engineers may plan an inspection');
    }
    this.assertText(input.deviceId, 'deviceId');
    this.assertText(input.plannedDate, 'plannedDate');
    const now = this.now();
    const { record } = await this.repo<InspectionRow>('inspections').createOne({
      values: {
        id: this.newId(),
        deviceId: input.deviceId,
        plannedDate: input.plannedDate,
        assigneeId: input.assigneeId ?? null,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      },
    });
    if (record.assigneeId) {
      await this.notify(
        `inspection:${record.id}:assigned:${record.assigneeId}`,
        record.assigneeId,
        '新的巡检任务',
        `请在 ${record.plannedDate} 前完成设备巡检。`,
        '/inspections',
      );
    }
    return record;
  }

  public async completeInspection(
    access: ServiceAccess,
    id: string,
    result: string,
  ): Promise<unknown> {
    this.assertText(result, 'result');
    const existing = await this.repo<InspectionRow>('inspections').findOne({
      filter: (filter) => filter.string('id').eq(id),
    });
    if (!existing) throw notFound('Inspection not found');
    if (!access.isAdmin()) {
      if (!access.isEngineer() || existing.assigneeId !== access.principal.id) {
        throw forbidden(
          'Only the assigned engineer may complete this inspection',
        );
      }
    }
    const { record } = await this.repo<InspectionRow>('inspections').updateOne({
      filter: (filter) => filter.string('id').eq(id),
      values: {
        status: 'completed',
        result,
        completedAt: this.now(),
        updatedAt: this.now(),
      },
    });
    return record;
  }

  // ---- Knowledge -------------------------------------------------------

  public async listKnowledge(access: ServiceAccess): Promise<unknown[]> {
    this.requireRead(access);
    const rows = await this.repo<KnowledgeArticleRow>(
      'knowledgeArticles',
    ).findMany({
      filter: access.isAdmin()
        ? alwaysTrue()
        : (filter) => filter.boolean('published').isTrue(),
      limit: MAX_LIST,
      sort: (sort) => sort.field('createdAt').desc(),
    });
    return rows;
  }

  public async createKnowledge(
    access: ServiceAccess,
    input: KnowledgeInput,
  ): Promise<unknown> {
    this.requireAdmin(access);
    this.assertText(input.title, 'title');
    this.assertText(input.body, 'body');
    const now = this.now();
    const { record } = await this.repo<KnowledgeArticleRow>(
      'knowledgeArticles',
    ).createOne({
      values: {
        id: this.newId(),
        title: input.title.trim(),
        body: input.body,
        published: input.published ?? false,
        createdById:
          access.principal.type === 'user' ? access.principal.id : null,
        createdAt: now,
        updatedAt: now,
      },
    });
    return record;
  }

  public async updateKnowledge(
    access: ServiceAccess,
    id: string,
    input: Partial<KnowledgeInput>,
  ): Promise<unknown> {
    this.requireAdmin(access);
    const { record } = await this.repo<KnowledgeArticleRow>(
      'knowledgeArticles',
    ).updateOne({
      filter: (filter) => filter.string('id').eq(id),
      values: {
        ...(input.title === undefined ? {} : { title: input.title.trim() }),
        ...(input.body === undefined ? {} : { body: input.body }),
        ...(input.published === undefined
          ? {}
          : { published: input.published }),
        updatedAt: this.now(),
      },
    });
    return record;
  }

  public async deleteKnowledge(
    access: ServiceAccess,
    id: string,
  ): Promise<void> {
    this.requireAdmin(access);
    await this.repo<KnowledgeArticleRow>('knowledgeArticles').deleteOne({
      filter: (filter) => filter.string('id').eq(id),
    });
  }

  // ---- Manuals ---------------------------------------------------------

  public async listManuals(access: ServiceAccess): Promise<unknown[]> {
    this.requireRead(access);
    // Engineers and observers read what is usable; a pending or failed manual
    // is the supervisor's draft and is not part of the readable library yet.
    const rows = await this.repo<DeviceManualRow>('deviceManuals').findMany({
      filter: access.isAdmin()
        ? undefined
        : (filter) => filter.string('status').eq('available'),
      limit: MAX_LIST,
      sort: (sort) => sort.field('createdAt').desc(),
    });
    return rows;
  }

  public async createManual(
    access: ServiceAccess,
    input: ManualInput,
  ): Promise<unknown> {
    this.requireAdmin(access);
    this.assertText(input.title, 'title');
    const now = this.now();
    const { record } = await this.repo<DeviceManualRow>(
      'deviceManuals',
    ).createOne({
      values: {
        id: this.newId(),
        title: input.title.trim(),
        filename: input.filename ?? null,
        content: input.content ?? null,
        // A new manual is not usable for the assistant until a supervisor says
        // so. Uploading is not indexing, and this application has no automated
        // vectorization step (an embedding model is required and may not be
        // configured), so the record starts pending and carries a real failure
        // reason if the supervisor marks it failed.
        status: input.status ?? 'pending',
        failureReason: input.failureReason ?? null,
        knowledgeBaseKey: input.knowledgeBaseKey ?? null,
        documentId: input.documentId ?? null,
        uploadedById:
          access.principal.type === 'user' ? access.principal.id : null,
        createdAt: now,
        updatedAt: now,
      },
    });
    return record;
  }

  public async updateManual(
    access: ServiceAccess,
    id: string,
    input: Partial<ManualInput>,
  ): Promise<unknown> {
    this.requireAdmin(access);
    const existing = await this.repo<DeviceManualRow>('deviceManuals').findOne({
      filter: (filter) => filter.string('id').eq(id),
    });
    if (!existing) throw notFound('Manual not found');
    const now = this.now();
    const status = input.status ?? existing.status;
    const failureReason =
      input.failureReason === undefined
        ? status === 'failed'
          ? existing.failureReason
          : null
        : input.failureReason;
    if (status === 'failed') {
      this.assertText(failureReason, 'failureReason');
    }
    const { record } = await this.repo<DeviceManualRow>(
      'deviceManuals',
    ).updateOne({
      filter: (filter) => filter.string('id').eq(id),
      values: {
        ...(input.title === undefined ? {} : { title: input.title.trim() }),
        ...(input.filename === undefined ? {} : { filename: input.filename }),
        ...(input.content === undefined ? {} : { content: input.content }),
        ...(input.knowledgeBaseKey === undefined
          ? {}
          : { knowledgeBaseKey: input.knowledgeBaseKey }),
        ...(input.documentId === undefined
          ? {}
          : { documentId: input.documentId }),
        status,
        failureReason: failureReason ?? null,
        processedAt: now,
        updatedAt: now,
      },
    });
    return record;
  }

  public async deleteManual(access: ServiceAccess, id: string): Promise<void> {
    this.requireAdmin(access);
    await this.repo<DeviceManualRow>('deviceManuals').deleteOne({
      filter: (filter) => filter.string('id').eq(id),
    });
  }

  // ---- Dashboard -------------------------------------------------------

  public async dashboard(
    access: ServiceAccess,
  ): Promise<Record<string, unknown>> {
    this.requireRead(access);
    const sharedIds = access.isEngineer()
      ? await this.sharedWorkOrderIds(access.principal.id)
      : [];
    const scope = this.workOrderScope(access, sharedIds);
    const total = await this.repo<WorkOrderRow>('workOrders').count({
      filter: scope,
    });
    const statusCounts: Record<string, number> = {};
    for (const status of Object.values(WORK_ORDER_STATUS)) {
      statusCounts[status] = await this.repo<WorkOrderRow>('workOrders').count({
        filter: (filter) =>
          filter.and([scope(filter), filter.string('status').eq(status)]),
      });
    }
    const [overdue, customers, devices, inspections] = await Promise.all([
      this.repo<WorkOrderRow>('workOrders').count({
        filter: (filter) =>
          filter.and([
            scope(filter),
            filter.date('dueAt').before(this.now()),
            filter.or(
              [
                WORK_ORDER_STATUS.pendingAccept,
                WORK_ORDER_STATUS.pendingHandle,
                WORK_ORDER_STATUS.processing,
                WORK_ORDER_STATUS.pendingConfirm,
              ].map((status) => filter.string('status').eq(status)),
            ),
          ]),
      }),
      this.repo<CustomerRow>('customers').count(),
      this.repo<DeviceRow>('devices').count(),
      this.repo<InspectionRow>('inspections').count({
        filter: (filter) =>
          filter.or([
            filter.string('status').eq('pending'),
            filter.string('status').eq('overdue'),
          ]),
      }),
    ]);
    // Per-assignee tallies back the "workload of each engineer" card. The
    // dashboard is only shown to signed-in staff, and the rows are already
    // narrowed by the same scope the counts use, so an out-of-scope work order
    // cannot enter the total.
    const assigneeRows = await this.repo<WorkOrderRow>('workOrders').findMany({
      filter: scope,
      limit: 1000,
    });
    const byAssignee: Record<string, number> = {};
    for (const row of assigneeRows) {
      if (!row.assigneeId) continue;
      byAssignee[row.assigneeId] = (byAssignee[row.assigneeId] ?? 0) + 1;
    }
    return {
      workOrders: { total, byStatus: statusCounts, overdue, byAssignee },
      customers,
      devices,
      pendingInspections: inspections,
      generatedAt: this.now().toISOString(),
    };
  }

  // ---- External integration -------------------------------------------

  public async submitFault(
    input: FaultInput,
    actor: ExternalActor,
  ): Promise<unknown> {
    if (actor.role !== SERVICE_ROLE.integrator && actor.role !== 'external') {
      throw forbidden('This credential may not submit faults');
    }
    this.assertText(input.eventNo, 'eventNo');
    this.assertText(input.title, 'title');
    this.assertText(input.problem, 'problem');
    const existing = await this.repo<DeviceIntegrationEventRow>(
      'deviceIntegrationEvents',
    ).findOne({
      filter: (filter) => filter.string('eventNo').eq(input.eventNo),
    });
    if (existing) {
      const existingOrder = existing.workOrderId
        ? await this.repo<WorkOrderRow>('workOrders').findOne({
            filter: (filter) =>
              filter.string('id').eq(String(existing.workOrderId)),
          })
        : undefined;
      if (existingOrder)
        return this.workOrderView(existingOrder, this.externalAccess(actor));
      throw conflict('This integration event was already received');
    }

    const device = input.deviceCode
      ? await this.repo<DeviceRow>('devices').findOne({
          filter: (filter) =>
            filter.string('code').eq(input.deviceCode as string),
        })
      : undefined;
    if (!device) {
      throw badRequest('A known deviceCode is required to raise a fault');
    }
    const now = this.now();
    const status = WORK_ORDER_STATUS.pendingAccept;
    const orderId = this.newId();
    const { record } = await this.repo<WorkOrderRow>('workOrders').createOne({
      values: {
        id: orderId,
        code: await this.nextWorkOrderCode(),
        title: input.title.trim(),
        customerId: device.customerId,
        deviceId: device.id,
        problem: input.problem,
        priority: input.priority ?? 'normal',
        status,
        confidential: input.confidential ?? false,
        submitCount: 0,
        createdById: actor.id,
        source: 'external',
        externalEventNo: input.eventNo,
        createdAt: now,
        updatedAt: now,
      },
    });
    await this.repo<DeviceIntegrationEventRow>(
      'deviceIntegrationEvents',
    ).createOne({
      values: {
        id: this.newId(),
        eventNo: input.eventNo,
        payload: (input.payload ?? {
          title: input.title,
          problem: input.problem,
        }) as never,
        workOrderId: record.id,
        createdAt: now,
      },
    });
    await this.recordEvent(record.id, 'created', actor.id, '外部系统报障');
    return this.workOrderView(record, this.externalAccess(actor));
  }

  public async queryOrder(
    eventNo: string,
    actor: ExternalActor,
  ): Promise<unknown> {
    if (actor.role !== SERVICE_ROLE.integrator && actor.role !== 'external') {
      throw forbidden('This credential may not query faults');
    }
    const event = await this.repo<DeviceIntegrationEventRow>(
      'deviceIntegrationEvents',
    ).findOne({
      filter: (filter) => filter.string('eventNo').eq(eventNo),
    });
    if (!event?.workOrderId) throw notFound('No work order for this event');
    const order = await this.repo<WorkOrderRow>('workOrders').findOne({
      filter: (filter) => filter.string('id').eq(String(event.workOrderId)),
    });
    if (!order) throw notFound('No work order for this event');
    return this.workOrderView(order, this.externalAccess(actor));
  }

  private externalAccess(actor: ExternalActor): ServiceAccess {
    return {
      principal: {
        id: actor.id ?? 'external',
        type: 'api-key',
        displayName: actor.name,
      },
      roles: new Set([actor.role]),
      is: (...roles: readonly string[]) => roles.includes(actor.role),
      isAdmin: () => false,
      isEngineer: () => false,
      isObserver: () => false,
      isIntegrator: () => actor.role === SERVICE_ROLE.integrator,
    };
  }

  // ---- Directory -------------------------------------------------------

  public async listAssignees(): Promise<unknown[]> {
    const rows = await this.database
      .connection()
      .repository<{ id: string; name: string | null; username: string | null }>(
        'user',
      )
      .findMany({ limit: MAX_LIST, sort: (sort) => sort.field('name').asc() });
    return rows.map((row) => ({
      id: row.id,
      name: row.name?.trim() || row.username?.trim() || row.id,
      username: row.username ?? '',
    }));
  }

  // ---- Overdue reminders ----------------------------------------------

  public async runOverdueReminders(
    locale: string | undefined,
  ): Promise<{ created: number }> {
    const orders = await this.repo<WorkOrderRow>('workOrders').findMany({
      filter: (filter) =>
        filter.and([
          filter.date('dueAt').before(this.now()),
          filter.or(
            [
              WORK_ORDER_STATUS.pendingAccept,
              WORK_ORDER_STATUS.pendingHandle,
              WORK_ORDER_STATUS.processing,
            ].map((status) => filter.string('status').eq(status)),
          ),
          filter.string('assigneeId').notEmpty(),
        ]),
      limit: MAX_LIST,
    });
    const today = this.now().toISOString().slice(0, 10);
    let created = 0;
    for (const order of orders) {
      if (!order.assigneeId) continue;
      const existing = await this.database
        .repository<OverdueReminderRow>('overdueReminders')
        .findOne({
          filter: (filter) =>
            filter.and([
              filter.string('workOrderId').eq(order.id),
              filter.string('reminderDate').eq(today),
            ]),
        });
      if (existing) continue;
      await this.repo<OverdueReminderRow>('overdueReminders').createOne({
        values: {
          id: this.newId(),
          workOrderId: order.id,
          assigneeId: order.assigneeId,
          reminderDate: today,
          createdAt: this.now(),
        },
      });
      created += 1;
      const title = await this.localized(
        locale,
        'service.notification.overdue.title',
        `工单 ${order.code} 已逾期`,
        { code: order.code },
      );
      const body = await this.localized(
        locale,
        'service.notification.overdue.body',
        '请尽快处理逾期工单。',
      );
      await this.notify(
        `overdue:${order.id}:${today}`,
        order.assigneeId,
        title,
        body,
        `/work-orders/${order.id}`,
      );
    }
    return { created };
  }

  /**
   * The scheduled counterpart to planning an inspection by hand: every enabled
   * device whose `nextInspectionAt` has come due gets one inspection for today.
   * A device is only generated for once, and `nextInspectionAt` is cleared
   * afterwards so the supervisor sets the next cycle rather than the job
   * inventing a cadence. Running twice in one day therefore creates nothing the
   * second time.
   */
  public async generateDueInspections(): Promise<{ created: number }> {
    const now = this.now();
    const today = now.toISOString().slice(0, 10);
    const devices = await this.repo<DeviceRow>('devices').findMany({
      filter: (filter) =>
        filter.and([
          filter.boolean('enabled').isTrue(),
          filter.date('nextInspectionAt').notAfter(now),
        ]),
      limit: MAX_LIST,
      sort: (sort) => sort.field('nextInspectionAt').asc(),
    });
    let created = 0;
    for (const device of devices) {
      const existing = await this.repo<InspectionRow>('inspections').findOne({
        filter: (filter) =>
          filter.and([
            filter.string('deviceId').eq(device.id),
            filter.string('plannedDate').eq(today),
          ]),
      });
      if (!existing) {
        const { record } = await this.repo<InspectionRow>(
          'inspections',
        ).createOne({
          values: {
            id: this.newId(),
            deviceId: device.id,
            plannedDate: today,
            assigneeId: device.serviceEngineerId,
            status: 'pending',
            createdAt: now,
            updatedAt: now,
          },
        });
        created += 1;
        if (record.assigneeId) {
          await this.notify(
            `inspection:${record.id}:assigned:${record.assigneeId}`,
            record.assigneeId,
            '新的巡检任务',
            `设备 ${device.code} 已到巡检日期，请在 ${today} 完成巡检。`,
            '/inspections',
          );
        }
      }
      await this.repo<DeviceRow>('devices').updateOne({
        filter: (filter) => filter.string('id').eq(device.id),
        values: { nextInspectionAt: null, updatedAt: now },
      });
    }
    return { created };
  }

  // ---- Helpers ---------------------------------------------------------

  /**
   * Resolves a server-produced string in the given locale, falling back to the
   * application's own wording when no translation runtime is available or the
   * key is not present in the requested language.
   */
  private async localized(
    locale: string | undefined,
    key: string,
    fallback: string,
    params?: Record<string, unknown>,
  ): Promise<string> {
    if (!this.translator) return fallback;
    const translated = await this.translator.translate(locale, key, params);
    return translated === key ? fallback : translated;
  }

  private async notify(
    idempotencyKey: string,
    recipientId: string | null,
    title: string,
    body: string,
    routePath: string,
  ): Promise<void> {
    await this.notifications.sendInApp({
      idempotencyKey,
      recipientId,
      title,
      body,
      routePath,
      source: { type: 'service' },
    });
  }

  private requireRead(access: ServiceAccess): void {
    if (access.isIntegrator() && !access.isAdmin()) {
      throw forbidden('This credential may only use the integration API');
    }
  }

  private requireAdmin(access: ServiceAccess): void {
    if (!access.isAdmin()) {
      throw forbidden('Only a supervisor may perform this action');
    }
  }

  private async assertDeviceCodeAvailable(
    code: string,
    exceptId?: string,
  ): Promise<void> {
    const existing = await this.repo<DeviceRow>('devices').findOne({
      filter: (filter) => filter.string('code').eq(code),
    });
    if (existing && existing.id !== exceptId) {
      throw conflict(`Device code ${code} already exists`);
    }
  }

  private assertText(value: unknown, field: string): void {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw badRequest(`${field} is required`);
    }
  }

  private toDate(value: string | Date | null | undefined): Date | null {
    if (value === null || value === undefined || value === '') return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw badRequest('Invalid date');
    return date;
  }
}

export { WORK_ORDER_TRANSITIONS };
