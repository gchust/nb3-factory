import type { AuthorizationContext } from '@nocobase/authorization/core';
import type { DatabaseManager, RepositoryFilter } from '@nocobase/db';

import { authorizeComposite, scopedConnection } from './authorization.js';
import {
  INSPECTION_STATUS,
  WORK_ORDER_EVENT,
  WORK_ORDER_STATUS,
} from './constants.js';
import { invalid, notFound } from './errors.js';
import type {
  ServiceEquipmentRow,
  ServiceInspectionRow,
  ServiceWorkOrderEventRow,
  ServiceWorkOrderRow,
} from './models.js';

export interface InspectionListQuery {
  status?: string;
  assigneeId?: string;
  equipmentId?: number;
  limit?: number;
  offset?: number;
}

export interface InspectionListResult {
  items: ServiceInspectionRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface InspectionCreateInput {
  equipmentId: number;
  planDate?: Date | string | null;
  dueDate?: Date | string | null;
  assigneeId?: string | null;
}

export interface InspectionCompleteInput {
  result: string;
}

export interface InspectionSweepResult {
  created: number;
  inspections: ServiceInspectionRow[];
}

export interface OverdueSweepResult {
  workOrders: ServiceWorkOrderRow[];
  notified: number;
}

export interface InspectionService {
  list(
    context: AuthorizationContext,
    query: InspectionListQuery,
  ): Promise<InspectionListResult>;
  create(
    context: AuthorizationContext,
    input: InspectionCreateInput,
  ): Promise<ServiceInspectionRow>;
  complete(
    context: AuthorizationContext,
    id: number,
    input: InspectionCompleteInput,
  ): Promise<ServiceInspectionRow>;
  /** Generate the day's plan for every enabled, due equipment. Runs as a scheduled system task. */
  generatePlans(): Promise<InspectionSweepResult>;
  /** Flag work orders past their deadline and record at most one reminder per work order per day. */
  flagOverdue(): Promise<OverdueSweepResult>;
}

function now(): Date {
  return new Date();
}

function startOfToday(at: Date = new Date()): Date {
  const day = new Date(at);
  day.setHours(0, 0, 0, 0);
  return day;
}

function startOfTomorrow(at: Date): Date {
  const day = startOfToday(at);
  day.setDate(day.getDate() + 1);
  return day;
}

let inspectionSequence = 0;

function nextInspectionCode(at: Date): string {
  inspectionSequence = (inspectionSequence + 1) % 1000;
  const date = `${at.getFullYear()}${String(at.getMonth() + 1).padStart(2, '0')}${String(
    at.getDate(),
  ).padStart(2, '0')}`;
  return `IN-${date}-${String(at.getTime() % 1000).padStart(3, '0')}${inspectionSequence}`;
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const OPEN_STATUSES = [
  WORK_ORDER_STATUS.PENDING_ACCEPTANCE,
  WORK_ORDER_STATUS.PENDING_PROCESSING,
  WORK_ORDER_STATUS.PROCESSING,
  WORK_ORDER_STATUS.PENDING_CONFIRMATION,
] as const;

export interface InspectionServiceDependencies {
  database: DatabaseManager;
}

export function createInspectionService({
  database,
}: InspectionServiceDependencies): InspectionService {
  const system = database.connection();

  return {
    async list(context, query) {
      const policies = await authorizeComposite(
        context,
        'service.inspections',
        'view',
      );
      const connection = scopedConnection(
        database,
        context.identity.principal,
        policies,
      );
      const repository =
        connection.repository<ServiceInspectionRow>('serviceInspections');
      const limit = Math.min(Math.max(query.limit ?? 25, 1), 200);
      const offset = Math.max(query.offset ?? 0, 0);
      const filter: RepositoryFilter<ServiceInspectionRow> = (builder) => {
        const items = [];
        if (query.status) items.push(builder.string('status').eq(query.status));
        if (query.assigneeId)
          items.push(builder.string('assigneeId').eq(query.assigneeId));
        if (typeof query.equipmentId === 'number')
          items.push(builder.number('equipmentId').eq(query.equipmentId));
        return items.length > 0 ? builder.and(items) : builder.and([]);
      };
      const items = await repository.findMany({
        filter,
        sort: (sort) => sort.field('planDate').desc(),
        limit,
        offset,
      });
      const total = await repository.count({ filter });
      return { items, total, limit, offset };
    },

    async create(context, input) {
      if (!Number.isFinite(input.equipmentId)) {
        throw invalid('An equipment is required.');
      }
      await authorizeComposite(context, 'service.inspections', 'create');
      const planDate = asDate(input.planDate) ?? now();
      const created = await system
        .repository<ServiceInspectionRow>('serviceInspections')
        .createOne({
          values: {
            code: nextInspectionCode(now()),
            equipmentId: input.equipmentId,
            planDate,
            dueDate: asDate(input.dueDate),
            assigneeId: input.assigneeId ?? null,
            status: INSPECTION_STATUS.PENDING,
            createdAt: now(),
            updatedAt: now(),
          },
        });
      return created.record;
    },

    async complete(context, id, input) {
      if (!input.result || !input.result.trim()) {
        throw invalid('An inspection result is required.');
      }
      const policies = await authorizeComposite(
        context,
        'service.inspections',
        'complete',
      );
      const connection = scopedConnection(
        database,
        context.identity.principal,
        policies,
      );
      const existing = await connection
        .repository<ServiceInspectionRow>('serviceInspections')
        .findOne({ filter: { id } });
      if (!existing) throw notFound('The inspection does not exist.');
      const updated = await system
        .repository<ServiceInspectionRow>('serviceInspections')
        .updateOne({
          filter: { id, status: existing.status },
          values: {
            status: INSPECTION_STATUS.DONE,
            result: input.result.trim(),
            completedAt: now(),
            updatedAt: now(),
          },
        });
      return updated.record;
    },

    async generatePlans() {
      const today = startOfToday();
      const equipment = await system
        .repository<ServiceEquipmentRow>('serviceEquipment')
        .findMany({
          filter: (builder) =>
            builder.and([
              builder.boolean('enabled').isTrue(),
              builder.date('nextInspectionDate').notAfter(today),
            ]),
        });
      const created: ServiceInspectionRow[] = [];
      const tomorrow = startOfTomorrow(today);
      for (const unit of equipment) {
        const existing = await system
          .repository<ServiceInspectionRow>('serviceInspections')
          .findOne({
            filter: (builder) =>
              builder.and([
                builder.number('equipmentId').eq(unit.id),
                // A `datetime` column cannot use a date-only operator, so match the half-open day range instead.
                builder.date('planDate').notBefore(today),
                builder.date('planDate').before(tomorrow),
              ]),
          });
        if (existing) continue;
        const result = await system
          .repository<ServiceInspectionRow>('serviceInspections')
          .createOne({
            values: {
              code: nextInspectionCode(today),
              equipmentId: unit.id,
              planDate: today,
              dueDate: null,
              assigneeId: unit.engineerId,
              status: INSPECTION_STATUS.PENDING,
              createdAt: now(),
              updatedAt: now(),
            },
          });
        created.push(result.record);
      }
      return { created: created.length, inspections: created };
    },

    async flagOverdue() {
      const at = now();
      const overdue = await system
        .repository<ServiceWorkOrderRow>('serviceWorkOrders')
        .findMany({
          filter: (builder) =>
            builder.and([
              builder.date('deadline').before(at),
              builder.or(
                OPEN_STATUSES.map((status) =>
                  builder.string('status').eq(status),
                ),
              ),
            ]),
        });
      const dayStart = startOfToday(at);
      const notified: ServiceWorkOrderRow[] = [];
      for (const workOrder of overdue) {
        const already = await system
          .repository<ServiceWorkOrderEventRow>('serviceWorkOrderEvents')
          .findOne({
            filter: (builder) =>
              builder.and([
                builder.number('workOrderId').eq(workOrder.id),
                builder.string('type').eq(WORK_ORDER_EVENT.OVERDUE_REMINDER),
                builder.date('createdAt').notBefore(dayStart),
              ]),
          });
        if (already) continue;
        await system
          .repository<ServiceWorkOrderEventRow>('serviceWorkOrderEvents')
          .createOne({
            values: {
              workOrderId: workOrder.id,
              type: WORK_ORDER_EVENT.OVERDUE_REMINDER,
              status: 'succeeded',
              message: 'The work order passed its deadline.',
              detail: { deadline: workOrder.deadline },
              actorId: null,
              createdAt: now(),
            },
          });
        notified.push(workOrder);
      }
      return { workOrders: notified, notified: notified.length };
    },
  };
}
