import {
  databaseManagerToken,
  type DatabaseManager,
  type Row,
} from '@nocobase/db';
import {
  createServiceToken,
  type ServiceResolver,
} from '@nocobase/service-provider';
import {
  asBoolean,
  ServiceError,
  serviceAccessToken,
  type ServiceIdentity,
  type ServiceTicketScopeRow,
} from './access.js';
import { serviceNotificationToken } from './notifications.js';
import { textValue } from './text.js';

/**
 * Service ticket lifecycle.
 *
 * Every transition is one explicit action, and every attempt is written to
 * `service_ticket_logs` so a retry can be recognised by `requestKey` and
 * answered with the original result instead of applying twice. Automated
 * acceptance steps are logged as first-class rows so the operator sees why a
 * submission was accepted or held back.
 */

export const serviceTicketToken =
  createServiceToken<ServiceTicketService>('service.tickets');

export type TicketAction =
  | 'submit'
  | 'assign'
  | 'reassign'
  | 'resolve'
  | 'confirm'
  | 'return'
  | 'cancel'
  | 'comment';

/** Ticket actions the assistant may propose and a human may confirm. */
export type AssistantTicketAction = Extract<
  TicketAction,
  | 'assign'
  | 'reassign'
  | 'resolve'
  | 'confirm'
  | 'return'
  | 'cancel'
  | 'comment'
>;

export interface TicketActionActor {
  readonly id: string;
  readonly name?: string | null;
  readonly role?: string | null;
}

export interface TicketActionPayload {
  readonly assigneeId?: string;
  readonly assigneeName?: string;
  readonly reason?: string;
  readonly resolution?: string;
  readonly comment?: string;
  readonly laborCost?: number;
  readonly partsCost?: number;
  readonly internalNotes?: string;
}

export interface TicketActionResult {
  readonly replayed: boolean;
  readonly ticket: Row;
  readonly logs: readonly Row[];
  readonly warnings: readonly string[];
}

interface Transition {
  readonly from: readonly string[];
  readonly to?: string;
  readonly requireReason?: boolean;
}

const TRANSITIONS: Readonly<Record<TicketAction, Transition>> = {
  submit: { from: ['draft'], to: 'pending_assignment' },
  assign: { from: ['pending_assignment', 'in_progress'], to: 'in_progress' },
  reassign: {
    from: ['pending_assignment', 'in_progress', 'pending_confirmation'],
    requireReason: true,
  },
  resolve: { from: ['in_progress'], to: 'pending_confirmation' },
  confirm: { from: ['pending_confirmation'], to: 'closed' },
  return: {
    from: ['pending_confirmation'],
    to: 'in_progress',
    requireReason: true,
  },
  cancel: {
    from: ['draft', 'pending_assignment', 'in_progress'],
    to: 'cancelled',
    requireReason: true,
  },
  comment: { from: ['*'] },
};

const SLA_HOURS: Readonly<Record<string, number>> = {
  urgent: 4,
  high: 8,
  normal: 24,
  low: 72,
};

export class ServiceTicketService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly container: ServiceResolver,
  ) {}

  /** Applies one action, or returns the earlier result for a repeated key. */
  async applyAction(input: {
    readonly ticketId: number;
    readonly action: TicketAction;
    readonly payload?: TicketActionPayload;
    readonly requestKey?: string | null;
    readonly actor: TicketActionActor;
    readonly identity: ServiceIdentity;
  }): Promise<TicketActionResult> {
    const access = this.container.resolve(serviceAccessToken);
    const ticket = await this.loadTicket(input.ticketId);
    await access.requireTicketWrite(input.identity, asScope(ticket));

    const transition = TRANSITIONS[input.action];
    if (!transition) {
      throw new ServiceError(400, 'UNKNOWN_ACTION', 'Unknown ticket action.');
    }

    // A retried request must return the earlier result even though the first
    // attempt already moved the ticket, so the recorded key is checked before
    // the transition rules, which only describe a first attempt.
    const requestKey = input.requestKey?.trim() || null;
    if (requestKey) {
      const existing = await this.findLogByRequestKey(
        input.ticketId,
        requestKey,
      );
      if (existing) {
        if (textValue(existing.action) !== input.action) {
          throw new ServiceError(
            409,
            'REQUEST_KEY_REUSED',
            'This request key was already used for a different ticket action.',
          );
        }
        return {
          replayed: true,
          ticket: await this.loadTicket(input.ticketId),
          logs: await this.logsFor(input.ticketId),
          warnings: [],
        };
      }
    }

    const status = String(ticket.status);
    if (!transition.from.includes('*') && !transition.from.includes(status)) {
      throw new ServiceError(
        409,
        'INVALID_TRANSITION',
        `Action "${input.action}" is not allowed from status "${status}".`,
      );
    }
    const payload = input.payload ?? {};
    if (transition.requireReason && !payload.reason?.trim()) {
      throw new ServiceError(
        400,
        'REASON_REQUIRED',
        `Action "${input.action}" requires a reason.`,
      );
    }

    const now = new Date().toISOString();
    const changes: Record<string, unknown> = { updatedAt: now };
    const warnings: string[] = [];

    switch (input.action) {
      case 'submit': {
        if (!textValue(ticket.title).trim()) {
          throw new ServiceError(
            400,
            'TITLE_REQUIRED',
            'A ticket needs a title.',
          );
        }
        changes.status = 'pending_assignment';
        changes.submittedAt = now;
        changes.slaDueAt = computeSlaDue(
          textValue(ticket.priority, 'normal'),
          now,
        );
        break;
      }
      case 'assign': {
        if (!payload.assigneeId) {
          throw new ServiceError(
            400,
            'ASSIGNEE_REQUIRED',
            'Assigning a ticket needs an assignee.',
          );
        }
        changes.status = 'in_progress';
        changes.assigneeId = payload.assigneeId;
        changes.assigneeName = payload.assigneeName ?? null;
        changes.assignedAt = now;
        changes.startedAt = ticket.startedAt ?? now;
        break;
      }
      case 'reassign': {
        if (!payload.assigneeId) {
          throw new ServiceError(
            400,
            'ASSIGNEE_REQUIRED',
            'Reassigning a ticket needs an assignee.',
          );
        }
        changes.assigneeId = payload.assigneeId;
        changes.assigneeName = payload.assigneeName ?? null;
        changes.assignedAt = now;
        changes.returnReason = payload.reason ?? null;
        break;
      }
      case 'resolve': {
        if (!payload.resolution?.trim()) {
          throw new ServiceError(
            400,
            'RESOLUTION_REQUIRED',
            'Resolving a ticket needs a resolution.',
          );
        }
        changes.status = 'pending_confirmation';
        changes.resolution = payload.resolution;
        changes.resolvedAt = now;
        break;
      }
      case 'confirm': {
        changes.status = 'closed';
        changes.confirmedAt = now;
        changes.closedAt = now;
        break;
      }
      case 'return': {
        changes.status = 'in_progress';
        changes.returnReason = payload.reason ?? null;
        changes.returnCount = Number(ticket.returnCount ?? 0) + 1;
        break;
      }
      case 'cancel': {
        changes.status = 'cancelled';
        changes.cancelReason = payload.reason ?? null;
        changes.cancelledAt = now;
        break;
      }
      case 'comment': {
        if (!payload.comment?.trim()) {
          throw new ServiceError(
            400,
            'COMMENT_REQUIRED',
            'A comment needs text.',
          );
        }
        break;
      }
    }

    // Commercial fields may only be written by someone allowed to see them.
    if (access.canSeeInternalFields(input.identity, asScope(ticket))) {
      if (payload.laborCost !== undefined)
        changes.laborCost = payload.laborCost;
      if (payload.partsCost !== undefined)
        changes.partsCost = payload.partsCost;
      if (payload.internalNotes !== undefined)
        changes.internalNotes = payload.internalNotes;
    } else if (
      payload.laborCost !== undefined ||
      payload.partsCost !== undefined ||
      payload.internalNotes !== undefined
    ) {
      throw new ServiceError(
        403,
        'INTERNAL_FIELDS_DENIED',
        'Your role may not change the ticket commercial fields.',
      );
    }

    const automated = await this.automatedSteps(input.action, ticket, payload);
    for (const step of automated) {
      if (step.stepStatus === 'failed') warnings.push(step.content);
    }

    await this.database
      .query()
      .updateTable('service_tickets')
      .set(changes)
      .where('id', '=', input.ticketId)
      .execute();

    await this.appendLog({
      ticketId: input.ticketId,
      kind: 'transition',
      action: input.action,
      fromStatus: status,
      toStatus: (changes.status as string | undefined) ?? status,
      content: describeAction(input.action, payload),
      actor: input.actor,
      requestKey,
      metadata: {
        reason: payload.reason ?? null,
        assigneeId: payload.assigneeId ?? null,
      },
      now,
    });
    for (const step of automated) {
      await this.appendLog({
        ticketId: input.ticketId,
        kind: 'step',
        action: input.action,
        step: step.step,
        stepStatus: step.stepStatus,
        content: step.content,
        actor: { id: 'system', name: 'Automated check', role: 'system' },
        requestKey,
        metadata: step.metadata,
        now,
      });
    }

    await this.notifyForAction(input, ticket, payload, now);

    return {
      replayed: false,
      ticket: await this.loadTicket(input.ticketId),
      logs: await this.logsFor(input.ticketId),
      warnings,
    };
  }

  /** Creates a draft ticket. Nothing is dispatched until it is submitted. */
  async create(input: {
    readonly values: Record<string, unknown>;
    readonly actor: TicketActionActor;
  }): Promise<Row> {
    const now = new Date().toISOString();
    const serial =
      (input.values.serial as string | undefined) ??
      `SR-${now.slice(0, 10).replace(/-/g, '')}-${Math.floor(
        Math.random() * 90_000 + 10_000,
      )}`;
    const result = await this.database
      .query()
      .insertInto('service_tickets')
      .values({
        serial,
        title: textValue(input.values.title),
        description: input.values.description ?? null,
        type: textValue(input.values.type, 'repair'),
        priority: textValue(input.values.priority, 'normal'),
        status: 'draft',
        confidential: asBoolean(input.values.confidential),
        customerId: Number(input.values.customerId ?? 0),
        customerName: textValue(input.values.customerName),
        deviceId:
          input.values.deviceId === undefined || input.values.deviceId === null
            ? null
            : Number(input.values.deviceId),
        deviceSerial: input.values.deviceSerial ?? null,
        region: textValue(input.values.region, 'east'),
        assigneeId: null,
        assigneeName: null,
        reporterId: input.actor.id,
        reporterName: input.actor.name ?? '',
        source: textValue(input.values.source, 'manual'),
        slaDueAt: null,
        submittedAt: null,
        assignedAt: null,
        startedAt: null,
        resolvedAt: null,
        confirmedAt: null,
        closedAt: null,
        cancelledAt: null,
        resolution: null,
        cancelReason: null,
        returnReason: null,
        laborCost: null,
        partsCost: null,
        internalNotes: null,
        returnCount: 0,
        overdue: false,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const id = Number(result.insertId ?? 0);
    await this.appendLog({
      ticketId: id,
      kind: 'transition',
      action: 'create',
      fromStatus: null,
      toStatus: 'draft',
      content: 'Ticket created as draft.',
      actor: input.actor,
      requestKey: null,
      metadata: null,
      now,
    });
    return this.loadTicket(id);
  }

  /** Field edits, only while the ticket is still a draft. */
  async updateDraft(input: {
    readonly ticketId: number;
    readonly values: Record<string, unknown>;
    readonly actor: TicketActionActor;
    readonly identity: ServiceIdentity;
  }): Promise<Row> {
    const access = this.container.resolve(serviceAccessToken);
    const ticket = await this.loadTicket(input.ticketId);
    await access.requireTicketWrite(input.identity, asScope(ticket));
    if (String(ticket.status) !== 'draft') {
      throw new ServiceError(
        409,
        'TICKET_NOT_DRAFT',
        'Only a draft ticket can be edited.',
      );
    }
    const allowed = [
      'title',
      'description',
      'type',
      'priority',
      'confidential',
      'customerId',
      'customerName',
      'deviceId',
      'deviceSerial',
      'region',
    ] as const;
    const changes: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    for (const key of allowed) {
      if (input.values[key] !== undefined) {
        changes[key] =
          key === 'confidential'
            ? asBoolean(input.values[key])
            : input.values[key];
      }
    }
    await this.database
      .query()
      .updateTable('service_tickets')
      .set(changes)
      .where('id', '=', input.ticketId)
      .execute();
    return this.loadTicket(input.ticketId);
  }

  /** Shares a ticket with a collaborator. Confidential tickets cannot be shared. */
  async share(input: {
    readonly ticketId: number;
    readonly userId: string;
    readonly userName: string;
    readonly reason?: string;
    readonly actor: TicketActionActor;
    readonly identity: ServiceIdentity;
  }): Promise<void> {
    const access = this.container.resolve(serviceAccessToken);
    const ticket = await this.loadTicket(input.ticketId);
    await access.requireTicketRead(input.identity, asScope(ticket));
    if (!access.canShareTicket(input.identity, asScope(ticket))) {
      throw new ServiceError(
        403,
        'TICKET_SHARE_DENIED',
        asBoolean(ticket.confidential)
          ? 'A confidential ticket cannot be shared with a collaborator.'
          : 'Your role may not share tickets.',
      );
    }
    const now = new Date().toISOString();
    const existing = await this.database
      .query()
      .selectFrom('service_ticket_shares')
      .select(['id'])
      .where('ticketId', '=', input.ticketId)
      .where('userId', '=', input.userId)
      .executeTakeFirst();
    if (existing) return;
    await this.database
      .query()
      .insertInto('service_ticket_shares')
      .values({
        ticketId: input.ticketId,
        userId: input.userId,
        userName: input.userName,
        permission: 'read',
        reason: input.reason ?? null,
        sharedById: input.actor.id,
        sharedByName: input.actor.name ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  }

  /** Removes a collaborator's share. */
  async unshare(input: {
    readonly ticketId: number;
    readonly userId: string;
    readonly identity: ServiceIdentity;
  }): Promise<void> {
    const access = this.container.resolve(serviceAccessToken);
    const ticket = await this.loadTicket(input.ticketId);
    await access.requireTicketRead(input.identity, asScope(ticket));
    if (!access.canShareTicket(input.identity, asScope(ticket))) {
      throw new ServiceError(
        403,
        'TICKET_SHARE_DENIED',
        'Your role may not change ticket sharing.',
      );
    }
    await this.database
      .query()
      .deleteFrom('service_ticket_shares')
      .where('ticketId', '=', input.ticketId)
      .where('userId', '=', input.userId)
      .execute();
  }

  async sharesFor(ticketId: number): Promise<Row[]> {
    return this.database
      .query()
      .selectFrom('service_ticket_shares')
      .selectAll()
      .where('ticketId', '=', ticketId)
      .orderBy('id', 'asc')
      .execute<Row>();
  }

  async logsFor(ticketId: number): Promise<Row[]> {
    return this.database
      .query()
      .selectFrom('service_ticket_logs')
      .selectAll()
      .where('ticketId', '=', ticketId)
      .orderBy('id', 'asc')
      .execute<Row>();
  }

  async loadTicket(id: number): Promise<Row> {
    const row = await this.database
      .query()
      .selectFrom('service_tickets')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst<Row>();
    if (!row) {
      throw new ServiceError(
        404,
        'TICKET_NOT_FOUND',
        'Service ticket not found.',
      );
    }
    return row;
  }

  /**
   * Removes commercial and internal fields from a ticket and its logs when the
   * identity may not see them.
   */
  sanitizeFor(identity: ServiceIdentity, row: Row): Record<string, unknown> {
    const access = this.container.resolve(serviceAccessToken);
    const scope = asScope(row);
    const clone: Record<string, unknown> = { ...row };
    if (!access.canSeeInternalFields(identity, scope)) {
      delete clone.laborCost;
      delete clone.partsCost;
      delete clone.internalNotes;
    }
    clone.overdue = asBoolean(row.overdue);
    clone.confidential = asBoolean(row.confidential);
    return clone;
  }

  /** Log rows carry no commercial fields, so they pass through unchanged. */
  sanitizeLog(row: Row): Record<string, unknown> {
    return { ...row, metadata: row.metadata ?? null };
  }

  private async findLogByRequestKey(
    ticketId: number,
    requestKey: string,
  ): Promise<Row | undefined> {
    return this.database
      .query()
      .selectFrom('service_ticket_logs')
      .selectAll()
      .where('ticketId', '=', ticketId)
      .where('requestKey', '=', requestKey)
      .where('kind', '=', 'transition')
      .executeTakeFirst<Row>();
  }

  private async appendLog(input: {
    readonly ticketId: number;
    readonly kind: string;
    readonly action: string;
    readonly fromStatus?: string | null;
    readonly toStatus?: string | null;
    readonly step?: string | null;
    readonly stepStatus?: string | null;
    readonly content: string;
    readonly actor: TicketActionActor;
    readonly requestKey: string | null;
    readonly metadata: Record<string, unknown> | null;
    readonly now: string;
  }): Promise<void> {
    await this.database
      .query()
      .insertInto('service_ticket_logs')
      .values({
        ticketId: input.ticketId,
        kind: input.kind,
        action: input.action,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus ?? null,
        step: input.step ?? null,
        stepStatus: input.stepStatus ?? null,
        content: input.content,
        actorId: input.actor.id,
        actorName: input.actor.name ?? null,
        actorRole: input.actor.role ?? null,
        requestKey: input.requestKey,
        metadata: input.metadata,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .execute();
  }

  /** Visible automated checks run alongside a transition. */
  private async automatedSteps(
    action: TicketAction,
    ticket: Row,
    payload: TicketActionPayload,
  ): Promise<
    Array<{
      step: string;
      stepStatus: 'passed' | 'failed' | 'warning';
      content: string;
      metadata: Record<string, unknown> | null;
    }>
  > {
    const steps: Array<{
      step: string;
      stepStatus: 'passed' | 'failed' | 'warning';
      content: string;
      metadata: Record<string, unknown> | null;
    }> = [];
    if (action === 'submit') {
      const customer = await this.database
        .query()
        .selectFrom('service_customers')
        .select(['id', 'name', 'status'])
        .where('id', '=', Number(ticket.customerId))
        .executeTakeFirst<Row>();
      steps.push(
        customer && String(customer.status) === 'active'
          ? {
              step: 'customer_active',
              stepStatus: 'passed',
              content: `Customer ${String(customer.name)} is active.`,
              metadata: { customerId: Number(customer.id) },
            }
          : {
              step: 'customer_active',
              stepStatus: 'failed',
              content: 'The customer is missing or not active.',
              metadata: { customerId: ticket.customerId },
            },
      );
      const deviceId =
        ticket.deviceId === null || ticket.deviceId === undefined
          ? null
          : Number(ticket.deviceId);
      if (deviceId !== null) {
        const device = await this.database
          .query()
          .selectFrom('service_devices')
          .select(['id', 'serialNumber', 'customerId', 'enabled'])
          .where('id', '=', deviceId)
          .executeTakeFirst<Row>();
        const ok =
          device !== undefined &&
          Number(device.customerId) === Number(ticket.customerId) &&
          asBoolean(device.enabled);
        steps.push({
          step: 'device_bound',
          stepStatus: ok ? 'passed' : 'failed',
          content: ok
            ? `Device ${String(device?.serialNumber)} belongs to the customer and is enabled.`
            : 'The device is missing, disabled, or does not belong to this customer.',
          metadata: { deviceId },
        });
      } else {
        steps.push({
          step: 'device_bound',
          stepStatus: 'warning',
          content: 'No device is linked to this ticket.',
          metadata: null,
        });
      }
      steps.push({
        step: 'sla_scheduled',
        stepStatus: 'passed',
        content: `Service level deadline set for priority "${String(ticket.priority)}".`,
        metadata: {
          slaDueAt: computeSlaDue(
            String(ticket.priority),
            new Date().toISOString(),
          ),
        },
      });
    }
    if (action === 'resolve') {
      steps.push(
        payload.resolution?.trim()
          ? {
              step: 'resolution_recorded',
              stepStatus: 'passed',
              content: 'A resolution is recorded for the customer to confirm.',
              metadata: null,
            }
          : {
              step: 'resolution_recorded',
              stepStatus: 'failed',
              content: 'A resolution is required before confirmation.',
              metadata: null,
            },
      );
      const attachments = await this.database
        .query()
        .selectFrom('service_attachments')
        .select(['id'])
        .where('ticketId', '=', Number(ticket.id))
        .execute<Row>();
      steps.push({
        step: 'evidence_attached',
        stepStatus: attachments.length > 0 ? 'passed' : 'warning',
        content:
          attachments.length > 0
            ? `${attachments.length} attachment(s) available as evidence.`
            : 'No attachment is linked; the customer may still confirm.',
        metadata: { attachments: attachments.length },
      });
    }
    if (action === 'confirm') {
      steps.push({
        step: 'customer_confirmation_recorded',
        stepStatus: 'passed',
        content: 'Customer confirmation recorded; the ticket is closed.',
        metadata: null,
      });
    }
    return steps;
  }

  private async notifyForAction(
    input: {
      readonly ticketId: number;
      readonly action: TicketAction;
      readonly actor: TicketActionActor;
    },
    ticket: Row,
    payload: TicketActionPayload,
    now: string,
  ): Promise<void> {
    if (!this.container.has(serviceNotificationToken)) return;
    const notifications = this.container.resolve(serviceNotificationToken);
    const serial = textValue(ticket.serial, String(input.ticketId));
    const target = {
      type: 'route' as const,
      path: `/service/tickets/${input.ticketId}`,
    };
    const recipients: Array<{
      id: string;
      name?: string | null;
      title: string;
      body: string;
    }> = [];
    const assigneeId =
      payload.assigneeId ?? (ticket.assigneeId as string | null);
    const assigneeName =
      payload.assigneeName ?? (ticket.assigneeName as string | null);
    if (input.action === 'assign' || input.action === 'reassign') {
      if (assigneeId) {
        recipients.push({
          id: assigneeId,
          name: assigneeName,
          title: 'Service ticket assigned',
          body: `Ticket ${serial} was assigned by ${input.actor.name ?? input.actor.id}.`,
        });
      }
    }
    if (
      input.action === 'resolve' ||
      input.action === 'confirm' ||
      input.action === 'return'
    ) {
      const reporterId = ticket.reporterId as string | null;
      if (reporterId && reporterId !== input.actor.id) {
        recipients.push({
          id: reporterId,
          name: (ticket.reporterName as string | null) ?? null,
          title:
            input.action === 'resolve'
              ? 'Service ticket awaiting confirmation'
              : input.action === 'confirm'
                ? 'Service ticket closed'
                : 'Service ticket returned',
          body: `Ticket ${serial} changed to "${String(ticket.status)}".`,
        });
      }
    }
    for (const recipient of recipients) {
      await notifications.notify({
        notificationKey: `service-ticket:${input.ticketId}:${input.action}:${now}`,
        title: recipient.title,
        body: recipient.body,
        ticketId: input.ticketId,
        recipient: { id: recipient.id, name: recipient.name },
        target,
      });
    }
  }
}

/** Maps a ticket row from the query layer onto the access-layer shape. */
function asScope(row: Row): ServiceTicketScopeRow {
  return {
    id: Number(row.id),
    region: (row.region as string | null) ?? null,
    assigneeId: (row.assigneeId as string | null) ?? null,
    reporterId: (row.reporterId as string | null) ?? null,
    confidential: row.confidential,
  };
}

export function computeSlaDue(priority: string, fromIso: string): string {
  const hours = SLA_HOURS[priority] ?? SLA_HOURS.normal;
  return new Date(
    new Date(fromIso).getTime() + hours * 3_600_000,
  ).toISOString();
}

function describeAction(
  action: TicketAction,
  payload: TicketActionPayload,
): string {
  switch (action) {
    case 'assign':
      return `Assigned to ${payload.assigneeName ?? payload.assigneeId ?? 'an engineer'}.`;
    case 'reassign':
      return `Reassigned to ${payload.assigneeName ?? payload.assigneeId ?? 'an engineer'}: ${payload.reason ?? ''}`;
    case 'resolve':
      return `Resolved: ${payload.resolution ?? ''}`;
    case 'confirm':
      return 'Customer confirmation recorded.';
    case 'return':
      return `Returned for rework: ${payload.reason ?? ''}`;
    case 'cancel':
      return `Cancelled: ${payload.reason ?? ''}`;
    case 'comment':
      return payload.comment ?? '';
    case 'submit':
      return 'Submitted for assignment.';
    default:
      return action;
  }
}

export function createServiceTicketService(
  container: ServiceResolver,
): ServiceTicketService {
  return new ServiceTicketService(
    container.resolve(databaseManagerToken),
    container,
  );
}
