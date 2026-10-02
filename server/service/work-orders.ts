import type { AuthorizationContext } from '@nocobase/authorization/core';
import type {
  DatabaseConnection,
  DatabaseManager,
  RepositoryFilter,
} from '@nocobase/db';

import { authorizeComposite, scopedConnection } from './authorization.js';
import {
  WORK_ORDER_EVENT,
  WORK_ORDER_STATUS,
  type WorkOrderStatus,
} from './constants.js';
import { conflict, invalid, notFound } from './errors.js';
import type {
  ServiceEquipmentRow,
  ServiceWorkOrderEventRow,
  ServiceWorkOrderRow,
  ServiceWorkOrderShareRow,
} from './models.js';

/**
 * Anything that can hand out a Repository: the full connection for system work, or a scoped connection whose
 * Policies bind the caller's grants. Both satisfy this, so a helper that writes application-owned log rows can
 * take either.
 */
type RepositoryHost = Pick<DatabaseConnection, 'repository'>;

export interface WorkOrderListQuery {
  status?: string;
  priority?: string;
  assigneeId?: string;
  customerId?: number;
  equipmentId?: number;
  keyword?: string;
  source?: string;
  limit?: number;
  offset?: number;
}

export interface WorkOrderListResult {
  items: ServiceWorkOrderRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface ServiceWorkOrderAttachment {
  id: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number | string;
  createdAt: Date;
}

export interface WorkOrderDetail {
  workOrder: ServiceWorkOrderRow;
  events: ServiceWorkOrderEventRow[];
  shares: ServiceWorkOrderShareRow[];
  attachments: ServiceWorkOrderAttachment[];
  /** The transitions the caller may actually perform on this work order, computed from their grants and scope. */
  transitions: WorkOrderTransition[];
  /** True when the caller may create or revoke collaboration shares for this work order. */
  canManageShares: boolean;
}

export interface WorkOrderCreateInput {
  title: string;
  customerId: number;
  equipmentId: number;
  description?: string | null;
  priority?: string;
  confidential?: boolean;
  deadline?: Date | string | null;
  assigneeId?: string | null;
  reporterId?: string | null;
  source?: string;
  /** The request locale, carried to the acceptance workflow so the note and message match the caller's language. */
  locale?: string | null;
}

export interface WorkOrderUpdateInput {
  title?: string;
  description?: string | null;
  priority?: string;
  confidential?: boolean;
  deadline?: Date | string | null;
  assigneeId?: string | null;
  supervisorId?: string | null;
  resolutionNote?: string | null;
}

export interface WorkOrderTransitionInput {
  note?: string | null;
  resolutionNote?: string | null;
  returnReason?: string | null;
  assigneeId?: string | null;
}

export interface WorkOrderTransitionResult {
  workOrder: ServiceWorkOrderRow;
  event: ServiceWorkOrderEventRow;
}

/** The closed loop's transitions, each a separate business action. */
export type WorkOrderTransition =
  'accept' | 'start' | 'submit' | 'confirm' | 'return';

export interface WorkOrderService {
  list(
    context: AuthorizationContext,
    query: WorkOrderListQuery,
  ): Promise<WorkOrderListResult>;
  get(context: AuthorizationContext, id: number): Promise<WorkOrderDetail>;
  create(
    context: AuthorizationContext,
    input: WorkOrderCreateInput,
  ): Promise<ServiceWorkOrderRow>;
  update(
    context: AuthorizationContext,
    id: number,
    input: WorkOrderUpdateInput,
  ): Promise<ServiceWorkOrderRow>;
  transition(
    context: AuthorizationContext,
    id: number,
    transition: WorkOrderTransition,
    input: WorkOrderTransitionInput,
  ): Promise<WorkOrderTransitionResult>;
  /**
   * Authorize and validate a supervisor's accept action. The transition itself runs in the source-managed
   * acceptance workflow, so this only confirms the caller may accept and the work order is still waiting.
   */
  requestAcceptance(
    context: AuthorizationContext,
    id: number,
  ): Promise<ServiceWorkOrderRow>;
  share(
    context: AuthorizationContext,
    id: number,
    engineerId: string,
  ): Promise<ServiceWorkOrderShareRow>;
  revokeShare(
    context: AuthorizationContext,
    id: number,
    shareId: number,
  ): Promise<ServiceWorkOrderShareRow>;
  remove(context: AuthorizationContext, id: number): Promise<void>;
}

function now(): Date {
  return new Date();
}

/** Normalize a client-supplied date to the `Date` a repository write expects. */
function asDate(
  value: Date | string | null | undefined,
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

let workOrderSequence = 0;

/** A short, human-readable work-order code. */
export function nextWorkOrderCode(at: Date = new Date()): string {
  workOrderSequence = (workOrderSequence + 1) % 1000;
  const year = at.getFullYear();
  const month = String(at.getMonth() + 1).padStart(2, '0');
  const day = String(at.getDate()).padStart(2, '0');
  const suffix = String(at.getTime() % 100000).padStart(5, '0');
  return `WO-${year}${month}${day}-${suffix}${workOrderSequence}`;
}

async function writeEvent(
  host: RepositoryHost,
  workOrderId: number,
  type: string,
  message: string | null,
  actorId: string | null,
  detail?: unknown,
): Promise<ServiceWorkOrderEventRow> {
  const created = await host
    .repository<ServiceWorkOrderEventRow>('serviceWorkOrderEvents')
    .createOne({
      values: {
        workOrderId,
        type,
        status: 'succeeded',
        message,
        detail: detail ?? null,
        actorId,
        createdAt: now(),
      },
    });
  return created.record;
}

async function findWorkOrder(
  host: RepositoryHost,
  id: number,
): Promise<ServiceWorkOrderRow> {
  const row = await host
    .repository<ServiceWorkOrderRow>('serviceWorkOrders')
    .findOne({ filter: { id } });
  if (!row) throw notFound('The work order does not exist.');
  return row;
}

/**
 * The auto-acceptance rule moved into the source-managed acceptance workflow
 * (`server/workflows/work-order-acceptance/server/register-acceptance.ts`). A compiled run module is copied
 * into a content-addressed Artifact directory, so it cannot import back into this file; the rule has to live with
 * the workflow that owns it.
 */

const TRANSITION_RULES: Record<
  WorkOrderTransition,
  { from: WorkOrderStatus; to: WorkOrderStatus; event: string }
> = {
  accept: {
    from: WORK_ORDER_STATUS.PENDING_ACCEPTANCE,
    to: WORK_ORDER_STATUS.PENDING_PROCESSING,
    event: WORK_ORDER_EVENT.ACCEPTED,
  },
  start: {
    from: WORK_ORDER_STATUS.PENDING_PROCESSING,
    to: WORK_ORDER_STATUS.PROCESSING,
    event: WORK_ORDER_EVENT.STARTED,
  },
  submit: {
    from: WORK_ORDER_STATUS.PROCESSING,
    to: WORK_ORDER_STATUS.PENDING_CONFIRMATION,
    event: WORK_ORDER_EVENT.SUBMITTED,
  },
  confirm: {
    from: WORK_ORDER_STATUS.PENDING_CONFIRMATION,
    to: WORK_ORDER_STATUS.CLOSED,
    event: WORK_ORDER_EVENT.CONFIRMED,
  },
  // A returned work order re-enters the engineer's queue rather than leaving the loop.
  return: {
    from: WORK_ORDER_STATUS.PENDING_CONFIRMATION,
    to: WORK_ORDER_STATUS.PENDING_PROCESSING,
    event: WORK_ORDER_EVENT.RETURNED,
  },
};

function transitionValues(
  transition: WorkOrderTransition,
  input: WorkOrderTransitionInput,
): Partial<ServiceWorkOrderRow> {
  const at = now();
  switch (transition) {
    case 'accept':
      return {
        status: WORK_ORDER_STATUS.PENDING_PROCESSING,
        acceptedAt: at,
        acceptanceNote: input.note ?? null,
        ...(input.assigneeId ? { assigneeId: input.assigneeId } : {}),
      };
    case 'start':
      return { status: WORK_ORDER_STATUS.PROCESSING, startedAt: at };
    case 'submit':
      return {
        status: WORK_ORDER_STATUS.PENDING_CONFIRMATION,
        submittedAt: at,
        resolutionNote: input.resolutionNote ?? null,
      };
    case 'confirm':
      return {
        status: WORK_ORDER_STATUS.CLOSED,
        closedAt: at,
        ...(input.resolutionNote !== undefined
          ? { resolutionNote: input.resolutionNote }
          : {}),
      };
    case 'return':
      return {
        status: WORK_ORDER_STATUS.PENDING_PROCESSING,
        returnReason: input.returnReason ?? null,
      };
  }
}

function transitionMessage(transition: WorkOrderTransition): string {
  switch (transition) {
    case 'accept':
      return 'Work order accepted and queued.';
    case 'start':
      return 'Repair started.';
    case 'submit':
      return 'Repair submitted for confirmation.';
    case 'confirm':
      return 'Repair confirmed and the work order closed.';
    case 'return':
      return 'Work order returned for another attempt.';
  }
}

/** Whether the caller holds any grant to update a work order. Used to decide who may see internal notes. */
async function canUpdateWorkOrders(
  context: AuthorizationContext,
): Promise<boolean> {
  try {
    await authorizeComposite(context, 'service.workOrders', 'update');
    return true;
  } catch {
    return false;
  }
}

/** The work order with its internal processing notes removed. */
function withoutInternalNotes(row: ServiceWorkOrderRow): ServiceWorkOrderRow {
  return {
    ...row,
    acceptanceNote: null,
    resolutionNote: null,
    returnReason: null,
  };
}

/**
 * The transitions this caller may perform on this work order right now. Authorization is checked and the row is
 * confirmed inside the transition's own data scope, so a view-only reader — an observer or a temporarily shared
 * engineer — gets no action, and a transition only appears when the server would accept it.
 */
async function allowedTransitionsFor(
  database: DatabaseManager,
  context: AuthorizationContext,
  workOrder: ServiceWorkOrderRow,
): Promise<WorkOrderTransition[]> {
  const allowed: WorkOrderTransition[] = [];
  for (const transition of Object.keys(
    TRANSITION_RULES,
  ) as WorkOrderTransition[]) {
    if (workOrder.status !== TRANSITION_RULES[transition].from) continue;
    try {
      const policies = await authorizeComposite(
        context,
        'service.workOrders',
        transition,
      );
      const connection = scopedConnection(
        database,
        context.identity.principal,
        policies,
      );
      await findWorkOrder(connection, workOrder.id);
      allowed.push(transition);
    } catch {
      // The caller may not perform this transition on this work order; leave it out.
    }
  }
  return allowed;
}

export interface WorkOrderServiceDependencies {
  database: DatabaseManager;
  /**
   * Hands the auto-acceptance decision that follows creation to the source-managed workflow. When absent the
   * work order stays pending acceptance and the supervisor accepts it by hand.
   */
  triggerAcceptance?: (input: {
    workOrderId: number;
    mode: 'auto' | 'manual';
    actorId: string | null;
    assigneeId?: string | null;
    locale?: string | null;
  }) => Promise<unknown>;
}

export function createWorkOrderService({
  database,
  triggerAcceptance,
}: WorkOrderServiceDependencies): WorkOrderService {
  return {
    async list(context, query) {
      const policies = await authorizeComposite(
        context,
        'service.workOrders',
        'view',
      );
      const connection = scopedConnection(
        database,
        context.identity.principal,
        policies,
      );
      const repository =
        connection.repository<ServiceWorkOrderRow>('serviceWorkOrders');
      const limit = Math.min(Math.max(query.limit ?? 25, 1), 200);
      const offset = Math.max(query.offset ?? 0, 0);
      const filter: RepositoryFilter<ServiceWorkOrderRow> = (builder) => {
        const items = [];
        if (query.status) items.push(builder.string('status').eq(query.status));
        if (query.priority)
          items.push(builder.string('priority').eq(query.priority));
        if (query.assigneeId)
          items.push(builder.string('assigneeId').eq(query.assigneeId));
        if (query.source) items.push(builder.string('source').eq(query.source));
        if (typeof query.customerId === 'number')
          items.push(builder.number('customerId').eq(query.customerId));
        if (typeof query.equipmentId === 'number')
          items.push(builder.number('equipmentId').eq(query.equipmentId));
        if (query.keyword)
          items.push(
            builder
              .string('title')
              .includes(query.keyword, { mode: 'insensitive' }),
          );
        return items.length > 0 ? builder.and(items) : builder.and([]);
      };
      const items = await repository.findMany({
        filter,
        sort: (sort) => sort.field('createdAt').desc(),
        limit,
        offset,
      });
      const total = await repository.count({ filter });
      const canSeeInternalNotes = await canUpdateWorkOrders(context);
      return {
        items: canSeeInternalNotes ? items : items.map(withoutInternalNotes),
        total,
        limit,
        offset,
      };
    },

    async get(context, id) {
      const policies = await authorizeComposite(
        context,
        'service.workOrders',
        'view',
      );
      const connection = scopedConnection(
        database,
        context.identity.principal,
        policies,
      );
      const workOrder = await findWorkOrder(connection, id);
      const events = await connection
        .repository<ServiceWorkOrderEventRow>('serviceWorkOrderEvents')
        .findMany({
          filter: (builder) => builder.number('workOrderId').eq(id),
          sort: (sort) => sort.field('createdAt').asc(),
        });
      const shares = await connection
        .repository<ServiceWorkOrderShareRow>('serviceWorkOrderShares')
        .findMany({
          filter: (builder) => builder.number('workOrderId').eq(id),
        });
      const attachments = await connection
        .repository<ServiceWorkOrderAttachment>('serviceAttachments')
        .findMany({
          filter: (builder) => builder.number('workOrderId').eq(id),
          sort: (sort) => sort.field('createdAt').desc(),
        });
      const principal = context.identity.principal;
      // A share grants read-only assistance: the collaborator sees no internal processing notes and no action,
      // and cannot manage the shares themselves. The assignee, creator and supervisor are not collaborators.
      const isCollaborator =
        shares.some(
          (share) => !share.revokedAt && share.engineerId === principal.id,
        ) &&
        workOrder.assigneeId !== principal.id &&
        workOrder.createdById !== principal.id &&
        workOrder.supervisorId !== principal.id;
      const hideInternalNotes =
        isCollaborator || !(await canUpdateWorkOrders(context));
      const transitions = await allowedTransitionsFor(
        database,
        context,
        workOrder,
      );
      let canManageShares = false;
      try {
        await authorizeComposite(context, 'service.workOrders', 'share');
        canManageShares = !isCollaborator;
      } catch {
        // Without the share grant the caller cannot manage collaboration links; keep the default.
      }
      return {
        workOrder: hideInternalNotes
          ? withoutInternalNotes(workOrder)
          : workOrder,
        events: hideInternalNotes
          ? events.map((event) => ({ ...event, detail: null }))
          : events,
        shares,
        attachments: attachments.map((row) => ({
          id: row.id,
          filename: row.filename,
          ext: row.ext,
          mimeType: row.mimeType,
          size: row.size,
          createdAt: row.createdAt,
        })),
        transitions,
        canManageShares,
      };
    },

    async create(context, input) {
      if (!input.title || !input.title.trim()) {
        throw invalid('A title is required.');
      }
      if (
        !Number.isFinite(input.customerId) ||
        !Number.isFinite(input.equipmentId)
      ) {
        throw invalid('A customer and an equipment are required.');
      }
      const policies = await authorizeComposite(
        context,
        'service.workOrders',
        'create',
      );
      // The equipment is read through the create action's own policies, so a caller who may not read it cannot
      // register a work order against it. The customer/equipment pair and the enabled flag are the registration
      // rules the form cannot be trusted to enforce.
      const equipment = await scopedConnection(
        database,
        context.identity.principal,
        policies,
      )
        .repository<ServiceEquipmentRow>('serviceEquipment')
        .findOne({ filter: { id: input.equipmentId } });
      if (!equipment) {
        throw invalid(
          'The selected equipment does not exist or is not available to you.',
        );
      }
      if (Number(equipment.customerId) !== Number(input.customerId)) {
        throw invalid(
          'The selected equipment does not belong to the selected customer.',
        );
      }
      if (equipment.enabled === false) {
        throw invalid(
          'A disabled equipment cannot be used for a new work order.',
        );
      }
      // The action is authorized above; the write itself uses the system connection so the
      // server-managed code, status and timestamps are not constrained by client field grants.
      const created = await database
        .connection()
        .repository<ServiceWorkOrderRow>('serviceWorkOrders')
        .createOne({
          values: {
            code: nextWorkOrderCode(),
            title: input.title.trim(),
            customerId: input.customerId,
            equipmentId: input.equipmentId,
            description: input.description ?? null,
            priority: input.priority ?? 'normal',
            confidential: input.confidential ?? false,
            deadline: asDate(input.deadline) ?? null,
            assigneeId: input.assigneeId ?? null,
            reporterId: input.reporterId ?? context.identity.principal.id,
            source: input.source ?? 'internal',
            status: WORK_ORDER_STATUS.PENDING_ACCEPTANCE,
            createdById: context.identity.principal.id,
            createdAt: now(),
            updatedAt: now(),
          },
        });
      const workOrder = created.record;
      await writeEvent(
        database.connection(),
        workOrder.id,
        WORK_ORDER_EVENT.CREATED,
        'Work order created.',
        context.identity.principal.id,
        { source: workOrder.source },
      );
      // Auto-acceptance is the source-managed Workflow's decision, not a second synchronous rule. The run
      // module is idempotent, so a trigger that fails or is retried cannot accept the order twice.
      if (triggerAcceptance) {
        try {
          await triggerAcceptance({
            workOrderId: workOrder.id,
            mode: 'auto',
            actorId: null,
            assigneeId: null,
            locale: input.locale ?? null,
          });
        } catch {
          // The workflow could not be scheduled; the order remains pending acceptance for a manual handoff.
        }
      }
      return findWorkOrder(database.connection(), workOrder.id);
    },

    async update(context, id, input) {
      const policies = await authorizeComposite(
        context,
        'service.workOrders',
        'update',
      );
      const connection = scopedConnection(
        database,
        context.identity.principal,
        policies,
      );
      const existing = await findWorkOrder(connection, id);
      if (existing.status === WORK_ORDER_STATUS.CLOSED) {
        throw conflict('A closed work order cannot be edited.');
      }
      const updated = await database
        .connection()
        .repository<ServiceWorkOrderRow>('serviceWorkOrders')
        .updateOne({
          filter: { id, status: existing.status },
          values: {
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.description !== undefined
              ? { description: input.description }
              : {}),
            ...(input.priority !== undefined
              ? { priority: input.priority }
              : {}),
            ...(input.confidential !== undefined
              ? { confidential: input.confidential }
              : {}),
            ...(input.deadline !== undefined
              ? { deadline: asDate(input.deadline) }
              : {}),
            ...(input.assigneeId !== undefined
              ? { assigneeId: input.assigneeId }
              : {}),
            ...(input.supervisorId !== undefined
              ? { supervisorId: input.supervisorId }
              : {}),
            ...(input.resolutionNote !== undefined
              ? { resolutionNote: input.resolutionNote }
              : {}),
            updatedAt: now(),
          },
        });
      return updated.record;
    },

    async transition(context, id, transition, input) {
      const rule = TRANSITION_RULES[transition];
      const policies = await authorizeComposite(
        context,
        'service.workOrders',
        transition,
      );
      const connection = scopedConnection(
        database,
        context.identity.principal,
        policies,
      );
      const existing = await findWorkOrder(connection, id);
      if (existing.status !== rule.from) {
        throw conflict(
          `A work order in "${existing.status}" cannot move to "${rule.to}".`,
        );
      }
      if (transition === 'submit' && !input.resolutionNote) {
        throw invalid('A resolution note is required before submitting.');
      }
      const updated = await database
        .connection()
        .repository<ServiceWorkOrderRow>('serviceWorkOrders')
        .updateOne({
          filter: { id, status: rule.from },
          values: {
            ...transitionValues(transition, input),
            updatedAt: now(),
          },
        });
      const event = await writeEvent(
        database.connection(),
        id,
        rule.event,
        transitionMessage(transition),
        context.identity.principal.id,
        {
          note:
            input.note ??
            input.resolutionNote ??
            input.returnReason ??
            undefined,
        },
      );
      return { workOrder: updated.record, event };
    },

    async requestAcceptance(context, id) {
      const policies = await authorizeComposite(
        context,
        'service.workOrders',
        'accept',
      );
      const connection = scopedConnection(
        database,
        context.identity.principal,
        policies,
      );
      const existing = await findWorkOrder(connection, id);
      if (existing.status !== WORK_ORDER_STATUS.PENDING_ACCEPTANCE) {
        throw conflict(
          `A work order in "${existing.status}" cannot be accepted.`,
        );
      }
      return existing;
    },

    async share(context, id, engineerId) {
      if (!engineerId) throw invalid('An engineer is required.');
      const viewPolicies = await authorizeComposite(
        context,
        'service.workOrders',
        'view',
      );
      const workOrder = await findWorkOrder(
        scopedConnection(database, context.identity.principal, viewPolicies),
        id,
      );
      if (workOrder.confidential) {
        throw conflict(
          'A confidential work order cannot be shared with a collaborating engineer.',
        );
      }
      await authorizeComposite(context, 'service.workOrders', 'share');
      const created = await database
        .connection()
        .repository<ServiceWorkOrderShareRow>('serviceWorkOrderShares')
        .createOne({
          values: {
            workOrderId: id,
            engineerId,
            grantedById: context.identity.principal.id,
            createdAt: now(),
            updatedAt: now(),
          },
        });
      await writeEvent(
        database.connection(),
        id,
        WORK_ORDER_EVENT.SHARED,
        'Work order shared with a collaborating engineer.',
        context.identity.principal.id,
        { engineerId },
      );
      return created.record;
    },

    async revokeShare(context, id, shareId) {
      await authorizeComposite(context, 'service.workOrders', 'share');
      const updated = await database
        .connection()
        .repository<ServiceWorkOrderShareRow>('serviceWorkOrderShares')
        .updateOne({
          filter: (filter) =>
            filter.and([
              filter.number('id').eq(Number(shareId)),
              filter.date('revokedAt').empty(),
            ]),
          values: { revokedAt: now(), updatedAt: now() },
        });
      await writeEvent(
        database.connection(),
        id,
        WORK_ORDER_EVENT.SHARE_REVOKED,
        'Collaboration share revoked.',
        context.identity.principal.id,
        { shareId },
      );
      return updated.record;
    },

    async remove(context, id) {
      const policies = await authorizeComposite(
        context,
        'service.workOrders',
        'delete',
      );
      const connection = scopedConnection(
        database,
        context.identity.principal,
        policies,
      );
      // Confirm the target is visible under the delete scope before the system delete.
      await findWorkOrder(connection, id);
      await database
        .connection()
        .repository<ServiceWorkOrderRow>('serviceWorkOrders')
        .deleteOne({ filter: { id } });
    },
  };
}
