import type { DatabaseManager, FilterNode } from '@nocobase/db';
import type { AccessService } from './access-service.js';
import type { ServiceNotificationService } from './notification-service.js';
import {
  TICKET_PRIORITY,
  TICKET_STATUS,
  conflict,
  forbidden,
  invalid,
  notFound,
  type CustomerRow,
  type DeviceRow,
  type ExecutionLogRow,
  type ServiceActor,
  type TicketAttachmentRow,
  type TicketFileRow,
  type TicketRow,
  type TicketShareRow,
  type UserRow,
} from './contracts.js';

const URGENT_DUE_HOURS = 4;
const NORMAL_DUE_HOURS = 48;

export interface TicketView {
  id: number;
  code: string;
  title: string;
  description?: string | null;
  customerId: number;
  customerName?: string | null;
  deviceId?: number | null;
  deviceCode?: string | null;
  deviceName?: string | null;
  priority: string;
  confidential: boolean;
  status: string;
  assigneeId?: string | null;
  /** Display name of the assigned engineer, resolved from the user directory. */
  assigneeName?: string | null;
  createdById?: string | null;
  source: string;
  externalEventNo?: string | null;
  dueAt?: string | null;
  acceptedAt?: string | null;
  acceptedById?: string | null;
  acceptNote?: string | null;
  processNote?: string | null;
  resultNote?: string | null;
  rejectReason?: string | null;
  confirmationNote?: string | null;
  closedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  /** Present on collaborator projections: the engineer reached this ticket through a share. */
  shared?: boolean;
  attachments?: TicketAttachmentView[];
  executionLogs?: ExecutionLogView[];
  shares?: TicketShareView[];
  /** Observer summaries omit the internal working notes. */
  summaryOnly?: boolean;
}

export interface TicketAttachmentView {
  id: number;
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
  kind: string;
  uploadedById?: string | null;
  createdAt?: string | null;
}

export interface ExecutionLogView {
  id: number;
  actorId?: string | null;
  action: string;
  detail?: string | null;
  createdAt?: string | null;
}

export interface TicketShareView {
  id: number;
  engineerId: string;
  expiresAt?: string | null;
  createdById?: string | null;
  createdAt?: string | null;
  expired: boolean;
}

export interface TicketListQuery {
  status?: string;
  priority?: string;
  customerId?: number;
  assigneeId?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface TicketListResult {
  items: TicketView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateTicketInput {
  title: string;
  description?: string;
  /** Required for a staff caller; an integration caller may derive it from the device. */
  customerId?: number;
  deviceId?: number;
  priority?: string;
  confidential?: boolean;
  assigneeId?: string;
  dueAt?: Date | string;
  /**
   * A repair event submitted by the device platform. Its presence makes the
   * ticket external, and it is the idempotency key for the submission.
   */
  externalEventNo?: string;
}

export interface ExternalRepairInput {
  externalEventNo: string;
  deviceCode: string;
  title: string;
  description?: string;
  priority?: string;
  contactName?: string;
  contactPhone?: string;
}

export interface ExternalRepairResult {
  ticket: TicketView;
  deduplicated: boolean;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function kindForMime(mimeType: string): string {
  if (mimeType.startsWith('image/')) {
    return 'photo';
  }
  if (
    mimeType.includes('wordprocessingml') ||
    mimeType === 'application/msword' ||
    mimeType.includes('officedocument')
  ) {
    return 'report';
  }
  return 'other';
}

/** Which attachment roles may be uploaded, so the form can validate early. */
export const ATTACHMENT_KINDS: readonly string[] = ['photo', 'report', 'other'];

/**
 * Ticket lifecycle, collaboration shares and attachments.
 *
 * Every state change is idempotent: repeating an action returns the current
 * state and sends no second message, which is what makes the Workflow trigger
 * and the direct HTTP call safe to compose.
 */
export class TicketService {
  private readonly db: DatabaseManager;
  private readonly access: AccessService;
  private readonly notifications: ServiceNotificationService;

  constructor(
    db: DatabaseManager,
    access: AccessService,
    notifications: ServiceNotificationService,
  ) {
    this.db = db;
    this.access = access;
    this.notifications = notifications;
  }

  // ---------------------------------------------------------------- reads

  async listTickets(
    actor: ServiceActor,
    query: TicketListQuery = {},
  ): Promise<TicketListResult> {
    this.access.assertCanReadTickets(actor);
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const sharedIds =
      actor.isEngineer && !actor.isRoot && !actor.isSupervisor
        ? await this.listActiveSharedTicketIds(actor.id)
        : [];

    const repository = this.db.repository<TicketRow>('serviceTickets');
    const items = await repository.findMany({
      filter: (filter) => this.buildListFilter(actor, query, sharedIds, filter),
      sort: (sort) => [sort.field('createdAt').desc(), sort.field('id').desc()],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    const total = await repository.count({
      filter: (filter) => this.buildListFilter(actor, query, sharedIds, filter),
    });
    const sharedSet = new Set(sharedIds);
    const views = await this.decorate(items, {
      sharedSet,
      summaryOnly:
        actor.isObserver &&
        !actor.isRoot &&
        !actor.isSupervisor &&
        !actor.isEngineer,
    });
    return { items: views, total, page, pageSize };
  }

  async getTicket(actor: ServiceActor, ticketId: number): Promise<TicketView> {
    const ticket = await this.loadTicket(ticketId);
    const shared = await this.isSharedWith(actor.id, ticketId);
    const plainObserver =
      actor.isObserver &&
      !actor.isRoot &&
      !actor.isSupervisor &&
      !actor.isEngineer;
    const plainIntegration =
      actor.isIntegration &&
      !actor.isRoot &&
      !actor.isSupervisor &&
      !actor.isEngineer;
    if (plainObserver) {
      if (ticket.status !== TICKET_STATUS.closed || ticket.confidential) {
        throw forbidden('Observers may only read closed ticket summaries.');
      }
    } else if (plainIntegration) {
      if (ticket.createdById !== actor.id || ticket.source !== 'external') {
        throw forbidden(
          'The integration account may only read the tickets it submitted.',
        );
      }
    } else {
      this.access.assertEngineerMayReadTicket(actor, ticket, shared);
    }
    const [view] = await this.decorate([ticket], {
      sharedSet: shared ? new Set([ticketId]) : new Set<number>(),
      summaryOnly: plainObserver,
      withDetail: true,
    });
    return view;
  }

  async getTicketByExternalEvent(
    userId: string,
    externalEventNo: string,
  ): Promise<TicketView | undefined> {
    const ticket = await this.db
      .repository<TicketRow>('serviceTickets')
      .findOne({
        filter: { externalEventNo },
      });
    if (!ticket || ticket.createdById !== userId) {
      return undefined;
    }
    const [view] = await this.decorate([ticket], { withDetail: true });
    return view;
  }

  // ------------------------------------------------------------ lifecycle

  async createTicket(
    actor: ServiceActor,
    input: CreateTicketInput,
  ): Promise<TicketView> {
    // A device-platform integration account may only submit external repair
    // requests; it is never a member of staff. Everyone else still has to be
    // staff, so an API key with no business role cannot open tickets.
    const plainIntegration =
      actor.isIntegration &&
      !actor.isRoot &&
      !actor.isSupervisor &&
      !actor.isEngineer;
    if (plainIntegration) {
      if (!input.externalEventNo) {
        throw forbidden(
          'An integration account may only submit repair requests carrying an external event number.',
        );
      }
    } else {
      this.access.assertStaff(actor);
    }
    const externalEventNo = input.externalEventNo?.trim() || undefined;
    if (externalEventNo) {
      // Idempotent per reporter: replaying the same external event returns the
      // ticket it already created instead of opening a second one, and another
      // reporter reusing the number is a conflict rather than a duplicate.
      const existing = await this.getTicketByExternalEvent(
        actor.id,
        externalEventNo,
      );
      if (existing) {
        return existing;
      }
      const anyTicket = await this.db
        .repository<TicketRow>('serviceTickets')
        .findOne({ filter: { externalEventNo } });
      if (anyTicket) {
        throw conflict('This external event number has already been used.');
      }
    }
    const customerId =
      input.customerId ??
      (input.deviceId !== undefined && input.deviceId !== null
        ? (
            await this.db
              .repository<DeviceRow>('serviceDevices')
              .findOne({ filter: { id: input.deviceId } })
          )?.customerId
        : undefined);
    const customer =
      customerId === undefined
        ? undefined
        : await this.db
            .repository<CustomerRow>('serviceCustomers')
            .findOne({ filter: { id: customerId } });
    if (!customer) {
      throw invalid('The selected customer does not exist.');
    }
    let device: DeviceRow | undefined;
    if (input.deviceId !== undefined && input.deviceId !== null) {
      device = await this.db
        .repository<DeviceRow>('serviceDevices')
        .findOne({ filter: { id: input.deviceId } });
      if (!device) {
        throw invalid('The selected device does not exist.');
      }
      if (device.customerId !== customer.id) {
        throw invalid(
          'The selected device does not belong to the selected customer.',
        );
      }
    }
    const priority = input.priority ?? TICKET_PRIORITY.normal;
    if (
      priority !== TICKET_PRIORITY.normal &&
      priority !== TICKET_PRIORITY.urgent
    ) {
      throw invalid('Priority must be normal or urgent.');
    }
    const now = new Date();
    const code = await this.nextTicketCode();
    const { record } = await this.db
      .repository<TicketRow>('serviceTickets')
      .createOne({
        values: {
          code,
          title: input.title,
          description: input.description ?? null,
          customerId: customer.id,
          deviceId: device?.id ?? null,
          priority,
          confidential: input.confidential ?? false,
          status: TICKET_STATUS.pendingAcceptance,
          assigneeId: input.assigneeId ?? device?.engineerId ?? null,
          createdById: actor.id,
          source: externalEventNo ? 'external' : 'internal',
          externalEventNo: externalEventNo ?? null,
          dueAt: input.dueAt ?? null,
          createdAt: now,
          updatedAt: now,
        },
      });
    await this.logEvent(
      record.id,
      actor.id,
      'created',
      `Ticket ${code} created.`,
    );
    return this.getTicket(actor, record.id);
  }

  async createExternalTicket(
    actor: ServiceActor,
    input: ExternalRepairInput,
  ): Promise<ExternalRepairResult> {
    if (!(actor.isRoot || actor.isIntegration)) {
      throw forbidden(
        'Only a registered device-platform integration account may submit repair requests.',
      );
    }
    if (input.externalEventNo) {
      const existing = await this.getTicketByExternalEvent(
        actor.id,
        input.externalEventNo,
      );
      if (existing) {
        return { ticket: existing, deduplicated: true };
      }
      const anyTicket = await this.db
        .repository<TicketRow>('serviceTickets')
        .findOne({ filter: { externalEventNo: input.externalEventNo } });
      if (anyTicket) {
        // A different integration account already reported this event; never
        // create a second ticket from the same external business event.
        throw conflict('This external event number has already been used.');
      }
    }
    const device = await this.db
      .repository<DeviceRow>('serviceDevices')
      .findOne({ filter: { code: input.deviceCode } });
    if (!device) {
      throw invalid('The reported device code is not registered.');
    }
    if (!device.enabled) {
      throw invalid('The reported device is not active.');
    }
    const now = new Date();
    const code = await this.nextTicketCode();
    const priority =
      input.priority === TICKET_PRIORITY.urgent
        ? TICKET_PRIORITY.urgent
        : TICKET_PRIORITY.normal;
    const { record } = await this.db
      .repository<TicketRow>('serviceTickets')
      .createOne({
        values: {
          code,
          title: input.title,
          description: input.description ?? null,
          customerId: device.customerId,
          deviceId: device.id,
          priority,
          confidential: false,
          status: TICKET_STATUS.pendingAcceptance,
          assigneeId: device.engineerId ?? null,
          createdById: actor.id,
          source: 'external',
          externalEventNo: input.externalEventNo,
          dueAt: null,
          createdAt: now,
          updatedAt: now,
        },
      });
    await this.logEvent(
      record.id,
      actor.id,
      'created',
      `External ticket ${code} submitted.`,
    );
    return {
      ticket: await this.getTicket(actor, record.id),
      deduplicated: false,
    };
  }

  /**
   * Supervisor acceptance. Idempotent: a ticket already accepted is returned
   * unchanged and no second message is sent.
   */
  async acceptTicket(
    actor: ServiceActor,
    ticketId: number,
    note?: string,
  ): Promise<{ ticket: TicketView; changed: boolean }> {
    this.access.assertMayDecideTicket(actor);
    const ticket = await this.loadTicket(ticketId);
    if (
      ticket.acceptedAt &&
      ticket.status !== TICKET_STATUS.pendingAcceptance
    ) {
      return { ticket: await this.getTicket(actor, ticketId), changed: false };
    }
    if (ticket.status === TICKET_STATUS.closed) {
      return { ticket: await this.getTicket(actor, ticketId), changed: false };
    }
    const now = new Date();
    const dueAt =
      ticket.dueAt ??
      new Date(
        now.getTime() +
          (ticket.priority === TICKET_PRIORITY.urgent
            ? URGENT_DUE_HOURS
            : NORMAL_DUE_HOURS) *
            3600 *
            1000,
      );
    const assigneeId =
      ticket.assigneeId ?? (await this.defaultAssignee(ticket));

    await this.db.repository<TicketRow>('serviceTickets').updateOne({
      filter: { id: ticketId },
      values: {
        status: TICKET_STATUS.pendingProcessing,
        acceptedAt: now,
        acceptedById: actor.id,
        acceptNote: note ?? ticket.acceptNote ?? null,
        assigneeId,
        dueAt,
        updatedAt: now,
      },
    });
    await this.logEvent(
      ticketId,
      actor.id,
      'accepted',
      `Accepted as ${ticket.priority} and assigned to ${assigneeId ?? 'an unassigned queue'}.`,
    );
    if (assigneeId) {
      await this.notifications.sendInApp({
        userId: assigneeId,
        title: `Ticket ${ticket.code} accepted`,
        body: `Ticket ${ticket.code} was accepted by the supervisor and is ready for processing.`,
        path: `/service/tickets/${ticketId}`,
        idempotencyKey: `ticket-accept:${ticketId}`,
        sourceType: 'serviceTicket',
        referenceId: String(ticketId),
      });
    }
    return { ticket: await this.getTicket(actor, ticketId), changed: true };
  }

  async startProcessing(
    actor: ServiceActor,
    ticketId: number,
    note?: string,
  ): Promise<TicketView> {
    const ticket = await this.loadTicket(ticketId);
    this.access.assertMayProcessTicket(actor, ticket);
    if (ticket.status === TICKET_STATUS.closed) {
      throw conflict('A closed ticket cannot be reopened for processing.');
    }
    if (ticket.status === TICKET_STATUS.processing) {
      return this.getTicket(actor, ticketId);
    }
    const now = new Date();
    await this.db.repository<TicketRow>('serviceTickets').updateOne({
      filter: { id: ticketId },
      values: {
        status: TICKET_STATUS.processing,
        processNote: note ?? ticket.processNote ?? null,
        updatedAt: now,
      },
    });
    await this.logEvent(
      ticketId,
      actor.id,
      'processing',
      note ?? 'Processing started.',
    );
    return this.getTicket(actor, ticketId);
  }

  async submitResult(
    actor: ServiceActor,
    ticketId: number,
    input: {
      resultNote: string;
      processNote?: string;
      imageFileIds?: readonly string[];
    },
  ): Promise<TicketView> {
    const ticket = await this.loadTicket(ticketId);
    this.access.assertMayProcessTicket(actor, ticket);
    if (!input.resultNote || !input.resultNote.trim()) {
      throw invalid(
        'A repair result is required before submitting for confirmation.',
      );
    }
    if (ticket.status === TICKET_STATUS.pendingConfirmation) {
      return this.getTicket(actor, ticketId);
    }
    if (ticket.status === TICKET_STATUS.closed) {
      throw conflict('A closed ticket cannot be resubmitted.');
    }
    const now = new Date();
    await this.db.repository<TicketRow>('serviceTickets').updateOne({
      filter: { id: ticketId },
      values: {
        status: TICKET_STATUS.pendingConfirmation,
        resultNote: input.resultNote,
        processNote: input.processNote ?? ticket.processNote ?? null,
        rejectReason: null,
        updatedAt: now,
      },
    });
    if (input.imageFileIds?.length) {
      for (const fileId of input.imageFileIds) {
        await this.attachFile(actor, ticketId, fileId);
      }
    }
    await this.logEvent(
      ticketId,
      actor.id,
      'submitted',
      'Result submitted for confirmation.',
    );
    // Notify every supervisor once per submission.
    const supervisors = await this.access.listUserIdsByRole('supervisor');
    for (const supervisorId of supervisors) {
      await this.notifications.sendInApp({
        userId: supervisorId,
        title: `Ticket ${ticket.code} awaits confirmation`,
        body: `Engineer submitted a result for ${ticket.code}. Please confirm or return it.`,
        path: `/service/tickets/${ticketId}`,
        idempotencyKey: `ticket-submit:${ticketId}:${toIso(ticket.updatedAt)}`,
        sourceType: 'serviceTicket',
        referenceId: String(ticketId),
      });
    }
    return this.getTicket(actor, ticketId);
  }

  async confirmTicket(
    actor: ServiceActor,
    ticketId: number,
    note?: string,
  ): Promise<TicketView> {
    this.access.assertMayDecideTicket(actor);
    const ticket = await this.loadTicket(ticketId);
    if (ticket.status === TICKET_STATUS.closed) {
      return this.getTicket(actor, ticketId);
    }
    if (ticket.status !== TICKET_STATUS.pendingConfirmation) {
      throw conflict('Only a ticket awaiting confirmation can be confirmed.');
    }
    const now = new Date();
    await this.db.repository<TicketRow>('serviceTickets').updateOne({
      filter: { id: ticketId },
      values: {
        status: TICKET_STATUS.closed,
        closedAt: now,
        confirmationNote: note ?? null,
        updatedAt: now,
      },
    });
    await this.logEvent(
      ticketId,
      actor.id,
      'closed',
      note ?? 'Confirmed and closed.',
    );
    if (ticket.assigneeId) {
      await this.notifications.sendInApp({
        userId: ticket.assigneeId,
        title: `Ticket ${ticket.code} closed`,
        body: `The supervisor confirmed ${ticket.code}. No further action is required.`,
        path: `/service/tickets/${ticketId}`,
        idempotencyKey: `ticket-close:${ticketId}`,
        sourceType: 'serviceTicket',
        referenceId: String(ticketId),
      });
    }
    return this.getTicket(actor, ticketId);
  }

  /** Supervisor returns a submitted result to the engineer. */
  async returnTicket(
    actor: ServiceActor,
    ticketId: number,
    reason: string,
  ): Promise<TicketView> {
    this.access.assertMayDecideTicket(actor);
    if (!reason || !reason.trim()) {
      throw invalid('A return reason is required.');
    }
    const ticket = await this.loadTicket(ticketId);
    if (ticket.status !== TICKET_STATUS.pendingConfirmation) {
      throw conflict('Only a ticket awaiting confirmation can be returned.');
    }
    const now = new Date();
    await this.db.repository<TicketRow>('serviceTickets').updateOne({
      filter: { id: ticketId },
      values: {
        status: TICKET_STATUS.processing,
        rejectReason: reason,
        confirmationNote: null,
        updatedAt: now,
      },
    });
    await this.logEvent(ticketId, actor.id, 'returned', reason);
    if (ticket.assigneeId) {
      await this.notifications.sendInApp({
        userId: ticket.assigneeId,
        title: `Ticket ${ticket.code} returned`,
        body: `The supervisor returned ${ticket.code}: ${reason}`,
        path: `/service/tickets/${ticketId}`,
        idempotencyKey: `ticket-return:${ticketId}:${now.toISOString()}`,
        sourceType: 'serviceTicket',
        referenceId: String(ticketId),
      });
    }
    return this.getTicket(actor, ticketId);
  }

  /** Assigned engineer hands a ticket back to the acceptance queue. */
  async requestReacceptance(
    actor: ServiceActor,
    ticketId: number,
    reason: string,
  ): Promise<TicketView> {
    const ticket = await this.loadTicket(ticketId);
    this.access.assertMayProcessTicket(actor, ticket);
    if (
      ticket.status === TICKET_STATUS.closed ||
      ticket.status === TICKET_STATUS.pendingAcceptance
    ) {
      throw conflict('This ticket cannot be returned to the acceptance queue.');
    }
    const now = new Date();
    await this.db.repository<TicketRow>('serviceTickets').updateOne({
      filter: { id: ticketId },
      values: {
        status: TICKET_STATUS.pendingAcceptance,
        acceptedAt: null,
        acceptedById: null,
        rejectReason: reason,
        updatedAt: now,
      },
    });
    await this.logEvent(ticketId, actor.id, 'reacceptance_requested', reason);
    const supervisors = await this.access.listUserIdsByRole('supervisor');
    for (const supervisorId of supervisors) {
      await this.notifications.sendInApp({
        userId: supervisorId,
        title: `Ticket ${ticket.code} returned to acceptance`,
        body: `The assigned engineer returned ${ticket.code}: ${reason}`,
        path: `/service/tickets/${ticketId}`,
        idempotencyKey: `ticket-reaccept:${ticketId}:${now.toISOString()}`,
        sourceType: 'serviceTicket',
        referenceId: String(ticketId),
      });
    }
    return this.getTicket(actor, ticketId);
  }

  // --------------------------------------------------------------- shares

  async shareTicket(
    actor: ServiceActor,
    ticketId: number,
    input: { engineerId: string; expiresAt?: Date | string | null },
  ): Promise<TicketShareView> {
    this.access.assertMayDecideTicket(actor);
    const ticket = await this.loadTicket(ticketId);
    if (ticket.confidential) {
      throw forbidden(
        'A confidential ticket cannot be shared for collaboration.',
      );
    }
    if (!input.engineerId) {
      throw invalid('Select an engineer to share this ticket with.');
    }
    if (input.engineerId === actor.id) {
      throw invalid('You already have access to this ticket.');
    }
    const now = new Date();
    const repository = this.db.repository<TicketShareRow>(
      'serviceTicketShares',
    );
    const existing = await repository.findOne({
      filter: { ticketId, engineerId: input.engineerId },
    });
    let shareId: number;
    if (existing) {
      await repository.updateOne({
        filter: { id: existing.id },
        values: {
          expiresAt: input.expiresAt ?? null,
          createdById: actor.id,
          updatedAt: now,
        },
      });
      shareId = existing.id;
    } else {
      const { record } = await repository.createOne({
        values: {
          ticketId,
          engineerId: input.engineerId,
          expiresAt: input.expiresAt ?? null,
          createdById: actor.id,
          createdAt: now,
          updatedAt: now,
        },
      });
      shareId = record.id;
    }
    await this.logEvent(
      ticketId,
      actor.id,
      'shared',
      `Shared read-only with engineer ${input.engineerId}.`,
    );
    await this.notifications.sendInApp({
      userId: input.engineerId,
      title: `Ticket ${ticket.code} shared with you`,
      body: `You have read-only access to ${ticket.code}.`,
      path: `/service/tickets/${ticketId}`,
      idempotencyKey: `ticket-share:${ticketId}:${input.engineerId}`,
      sourceType: 'serviceTicket',
      referenceId: String(ticketId),
    });
    const shares = await this.listShares(actor, ticketId);
    const found = shares.find((share) => share.id === shareId);
    if (!found) {
      throw notFound('The share could not be created.');
    }
    return found;
  }

  async listShares(
    actor: ServiceActor,
    ticketId: number,
  ): Promise<TicketShareView[]> {
    this.access.assertMayDecideTicket(actor);
    const rows = await this.db
      .repository<TicketShareRow>('serviceTicketShares')
      .findMany({
        filter: { ticketId },
        sort: (sort) => sort.field('createdAt').desc(),
      });
    return rows.map((row) => this.toShareView(row));
  }

  async revokeShare(
    actor: ServiceActor,
    ticketId: number,
    shareId: number,
  ): Promise<void> {
    this.access.assertMayDecideTicket(actor);
    const share = await this.db
      .repository<TicketShareRow>('serviceTicketShares')
      .findOne({ filter: { id: shareId } });
    if (!share || share.ticketId !== ticketId) {
      throw notFound('The share does not exist on this ticket.');
    }
    await this.db
      .repository<TicketShareRow>('serviceTicketShares')
      .deleteOne({ filter: { id: shareId } });
    await this.logEvent(
      ticketId,
      actor.id,
      'share_revoked',
      `Revoked access for ${share.engineerId}.`,
    );
  }

  // ---------------------------------------------------------- attachments

  async attachFile(
    actor: ServiceActor,
    ticketId: number,
    fileId: string,
  ): Promise<TicketAttachmentView> {
    const ticket = await this.loadTicket(ticketId);
    const shared = await this.isSharedWith(actor.id, ticketId);
    // Engineers may attach only to tickets they may process; supervisors to any.
    if (
      !(actor.isRoot || actor.isSupervisor) &&
      !(actor.isEngineer && ticket.assigneeId === actor.id)
    ) {
      throw forbidden('You may only attach files to tickets assigned to you.');
    }
    if (shared && !(actor.isRoot || actor.isSupervisor)) {
      throw forbidden(
        'A shared ticket is read-only and cannot receive attachments.',
      );
    }
    const file = await this.db
      .repository<TicketFileRow>('serviceTicketFiles')
      .findOne({ filter: { id: fileId } });
    if (!file) {
      throw invalid('The uploaded file could not be found.');
    }
    const now = new Date();
    const repository = this.db.repository<TicketAttachmentRow>(
      'serviceTicketAttachments',
    );
    const existing = await repository.findOne({ filter: { ticketId, fileId } });
    if (existing) {
      return this.toAttachmentView(existing, file);
    }
    const { record } = await repository.createOne({
      values: {
        ticketId,
        fileId,
        kind: kindForMime(file.mimeType),
        uploadedById: actor.id,
        createdAt: now,
        updatedAt: now,
      },
    });
    await this.logEvent(
      ticketId,
      actor.id,
      'attachment_added',
      `Attached ${file.filename}.`,
    );
    return this.toAttachmentView(record, file);
  }

  async listAttachments(
    actor: ServiceActor,
    ticketId: number,
  ): Promise<TicketAttachmentView[]> {
    await this.getTicket(actor, ticketId);
    const links = await this.db
      .repository<TicketAttachmentRow>('serviceTicketAttachments')
      .findMany({
        filter: { ticketId },
        sort: (sort) => sort.field('createdAt').asc(),
      });
    const files = await this.db
      .repository<TicketFileRow>('serviceTicketFiles')
      .findMany({});
    const byId = new Map(files.map((file) => [file.id, file]));
    return links
      .map((link) => {
        const file = byId.get(link.fileId);
        return file ? this.toAttachmentView(link, file) : undefined;
      })
      .filter((view): view is TicketAttachmentView => Boolean(view));
  }

  async removeAttachment(
    actor: ServiceActor,
    ticketId: number,
    attachmentId: number,
  ): Promise<void> {
    const ticket = await this.loadTicket(ticketId);
    if (
      !(actor.isRoot || actor.isSupervisor) &&
      !(actor.isEngineer && ticket.assigneeId === actor.id)
    ) {
      throw forbidden(
        'You may only remove attachments from tickets assigned to you.',
      );
    }
    const link = await this.db
      .repository<TicketAttachmentRow>('serviceTicketAttachments')
      .findOne({ filter: { id: attachmentId } });
    if (!link || link.ticketId !== ticketId) {
      throw notFound('The attachment does not exist on this ticket.');
    }
    await this.db
      .repository<TicketAttachmentRow>('serviceTicketAttachments')
      .deleteOne({ filter: { id: attachmentId } });
    await this.logEvent(
      ticketId,
      actor.id,
      'attachment_removed',
      `Removed attachment ${link.fileId}.`,
    );
  }

  /** Authorized metadata for streaming a single attachment; never a public link. */
  async resolveAttachmentFile(
    actor: ServiceActor,
    ticketId: number,
    attachmentId: number,
  ): Promise<{ attachment: TicketAttachmentView; file: TicketFileRow }> {
    await this.getTicket(actor, ticketId);
    const link = await this.db
      .repository<TicketAttachmentRow>('serviceTicketAttachments')
      .findOne({ filter: { id: attachmentId } });
    if (!link || link.ticketId !== ticketId) {
      throw notFound('The attachment does not exist on this ticket.');
    }
    const file = await this.db
      .repository<TicketFileRow>('serviceTicketFiles')
      .findOne({ filter: { id: link.fileId } });
    if (!file) {
      throw notFound('The attachment file is missing.');
    }
    return { attachment: this.toAttachmentView(link, file), file };
  }

  // ------------------------------------------------------------- internals

  async isSharedWith(engineerId: string, ticketId: number): Promise<boolean> {
    const rows = await this.db
      .repository<TicketShareRow>('serviceTicketShares')
      .findMany({
        filter: { ticketId, engineerId },
      });
    const now = Date.now();
    return rows.some((row) => {
      if (!row.expiresAt) {
        return true;
      }
      return new Date(row.expiresAt).getTime() > now;
    });
  }

  private async listActiveSharedTicketIds(
    engineerId: string,
  ): Promise<number[]> {
    const rows = await this.db
      .repository<TicketShareRow>('serviceTicketShares')
      .findMany({
        filter: { engineerId },
      });
    const now = Date.now();
    return rows
      .filter(
        (row) => !row.expiresAt || new Date(row.expiresAt).getTime() > now,
      )
      .map((row) => row.ticketId);
  }

  private buildListFilter(
    actor: ServiceActor,
    query: TicketListQuery,
    sharedIds: readonly number[],
    filter: {
      and(items: readonly FilterNode[]): FilterNode;
      or(items: readonly FilterNode[]): FilterNode;
      string(path: string): {
        eq(value: string): FilterNode;
        includes(
          value: string,
          options?: { mode?: 'default' | 'insensitive' },
        ): FilterNode;
      };
      text(path: string): {
        includes(
          value: string,
          options?: { mode?: 'default' | 'insensitive' },
        ): FilterNode;
      };
      number(path: string): { eq(value: number | string): FilterNode };
      boolean(path: string): { isFalse(): FilterNode; isTrue(): FilterNode };
    },
  ): FilterNode {
    const items: FilterNode[] = [];
    if (query.status) {
      items.push(filter.string('status').eq(query.status));
    }
    if (query.priority) {
      items.push(filter.string('priority').eq(query.priority));
    }
    if (query.customerId !== undefined) {
      items.push(filter.number('customerId').eq(query.customerId));
    }
    if (query.assigneeId) {
      items.push(filter.string('assigneeId').eq(query.assigneeId));
    }
    if (query.keyword && query.keyword.trim()) {
      const keyword = query.keyword.trim();
      items.push(
        filter.or([
          filter.string('code').includes(keyword, { mode: 'insensitive' }),
          filter.string('title').includes(keyword, { mode: 'insensitive' }),
          filter.text('description').includes(keyword, { mode: 'insensitive' }),
        ]),
      );
    }
    if (
      actor.isObserver &&
      !actor.isRoot &&
      !actor.isSupervisor &&
      !actor.isEngineer
    ) {
      // Observers see approved work only: a closed, non-confidential summary.
      items.push(filter.string('status').eq(TICKET_STATUS.closed));
      items.push(filter.boolean('confidential').isFalse());
    } else if (
      actor.isIntegration &&
      !actor.isRoot &&
      !actor.isSupervisor &&
      !actor.isEngineer
    ) {
      items.push(filter.string('createdById').eq(actor.id));
    } else if (actor.isEngineer && !actor.isRoot && !actor.isSupervisor) {
      const scoped: FilterNode[] = [filter.string('assigneeId').eq(actor.id)];
      for (const sharedId of sharedIds) {
        scoped.push(filter.number('id').eq(sharedId));
      }
      items.push(filter.or(scoped));
    }
    return filter.and(items);
  }

  /** The engineer who owns the device is the default owner of its ticket. */
  private async defaultAssignee(ticket: TicketRow): Promise<string | null> {
    if (ticket.deviceId === null || ticket.deviceId === undefined) {
      return null;
    }
    const device = await this.db
      .repository<DeviceRow>('serviceDevices')
      .findOne({ filter: { id: ticket.deviceId } });
    return device?.engineerId ?? null;
  }

  private async loadTicket(ticketId: number): Promise<TicketRow> {
    const ticket = await this.db
      .repository<TicketRow>('serviceTickets')
      .findOne({ filter: { id: ticketId } });
    if (!ticket) {
      throw notFound('The ticket does not exist.');
    }
    return ticket;
  }

  private async decorate(
    tickets: TicketRow[],
    options: {
      sharedSet?: Set<number>;
      summaryOnly?: boolean;
      withDetail?: boolean;
    } = {},
  ): Promise<TicketView[]> {
    if (!tickets.length) {
      return [];
    }
    const customers = await this.db
      .repository<CustomerRow>('serviceCustomers')
      .findMany({});
    const customerById = new Map(
      customers.map((customer) => [customer.id, customer]),
    );
    const devices = await this.db
      .repository<DeviceRow>('serviceDevices')
      .findMany({});
    const deviceById = new Map(devices.map((device) => [device.id, device]));
    // Resolve assignee display names once for the whole page of tickets.
    const users = await this.db.repository<UserRow>('user').findMany({});
    const userNameById = new Map(users.map((user) => [user.id, user.name]));

    let attachmentsByTicket = new Map<number, TicketAttachmentView[]>();
    let logsByTicket = new Map<number, ExecutionLogView[]>();
    let sharesByTicket = new Map<number, TicketShareView[]>();
    if (options.withDetail) {
      const ids = tickets.map((ticket) => ticket.id);
      const [links, files, logs, shares] = await Promise.all([
        this.db
          .repository<TicketAttachmentRow>('serviceTicketAttachments')
          .findMany({}),
        this.db.repository<TicketFileRow>('serviceTicketFiles').findMany({}),
        this.db
          .repository<ExecutionLogRow>('serviceExecutionLogs')
          .findMany({}),
        this.db.repository<TicketShareRow>('serviceTicketShares').findMany({}),
      ]);
      const idSet = new Set(ids);
      const fileById = new Map(files.map((file) => [file.id, file]));
      attachmentsByTicket = new Map();
      for (const link of links) {
        if (!idSet.has(link.ticketId)) continue;
        const file = fileById.get(link.fileId);
        if (!file) continue;
        const list = attachmentsByTicket.get(link.ticketId) ?? [];
        list.push(this.toAttachmentView(link, file));
        attachmentsByTicket.set(link.ticketId, list);
      }
      logsByTicket = new Map();
      for (const log of logs) {
        if (!idSet.has(log.ticketId)) continue;
        const list = logsByTicket.get(log.ticketId) ?? [];
        list.push(this.toLogView(log));
        logsByTicket.set(log.ticketId, list);
      }
      sharesByTicket = new Map();
      for (const share of shares) {
        if (!idSet.has(share.ticketId)) continue;
        const list = sharesByTicket.get(share.ticketId) ?? [];
        list.push(this.toShareView(share));
        sharesByTicket.set(share.ticketId, list);
      }
    }

    return tickets.map((ticket) => {
      const customer = customerById.get(ticket.customerId);
      const device = ticket.deviceId
        ? deviceById.get(ticket.deviceId)
        : undefined;
      const view: TicketView = {
        id: ticket.id,
        code: ticket.code,
        title: ticket.title,
        description: ticket.description ?? null,
        customerId: ticket.customerId,
        customerName: customer?.name ?? null,
        deviceId: ticket.deviceId ?? null,
        deviceCode: device?.code ?? null,
        deviceName: device?.name ?? null,
        priority: ticket.priority,
        confidential: ticket.confidential,
        status: ticket.status,
        assigneeId: ticket.assigneeId ?? null,
        assigneeName: ticket.assigneeId
          ? (userNameById.get(ticket.assigneeId) ?? null)
          : null,
        createdById: ticket.createdById ?? null,
        source: ticket.source,
        externalEventNo: ticket.externalEventNo ?? null,
        dueAt: toIso(ticket.dueAt),
        createdAt: toIso(ticket.createdAt),
        updatedAt: toIso(ticket.updatedAt),
        shared: options.sharedSet?.has(ticket.id) ?? false,
      };
      if (options.summaryOnly) {
        view.summaryOnly = true;
        view.closedAt = toIso(ticket.closedAt);
        return view;
      }
      view.acceptedAt = toIso(ticket.acceptedAt);
      view.acceptedById = ticket.acceptedById ?? null;
      view.acceptNote = ticket.acceptNote ?? null;
      view.processNote = ticket.processNote ?? null;
      view.resultNote = ticket.resultNote ?? null;
      view.rejectReason = ticket.rejectReason ?? null;
      view.confirmationNote = ticket.confirmationNote ?? null;
      view.closedAt = toIso(ticket.closedAt);
      if (options.withDetail) {
        view.attachments = attachmentsByTicket.get(ticket.id) ?? [];
        view.executionLogs = logsByTicket.get(ticket.id) ?? [];
        view.shares = sharesByTicket.get(ticket.id) ?? [];
      }
      return view;
    });
  }

  private toAttachmentView(
    link: TicketAttachmentRow,
    file: TicketFileRow,
  ): TicketAttachmentView {
    return {
      id: link.id,
      fileId: link.fileId,
      filename: file.filename,
      mimeType: file.mimeType,
      size: Number(file.size),
      kind: link.kind,
      uploadedById: link.uploadedById ?? null,
      createdAt: toIso(link.createdAt),
    };
  }

  private toLogView(log: ExecutionLogRow): ExecutionLogView {
    return {
      id: log.id,
      actorId: log.actorId ?? null,
      action: log.action,
      detail: log.detail ?? null,
      createdAt: toIso(log.createdAt),
    };
  }

  private toShareView(share: TicketShareRow): TicketShareView {
    const expiresAt = toIso(share.expiresAt);
    return {
      id: share.id,
      engineerId: share.engineerId,
      expiresAt,
      createdById: share.createdById ?? null,
      createdAt: toIso(share.createdAt),
      expired: expiresAt ? new Date(expiresAt).getTime() <= Date.now() : false,
    };
  }

  async logEvent(
    ticketId: number,
    actorId: string | undefined,
    action: string,
    detail?: string,
  ): Promise<void> {
    await this.db
      .repository<ExecutionLogRow>('serviceExecutionLogs')
      .createOne({
        values: {
          ticketId,
          actorId: actorId ?? null,
          action,
          detail: detail ?? null,
          createdAt: new Date(),
        },
      });
  }

  private async nextTicketCode(): Promise<string> {
    const date = new Date();
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(
      date.getDate(),
    ).padStart(2, '0')}`;
    const prefix = `TK-${stamp}-`;
    const todays = await this.db
      .repository<TicketRow>('serviceTickets')
      .findMany({
        filter: (filter) => filter.string('code').startsWith(prefix),
      });
    let sequence = todays.length + 1;
    const taken = new Set(todays.map((ticket) => ticket.code));
    let candidate = `${prefix}${String(sequence).padStart(4, '0')}`;
    while (taken.has(candidate)) {
      sequence += 1;
      candidate = `${prefix}${String(sequence).padStart(4, '0')}`;
    }
    return candidate;
  }
}
