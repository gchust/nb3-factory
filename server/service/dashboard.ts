import type { AuthorizationContext } from '@nocobase/authorization/core';
import type { DatabaseManager } from '@nocobase/db';

import { authorizeComposite, scopedConnection } from './authorization.js';
import { WORK_ORDER_STATUS } from './constants.js';
import type { ServiceWorkOrderRow } from './models.js';

export interface DashboardEngineerLoad {
  assigneeId: string | null;
  count: number;
}

export interface DashboardSummary {
  /** Waiting for acceptance or dispatch — the supervisor's queue. */
  pending: number;
  processing: number;
  pendingConfirmation: number;
  closed: number;
  /** Open work orders past their deadline. */
  overdue: number;
  total: number;
  byEngineer: DashboardEngineerLoad[];
}

export interface DashboardService {
  /** Work-order counts for the signed-in principal, from records that principal may read. */
  summary(context: AuthorizationContext): Promise<DashboardSummary>;
}

export interface DashboardServiceDependencies {
  database: DatabaseManager;
}

export function createDashboardService({
  database,
}: DashboardServiceDependencies): DashboardService {
  return {
    async summary(context) {
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
      const countByStatus = (status: string) =>
        repository.count({
          filter: (builder) => builder.string('status').eq(status),
        });
      const [
        pendingAcceptance,
        pendingProcessing,
        processing,
        pendingConfirmation,
        closed,
        total,
      ] = await Promise.all([
        countByStatus(WORK_ORDER_STATUS.PENDING_ACCEPTANCE),
        countByStatus(WORK_ORDER_STATUS.PENDING_PROCESSING),
        countByStatus(WORK_ORDER_STATUS.PROCESSING),
        countByStatus(WORK_ORDER_STATUS.PENDING_CONFIRMATION),
        countByStatus(WORK_ORDER_STATUS.CLOSED),
        repository.count(),
      ]);
      const overdue = await repository.count({
        filter: (builder) =>
          builder.and([
            builder.date('deadline').before(new Date()),
            builder.or([
              builder.string('status').eq(WORK_ORDER_STATUS.PENDING_ACCEPTANCE),
              builder.string('status').eq(WORK_ORDER_STATUS.PENDING_PROCESSING),
              builder.string('status').eq(WORK_ORDER_STATUS.PROCESSING),
              builder
                .string('status')
                .eq(WORK_ORDER_STATUS.PENDING_CONFIRMATION),
            ]),
          ]),
      });
      const open = await repository.findMany({
        select: (select) => select.fields('assigneeId'),
        filter: (builder) =>
          builder.or([
            builder.string('status').eq(WORK_ORDER_STATUS.PENDING_ACCEPTANCE),
            builder.string('status').eq(WORK_ORDER_STATUS.PENDING_PROCESSING),
            builder.string('status').eq(WORK_ORDER_STATUS.PROCESSING),
            builder.string('status').eq(WORK_ORDER_STATUS.PENDING_CONFIRMATION),
          ]),
      });
      const load = new Map<string | null, number>();
      for (const row of open) {
        const key = row.assigneeId ?? null;
        load.set(key, (load.get(key) ?? 0) + 1);
      }
      const byEngineer = [...load.entries()]
        .map(([assigneeId, count]) => ({ assigneeId, count }))
        .sort((a, b) => b.count - a.count);
      return {
        pending: pendingAcceptance + pendingProcessing,
        processing,
        pendingConfirmation,
        closed,
        overdue,
        total,
        byEngineer,
      };
    },
  };
}
