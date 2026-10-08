import type { ServiceResolver, ServiceToken } from '@nocobase/service-provider';
import type { DatabaseManager, Repository } from '@nocobase/db';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { workflowServiceToken } from '@nocobase/app-plugin-workflow/server';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import { createdAtStamp, stamped, touched } from './timestamps.js';
import { normalizeDateTime } from './scalars.js';

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** PNG photos and DOCX reports are the two formats a work order accepts. */
function attachmentContentMatches(ext: string, bytes: Uint8Array): boolean {
  if (ext === 'png') {
    return (
      bytes.length >= PNG_SIGNATURE.length &&
      PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
    );
  }
  if (ext === 'docx') {
    // A DOCX is an Office Open XML ZIP container, so a real one begins with
    // the ZIP local file header.
    return (
      bytes.length >= 4 &&
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      bytes[2] === 0x03 &&
      bytes[3] === 0x04
    );
  }
  return false;
}

export const TICKET_STATUS = {
  pendingAcceptance: 'pendingAcceptance',
  pending: 'pending',
  processing: 'processing',
  pendingConfirmation: 'pendingConfirmation',
  closed: 'closed',
} as const;

export type TicketStatus = (typeof TICKET_STATUS)[keyof typeof TICKET_STATUS];

export interface TicketRecord {
  id: number;
  ticketNo: string;
  title: string;
  customerId: number;
  deviceId: number;
  problem: string | null;
  priority: string;
  dueAt: string | null;
  ownerId: string | null;
  confidential: boolean;
  status: string;
  result: string | null;
  resolutionNote: string | null;
  rejectReason: string | null;
  acceptedAt: string | null;
  closedAt: string | null;
  externalEventNo: string | null;
  source: string;
  createdById: string | null;
  observerVisible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceRecord {
  id: number;
  serial: string;
  name: string;
  model: string | null;
  customerId: number;
  engineerId: string | null;
  enabled: boolean;
  nextInspectionAt: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface CustomerRecord {
  id: number;
  name: string;
  contactName: string | null;
  phone: string | null;
  address: string | null;
  note: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface InspectionRecord {
  id: number;
  deviceId: number;
  plannedDate: string;
  ownerId: string;
  status: string;
  result: string | null;
  completedAt: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface ServiceMessageRecord {
  id: number;
  recipientId: string;
  kind: string;
  title: string;
  body: string | null;
  route: string | null;
  ticketId: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string | Date;
}

export interface TicketFileRecord {
  id: string;
  disk: string;
  key: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number;
  ticketId: number | null;
  category: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export type ServiceErrorCode =
  'NOT_FOUND' | 'INVALID_STATE' | 'FORBIDDEN' | 'VALIDATION' | 'CONFLICT';

export class TicketServiceError extends Error {
  constructor(
    readonly code: ServiceErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'TicketServiceError';
  }
}

export interface Actor {
  id: string;
  name?: string;
}

export interface CreateTicketInput {
  title: string;
  customerId?: number;
  deviceId?: number;
  deviceSerial?: string;
  customerName?: string;
  contactName?: string;
  contactPhone?: string;
  problem?: string;
  priority?: string;
  dueAt?: string | null;
  ownerId?: string | null;
  confidential?: boolean;
  source?: string;
  externalEventNo?: string | null;
}

export interface ExternalSubmitInput {
  eventNo: string;
  deviceSerial: string;
  title?: string;
  problem?: string;
  priority?: string;
  deviceName?: string;
  customerName?: string;
  contactName?: string;
  contactPhone?: string;
}

export interface DashboardSummary {
  byStatus: Record<string, number>;
  overdue: number;
  urgentOpen: number;
  pendingInspectionsToday: number;
  acceptanceFailures: number;
  total: number;
}

function todayInShanghai(now = new Date()): string {
  // Asia/Shanghai is UTC+8 with no daylight saving, so a fixed offset is exact.
  const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Whether a device's next inspection is due by the planned day. `null` means
 * the device has never been scheduled, so its first inspection is due; an
 * unparseable value is treated as not due rather than generating a task for a
 * device that cannot be shown to be due.
 */
function isInspectionDue(
  nextInspectionAt: string | null | undefined,
  plannedDate: string,
): boolean {
  if (!nextInspectionAt) {
    return true;
  }
  const day = nextInspectionAt.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= plannedDate;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

export class TicketService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly container: ServiceResolver,
  ) {}

  private tickets(): Repository<TicketRecord> {
    return this.database.repository<TicketRecord>('tickets');
  }

  private devices(): Repository<DeviceRecord> {
    return this.database.repository<DeviceRecord>('devices');
  }

  private customers(): Repository<CustomerRecord> {
    return this.database.repository<CustomerRecord>('customers');
  }

  private inspections(): Repository<InspectionRecord> {
    return this.database.repository<InspectionRecord>('inspections');
  }

  private logs(): Repository<Record<string, unknown>> {
    return this.database.repository('acceptance_logs');
  }

  private messages(): Repository<ServiceMessageRecord> {
    return this.database.repository<ServiceMessageRecord>('service_messages');
  }

  private files(): Repository<TicketFileRecord> {
    return this.database.repository<TicketFileRecord>('ticket_files');
  }

  async recordStep(entry: {
    ticketId: number;
    step: string;
    status: 'success' | 'failed' | 'running';
    message?: string | null;
    retryable?: boolean;
    eventKey?: string | null;
  }): Promise<void> {
    // A step keyed by a stable event key is written once. Retrying a decision
    // keeps the first real failure record instead of piling up duplicates,
    // while the workflow run still records every attempt.
    if (entry.eventKey) {
      const existing = await this.logs().findOne({
        filter: { eventKey: entry.eventKey, status: entry.status },
      });
      if (existing) {
        return;
      }
    }
    await this.logs().createOne({
      values: stamped({
        ticketId: entry.ticketId,
        step: entry.step,
        status: entry.status,
        message: entry.message ?? null,
        retryable: entry.retryable ?? false,
        eventKey: entry.eventKey ?? null,
      }),
    });
  }

  /** Best-effort in-app message; a failure never rolls back a business change. */
  async notify(
    recipientId: string,
    message: {
      kind: string;
      title: string;
      body?: string;
      route?: string;
      ticketId?: number;
      idempotencyKey?: string;
    },
  ): Promise<void> {
    try {
      await this.messages().createOne({
        values: createdAtStamp({
          recipientId,
          kind: message.kind,
          title: message.title,
          body: message.body ?? null,
          route: message.route ?? null,
          ticketId: message.ticketId ? String(message.ticketId) : null,
          read: false,
          readAt: null,
        }),
      });
    } catch (error) {
      console.warn('[service] failed to persist in-app message', error);
    }

    const notification = this.container.has(notificationServiceToken)
      ? this.container.resolve(notificationServiceToken)
      : undefined;
    if (!notification) {
      return;
    }
    try {
      await notification.send({
        idempotencyKey:
          message.idempotencyKey ??
          `service-message:${message.kind}:${message.ticketId ?? recipientId}:${Date.now()}`,
        source: {
          type: message.kind,
          referenceId: message.ticketId
            ? String(message.ticketId)
            : recipientId,
        },
        messages: {
          inbox: {
            to: recipientId,
            title: message.title,
            body: message.body ?? message.title,
            ...(message.route
              ? { target: { type: 'route' as const, path: message.route } }
              : {}),
          },
        },
      });
    } catch (error) {
      // An unconfigured inbox channel is expected in development; the
      // application-owned message above is the durable record.
      console.warn('[service] notification inbox delivery skipped', error);
    }
  }

  async nextTicketNo(now = new Date()): Promise<string> {
    const day = todayInShanghai(now).replace(/-/g, '');
    const prefix = `SR-${day}-`;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const rows = await this.database
        .query('main')
        .selectFrom('tickets')
        .select('id')
        .where('ticket_no', 'like', `${prefix}%`)
        .execute<{ id: number }>();
      const next = rows.length + 1 + attempt;
      const candidate = `${prefix}${pad(next, 4)}`;
      const existing = await this.tickets().findOne({
        filter: { ticketNo: candidate },
      });
      if (!existing) {
        return candidate;
      }
    }
    return `${prefix}${pad(Math.floor(Math.random() * 10000), 4)}`;
  }

  async getTicket(ticketId: number): Promise<TicketRecord> {
    const ticket = await this.tickets().findOne({ filter: { id: ticketId } });
    if (!ticket) {
      throw new TicketServiceError('NOT_FOUND', `Ticket ${ticketId} not found`);
    }
    return ticket;
  }

  async createTicket(
    input: CreateTicketInput,
    actor?: Actor,
  ): Promise<TicketRecord> {
    if (!input.title?.trim()) {
      throw new TicketServiceError('VALIDATION', 'title is required');
    }

    let device: DeviceRecord | undefined;
    if (input.deviceId) {
      device = await this.devices().findOne({
        filter: { id: input.deviceId },
      });
    } else if (input.deviceSerial) {
      device = await this.devices().findOne({
        filter: { serial: input.deviceSerial },
      });
    }
    if (!device) {
      throw new TicketServiceError('VALIDATION', 'device not found');
    }

    const customerId = input.customerId ?? device.customerId;
    const customer = await this.customers().findOne({
      filter: { id: customerId },
    });
    if (!customer) {
      throw new TicketServiceError(
        'VALIDATION',
        `customer ${customerId} not found`,
      );
    }
    // The selected device has to belong to the selected customer, and a new
    // repair may not open against a disabled device. Historic tickets keep
    // working because these checks only run on create.
    if (Number(device.customerId) !== Number(customerId)) {
      throw new TicketServiceError(
        'VALIDATION',
        'The selected device does not belong to the selected customer.',
      );
    }
    if (!device.enabled) {
      throw new TicketServiceError(
        'VALIDATION',
        'A disabled device cannot be used for a new repair ticket.',
      );
    }

    const ticketNo = await this.nextTicketNo();
    const { record } = await this.tickets().createOne({
      values: stamped({
        ticketNo,
        title: input.title.trim(),
        customerId,
        deviceId: device.id,
        problem: input.problem ?? null,
        priority: input.priority === 'urgent' ? 'urgent' : 'normal',
        // A `datetime-local` control submits `YYYY-MM-DDTHH:mm`; complete it
        // to the millisecond-precision value the collection field requires.
        dueAt: normalizeDateTime(input.dueAt ?? null) as string | null,
        ownerId: input.ownerId ?? device.engineerId ?? null,
        confidential: input.confidential ?? false,
        status: TICKET_STATUS.pendingAcceptance,
        externalEventNo: input.externalEventNo ?? null,
        source: input.source ?? 'manual',
        createdById: actor?.id ?? null,
        observerVisible: false,
      }),
    });
    await this.recordStep({
      ticketId: record.id,
      step: 'created',
      status: 'success',
      message: `source=${record.source}`,
    });
    return record;
  }

  /**
   * Idempotent external submission. The event number is the deduplication
   * key: a repeat returns the existing ticket and a flag instead of creating a
   * second one.
   */
  async submitExternalTicket(
    input: ExternalSubmitInput,
    actor: Actor,
  ): Promise<{ ticket: TicketRecord; duplicate: boolean }> {
    if (!input.eventNo?.trim()) {
      throw new TicketServiceError('VALIDATION', 'eventNo is required');
    }
    if (!input.deviceSerial?.trim()) {
      throw new TicketServiceError('VALIDATION', 'deviceSerial is required');
    }

    const existing = await this.tickets().findOne({
      filter: { externalEventNo: input.eventNo },
    });
    if (existing) {
      return { ticket: existing, duplicate: true };
    }

    let device: DeviceRecord | undefined = await this.devices().findOne({
      filter: { serial: input.deviceSerial },
    });
    if (!device) {
      if (!input.customerName?.trim()) {
        throw new TicketServiceError(
          'VALIDATION',
          `unknown device ${input.deviceSerial} and no customerName to register it`,
        );
      }
      const { record: customer } = await this.customers().createOne({
        values: stamped({
          name: input.customerName.trim(),
          contactName: input.contactName ?? null,
          phone: input.contactPhone ?? null,
          address: null,
          note: 'Registered from device platform integration',
        }),
      });
      const { record: createdDevice } = await this.devices().createOne({
        values: stamped({
          serial: input.deviceSerial.trim(),
          name: input.deviceName?.trim() || input.deviceSerial.trim(),
          model: null,
          customerId: customer.id,
          engineerId: null,
          enabled: true,
          nextInspectionAt: null,
        }),
      });
      device = createdDevice;
    }

    const ticketNo = await this.nextTicketNo();
    let record: TicketRecord;
    try {
      const created = await this.tickets().createOne({
        values: stamped({
          ticketNo,
          title: input.title?.trim() || `External repair ${input.eventNo}`,
          customerId: device.customerId,
          deviceId: device.id,
          problem: input.problem ?? null,
          priority: input.priority === 'urgent' ? 'urgent' : 'normal',
          dueAt: null,
          ownerId: device.engineerId ?? null,
          confidential: false,
          status: TICKET_STATUS.pendingAcceptance,
          externalEventNo: input.eventNo,
          source: 'external',
          createdById: actor.id,
          observerVisible: false,
        }),
      });
      record = created.record;
    } catch (error) {
      // A concurrent submission may have won the unique index; return it.
      const raced = await this.tickets().findOne({
        filter: { externalEventNo: input.eventNo },
      });
      if (raced) {
        return { ticket: raced, duplicate: true };
      }
      throw error;
    }

    await this.recordStep({
      ticketId: record.id,
      step: 'external_submitted',
      status: 'success',
      message: `eventNo=${input.eventNo}`,
      eventKey: input.eventNo,
    });
    return { ticket: record, duplicate: false };
  }

  async assertOwner(ticket: TicketRecord, actor: Actor): Promise<void> {
    if (ticket.ownerId !== actor.id) {
      throw new TicketServiceError(
        'FORBIDDEN',
        'Only the assigned engineer may perform this action',
      );
    }
  }

  private assertStatus(ticket: TicketRecord, allowed: readonly string[]): void {
    if (!allowed.includes(ticket.status)) {
      throw new TicketServiceError(
        'INVALID_STATE',
        `Ticket ${ticket.ticketNo} is ${ticket.status}; expected one of ${allowed.join(', ')}`,
      );
    }
  }

  async markProcessing(ticketId: number, actor: Actor): Promise<TicketRecord> {
    const ticket = await this.getTicket(ticketId);
    this.assertStatus(ticket, [TICKET_STATUS.pending]);
    await this.assertOwner(ticket, actor);
    const { record } = await this.tickets().updateOne({
      filter: { id: ticketId },
      values: touched({ status: TICKET_STATUS.processing }),
    });
    await this.recordStep({
      ticketId,
      step: 'processing',
      status: 'success',
      message: `owner=${actor.id}`,
    });
    return record;
  }

  /**
   * Stores the assistant's suggestion as a draft on the ticket. Nothing else
   * changes: the status stays where it is and no notification is sent. Writing
   * the resolution note and moving the ticket forward remains the explicit
   * `submitResult` transition.
   */
  async saveAssistantDraft(
    ticketId: number,
    actor: Actor,
    input: { draft: string },
  ): Promise<TicketRecord> {
    const ticket = await this.getTicket(ticketId);
    this.assertStatus(ticket, [
      TICKET_STATUS.pendingAcceptance,
      TICKET_STATUS.pending,
      TICKET_STATUS.processing,
      TICKET_STATUS.pendingConfirmation,
    ]);
    const draft = input.draft?.trim() ?? '';
    if (!draft) {
      throw new TicketServiceError('VALIDATION', 'draft is required');
    }
    const { record } = await this.tickets().updateOne({
      filter: { id: ticketId },
      values: touched({ assistantDraft: draft }),
    });
    await this.recordStep({
      ticketId,
      step: 'assistant_draft_saved',
      status: 'success',
      message: `by=${actor.id}`,
    });
    return record;
  }

  async submitResult(
    ticketId: number,
    actor: Actor,
    input: { result: string; resolutionNote?: string },
  ): Promise<TicketRecord> {
    const ticket = await this.getTicket(ticketId);
    this.assertStatus(ticket, [TICKET_STATUS.processing]);
    await this.assertOwner(ticket, actor);
    if (!input.result?.trim()) {
      throw new TicketServiceError('VALIDATION', 'result is required');
    }
    const { record } = await this.tickets().updateOne({
      filter: { id: ticketId },
      values: touched({
        status: TICKET_STATUS.pendingConfirmation,
        result: input.result.trim(),
        resolutionNote: input.resolutionNote?.trim() ?? null,
      }),
    });
    await this.recordStep({
      ticketId,
      step: 'submitted',
      status: 'success',
      message: `owner=${actor.id}`,
    });
    const supervisors = await this.supervisorIds();
    for (const supervisorId of supervisors) {
      await this.notify(supervisorId, {
        kind: 'ticket.pendingConfirmation',
        title: `待确认工单 ${record.ticketNo}`,
        body: record.title,
        route: `/tickets/${record.id}`,
        ticketId: record.id,
      });
    }
    return record;
  }

  async confirmClose(
    ticketId: number,
    actor: Actor,
    input: { resolutionNote?: string } = {},
  ): Promise<TicketRecord> {
    const ticket = await this.getTicket(ticketId);
    this.assertStatus(ticket, [TICKET_STATUS.pendingConfirmation]);
    const { record } = await this.tickets().updateOne({
      filter: { id: ticketId },
      values: touched({
        status: TICKET_STATUS.closed,
        closedAt: new Date().toISOString(),
        resolutionNote:
          input.resolutionNote?.trim() || ticket.resolutionNote || null,
      }),
    });
    await this.recordStep({
      ticketId,
      step: 'closed',
      status: 'success',
      message: `confirmedBy=${actor.id}`,
    });
    if (record.ownerId) {
      await this.notify(record.ownerId, {
        kind: 'ticket.closed',
        title: `工单已关闭 ${record.ticketNo}`,
        body: record.title,
        route: `/tickets/${record.id}`,
        ticketId: record.id,
      });
    }
    return record;
  }

  async returnToProcessing(
    ticketId: number,
    actor: Actor,
    reason: string,
  ): Promise<TicketRecord> {
    const ticket = await this.getTicket(ticketId);
    this.assertStatus(ticket, [TICKET_STATUS.pendingConfirmation]);
    const { record } = await this.tickets().updateOne({
      filter: { id: ticketId },
      values: touched({
        status: TICKET_STATUS.processing,
        rejectReason: reason,
      }),
    });
    await this.recordStep({
      ticketId,
      step: 'returned',
      status: 'success',
      message: `by=${actor.id} reason=${reason}`,
    });
    if (record.ownerId) {
      await this.notify(record.ownerId, {
        kind: 'ticket.returned',
        title: `工单被退回 ${record.ticketNo}`,
        body: reason,
        route: `/tickets/${record.id}`,
        ticketId: record.id,
      });
    }
    return record;
  }

  /**
   * Explicit rejection of an unaccepted ticket. The durable attempt and its
   * outcome are recorded so an operator can see and retry it.
   */
  async rejectTicket(
    ticketId: number,
    actor: Actor,
    reason: string,
  ): Promise<TicketRecord> {
    const ticket = await this.getTicket(ticketId);
    this.assertStatus(ticket, [
      TICKET_STATUS.pendingAcceptance,
      TICKET_STATUS.pending,
    ]);
    const { record } = await this.tickets().updateOne({
      filter: { id: ticketId },
      values: touched({
        status: TICKET_STATUS.closed,
        closedAt: new Date().toISOString(),
        rejectReason: reason,
      }),
    });
    await this.recordStep({
      ticketId,
      step: 'rejected',
      status: 'failed',
      message: `by=${actor.id} reason=${reason}`,
      retryable: true,
    });
    return record;
  }

  async setObserverVisibility(
    ticketId: number,
    visible: boolean,
  ): Promise<TicketRecord> {
    const ticket = await this.getTicket(ticketId);
    if (ticket.confidential && visible) {
      throw new TicketServiceError(
        'VALIDATION',
        'A confidential ticket cannot be shown to observers',
      );
    }
    const { record } = await this.tickets().updateOne({
      filter: { id: ticketId },
      values: touched({ observerVisible: visible }),
    });
    await this.recordStep({
      ticketId,
      step: 'observer_visibility',
      status: 'success',
      message: `visible=${visible}`,
    });
    return record;
  }

  /** Ordinary (non-confidential) tickets can be shared read-only. */
  async shareTicket(
    ticketId: number,
    engineerId: string,
    actor: Actor,
  ): Promise<Record<string, unknown>> {
    const ticket = await this.getTicket(ticketId);
    if (ticket.confidential) {
      throw new TicketServiceError(
        'FORBIDDEN',
        'Confidential tickets cannot be shared',
      );
    }
    const repository = this.database.repository<{
      id: number;
      ticketId: number;
      engineerId: string;
      grantedById: string;
      active: boolean;
      createdAt?: string | Date;
      updatedAt?: string | Date;
    }>('ticket_shares');
    const existing = await repository.findOne({
      filter: { ticketId, engineerId },
    });
    if (existing) {
      if (!existing.active) {
        await repository.updateOne({
          filter: { id: existing.id },
          values: touched({ active: true }),
        });
      }
      return { id: existing.id, ticketId, engineerId, active: true };
    }
    const { record } = await repository.createOne({
      values: stamped({
        ticketId,
        engineerId,
        grantedById: actor.id,
        active: true,
      }),
    });
    await this.recordStep({
      ticketId,
      step: 'shared',
      status: 'success',
      message: `engineer=${engineerId} by=${actor.id}`,
    });
    await this.notify(engineerId, {
      kind: 'ticket.shared',
      title: `工单已共享给你 ${ticket.ticketNo}`,
      body: '只读查看，处理完成后可由主管撤销',
      route: `/tickets/${ticket.id}`,
      ticketId: ticket.id,
    });
    return record;
  }

  async revokeShare(ticketId: number, engineerId: string): Promise<void> {
    const repository = this.database.repository<{
      id: number;
      ticketId: number;
      engineerId: string;
      active: boolean;
      createdAt?: string | Date;
      updatedAt?: string | Date;
    }>('ticket_shares');
    const existing = await repository.findOne({
      filter: { ticketId, engineerId },
    });
    if (!existing) {
      throw new TicketServiceError('NOT_FOUND', 'Share not found');
    }
    await repository.updateOne({
      filter: { id: existing.id },
      values: touched({ active: false }),
    });
    await this.recordStep({
      ticketId,
      step: 'share_revoked',
      status: 'success',
      message: `engineer=${engineerId}`,
    });
  }

  async listShares(
    ticketId: number,
  ): Promise<readonly Record<string, unknown>[]> {
    return this.database
      .repository('ticket_shares')
      .findMany({ filter: { ticketId } });
  }

  async listLogs(
    ticketId: number,
    limit = 50,
  ): Promise<readonly Record<string, unknown>[]> {
    return this.logs().findMany({
      filter: { ticketId },
      sort: (sort) => [sort.field('createdAt').desc()],
      limit,
    });
  }

  /**
   * Trigger the source-managed acceptance workflow. Workflow remains the
   * durable owner of the acceptance decision and its step history.
   */
  async requestAcceptance(
    ticketId: number,
    actor: Actor,
    decision: { accept: boolean; ownerId?: string; priority?: string },
  ): Promise<{ status: string; runId?: string; eventKey?: string }> {
    const ticket = await this.getTicket(ticketId);
    // A decision that already took effect is a no-op: repeating it must not
    // trigger the workflow again, advance the ticket, record another failure
    // step or send another business message. An impossible decision still
    // reaches the workflow so a real, retryable failure record is kept.
    if (ticket.status !== TICKET_STATUS.pendingAcceptance) {
      if (decision.accept && ticket.acceptedAt) {
        return { status: 'already-accepted' };
      }
      if (!decision.accept && ticket.status === TICKET_STATUS.closed) {
        return { status: 'already-refused' };
      }
    }
    if (!this.container.has(workflowServiceToken)) {
      throw new TicketServiceError(
        'INVALID_STATE',
        'Workflow service is not registered',
      );
    }
    const workflow = this.container.resolve(workflowServiceToken);
    const eventKey = `ticket-acceptance:${ticketId}:${Date.now()}`;
    const receipt = await workflow.trigger(
      'ticket-acceptance',
      {
        ticketId,
        ticketNo: ticket.ticketNo,
        actorId: actor.id,
        actorName: actor.name ?? actor.id,
        accept: decision.accept,
        ...(decision.ownerId ? { ownerId: decision.ownerId } : {}),
        priority: decision.priority ?? ticket.priority,
        reason: decision.accept ? '' : 'refused during acceptance',
      },
      { eventKey },
    );
    if (receipt.status === 'skipped') {
      await this.recordStep({
        ticketId,
        step: 'acceptance',
        status: 'failed',
        message: 'workflow skipped (not enabled)',
        retryable: true,
        eventKey: `ticket-acceptance:${ticketId}:workflow-skipped`,
      });
      return { status: 'skipped' };
    }
    return {
      status: 'accepted',
      runId: receipt.runId,
      eventKey: receipt.eventKey,
    };
  }

  /**
   * Applied by the acceptance workflow handler inside its own run so the
   * change is attributable to the workflow attempt.
   */
  async applyAcceptance(
    ticketId: number,
    actor: Actor,
    input: { ownerId: string | null; priority?: string; acceptedAt: string },
  ): Promise<TicketRecord> {
    const ticket = await this.getTicket(ticketId);
    if (ticket.status !== TICKET_STATUS.pendingAcceptance) {
      // A second run that finds the ticket accepted already is the same
      // decision landing twice; do not advance state, log a failure or notify
      // the owner again. A ticket that never recorded acceptance is a genuine
      // failure and keeps its retryable record.
      if (ticket.acceptedAt) {
        return ticket;
      }
      await this.recordStep({
        ticketId,
        step: 'accepted',
        status: 'failed',
        message: `unexpected status ${ticket.status}`,
        retryable: false,
      });
      throw new TicketServiceError(
        'INVALID_STATE',
        `Ticket ${ticket.ticketNo} is ${ticket.status} and cannot be accepted`,
      );
    }
    const ownerId = input.ownerId ?? ticket.ownerId;
    const { record } = await this.tickets().updateOne({
      filter: { id: ticketId },
      values: touched({
        status: TICKET_STATUS.pending,
        ownerId,
        acceptedAt: input.acceptedAt,
        priority: input.priority ?? ticket.priority,
      }),
    });
    await this.recordStep({
      ticketId,
      step: 'accepted',
      status: 'success',
      message: `by=${actor.id} owner=${ownerId ?? 'unassigned'}`,
    });
    if (ownerId) {
      await this.notify(ownerId, {
        kind: 'ticket.assigned',
        title: `新工单待处理 ${record.ticketNo}`,
        body: record.title,
        route: `/tickets/${record.id}`,
        ticketId: record.id,
      });
    }
    return record;
  }

  async supervisorIds(): Promise<string[]> {
    // Supervisors are the people holding the supervisor permission set. The
    // assignment is administrator data, so it is read rather than hardcoded.
    const rows = await this.database
      .query('main')
      .selectFrom('authorization_permission_set_assignments')
      .select('subject_id')
      .where('permission_set_key', '=', 'service-supervisor')
      .where('subject_type', '=', 'user')
      .execute<{ subject_id: string }>();
    return [...new Set(rows.map((row) => row.subject_id))];
  }

  async dashboard(): Promise<DashboardSummary> {
    const rows = await this.database
      .query('main')
      .selectFrom('tickets')
      .select('status')
      .execute<{ status: string }>();
    const byStatus: Record<string, number> = {};
    for (const row of rows) {
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    }
    const now = new Date().toISOString();
    const overdue = await this.database
      .query('main')
      .selectFrom('tickets')
      .select('id')
      .where('due_at', '<', now)
      .where('status', '<>', TICKET_STATUS.closed)
      .execute<{ id: number }>();
    const urgent = await this.database
      .query('main')
      .selectFrom('tickets')
      .select('id')
      .where('priority', '=', 'urgent')
      .where('status', '<>', TICKET_STATUS.closed)
      .execute<{ id: number }>();
    const today = todayInShanghai();
    const inspectionsToday = await this.database
      .query('main')
      .selectFrom('inspections')
      .select('id')
      .where('planned_date', '=', today)
      .execute<{ id: number }>();
    const failures = await this.database
      .query('main')
      .selectFrom('acceptance_logs')
      .select('id')
      .where('status', '=', 'failed')
      .execute<{ id: number }>();
    return {
      byStatus,
      overdue: overdue.length,
      urgentOpen: urgent.length,
      pendingInspectionsToday: inspectionsToday.length,
      acceptanceFailures: failures.length,
      total: rows.length,
    };
  }

  /**
   * Generate the day's inspection tasks for every enabled device whose next
   * inspection is due. "Due" means the scheduled next inspection date has
   * arrived (on or before the planned day); a device whose next inspection is
   * still in the future must not be processed. A device that was never
   * scheduled (no date) is treated as due, so its first task can be generated.
   * The (deviceId, plannedDate) unique index makes a repeated run a no-op.
   */
  async generateDailyInspections(
    plannedDate = todayInShanghai(),
  ): Promise<{ created: number; skipped: number }> {
    const devices = await this.devices().findMany({
      filter: { enabled: true },
    });
    let created = 0;
    let skipped = 0;
    for (const device of devices) {
      if (!isInspectionDue(device.nextInspectionAt, plannedDate)) {
        skipped += 1;
        continue;
      }
      if (!device.engineerId) {
        skipped += 1;
        continue;
      }
      const existing = await this.inspections().findOne({
        filter: (builder) =>
          builder.and([
            builder.number('deviceId').eq(device.id),
            builder.date('plannedDate').on(plannedDate),
          ]),
      });
      if (existing) {
        skipped += 1;
        continue;
      }
      await this.inspections().createOne({
        values: stamped({
          deviceId: device.id,
          plannedDate,
          ownerId: device.engineerId,
          status: 'pending',
          result: null,
          completedAt: null,
        }),
      });
      created += 1;
      await this.notify(device.engineerId, {
        kind: 'inspection.generated',
        title: `今日巡检任务：${device.name}`,
        body: `设备编号 ${device.serial}`,
        route: '/inspections',
        idempotencyKey: `inspection:${device.id}:${plannedDate}`,
      });
    }
    return { created, skipped };
  }

  async completeInspection(
    inspectionId: number,
    actor: Actor,
    input: { result: string; status?: string },
  ): Promise<InspectionRecord> {
    const inspection = await this.inspections().findOne({
      filter: { id: inspectionId },
    });
    if (!inspection) {
      throw new TicketServiceError('NOT_FOUND', 'Inspection not found');
    }
    if (inspection.ownerId !== actor.id) {
      throw new TicketServiceError(
        'FORBIDDEN',
        'Only the assigned engineer may complete this inspection',
      );
    }
    const { record } = await this.inspections().updateOne({
      filter: { id: inspectionId },
      values: touched({
        status: input.status ?? 'done',
        result: input.result,
        completedAt: new Date().toISOString(),
      }),
    });
    return record;
  }

  /** One reminder per overdue ticket per day, deduplicated by the unique key. */
  async sendOverdueReminders(
    reminderDate = todayInShanghai(),
  ): Promise<{ created: number; skipped: number }> {
    const now = new Date().toISOString();
    const overdue = await this.tickets().findMany({
      filter: (filter) => filter.date('dueAt').before(now),
      limit: 200,
    });
    const repository = this.database.repository<{
      id: number;
      ticketId: number;
      reminderDate: string;
      createdAt?: string | Date;
    }>('overdue_reminders');
    let created = 0;
    let skipped = 0;
    for (const ticket of overdue) {
      if (ticket.status === TICKET_STATUS.closed) {
        continue;
      }
      // `dueAt` is a datetime and `reminderDate` a date; the shorthand
      // `findOne({ filter: { ... } })` object form is not supported for those
      // field capabilities and makes the repository answer 400.
      const existing = await repository.findOne({
        filter: (builder) =>
          builder.and([
            builder.number('ticketId').eq(ticket.id),
            builder.date('reminderDate').on(reminderDate),
          ]),
      });
      if (existing) {
        skipped += 1;
        continue;
      }
      await repository.createOne({
        values: createdAtStamp({ ticketId: ticket.id, reminderDate }),
      });
      created += 1;
      if (ticket.ownerId) {
        await this.notify(ticket.ownerId, {
          kind: 'ticket.overdue',
          title: `工单已超期 ${ticket.ticketNo}`,
          body: ticket.title,
          route: `/tickets/${ticket.id}`,
          ticketId: ticket.id,
          idempotencyKey: `overdue:${ticket.id}:${reminderDate}`,
        });
      }
    }
    return { created, skipped };
  }

  async listMessages(
    recipientId: string,
    options: { unreadOnly?: boolean; limit?: number } = {},
  ): Promise<readonly ServiceMessageRecord[]> {
    const filter: Record<string, unknown> = { recipientId };
    if (options.unreadOnly) {
      filter.read = false;
    }
    return this.messages().findMany({
      filter,
      sort: (sort) => [sort.field('createdAt').desc()],
      limit: options.limit ?? 50,
    });
  }

  async markMessageRead(
    messageId: number,
    recipientId: string,
  ): Promise<ServiceMessageRecord> {
    const message = await this.messages().findOne({
      filter: { id: messageId },
    });
    if (!message) {
      throw new TicketServiceError('NOT_FOUND', 'Message not found');
    }
    if (message.recipientId !== recipientId) {
      throw new TicketServiceError('FORBIDDEN', 'Not your message');
    }
    const { record } = await this.messages().updateOne({
      filter: { id: messageId },
      // `service_messages` has no `updatedAt` column, so `touched()` would ask
      // the ORM to write a field the collection does not have (400 FIELD_NOT_FOUND).
      // The read flag and its timestamp are the only mutable columns here.
      values: { read: true, readAt: new Date().toISOString() },
    });
    return record;
  }

  async unreadCount(recipientId: string): Promise<number> {
    const rows = await this.database
      .query('main')
      .selectFrom('service_messages')
      .select('id')
      .where('recipient_id', '=', recipientId)
      .where('read', '=', false)
      .execute<{ id: number }>();
    return rows.length;
  }

  /** Whether the permission-set assignments give this user a named set. */
  async holdsPermissionSet(
    userId: string,
    permissionSet: string,
  ): Promise<boolean> {
    const rows = await this.database
      .query('main')
      .selectFrom('authorization_permission_set_assignments')
      .select('id')
      .where('subject_id', '=', userId)
      .where('subject_type', '=', 'user')
      .where('permission_set_key', '=', permissionSet)
      .execute<{ id: number }>();
    return rows.length > 0;
  }

  /**
   * Whether the user may read the whole ticket: its handling log, its share
   * list and its repair attachments. Limited to the owner, the creator, a
   * supervisor and an engineer the ticket is actively shared with.
   */
  private async canReadTicketInFull(
    ticket: TicketRecord,
    userId: string,
  ): Promise<boolean> {
    if (ticket.ownerId === userId || ticket.createdById === userId) {
      return true;
    }
    const supervisors = await this.supervisorIds();
    if (supervisors.includes(userId)) {
      return true;
    }
    const share = await this.database
      .query('main')
      .selectFrom('ticket_shares')
      .select('id')
      .where('ticket_id', '=', ticket.id)
      .where('engineer_id', '=', userId)
      .where('active', '=', true)
      .execute<{ id: number }>();
    return share.length > 0;
  }

  /**
   * Full-record visibility for one ticket, mirroring the record-access rules
   * registered for the authorization plugin. Used where the caller is not the
   * owner and no repository policy is in play, such as the restricted file
   * content route and the ticket detail's internal sections.
   */
  async canViewTicketInternal(
    ticketId: number,
    userId: string,
  ): Promise<boolean> {
    const ticket = await this.tickets().findOne({
      filter: { id: ticketId },
    });
    if (!ticket) {
      return false;
    }
    return this.canReadTicketInFull(ticket, userId);
  }

  /**
   * Ticket-level visibility. Observers are deliberately excluded from the
   * full record: the observer permission set reads an approved,
   * non-confidential ticket summary, not the internal handling log, the share
   * list or the repair attachments.
   */
  async canViewTicket(ticketId: number, userId: string): Promise<boolean> {
    const ticket = await this.tickets().findOne({
      filter: { id: ticketId },
    });
    if (!ticket) {
      return false;
    }
    if (await this.canReadTicketInFull(ticket, userId)) {
      return true;
    }
    // Read-only observers see approved, non-confidential summaries only.
    return (
      Boolean(ticket.observerVisible) &&
      !ticket.confidential &&
      (await this.holdsPermissionSet(userId, 'service-observer'))
    );
  }

  /** Whether the caller may read the bytes behind a stored file key. */
  async canViewFileKey(key: string, userId: string): Promise<boolean> {
    const file = await this.files().findOne({ filter: { key } });
    if (!file) {
      return false;
    }
    if (file.ticketId == null) {
      return false;
    }
    return this.canViewTicketInternal(file.ticketId, userId);
  }

  /**
   * The byte route addresses a file by its record id (`<id>.<ext>`), not by its
   * storage key, so the guard resolves it the same way the byte route does.
   * Repair attachments are internal handling records, so an observer may not
   * fetch their bytes even though it may read the ticket summary.
   */
  async canViewFileId(fileId: string, userId: string): Promise<boolean> {
    const file = await this.files().findOne({ filter: { id: fileId } });
    if (!file) {
      return false;
    }
    if (file.ticketId == null) {
      return false;
    }
    return this.canViewTicketInternal(file.ticketId, userId);
  }

  /**
   * Rejects an upload whose stored bytes do not match the format the record
   * claims: a photo must carry the PNG signature and a report the ZIP signature
   * every DOCX has. The rejected record is discarded so a corrupt or
   * mislabelled upload never becomes a ticket attachment.
   */
  async assertAttachmentContent(fileId: string): Promise<void> {
    const file = await this.files().findOne({ filter: { id: fileId } });
    if (!file) {
      throw new TicketServiceError('NOT_FOUND', 'Attachment not found');
    }
    if (!this.container.has(driveManagerToken)) {
      throw new TicketServiceError(
        'INVALID_STATE',
        'File storage is not registered',
      );
    }
    const disk = this.container.resolve(driveManagerToken).use(file.disk);
    const bytes = await disk.getBytes(file.key);
    const ext = (file.ext ?? '').toLowerCase();
    if (attachmentContentMatches(ext, bytes)) {
      return;
    }
    await this.files().deleteOne({ filter: { id: fileId } });
    // The upload already stored the object, so the record and its bytes must go
    // together; otherwise every rejected upload leaves an orphan on the disk.
    try {
      await disk.delete(file.key);
    } catch (error) {
      console.warn(
        '[service] failed to remove rejected attachment bytes',
        error,
      );
    }
    throw new TicketServiceError(
      'VALIDATION',
      ext === 'docx'
        ? 'The file is not a valid DOCX report.'
        : 'The file is not a valid PNG photo.',
      { reason: 'SERVICE_ATTACHMENT_CONTENT_INVALID' },
    );
  }
}

// The acceptance workflow runs from a snapshot of its own package, so it
// cannot import this token object. Both sides derive the same container key
// from this one process-global name: see
// `workflows/ticket-acceptance/server/tokens.ts`, which must keep using it.
const TICKET_SERVICE_TOKEN_KEY = 'equipment-service/service.ticket';

export const ticketServiceToken = Symbol.for(
  TICKET_SERVICE_TOKEN_KEY,
) as unknown as ServiceToken<TicketService>;
