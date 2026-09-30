import type {
  DatabaseManager,
  RepositoryMutationScalarValue,
  RepositoryPolicy,
} from '@nocobase/db';
import type { ServiceDirectoryService } from './directory-service.js';
import type {
  ServiceAttachmentRecord,
  ServiceDeviceRecord,
  ServiceTicketEventRecord,
  ServiceTicketOperationRecord,
  ServiceTicketRecord,
} from './records.js';
import type { ServiceNotifier } from './notifier.js';

/**
 * Service-ticket lifecycle, the operation journal that makes acceptance and
 * external submission idempotent, and the notifications those transitions
 * produce. All authorization is decided by the caller: routes resolve a
 * Repository Policy per collection from an authorized composite action and pass
 * it here, so the database enforces the caller's data scope on every read and
 * write. The automatic acceptance is called by the workflow with no user, and
 * therefore reads and writes as the system with an explicit state guard.
 */

export const TICKET_STATUS = {
  pendingAcceptance: 'pending_acceptance',
  pendingProcessing: 'pending_processing',
  processing: 'processing',
  pendingConfirmation: 'pending_confirmation',
  closed: 'closed',
} as const;

export type TicketStatus = (typeof TICKET_STATUS)[keyof typeof TICKET_STATUS];

export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export interface TicketPolicies {
  tickets: RepositoryPolicy;
  events?: RepositoryPolicy;
}

export interface TicketActor {
  id: string;
  name?: string;
}

export interface TicketListFilters {
  status?: string;
  statuses?: readonly string[];
  priority?: string;
  query?: string;
  assigneeId?: string;
  customerId?: number;
  deviceId?: number;
  confidential?: boolean;
  overdue?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreateTicketInput {
  title: string;
  description?: string | null;
  customerId: number;
  deviceId: number;
  priority?: TicketPriority;
  confidential?: boolean;
  reporterName?: string | null;
  assigneeId?: string | null;
  source?: string;
  dueAt?: string | null;
}

export type TicketAction = 'accept' | 'process' | 'submit' | 'return' | 'close';

export interface TicketTransitionInput {
  resolution?: string | null;
  message?: string | null;
  assigneeId?: string | null;
}

export interface AcceptanceOutcome {
  status: 'accepted' | 'already_handled' | 'failed';
  ticketId: number;
  assigneeId: string | null;
  highPriority: boolean;
  error?: string;
}

export interface ExternalTicketInput {
  externalEventId: string;
  externalPlatform?: string | null;
  deviceSerialNumber: string;
  title: string;
  description?: string | null;
  priority?: string;
  reporterName?: string | null;
  occurredAt?: string | null;
}

export interface ExternalTicketOutcome {
  ticket: Record<string, unknown>;
  created: boolean;
  duplicate: boolean;
}

export const TRANSITION_FROM: Record<TicketAction, TicketStatus> = {
  accept: TICKET_STATUS.pendingAcceptance,
  process: TICKET_STATUS.pendingProcessing,
  submit: TICKET_STATUS.processing,
  return: TICKET_STATUS.pendingConfirmation,
  close: TICKET_STATUS.pendingConfirmation,
};

const TRANSITION_TO: Record<TicketAction, TicketStatus> = {
  accept: TICKET_STATUS.pendingProcessing,
  process: TICKET_STATUS.processing,
  submit: TICKET_STATUS.pendingConfirmation,
  return: TICKET_STATUS.processing,
  close: TICKET_STATUS.closed,
};

const OPEN_STATUSES: readonly string[] = [
  TICKET_STATUS.pendingProcessing,
  TICKET_STATUS.processing,
  TICKET_STATUS.pendingConfirmation,
];

const HIGH_PRIORITIES: readonly string[] = ['high', 'urgent'];

function nowIso(): string {
  return new Date().toISOString();
}

/** Directory names attached to a ticket row for display. */
interface TicketDecoration {
  customerName: string | null;
  customerCode: string | null;
  deviceName: string | null;
  deviceSerialNumber: string | null;
  assigneeName: string | null;
}

export class ServiceTicketService {
  public constructor(
    private readonly database: DatabaseManager,
    private readonly directories: ServiceDirectoryService,
    private readonly notifier: ServiceNotifier,
  ) {}

  public async list(
    policies: TicketPolicies,
    filters: TicketListFilters = {},
  ): Promise<Record<string, unknown>[]> {
    const rows = await this.database
      .repository<ServiceTicketRecord>('serviceTickets')
      .withPolicy(policies.tickets)
      .findMany({
        filter: (filter) =>
          filter.and([
            ...(filters.statuses?.length
              ? [
                  filter.or(
                    filters.statuses.map((status) =>
                      filter.string('status').eq(status),
                    ),
                  ),
                ]
              : filters.status
                ? [filter.string('status').eq(filters.status)]
                : []),
            ...(filters.priority
              ? [filter.string('priority').eq(filters.priority)]
              : []),
            ...(filters.assigneeId
              ? [filter.string('assigneeId').eq(filters.assigneeId)]
              : []),
            ...(filters.customerId !== undefined
              ? [filter.number('customerId').eq(filters.customerId)]
              : []),
            ...(filters.deviceId !== undefined
              ? [filter.number('deviceId').eq(filters.deviceId)]
              : []),
            ...(filters.confidential !== undefined
              ? [
                  filters.confidential
                    ? filter.boolean('confidential').isTrue()
                    : filter.boolean('confidential').isFalse(),
                ]
              : []),
            ...(filters.overdue
              ? [
                  filter.or(
                    OPEN_STATUSES.map((status) =>
                      filter.string('status').eq(status),
                    ),
                  ),
                  filter.date('dueAt').before(nowIso()),
                ]
              : []),
            ...(filters.query
              ? [filter.string('title').includes(filters.query)]
              : []),
          ]),
        sort: (sort) => sort.field('createdAt').desc(),
        limit: filters.limit ?? 50,
        offset: filters.offset ?? 0,
      });
    return this.decorate(rows);
  }

  public async listForIntegration(
    actorId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<Record<string, unknown>[]> {
    const rows = await this.database
      .repository<ServiceTicketRecord>('serviceTickets')
      .findMany({
        filter: { createdById: actorId },
        sort: (sort) => sort.field('createdAt').desc(),
        limit: options.limit ?? 50,
        offset: options.offset ?? 0,
      });
    return this.decorate(rows);
  }

  public async get(
    policies: TicketPolicies,
    id: number,
  ): Promise<Record<string, unknown> | undefined> {
    const ticket = await this.database
      .repository<ServiceTicketRecord>('serviceTickets')
      .withPolicy(policies.tickets)
      .findOne({ filter: { id } });
    if (!ticket) return undefined;
    // Events are read only when this operation was granted an events scope. The
    // share action deliberately grants the ticket alone, and a restricted
    // ticket policy cannot be applied to the events collection.
    const events = policies.events
      ? await this.database
          .repository<ServiceTicketEventRecord>('serviceTicketEvents')
          .withPolicy(policies.events)
          .findMany({
            filter: { ticketId: id },
            sort: (sort) => sort.field('createdAt').asc(),
          })
      : [];
    const attachments = await this.database
      .repository<ServiceAttachmentRecord>('serviceAttachments')
      .findMany({
        filter: { ticketId: id },
        sort: (sort) => sort.field('createdAt').asc(),
      });
    const [decorated] = await this.decorate([ticket]);
    // The history and the resolution are internal handling notes. A caller
    // whose operation was not granted an events scope (the read-only observer,
    // or a share grant that deliberately carries the ticket alone) sees the
    // summary only, never the notes the team wrote for each other.
    const visible = policies.events
      ? decorated
      : { ...decorated, resolution: null };
    return {
      ...visible,
      events: events,
      attachments: attachments,
    };
  }

  public async create(
    policies: TicketPolicies,
    input: CreateTicketInput,
    actor: TicketActor,
  ): Promise<Record<string, unknown>> {
    const timestamp = nowIso();
    const code = await this.nextTicketCode();
    const { record } = await this.database
      .repository<ServiceTicketRecord>('serviceTickets')
      .withPolicy(policies.tickets)
      .createOne({
        values: {
          code,
          title: input.title,
          description: input.description ?? null,
          status: TICKET_STATUS.pendingAcceptance,
          priority: input.priority ?? 'normal',
          source: input.source ?? 'manual',
          confidential: input.confidential ?? false,
          reporterName: input.reporterName ?? null,
          acceptanceStatus: 'pending',
          acceptanceError: null,
          acceptanceHandledAt: null,
          dueAt: input.dueAt ?? null,
          createdById: actor.id,
          assigneeId: input.assigneeId ?? null,
          customerId: input.customerId,
          deviceId: input.deviceId,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      });
    const ticket = record as Record<string, unknown>;
    await this.appendEvent(policies, {
      ticketId: Number(ticket.id),
      type: 'created',
      fromStatus: null,
      toStatus: TICKET_STATUS.pendingAcceptance,
      message: `Ticket ${code} created`,
      actorId: actor.id,
      data: { source: input.source ?? 'manual' },
    });
    return ticket;
  }

  public async submitExternal(
    input: ExternalTicketInput,
    actor: TicketActor,
  ): Promise<ExternalTicketOutcome> {
    const existing = await this.database
      .repository<ServiceTicketRecord>('serviceTickets')
      .findOne({
        filter: { externalEventId: input.externalEventId },
      });
    if (existing) {
      return {
        ticket: (await this.decorate([existing]))[0],
        created: false,
        duplicate: true,
      };
    }
    const device = await this.database
      .repository<ServiceDeviceRecord>('serviceDevices')
      .findOne({ filter: { serialNumber: input.deviceSerialNumber } });
    if (!device) {
      const error = new Error(
        `Unknown device serial number: ${input.deviceSerialNumber}`,
      );
      (error as Error & { code?: string }).code = 'device_not_found';
      throw error;
    }
    const timestamp = nowIso();
    const code = await this.nextTicketCode();
    const priority = TICKET_PRIORITIES.includes(
      (input.priority ?? '') as TicketPriority,
    )
      ? (input.priority as TicketPriority)
      : 'normal';
    const { record } = await this.database
      .repository<ServiceTicketRecord>('serviceTickets')
      .createOne({
        values: {
          code,
          title: input.title,
          description: input.description ?? null,
          status: TICKET_STATUS.pendingAcceptance,
          priority,
          source: 'external',
          confidential: false,
          reporterName: input.reporterName ?? null,
          acceptanceStatus: 'pending',
          acceptanceError: null,
          acceptanceHandledAt: null,
          externalEventId: input.externalEventId,
          externalPlatform: input.externalPlatform ?? 'external-platform',
          createdById: actor.id,
          assigneeId: null,
          customerId: Number(device.customerId),
          deviceId: Number(device.id),
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      });
    const ticket = record as Record<string, unknown>;
    await this.appendEvent(undefined, {
      ticketId: Number(ticket.id),
      type: 'created',
      fromStatus: null,
      toStatus: TICKET_STATUS.pendingAcceptance,
      message: `External repair event ${input.externalEventId} received`,
      actorId: actor.id,
      data: {
        externalEventId: input.externalEventId,
        platform: input.externalPlatform ?? 'external-platform',
        occurredAt: input.occurredAt ?? null,
      },
    });
    return { ticket, created: true, duplicate: false };
  }

  /**
   * The single state machine used by user actions and the acceptance
   * workflow. The status in the filter makes the write conditional: two
   * concurrent requests cannot both advance the ticket, and a repeated request
   * observes the ticket past this step and reports a conflict instead.
   */
  public async transition(
    policies: TicketPolicies,
    id: number,
    action: TicketAction,
    input: TicketTransitionInput,
    actor: TicketActor,
  ): Promise<Record<string, unknown>> {
    const from = TRANSITION_FROM[action];
    const to = TRANSITION_TO[action];
    const timestamp = nowIso();
    if (action === 'submit' || action === 'return') {
      const note = `${input.resolution ?? input.message ?? ''}`.trim();
      if (note.length === 0) {
        throw new TicketTransitionError(
          'note_required',
          action === 'submit'
            ? 'A processing note is required before submitting for confirmation.'
            : 'A reason is required before returning the ticket to processing.',
        );
      }
      input = {
        ...input,
        resolution: note,
        message: input.message?.trim() || note,
      };
    }
    const values = this.transitionValues(action, to, input, timestamp);

    const { record } = await this.database
      .repository<ServiceTicketRecord>('serviceTickets')
      .withPolicy(policies.tickets)
      .updateOne({
        filter: { id, status: from },
        values,
      });
    const ticket = record as Record<string, unknown>;

    await this.appendEvent(policies, {
      ticketId: id,
      type: action,
      fromStatus: from,
      toStatus: to,
      message: input.message ?? this.defaultMessage(action),
      actorId: actor.id,
      data: input.assigneeId ? { assigneeId: input.assigneeId } : null,
    });
    await this.notifyTransition(action, to, ticket, actor);
    return ticket;
  }

  /**
   * Automatic acceptance: the workflow calls this with no signed-in user. It
   * resolves an assignee, performs exactly the same status transition, and
   * records a durable operation row keyed by ticket so a retried workflow run
   * cannot accept the ticket twice. A failure is recorded on the ticket rather
   * than silently swallowed, and then re-thrown so the run is marked failed.
   */
  public async automaticAccept(ticketId: number): Promise<AcceptanceOutcome> {
    const existing = await this.database
      .repository<ServiceTicketRecord>('serviceTickets')
      .findOne({ filter: { id: ticketId } });
    if (!existing) {
      throw new Error(`Ticket ${ticketId} not found`);
    }
    const priority = String(existing.priority ?? 'normal');
    const highPriority = HIGH_PRIORITIES.includes(priority);
    if (String(existing.status) !== TICKET_STATUS.pendingAcceptance) {
      return {
        status: 'already_handled',
        ticketId,
        assigneeId: existing.assigneeId ? String(existing.assigneeId) : null,
        highPriority,
      };
    }

    const operationKey = `ticket-acceptance:${ticketId}`;
    const journal = this.database.repository<ServiceTicketOperationRecord>(
      'serviceTicketOperations',
    );
    try {
      await journal.createOne({
        values: {
          idempotencyKey: operationKey,
          type: 'ticket-acceptance',
          status: 'running',
          ticketId,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        },
      });
    } catch {
      // A previous run already recorded this operation. Inspect it.
      const done = await journal.findOne({
        filter: { idempotencyKey: operationKey },
      });
      if (done && String(done.status) === 'succeeded') {
        return {
          status: 'already_handled',
          ticketId,
          assigneeId:
            done.result && typeof done.result === 'object'
              ? ((done.result.assigneeId as string | null) ?? null)
              : null,
          highPriority,
        };
      }
    }

    const timestamp = nowIso();
    try {
      const assigneeId = await this.resolveAssignee(existing);
      if (!assigneeId) {
        throw new Error(
          'No service engineer is available to accept the ticket',
        );
      }
      const { record } = await this.database
        .repository<ServiceTicketRecord>('serviceTickets')
        .updateOne({
          filter: { id: ticketId, status: TICKET_STATUS.pendingAcceptance },
          values: {
            status: TICKET_STATUS.pendingProcessing,
            assigneeId,
            acceptedAt: timestamp,
            acceptanceStatus: 'succeeded',
            acceptanceError: null,
            acceptanceHandledAt: timestamp,
            updatedAt: timestamp,
          },
        });
      await this.appendEvent(undefined, {
        ticketId,
        type: 'accepted',
        fromStatus: TICKET_STATUS.pendingAcceptance,
        toStatus: TICKET_STATUS.pendingProcessing,
        message: highPriority
          ? 'Ticket automatically accepted (high priority)'
          : 'Ticket automatically accepted',
        actorId: null,
        data: { assigneeId, highPriority, automatic: true },
      });
      await this.recordOperation(operationKey, 'succeeded', null, {
        assigneeId,
        highPriority,
      });
      await this.notifyAcceptance(ticketId, record, assigneeId, highPriority);
      return {
        status: 'accepted',
        ticketId,
        assigneeId,
        highPriority,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.recordFailure(ticketId, operationKey, message);
      throw error;
    }
  }

  /**
   * Classification the acceptance workflow branches on: whether the ticket is
   * high priority and whether it still waits for acceptance.
   */
  public async acceptancePlan(ticketId: number): Promise<{
    priority: string;
    highPriority: boolean;
    handled: boolean;
  }> {
    const record = await this.database
      .repository<ServiceTicketRecord>('serviceTickets')
      .findOne({ filter: { id: ticketId } });
    if (!record) {
      throw new Error(`Ticket ${ticketId} not found`);
    }
    const priority = String(record.priority ?? 'normal');
    return {
      priority,
      highPriority: HIGH_PRIORITIES.includes(priority),
      handled: String(record.status) !== TICKET_STATUS.pendingAcceptance,
    };
  }

  /**
   * Set the response deadline the acceptance workflow chose for this priority.
   * An existing deadline is left alone, and a ticket past acceptance keeps
   * whatever it has, so re-running the workflow cannot shorten a promise.
   */
  public async applyAcceptanceSla(
    ticketId: number,
    hours: number,
  ): Promise<{ dueAt: string | null }> {
    const record = await this.database
      .repository<ServiceTicketRecord>('serviceTickets')
      .findOne({ filter: { id: ticketId } });
    if (!record) {
      throw new Error(`Ticket ${ticketId} not found`);
    }
    if (String(record.status) !== TICKET_STATUS.pendingAcceptance) {
      return { dueAt: record.dueAt ? String(record.dueAt) : null };
    }
    if (record.dueAt) {
      return { dueAt: String(record.dueAt) };
    }
    const dueAt = new Date(Date.now() + hours * 3_600_000).toISOString();
    await this.database
      .repository<ServiceTicketRecord>('serviceTickets')
      .updateOne({
        filter: { id: ticketId, status: TICKET_STATUS.pendingAcceptance },
        values: { dueAt, updatedAt: nowIso() },
      });
    return { dueAt };
  }

  /** Best-effort notification of a failed automatic acceptance. */
  public async notifyAcceptanceFailure(
    ticketId: number,
    message: string,
  ): Promise<void> {
    const supervisors =
      await this.directories.userIdsWithPermissionSet('service-supervisor');
    if (supervisors.length === 0) return;
    const ticket = await this.database
      .repository<ServiceTicketRecord>('serviceTickets')
      .findOne({ filter: { id: ticketId } });
    const code = ticket ? String(ticket.code) : String(ticketId);
    await this.notifier.notify(
      `ticket-acceptance-failed:${ticketId}`,
      'service.ticket',
      String(ticketId),
      {
        to: supervisors,
        title: 'Ticket acceptance failed',
        body: `Ticket ${code} could not be automatically accepted: ${message}`,
        target: { type: 'route', path: `/service/tickets/${ticketId}` },
      },
    );
  }

  /**
   * Open ticket counts per engineer, used to distribute new work. A ticket
   * already assigned to an engineer stays with that engineer.
   */
  private async resolveAssignee(
    ticket: Partial<ServiceTicketRecord>,
  ): Promise<string | null> {
    const candidates = await this.directories.engineerUserIds();
    if (candidates.length === 0) return null;
    const current = ticket.assigneeId ? String(ticket.assigneeId) : null;
    if (current && candidates.includes(current)) return current;
    const rows = await this.database
      .query()
      .selectFrom('service_tickets')
      .select(['assigneeId'])
      .where('status', 'in', [...OPEN_STATUSES])
      .where('assigneeId', 'is not', null)
      .execute();
    const load = new Map<string, number>();
    for (const id of candidates) load.set(id, 0);
    for (const row of rows) {
      const id = String(row.assigneeId);
      if (load.has(id)) load.set(id, (load.get(id) ?? 0) + 1);
    }
    // High-priority and normal tickets use the same balance; the priority
    // branch chooses the escalation notice and SLA, not a different pool.
    return (
      [...load.entries()].sort(
        (a, b) => a[1] - b[1] || a[0].localeCompare(b[0]),
      )[0]?.[0] ?? null
    );
  }

  private async decorate(
    rows: readonly Partial<ServiceTicketRecord>[],
  ): Promise<(Partial<ServiceTicketRecord> & TicketDecoration)[]> {
    const customerIds = [
      ...new Set(rows.map((row) => Number(row.customerId)).filter(Boolean)),
    ];
    const deviceIds = [
      ...new Set(rows.map((row) => Number(row.deviceId)).filter(Boolean)),
    ];
    const assigneeIds = [
      ...new Set(
        rows.map((row) => String(row.assigneeId ?? '')).filter(Boolean),
      ),
    ];
    const [customers, devices, people] = await Promise.all([
      customerIds.length
        ? this.database
            .query()
            .selectFrom('service_customers')
            .select(['id', 'name', 'code'])
            .where('id', 'in', customerIds)
            .execute()
        : Promise.resolve([]),
      deviceIds.length
        ? this.database
            .query()
            .selectFrom('service_devices')
            .select(['id', 'name', 'serialNumber'])
            .where('id', 'in', deviceIds)
            .execute()
        : Promise.resolve([]),
      this.directories.resolveUserNames(assigneeIds),
    ]);
    const customerById = new Map(customers.map((row) => [Number(row.id), row]));
    const deviceById = new Map(devices.map((row) => [Number(row.id), row]));
    return rows.map((row) => {
      const customer = customerById.get(Number(row.customerId));
      const device = deviceById.get(Number(row.deviceId));
      const assigneeId = row.assigneeId ? String(row.assigneeId) : null;
      return {
        ...row,
        customerName: customer ? String(customer.name) : null,
        customerCode: customer ? String(customer.code) : null,
        deviceName: device ? String(device.name) : null,
        deviceSerialNumber: device ? String(device.serialNumber) : null,
        assigneeName: assigneeId ? (people.get(assigneeId) ?? null) : null,
      };
    });
  }

  private transitionValues(
    action: TicketAction,
    to: TicketStatus,
    input: TicketTransitionInput,
    timestamp: string,
  ): Record<string, RepositoryMutationScalarValue> {
    const values: Record<string, RepositoryMutationScalarValue> = {
      status: to,
      updatedAt: timestamp,
    };
    switch (action) {
      case 'accept':
        values.acceptedAt = timestamp;
        values.acceptanceStatus = 'succeeded';
        values.acceptanceError = null;
        values.acceptanceHandledAt = timestamp;
        if (input.assigneeId) values.assigneeId = input.assigneeId;
        break;
      case 'process':
        values.startedAt = timestamp;
        break;
      case 'submit':
        values.submittedAt = timestamp;
        values.resolution = input.resolution?.trim() ?? null;
        break;
      case 'return':
        values.resolution = input.resolution?.trim() ?? null;
        break;
      case 'close':
        values.closedAt = timestamp;
        break;
      default:
        break;
    }
    return values;
  }

  private defaultMessage(action: TicketAction): string {
    switch (action) {
      case 'accept':
        return 'Ticket accepted';
      case 'process':
        return 'Work started on the ticket';
      case 'submit':
        return 'Ticket submitted for confirmation';
      case 'return':
        return 'Ticket returned to processing';
      case 'close':
        return 'Ticket closed';
      default:
        return action;
    }
  }

  private async notifyTransition(
    action: TicketAction,
    to: TicketStatus,
    ticket: Partial<ServiceTicketRecord>,
    actor: TicketActor,
  ): Promise<void> {
    const id = Number(ticket.id);
    const code = String(ticket.code ?? id);
    const assigneeId = ticket.assigneeId ? String(ticket.assigneeId) : null;
    const path = `/service/tickets/${id}`;
    if (action === 'submit') {
      const supervisors =
        await this.directories.userIdsWithPermissionSet('service-supervisor');
      const recipients = [
        ...new Set([...supervisors, String(ticket.createdById ?? '')]),
      ].filter((value) => value && value !== actor.id);
      if (recipients.length > 0) {
        await this.notifier.notify(
          `ticket-${action}:${id}:${to}`,
          'service.ticket',
          String(id),
          {
            to: recipients,
            title: 'Ticket awaiting confirmation',
            body: `Ticket ${code} was submitted for confirmation.`,
            target: { type: 'route', path },
          },
        );
      }
      return;
    }
    if (assigneeId && assigneeId !== actor.id) {
      await this.notifier.notify(
        `ticket-${action}:${id}:${to}`,
        'service.ticket',
        String(id),
        {
          to: assigneeId,
          title: 'Ticket updated',
          body: `Ticket ${code} is now ${to.replace(/_/g, ' ')}.`,
          target: { type: 'route', path },
        },
      );
    }
  }

  private async notifyAcceptance(
    ticketId: number,
    ticket: Partial<ServiceTicketRecord>,
    assigneeId: string,
    highPriority: boolean,
  ): Promise<void> {
    const code = String(ticket.code ?? ticketId);
    const path = `/service/tickets/${ticketId}`;
    await this.notifier.notify(
      `ticket-acceptance:${ticketId}:assignee`,
      'service.ticket',
      String(ticketId),
      {
        to: assigneeId,
        title: highPriority ? 'Urgent ticket assigned' : 'New ticket assigned',
        body: `${highPriority ? '[High priority] ' : ''}Ticket ${code} has been assigned to you.`,
        target: { type: 'route', path },
      },
    );
    if (highPriority) {
      const supervisors =
        await this.directories.userIdsWithPermissionSet('service-supervisor');
      if (supervisors.length > 0) {
        await this.notifier.notify(
          `ticket-acceptance:${ticketId}:supervisor`,
          'service.ticket',
          String(ticketId),
          {
            to: supervisors,
            title: 'High-priority ticket accepted',
            body: `High-priority ticket ${code} was accepted automatically.`,
            target: { type: 'route', path },
          },
        );
      }
    }
  }

  private async appendEvent(
    policies: TicketPolicies | undefined,
    event: {
      ticketId: number;
      type: string;
      fromStatus: string | null;
      toStatus: string | null;
      message: string;
      actorId: string | null;
      data: Record<string, unknown> | null;
    },
  ): Promise<void> {
    const repository = policies?.events
      ? this.database
          .repository<ServiceTicketEventRecord>('serviceTicketEvents')
          .withPolicy(policies.events)
      : this.database.repository<ServiceTicketEventRecord>(
          'serviceTicketEvents',
        );
    await repository.createOne({
      values: { ...event, createdAt: nowIso() },
    });
  }

  private async recordOperation(
    key: string,
    status: string,
    error: string | null,
    result: Record<string, unknown> | null,
  ): Promise<void> {
    try {
      await this.database
        .repository<ServiceTicketOperationRecord>('serviceTicketOperations')
        .updateOne({
          filter: { idempotencyKey: key },
          values: { status, error, result, updatedAt: nowIso() },
        });
    } catch {
      // The journal is diagnostic; a failure to update it must not undo the
      // successful business transition.
    }
  }

  private async recordFailure(
    ticketId: number,
    operationKey: string,
    message: string,
  ): Promise<void> {
    const timestamp = nowIso();
    try {
      await this.database
        .repository<ServiceTicketRecord>('serviceTickets')
        .updateOne({
          filter: { id: ticketId, status: TICKET_STATUS.pendingAcceptance },
          values: {
            acceptanceStatus: 'failed',
            acceptanceError: message,
            acceptanceHandledAt: timestamp,
            updatedAt: timestamp,
          },
        });
    } catch {
      // The ticket may have been accepted concurrently; the failure record on
      // the journal below still captures the attempt.
    }
    await this.recordOperation(operationKey, 'failed', message, null);
  }

  private async nextTicketCode(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `WO-${year}-`;
    const rows = await this.database
      .query()
      .selectFrom('service_tickets')
      .select('code')
      .where('code', 'like', `${prefix}%`)
      .execute();
    let max = 0;
    for (const row of rows) {
      const suffix = Number(String(row.code).slice(prefix.length));
      if (Number.isFinite(suffix) && suffix > max) max = suffix;
    }
    return `${prefix}${String(max + 1).padStart(4, '0')}`;
  }
}

/** A rejected lifecycle action the route maps to a 400/403 response. */
export class TicketTransitionError extends Error {
  public constructor(
    public readonly code: 'note_required',
    message: string,
  ) {
    super(message);
    this.name = 'TicketTransitionError';
  }
}
