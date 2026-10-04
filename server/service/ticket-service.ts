import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseManager, Repository } from '@nocobase/db';

import type { ServiceActor } from './access.js';
import { hasRole, isManager, ServiceAccess } from './access.js';
import type {
  Customer,
  Device,
  Ticket,
  TicketAttachment,
  TicketEvent,
  TicketEventType,
  TicketPriority,
  TicketShare,
  TicketStatus,
} from './domain.js';
import { addHours, canTransition, PRIORITY_SLA_HOURS } from './domain.js';
import {
  ServiceConflictError,
  ServiceForbiddenError,
  ServiceNotFoundError,
  ServiceValidationError,
} from './errors.js';
import { visibleTicketIds } from './visibility.js';
import type { ServiceRouting } from './routing-service.js';

export interface TicketListQuery {
  readonly search?: string;
  readonly status?: TicketStatus;
  readonly priority?: TicketPriority;
  readonly assigneeId?: number;
  readonly customerId?: number;
  readonly deviceId?: number;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface TicketCreateInput {
  readonly title?: string;
  readonly description?: string | null;
  readonly priority?: TicketPriority;
  readonly confidential?: boolean;
  readonly customerId?: number | null;
  readonly deviceId?: number | null;
  readonly assigneeId?: number | null;
  readonly source?: string;
  readonly externalEventNo?: string | null;
}

export interface TicketUpdateInput {
  readonly title?: string;
  readonly description?: string | null;
  readonly priority?: TicketPriority;
  readonly confidential?: boolean;
  readonly customerId?: number | null;
  readonly deviceId?: number | null;
  readonly assigneeId?: number | null;
  readonly handling?: string | null;
  readonly resolution?: string | null;
  readonly acceptanceNote?: string | null;
}

export type TicketAction = 'accept' | 'start' | 'submit' | 'close' | 'return';

export interface TicketListResult {
  readonly items: readonly TicketView[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

/**
 * A ticket with the labels a list or detail screen needs, resolved from the
 * related customer, device and engineer rows so the client does not have to
 * hold its own lookup tables.
 */
export type TicketView = Ticket & {
  readonly customerName: string | null;
  readonly customerCode: string | null;
  readonly deviceNo: string | null;
  readonly deviceModel: string | null;
  readonly assigneeName: string | null;
};

/**
 * A stored attachment joined with its file row, so a screen can render the
 * file name, size and a link without a second round trip.
 */
export type AttachmentView = TicketAttachment & {
  readonly filename: string | null;
  readonly mimeType: string | null;
  readonly size: number | null;
  readonly ext: string | null;
  readonly contentUrl: string | null;
};

export interface TicketDetail {
  readonly ticket: TicketView;
  readonly events: readonly TicketEvent[];
  readonly shares: readonly TicketShare[];
  readonly attachments: readonly AttachmentView[];
  readonly capabilities: readonly TicketAction[];
  /** Whether an acceptance hand-off is in flight, failed, or settled. */
  readonly acceptance: AcceptanceState;
}

export interface ShareInput {
  readonly granteeId?: number | null;
  readonly granteeName?: string | null;
  readonly reason?: string | null;
  readonly ttlHours?: number | null;
}

export interface TicketNotifier {
  ticketAccepted(ticket: Ticket, engineerName: string): Promise<void>;
  ticketSubmitted(ticket: Ticket): Promise<void>;
  ticketClosed(ticket: Ticket): Promise<void>;
  ticketShared(ticket: Ticket, granteeId: number): Promise<void>;
}

const ACTION_TARGET: Record<TicketAction, TicketStatus> = {
  accept: 'accepted',
  start: 'processing',
  submit: 'pending_confirm',
  close: 'closed',
  return: 'returned',
};

const PUBLIC_EVENT_TYPES: readonly TicketEventType[] = [
  'created',
  'accepted',
  'started',
  'submitted',
  'closed',
  'returned',
];

/** The branch the acceptance Workflow took, which decides the note wording. */
export type AcceptanceNoteKind = 'normal' | 'urgent';

/** What the acceptance Workflow's run script returns for one ticket. */
export interface AcceptanceResult {
  readonly ticketId: number;
  readonly ticketNo: string;
  readonly status: TicketStatus;
  readonly priority: TicketPriority;
  readonly assigneeId: number | null;
  readonly assigneeName: string | null;
  readonly note: string | null;
}

/** Whether an acceptance is already running, failed, or settled. */
export interface AcceptanceState {
  readonly pending: boolean;
  readonly lastFailed: boolean;
  readonly attempts: number;
}

/** One acceptance hand-off to the Workflow runtime. */
export interface AcceptanceDispatchInput {
  readonly ticketId: number;
  readonly actorId: string;
  readonly priority: TicketPriority;
  /** Stable id for the run, so a retried request does not double-dispatch. */
  readonly eventKey: string;
}

/**
 * The acceptance trigger, injected by the provider that owns the Workflow
 * runtime. `skipped` means no Workflow ran (the plugin is absent, or the
 * definition is disabled), which the service answers by registering the
 * acceptance synchronously so the business still moves.
 */
export interface AcceptanceDispatchReceipt {
  readonly status: 'accepted' | 'skipped';
  readonly reason?: string;
  readonly runId?: string;
}

export interface TicketAcceptancePort {
  dispatch(input: AcceptanceDispatchInput): Promise<AcceptanceDispatchReceipt>;
}

export interface TicketService {
  list(query: TicketListQuery, actor: ServiceActor): Promise<TicketListResult>;
  get(id: number, actor: ServiceActor): Promise<TicketDetail>;
  create(input: TicketCreateInput, actor: ServiceActor): Promise<Ticket>;
  update(
    id: number,
    input: TicketUpdateInput,
    actor: ServiceActor,
  ): Promise<Ticket>;
  transition(
    id: number,
    action: TicketAction,
    payload: { comment?: string | null },
    actor: ServiceActor,
  ): Promise<Ticket>;
  comment(
    id: number,
    comment: string,
    actor: ServiceActor,
  ): Promise<TicketEvent>;
  share(
    id: number,
    input: ShareInput,
    actor: ServiceActor,
  ): Promise<TicketShare>;
  revokeShare(id: number, shareId: number, actor: ServiceActor): Promise<void>;
  listShares(id: number, actor: ServiceActor): Promise<readonly TicketShare[]>;
  addAttachment(
    id: number,
    input: { fileId?: string; kind?: string; note?: string | null },
    actor: ServiceActor,
  ): Promise<AttachmentView>;
  listAttachments(
    id: number,
    actor: ServiceActor,
  ): Promise<readonly AttachmentView[]>;
  /**
   * Removes the association between a ticket and a stored file. The file record
   * and its bytes stay where they are: the requirement is to unlink an
   * attachment, not to destroy the object another record may still reference.
   */
  removeAttachment(
    id: number,
    attachmentId: number,
    actor: ServiceActor,
  ): Promise<void>;
  listEvents(id: number, actor: ServiceActor): Promise<readonly TicketEvent[]>;
  /** Records that an acceptance invocation has been handed to the Workflow. */
  beginAcceptance(id: number, actor: ServiceActor): Promise<Ticket>;
  /**
   * Requests acceptance: records the in-flight state, hands the ticket to the
   * Workflow, and keeps the ticket pending while that Workflow runs. Never
   * reports the business as accepted on its own.
   */
  requestAcceptance(id: number, actor: ServiceActor): Promise<Ticket>;
  /** Records a real acceptance failure so an operator can retry deliberately. */
  recordAcceptanceFailure(id: number, reason: string): Promise<void>;
  /** Reads whether an acceptance is in flight, failed, or never started. */
  acceptanceState(id: number): Promise<AcceptanceState>;
  /**
   * The Workflow's terminal step: assign, set the branch-specific acceptance
   * note, persist the accepted state and notify the engineer. Idempotent, so a
   * retried node cannot accept twice or send the same message twice.
   */
  registerAcceptance(
    id: number,
    input: { actorId?: string | null; noteKind: AcceptanceNoteKind },
  ): Promise<AcceptanceResult>;
}

export function sanitizeForObserver(ticket: Ticket): Ticket {
  return {
    ...ticket,
    description: null,
    handling: null,
    resolution: null,
    acceptanceNote: null,
    slaDueAt: null,
  };
}

/**
 * Reads acceptance progress from a ticket's event trail. A hand-off is only
 * still "pending" while the newest acceptance event is the pending marker; a
 * later terminal `accepted` event settles it, so a completed acceptance never
 * keeps showing as in flight.
 */
function acceptanceStateFrom(rows: readonly TicketEvent[]): AcceptanceState {
  const relevant = rows
    .filter(
      (row) =>
        row.type === 'acceptance_pending' ||
        row.type === 'acceptance_failed' ||
        row.type === 'accepted',
    )
    .sort((left, right) => left.id - right.id);
  const last = relevant[relevant.length - 1];
  return {
    pending: last?.type === 'acceptance_pending',
    lastFailed: last?.type === 'acceptance_failed',
    attempts: relevant.filter((row) => row.type === 'acceptance_pending')
      .length,
  };
}

export function createTicketService(
  database: DatabaseManager,
  options: {
    readonly actorName: (id: string) => Promise<string | undefined>;
    readonly routing: ServiceRouting;
    readonly notifier?: TicketNotifier;
    readonly authz?: AppAuthorization;
    /** The acceptance trigger. Without it acceptance is applied inline. */
    readonly acceptance?: TicketAcceptancePort;
  },
): TicketService {
  const tickets = (): Repository<Ticket> =>
    database.repository<Ticket>('tickets');
  const events = (): Repository<TicketEvent> =>
    database.repository<TicketEvent>('ticket_events');
  const shares = (): Repository<TicketShare> =>
    database.repository<TicketShare>('ticket_shares');
  const attachments = (): Repository<TicketAttachment> =>
    database.repository<TicketAttachment>('ticket_attachments');
  const devices = (): Repository<Device> =>
    database.repository<Device>('devices');
  const customers = (): Repository<Customer> =>
    database.repository<Customer>('customers');

  async function operatorName(id: string): Promise<string | undefined> {
    return options.actorName(id);
  }

  const TICKET_FILES_ACCESS_PATH = '/uploads/ticket-files';
  interface TicketFileRow {
    id: string;
    filename?: string;
    mimeType?: string;
    size?: number | string;
    ext?: string;
  }

  async function attachFiles(
    rows: readonly TicketAttachment[],
  ): Promise<AttachmentView[]> {
    if (rows.length === 0) return [];
    const files =
      (await database.repository<TicketFileRow>('ticket_files').findMany()) ??
      [];
    const byId = new Map(files.map((file) => [String(file.id), file]));
    return rows.map((row) => {
      const file = byId.get(String(row.fileId));
      const ext = file?.ext ?? null;
      return {
        ...row,
        filename: file?.filename ?? null,
        mimeType: file?.mimeType ?? null,
        size: file?.size != null ? Number(file.size) : null,
        ext,
        contentUrl: file
          ? `${TICKET_FILES_ACCESS_PATH}/${encodeURIComponent(String(file.id))}${ext ? `.${encodeURIComponent(ext)}` : ''}`
          : null,
      };
    });
  }

  async function enrich(rows: readonly Ticket[]): Promise<TicketView[]> {
    if (rows.length === 0) return [];
    const customerIds = new Set<number>();
    const deviceIds = new Set<number>();
    const assigneeIds = new Set<number>();
    for (const row of rows) {
      if (row.customerId != null) customerIds.add(row.customerId);
      if (row.deviceId != null) deviceIds.add(row.deviceId);
      if (row.assigneeId != null) assigneeIds.add(row.assigneeId);
    }
    const customerRows =
      (await customers().findMany())?.filter((row) =>
        customerIds.has(row.id),
      ) ?? [];
    const deviceRows =
      (await devices().findMany())?.filter((row) => deviceIds.has(row.id)) ??
      [];
    const customerById = new Map(customerRows.map((row) => [row.id, row]));
    const deviceById = new Map(deviceRows.map((row) => [row.id, row]));
    const names = new Map<number, string>();
    await Promise.all(
      [...assigneeIds].map(async (id) => {
        const name = await operatorName(String(id));
        if (name) names.set(id, name);
      }),
    );
    return rows.map((row) => {
      const customer =
        row.customerId != null ? customerById.get(row.customerId) : undefined;
      const device =
        row.deviceId != null ? deviceById.get(row.deviceId) : undefined;
      return {
        ...row,
        customerName: customer?.name ?? null,
        customerCode: customer?.code ?? null,
        deviceNo: device?.deviceNo ?? null,
        deviceModel: device?.model ?? null,
        assigneeName:
          row.assigneeId != null ? (names.get(row.assigneeId) ?? null) : null,
      };
    });
  }

  async function requireTicket(id: number): Promise<Ticket> {
    const ticket = await tickets().findOne({ filter: { id } });
    if (!ticket) throw new ServiceNotFoundError('Ticket not found');
    return ticket;
  }

  async function requireReadable(
    id: number,
    actor: ServiceActor,
  ): Promise<Ticket> {
    const scope = await visibleTicketIds(database, actor);
    if (scope.kind === 'ids' && !scope.ids.includes(id)) {
      throw new ServiceNotFoundError('Ticket not found');
    }
    if (scope.kind === 'none')
      throw new ServiceNotFoundError('Ticket not found');
    return requireTicket(id);
  }

  async function appendEvent(
    ticketId: number,
    type: TicketEventType,
    actor: ServiceActor,
    values: {
      status?: TicketStatus | null;
      comment?: string | null;
      payload?: Record<string, unknown> | null;
    } = {},
  ): Promise<TicketEvent> {
    const created = await events().createOne({
      values: {
        ticketId,
        type,
        status: values.status ?? null,
        operatorId: Number(actor.id) || null,
        operatorName: (await operatorName(actor.id)) ?? null,
        comment: values.comment ?? null,
        payload: values.payload ?? null,
        createdAt: new Date().toISOString(),
      },
    });
    return created.record;
  }

  function capabilities(ticket: Ticket, actor: ServiceActor): TicketAction[] {
    if (ticket.status === 'closed') return [];
    const manager = isManager(actor);
    const assignee =
      ticket.assigneeId != null && String(ticket.assigneeId) === actor.id;
    const result: TicketAction[] = [];
    if (canTransition(ticket.status, 'accepted')) {
      if (manager) result.push('accept');
    }
    if (canTransition(ticket.status, 'processing')) {
      if (manager || assignee) result.push('start');
    }
    if (canTransition(ticket.status, 'pending_confirm')) {
      if (manager || assignee) result.push('submit');
    }
    if (canTransition(ticket.status, 'closed')) {
      if (manager) result.push('close');
    }
    if (canTransition(ticket.status, 'returned')) {
      if (manager) result.push('return');
    }
    return result;
  }

  return {
    async list(query, actor) {
      const scope = await visibleTicketIds(database, actor);
      if (scope.kind === 'none') {
        return { items: [], total: 0, page: 1, pageSize: 0 };
      }
      const pageSize = Math.min(Math.max(query.pageSize ?? 20, 1), 200);
      const page = Math.max(query.page ?? 1, 1);
      const search = query.search?.toLowerCase();
      let rows = (await tickets().findMany()) ?? [];
      if (scope.kind === 'ids') {
        const allowed = new Set(scope.ids);
        rows = rows.filter((row) => allowed.has(row.id));
      }
      if (query.status)
        rows = rows.filter((row) => row.status === query.status);
      if (query.priority) {
        rows = rows.filter((row) => row.priority === query.priority);
      }
      if (query.assigneeId) {
        rows = rows.filter((row) => row.assigneeId === query.assigneeId);
      }
      if (query.customerId) {
        rows = rows.filter((row) => row.customerId === query.customerId);
      }
      if (query.deviceId) {
        rows = rows.filter((row) => row.deviceId === query.deviceId);
      }
      if (search) {
        rows = rows.filter(
          (row) =>
            row.ticketNo?.toLowerCase().includes(search) ||
            row.title?.toLowerCase().includes(search),
        );
      }
      rows.sort((left, right) => right.id - left.id);
      const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
      const observer = !isManager(actor) && hasRole(actor, 'observer');
      const scoped = observer ? pageRows.map(sanitizeForObserver) : pageRows;
      return {
        items: await enrich(scoped),
        total: rows.length,
        page,
        pageSize,
      };
    },

    async get(id, actor) {
      const ticket = await requireReadable(id, actor);
      const observer = !isManager(actor) && hasRole(actor, 'observer');
      const allEvents =
        (await events().findMany({ filter: { ticketId: id } })) ?? [];
      const visibleEvents = observer
        ? allEvents.filter((event) => PUBLIC_EVENT_TYPES.includes(event.type))
        : allEvents;
      visibleEvents.sort((left, right) => left.id - right.id);
      const ticketShares = observer
        ? []
        : ((await shares().findMany({ filter: { ticketId: id } })) ?? []);
      const ticketAttachments = await attachFiles(
        (await attachments().findMany({ filter: { ticketId: id } })) ?? [],
      );
      return {
        ticket: (
          await enrich([observer ? sanitizeForObserver(ticket) : ticket])
        )[0],
        events: visibleEvents,
        shares: ticketShares,
        attachments: ticketAttachments,
        capabilities: capabilities(ticket, actor),
        acceptance: acceptanceStateFrom(allEvents),
      };
    },

    async create(input, actor) {
      const title = input.title?.trim();
      if (!title) {
        throw new ServiceValidationError('Ticket title is required', {
          title: 'required',
        });
      }
      let device:
        { id: number; status: string; customerId: number | null } | undefined;
      if (input.deviceId != null) {
        device = await devices().findOne({
          filter: { id: input.deviceId },
        });
        if (!device) {
          throw new ServiceValidationError('Device does not exist', {
            deviceId: 'unknown',
          });
        }
        if (device.status === 'disabled') {
          throw new ServiceValidationError(
            'A disabled device cannot be reported for repair',
            { deviceId: 'disabled' },
          );
        }
        if (
          input.customerId != null &&
          device.customerId != null &&
          device.customerId !== input.customerId
        ) {
          throw new ServiceValidationError(
            'The device does not belong to the selected customer',
            { deviceId: 'mismatch' },
          );
        }
      }
      if (input.customerId != null) {
        const customer = await customers().findOne({
          filter: { id: input.customerId },
        });
        if (!customer) {
          throw new ServiceValidationError('Customer does not exist', {
            customerId: 'unknown',
          });
        }
      }

      const source = input.source === 'external' ? 'external' : 'internal';
      const priority = input.priority ?? 'normal';
      const now = new Date();
      const nowIso = now.toISOString();
      const duplicate = await findDuplicate({
        title,
        deviceId: input.deviceId ?? null,
        externalEventNo: input.externalEventNo ?? null,
      });
      if (duplicate) return duplicate;

      const ticketNo = await nextTicketNo(tickets(), now);
      const created = await tickets().createOne({
        values: {
          ticketNo,
          title,
          description: input.description ?? null,
          status: 'pending',
          priority,
          confidential: input.confidential ?? false,
          customerId: input.customerId ?? device?.customerId ?? null,
          deviceId: input.deviceId ?? null,
          assigneeId: input.assigneeId ?? null,
          reporterId: Number(actor.id) || null,
          source,
          externalEventNo: input.externalEventNo ?? null,
          slaDueAt: addHours(now, PRIORITY_SLA_HOURS[priority]).toISOString(),
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      });
      await appendEvent(created.record.id, 'created', actor, {
        status: 'pending',
        comment: input.description ?? null,
      });

      // Eligible tickets are handed to the acceptance Workflow immediately.
      // The ticket stays `pending` until the Workflow's run script registers
      // the acceptance, so a submitted dispatch is never reported as done.
      if (
        created.record.assigneeId == null &&
        options.routing.isAutoAcceptanceEnabled() &&
        options.routing.isEligibleSource(source)
      ) {
        await requestAcceptanceCore(created.record.id, actor);
      }
      return requireTicket(created.record.id);
    },

    async update(id, input, actor) {
      const ticket = await requireReadable(id, actor);
      if (ticket.status === 'closed') {
        throw new ServiceConflictError('A closed ticket is read-only');
      }
      const manager = isManager(actor);
      const assignee =
        ticket.assigneeId != null && String(ticket.assigneeId) === actor.id;
      if (!manager && !assignee) {
        throw new ServiceForbiddenError(
          'Only a supervisor or the assigned engineer may edit this ticket',
        );
      }
      if (input.confidential !== undefined && !manager) {
        throw new ServiceForbiddenError(
          'Only a supervisor may change the confidentiality of a ticket',
        );
      }
      if (
        (input.assigneeId !== undefined || input.customerId !== undefined) &&
        !manager
      ) {
        throw new ServiceForbiddenError(
          'Only a supervisor may reassign a ticket or change its customer',
        );
      }
      const updated = await tickets().updateOne({
        filter: { id },
        values: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.confidential !== undefined
            ? { confidential: input.confidential }
            : {}),
          ...(input.customerId !== undefined
            ? { customerId: input.customerId }
            : {}),
          ...(input.deviceId !== undefined ? { deviceId: input.deviceId } : {}),
          ...(input.assigneeId !== undefined
            ? { assigneeId: input.assigneeId }
            : {}),
          ...(input.handling !== undefined ? { handling: input.handling } : {}),
          ...(input.resolution !== undefined
            ? { resolution: input.resolution }
            : {}),
          ...(input.acceptanceNote !== undefined
            ? { acceptanceNote: input.acceptanceNote }
            : {}),
          updatedAt: new Date().toISOString(),
        },
      });
      return updated.record;
    },

    async transition(id, action, payload, actor) {
      const ticket = await requireReadable(id, actor);
      const target = ACTION_TARGET[action];
      if (!target) throw new ServiceValidationError('Unknown ticket action');
      if (ticket.status === 'closed') {
        throw new ServiceConflictError('A closed ticket is read-only');
      }
      const manager = isManager(actor);
      const assignee =
        ticket.assigneeId != null && String(ticket.assigneeId) === actor.id;

      // Acceptance is not a plain status write: it is handed to the acceptance
      // Workflow, which registers the assignment, the branch-specific note and
      // the engineer notification as separate, inspectable steps. Accepting an
      // already accepted ticket is a no-op rather than a second transition, so
      // a repeated request cannot advance the status or notify twice.
      if (action === 'accept') {
        if (!manager) {
          throw new ServiceForbiddenError(
            'Only a supervisor may accept a ticket',
          );
        }
        if (ticket.status !== 'pending') return ticket;
        return requestAcceptanceCore(id, actor);
      }

      if (!canTransition(ticket.status, target)) {
        throw new ServiceConflictError(
          `Cannot move a ${ticket.status} ticket to ${target}`,
        );
      }
      if (!manager && !assignee) {
        throw new ServiceForbiddenError(
          'Only a supervisor or the assigned engineer may move this ticket',
        );
      }
      if ((action === 'close' || action === 'return') && !manager) {
        throw new ServiceForbiddenError(
          `Only a supervisor may ${action} a ticket`,
        );
      }

      const nowIso = new Date().toISOString();
      const values: Record<string, unknown> = {
        status: target,
        updatedAt: nowIso,
      };
      if (action === 'start') values.startedAt = nowIso;
      if (action === 'submit') values.submittedAt = nowIso;
      if (action === 'close') values.closedAt = nowIso;
      if (payload.comment != null) {
        if (action === 'submit' || action === 'close') {
          values.resolution = payload.comment;
        }
        if (action === 'close') values.acceptanceNote = payload.comment;
        if (action === 'return') values.handling = payload.comment;
      }

      const updated = await tickets().updateOne({ filter: { id }, values });
      const type =
        action === 'start'
          ? 'started'
          : action === 'submit'
            ? 'submitted'
            : action === 'close'
              ? 'closed'
              : 'returned';
      await appendEvent(id, type, actor, {
        status: target,
        comment: payload.comment ?? null,
      });

      const result = updated.record;
      if (action === 'submit' && options.notifier) {
        await options.notifier.ticketSubmitted(result);
      }
      if (action === 'close' && options.notifier) {
        await options.notifier.ticketClosed(result);
      }
      return result;
    },

    async comment(id, comment, actor) {
      const trimmed = comment?.trim();
      if (!trimmed) {
        throw new ServiceValidationError('Comment is required', {
          comment: 'required',
        });
      }
      await requireReadable(id, actor);
      return appendEvent(id, 'comment', actor, { comment: trimmed });
    },

    async share(id, input, actor) {
      const ticket = await requireReadable(id, actor);
      if (!isManager(actor)) {
        throw new ServiceForbiddenError('Only a supervisor may share a ticket');
      }
      if (ticket.confidential) {
        throw new ServiceForbiddenError(
          'A confidential ticket cannot be temporarily shared',
        );
      }
      if (input.granteeId == null) {
        throw new ServiceValidationError('A grantee is required', {
          granteeId: 'required',
        });
      }
      const ttlHours = input.ttlHours ?? 48;
      if (!Number.isFinite(ttlHours) || ttlHours <= 0 || ttlHours > 720) {
        throw new ServiceValidationError(
          'Share duration must be between 1 and 720 hours',
          { ttlHours: 'invalid' },
        );
      }
      const now = new Date();
      const nowIso = now.toISOString();
      const created = await shares().createOne({
        values: {
          ticketId: id,
          granteeId: Number(input.granteeId),
          granteeName: input.granteeName ?? null,
          grantedById: Number(actor.id) || null,
          reason: input.reason ?? null,
          sharingRuleKey: 'service.tickets.temporary',
          expiresAt: addHours(now, ttlHours).toISOString(),
          revoked: false,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      });
      await appendEvent(id, 'shared', actor, {
        payload: { granteeId: Number(input.granteeId), ttlHours },
      });
      if (options.notifier) {
        await options.notifier.ticketShared(ticket, Number(input.granteeId));
      }
      return created.record;
    },

    async revokeShare(id, shareId, actor) {
      await requireReadable(id, actor);
      if (!isManager(actor)) {
        throw new ServiceForbiddenError('Only a supervisor may revoke a share');
      }
      const share = await shares().findOne({ filter: { id: shareId } });
      if (!share || share.ticketId !== id) {
        throw new ServiceNotFoundError('Share not found');
      }
      await shares().updateOne({
        filter: { id: shareId },
        values: { revoked: true, updatedAt: new Date().toISOString() },
      });
      await appendEvent(id, 'share_revoked', actor, {
        payload: { shareId, granteeId: share.granteeId },
      });
    },

    async listShares(id, actor) {
      await requireReadable(id, actor);
      if (!isManager(actor)) return [];
      const rows =
        (await shares().findMany({ filter: { ticketId: id } })) ?? [];
      return rows.sort((left, right) => right.id - left.id);
    },

    async addAttachment(id, input, actor) {
      await requireReadable(id, actor);
      if (!input.fileId) {
        throw new ServiceValidationError('A file is required', {
          fileId: 'required',
        });
      }
      const created = await attachments().createOne({
        values: {
          ticketId: id,
          fileId: input.fileId,
          kind: input.kind ?? 'repair',
          note: input.note ?? null,
          createdById: Number(actor.id) || null,
          createdAt: new Date().toISOString(),
        },
      });
      await appendEvent(id, 'comment', actor, {
        comment: input.note ?? '上传附件',
        payload: { attachmentId: created.record.id },
      });
      return (await attachFiles([created.record]))[0];
    },

    async listAttachments(id, actor) {
      await requireReadable(id, actor);
      const rows =
        (await attachments().findMany({ filter: { ticketId: id } })) ?? [];
      return attachFiles(rows.sort((left, right) => left.id - right.id));
    },

    async removeAttachment(id, attachmentId, actor) {
      await requireReadable(id, actor);
      if (!isManager(actor) && !hasRole(actor, 'engineer')) {
        throw new ServiceForbiddenError(
          'Only a supervisor or an engineer may change attachments',
        );
      }
      const link = await attachments().findOne({
        filter: { id: attachmentId, ticketId: id },
      });
      if (!link) {
        throw new ServiceNotFoundError('Attachment not found');
      }
      await attachments().deleteOne({ filter: { id: attachmentId } });
      await appendEvent(id, 'comment', actor, {
        comment: '移除附件',
        payload: { attachmentId, removed: true },
      });
    },

    async listEvents(id, actor) {
      await requireReadable(id, actor);
      const observer = !isManager(actor) && hasRole(actor, 'observer');
      const allEvents =
        (await events().findMany({ filter: { ticketId: id } })) ?? [];
      const visible = observer
        ? allEvents.filter((event) => PUBLIC_EVENT_TYPES.includes(event.type))
        : allEvents;
      return visible.sort((left, right) => left.id - right.id);
    },

    async beginAcceptance(id, actor) {
      const ticket = await requireTicket(id);
      if (ticket.status !== 'pending') return ticket;
      await appendEvent(id, 'acceptance_pending', actor, {
        status: 'pending',
        payload: { workflow: 'ticket-acceptance' },
      });
      return ticket;
    },

    async requestAcceptance(id, actor) {
      await requireReadable(id, actor);
      if (!isManager(actor)) {
        throw new ServiceForbiddenError(
          'Only a supervisor may accept a ticket',
        );
      }
      return requestAcceptanceCore(id, actor);
    },

    async recordAcceptanceFailure(id, reason) {
      await recordAcceptanceFailureCore(id, reason);
    },

    async acceptanceState(id) {
      return acceptanceStateOf(id);
    },

    async registerAcceptance(id, input) {
      return registerAcceptanceCore(id, input);
    },
  };

  /**
   * Requests acceptance for a pending ticket. The in-flight state is recorded
   * first, then the Workflow is asked to run the registration. The ticket stays
   * `pending` while the Workflow runs, so a submitted dispatch is never shown
   * as a completed acceptance. A Workflow that cannot run (plugin absent, or
   * definition disabled) is answered by registering the acceptance inline, so
   * the business still moves and the run status reported to the operator stays
   * truthful.
   */
  async function requestAcceptanceCore(
    id: number,
    actor: ServiceActor,
  ): Promise<Ticket> {
    const ticket = await requireTicket(id);
    if (ticket.status !== 'pending') return ticket;
    const state = await acceptanceStateOf(id);
    if (state.pending) return ticket;
    await appendEvent(id, 'acceptance_pending', actor, {
      status: 'pending',
      payload: {
        workflow: 'ticket-acceptance',
        attempt: state.attempts + 1,
      },
    });
    const noteKind: AcceptanceNoteKind =
      ticket.priority === 'urgent' ? 'urgent' : 'normal';
    if (!options.acceptance) {
      await registerAcceptanceCore(id, { actorId: actor.id, noteKind });
      return requireTicket(id);
    }
    try {
      const receipt = await options.acceptance.dispatch({
        ticketId: id,
        actorId: actor.id,
        priority: ticket.priority,
        eventKey: acceptanceEventKey(id, state.attempts),
      });
      if (receipt.status === 'skipped') {
        await registerAcceptanceCore(id, { actorId: actor.id, noteKind });
      }
    } catch (error) {
      const reason = messageOf(error);
      await appendEvent(id, 'acceptance_failed', actor, {
        status: 'pending',
        comment: reason,
        payload: { failed: true, error: reason },
      });
      throw error;
    }
    return requireTicket(id);
  }

  function acceptanceEventKey(id: number, attempts: number): string {
    const base = `service.ticket.accept:${id}`;
    return attempts <= 0 ? base : `${base}:retry:${attempts}`;
  }

  async function recordAcceptanceFailureCore(
    id: number,
    reason: string,
  ): Promise<void> {
    await appendEvent(id, 'acceptance_failed', systemActor(), {
      status: null,
      comment: reason,
      payload: { failed: true },
    });
  }

  async function acceptanceStateOf(id: number): Promise<AcceptanceState> {
    return acceptanceStateFrom(
      (await events().findMany({ filter: { ticketId: id } })) ?? [],
    );
  }

  async function registerAcceptanceCore(
    id: number,
    input: { actorId?: string | null; noteKind: AcceptanceNoteKind },
  ): Promise<AcceptanceResult> {
    const actor = await actorFrom(input.actorId);
    if (!isManager(actor)) {
      throw new ServiceForbiddenError('Only a supervisor may accept a ticket');
    }
    const ticket = await requireTicket(id);
    if (
      ticket.status === 'accepted' ||
      ticket.status === 'processing' ||
      ticket.status === 'pending_confirm' ||
      ticket.status === 'closed'
    ) {
      return acceptanceResult(ticket, await engineerNameOf(ticket));
    }
    if (ticket.status !== 'pending') {
      throw new ServiceConflictError(`Cannot accept a ${ticket.status} ticket`);
    }
    const engineer = await resolveEngineer(ticket);
    if (!engineer) {
      throw new ServiceConflictError(
        'No engineer is available to accept this ticket',
      );
    }
    const note =
      input.noteKind === 'urgent'
        ? `紧急工单已受理：已指派 ${engineer.name} 优先处理，请在 4 小时内响应。`
        : `工单已受理：已指派 ${engineer.name} 跟进处理。`;
    const nowIso = new Date().toISOString();
    const updated = await tickets().updateOne({
      filter: { id },
      values: {
        status: 'accepted',
        assigneeId: Number(engineer.id) || null,
        acceptedAt: nowIso,
        acceptanceNote: note,
        updatedAt: nowIso,
      },
    });
    await appendEvent(id, 'accepted', actor, {
      status: 'accepted',
      comment: note,
      payload: {
        viaWorkflow: true,
        noteKind: input.noteKind,
        engineerId: engineer.id,
      },
    });
    if (options.notifier) {
      await options.notifier.ticketAccepted(updated.record, engineer.name);
    }
    return { ...acceptanceResult(updated.record, engineer.name), note };
  }

  /** Resolves the Workflow caller's service actor, if authorization is wired. */
  async function actorFrom(
    id: string | null | undefined,
  ): Promise<ServiceActor> {
    if (!id) return systemActor();
    if (!options.authz) return { id, roles: new Set(), unrestricted: false };
    return new ServiceAccess(options.authz).actor(id);
  }

  function systemActor(): ServiceActor {
    return { id: '', roles: new Set(), unrestricted: false };
  }

  /** The assigned engineer, or the least-loaded one when none is assigned. */
  async function resolveEngineer(
    ticket: Ticket,
  ): Promise<{ id: string; name: string } | undefined> {
    if (ticket.assigneeId != null) {
      const name =
        (await operatorName(String(ticket.assigneeId))) ??
        String(ticket.assigneeId);
      return { id: String(ticket.assigneeId), name };
    }
    return options.routing.pickEngineer();
  }

  async function engineerNameOf(ticket: Ticket): Promise<string | null> {
    if (ticket.assigneeId == null) return null;
    return (await operatorName(String(ticket.assigneeId))) ?? null;
  }

  function acceptanceResult(
    ticket: Ticket,
    assigneeName: string | null | undefined,
  ): AcceptanceResult {
    return {
      ticketId: ticket.id,
      ticketNo: ticket.ticketNo,
      status: ticket.status,
      priority: ticket.priority,
      assigneeId: ticket.assigneeId,
      assigneeName: assigneeName ?? null,
      note: ticket.acceptanceNote,
    };
  }
  async function findDuplicate(input: {
    title: string;
    deviceId: number | null;
    externalEventNo: string | null;
  }): Promise<Ticket | undefined> {
    if (input.externalEventNo) {
      // An external report is identified by its event id. A retry of the same
      // event returns that ticket; a different event always gets its own, even
      // when it repeats the title and device of an earlier one.
      return await tickets().findOne({
        filter: { externalEventNo: input.externalEventNo },
      });
    }
    if (input.deviceId == null) return undefined;
    const cutoff = addHours(new Date(), -24).toISOString();
    const rows =
      (await tickets().findMany({
        filter: (filter) =>
          filter.and([
            filter.number('deviceId').eq(input.deviceId as number),
            filter.string('title').eq(input.title),
          ]),
      })) ?? [];
    return rows.find(
      (row) =>
        row.status !== 'closed' &&
        row.status !== 'returned' &&
        (row.createdAt ?? '') >= cutoff,
    );
  }
}

async function nextTicketNo(
  repository: Repository<Ticket>,
  now: Date,
): Promise<string> {
  const total = await repository.count();
  const date = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
  return `T-${date}-${String(total + 1).padStart(4, '0')}`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
