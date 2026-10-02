import type { AuthorizationContext } from '@nocobase/authorization/core';
import type { DatabaseManager, RepositoryFilter } from '@nocobase/db';

import { authorizeComposite, scopedConnection } from './authorization.js';
import { WORK_ORDER_EVENT, WORK_ORDER_STATUS } from './constants.js';
import { invalid } from './errors.js';
import type {
  ServiceEquipmentRow,
  ServiceExternalEventRow,
  ServiceWorkOrderEventRow,
  ServiceWorkOrderRow,
} from './models.js';
import { nextWorkOrderCode } from './work-orders.js';

export interface ExternalEventInput {
  externalEventId: string;
  title: string;
  equipmentId: number;
  description?: string | null;
  priority?: string;
  eventType?: string | null;
  source?: string | null;
  deadline?: Date | string | null;
  payload?: unknown;
}

export interface IntegrationIngestResult {
  workOrder: ServiceWorkOrderRow;
  event: ServiceExternalEventRow;
  /** True when the external event id had already been received and nothing new was created. */
  duplicate: boolean;
}

export interface IntegrationStatusResult {
  event: ServiceExternalEventRow;
  workOrder: ServiceWorkOrderRow | null;
}

export interface IntegrationQuery {
  status?: string;
  limit?: number;
  offset?: number;
}

export interface IntegrationListResult {
  items: ServiceWorkOrderRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface IntegrationService {
  /** Ingest an external equipment report, deduplicated by its external event id. */
  ingest(
    context: AuthorizationContext,
    input: ExternalEventInput,
  ): Promise<IntegrationIngestResult>;
  /** List only the work orders this integration principal submitted. */
  listMine(
    context: AuthorizationContext,
    query: IntegrationQuery,
  ): Promise<IntegrationListResult>;
  /** Read the status of one event this principal submitted. */
  status(
    context: AuthorizationContext,
    externalEventId: string,
  ): Promise<IntegrationStatusResult | null>;
}

function now(): Date {
  return new Date();
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function findEvent(
  connection: ReturnType<DatabaseManager['connection']>,
  externalEventId: string,
): Promise<ServiceExternalEventRow | undefined> {
  return connection
    .repository<ServiceExternalEventRow>('serviceExternalEvents')
    .findOne({ filter: { externalEventId } });
}

export interface IntegrationServiceDependencies {
  database: DatabaseManager;
}

export function createIntegrationService({
  database,
}: IntegrationServiceDependencies): IntegrationService {
  const system = database.connection();

  return {
    async ingest(context, input) {
      if (!input.externalEventId || !input.externalEventId.trim()) {
        throw invalid('An external event id is required.');
      }
      if (!input.title || !input.title.trim()) {
        throw invalid('A title is required.');
      }
      if (!Number.isFinite(input.equipmentId)) {
        throw invalid('An equipment is required.');
      }
      await authorizeComposite(context, 'service.integration', 'ingest');
      const existing = await findEvent(system, input.externalEventId);
      if (existing) {
        const workOrder = existing.workOrderId
          ? ((await system
              .repository<ServiceWorkOrderRow>('serviceWorkOrders')
              .findOne({ filter: { id: existing.workOrderId } })) ?? null)
          : null;
        if (workOrder) {
          return { workOrder, event: existing, duplicate: true };
        }
      }
      const equipment = await system
        .repository<ServiceEquipmentRow>('serviceEquipment')
        .findOne({ filter: { id: input.equipmentId } });
      if (!equipment) throw invalid('The equipment does not exist.');
      const actorId = context.identity.principal.id;
      const createdOrder = await system
        .repository<ServiceWorkOrderRow>('serviceWorkOrders')
        .createOne({
          values: {
            code: nextWorkOrderCode(),
            title: input.title.trim(),
            source: input.source ?? 'external',
            reporterId: actorId,
            customerId: equipment.customerId,
            equipmentId: equipment.id,
            description: input.description ?? null,
            priority: input.priority ?? 'normal',
            confidential: false,
            deadline: toDate(input.deadline),
            assigneeId: null,
            status: WORK_ORDER_STATUS.PENDING_ACCEPTANCE,
            externalEventId: input.externalEventId,
            createdById: actorId,
            createdAt: now(),
            updatedAt: now(),
          },
        });
      const workOrder = createdOrder.record;
      let event: ServiceExternalEventRow;
      try {
        const createdEvent = await system
          .repository<ServiceExternalEventRow>('serviceExternalEvents')
          .createOne({
            values: {
              externalEventId: input.externalEventId,
              source: input.source ?? 'external',
              eventType: input.eventType ?? null,
              status: 'accepted',
              message: null,
              workOrderId: workOrder.id,
              payload: input.payload ?? null,
              createdAt: now(),
            },
          });
        event = createdEvent.record;
      } catch (error) {
        // A concurrent request inserted the same event id first; return that attempt's work order.
        const raced = await findEvent(system, input.externalEventId);
        if (raced?.workOrderId) {
          const racedOrder = await system
            .repository<ServiceWorkOrderRow>('serviceWorkOrders')
            .findOne({ filter: { id: raced.workOrderId } });
          if (racedOrder) {
            return { workOrder: racedOrder, event: raced, duplicate: true };
          }
        }
        throw error;
      }
      await system
        .repository<ServiceWorkOrderEventRow>('serviceWorkOrderEvents')
        .createOne({
          values: {
            workOrderId: workOrder.id,
            type: WORK_ORDER_EVENT.INTEGRATION_INGESTED,
            status: 'succeeded',
            message: 'Work order received from the equipment platform.',
            detail: { externalEventId: input.externalEventId },
            actorId,
            createdAt: now(),
          },
        });
      return { workOrder, event, duplicate: false };
    },

    async listMine(context, query) {
      const policies = await authorizeComposite(
        context,
        'service.integration',
        'read',
      );
      const connection = scopedConnection(
        database,
        context.identity.principal,
        policies,
      );
      const repository =
        connection.repository<ServiceWorkOrderRow>('serviceWorkOrders');
      const actorId = context.identity.principal.id;
      const limit = Math.min(Math.max(query.limit ?? 25, 1), 200);
      const offset = Math.max(query.offset ?? 0, 0);
      const filter: RepositoryFilter<ServiceWorkOrderRow> = (builder) => {
        const items = [builder.string('createdById').eq(actorId)];
        if (query.status) items.push(builder.string('status').eq(query.status));
        return builder.and(items);
      };
      const items = await repository.findMany({
        filter,
        sort: (sort) => sort.field('createdAt').desc(),
        limit,
        offset,
      });
      const total = await repository.count({ filter });
      return { items, total, limit, offset };
    },

    async status(context, externalEventId) {
      const policies = await authorizeComposite(
        context,
        'service.integration',
        'read',
      );
      const connection = scopedConnection(
        database,
        context.identity.principal,
        policies,
      );
      const event = await findEvent(system, externalEventId);
      if (!event || !event.workOrderId) return null;
      // Reading the work order through the scoped connection keeps an event whose work order is hidden
      // from this principal invisible, even though the event row itself carries no owner column.
      const workOrder = await connection
        .repository<ServiceWorkOrderRow>('serviceWorkOrders')
        .findOne({ filter: { id: event.workOrderId } });
      if (!workOrder) return null;
      return { event, workOrder };
    },
  };
}
