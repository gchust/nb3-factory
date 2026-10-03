import type { DatabaseManager } from '@nocobase/db';
import type { AuthorizationContext } from '@nocobase/authorization/core';

import { resolvePolicy, scopedRepository } from './authorization-helper.js';

export interface DashboardGroupStat {
  id: number;
  code: string;
  name: string;
  engineers: number;
  openOrders: number;
}

export interface DashboardSummary {
  orders: {
    total: number;
    byStatus: Record<string, number>;
    urgent: number;
    overdue: number;
    awaitingMyAction: number;
  };
  inspections: {
    total: number;
    pending: number;
    overdue: number;
  };
  recentOrders: readonly {
    id: number;
    orderNo: string;
    title: string;
    status: string;
    priority: string;
    deadline: string | null;
    overdue: boolean;
    customer: { id: number; name: string } | null;
  }[];
  /** Only present for a viewer who may supervise orders; empty otherwise. */
  groups: readonly DashboardGroupStat[];
  myDeadlines: readonly {
    id: number;
    deviceId: number;
    planDate: string;
    status: string;
  }[];
}

interface OrderLite {
  id: number;
  orderNo: string;
  title: string;
  status: string;
  priority: string;
  deadline: Date | string | null;
  assigneeId: string | null;
  groupId: number | string | null;
  customerId: number | string | null;
}

interface InspectionLite {
  id: number;
  deviceId: number;
  planDate: string;
  status: string;
  assigneeId: string | null;
}

/**
 * The dashboard reads the same row policies the list pages use, so a summary
 * never discloses a record the viewer could not open. Counts are folded in
 * memory from the visible subset, which keeps one definition of visibility.
 */
export class ServiceDashboardService {
  constructor(private readonly database: DatabaseManager) {}

  async summary(
    context: AuthorizationContext,
    userId: string,
  ): Promise<DashboardSummary> {
    const orderPolicy = await resolvePolicy(
      context,
      'service.orders',
      'view',
      'serviceOrders',
    );
    const inspectionPolicy = await resolvePolicy(
      context,
      'service.inspections',
      'view',
      'inspections',
    );

    const orders: OrderLite[] =
      orderPolicy.effect === 'deny'
        ? []
        : ((await scopedRepository(
            this.database,
            'serviceOrders',
            orderPolicy,
          ).findMany({
            limit: 1000,
          })) as unknown as OrderLite[]);
    const inspections: InspectionLite[] =
      inspectionPolicy.effect === 'deny'
        ? []
        : ((await scopedRepository(
            this.database,
            'inspections',
            inspectionPolicy,
          ).findMany({
            limit: 1000,
          })) as unknown as InspectionLite[]);

    const now = Date.now();
    const openStatuses = [
      'pending_accept',
      'pending_process',
      'processing',
      'pending_confirm',
    ];
    const byStatus: Record<string, number> = {
      pending_accept: 0,
      pending_process: 0,
      processing: 0,
      pending_confirm: 0,
      closed: 0,
    };
    let urgent = 0;
    let overdue = 0;
    let awaitingMyAction = 0;
    for (const order of orders) {
      byStatus[order.status] = (byStatus[order.status] ?? 0) + 1;
      if (order.priority === 'urgent' && openStatuses.includes(order.status)) {
        urgent += 1;
      }
      const deadline = order.deadline
        ? new Date(order.deadline).getTime()
        : null;
      if (
        deadline !== null &&
        deadline < now &&
        openStatuses.includes(order.status)
      ) {
        overdue += 1;
      }
      if (openStatuses.includes(order.status) && order.assigneeId === userId) {
        awaitingMyAction += 1;
      }
    }

    const upcoming = orders
      .filter((order) => openStatuses.includes(order.status))
      .sort((left, right) => {
        const leftTime = left.deadline
          ? new Date(left.deadline).getTime()
          : Number.MAX_SAFE_INTEGER;
        const rightTime = right.deadline
          ? new Date(right.deadline).getTime()
          : Number.MAX_SAFE_INTEGER;
        return leftTime - rightTime;
      })
      .slice(0, 8);
    const customerIds = [
      ...new Set(upcoming.map((order) => Number(order.customerId))),
    ];
    const customerRows = customerIds.length
      ? await this.database
          .query()
          .selectFrom('customers')
          .select(['id', 'name'])
          .where('id', 'in', customerIds)
          .execute()
      : [];
    const customerById = new Map(
      customerRows.map((row) => [
        Number(row.id),
        { id: Number(row.id), name: String(row.name) },
      ]),
    );
    const recentOrders = upcoming.map((order) => ({
      id: order.id,
      orderNo: order.orderNo,
      title: order.title,
      status: order.status,
      priority: order.priority,
      deadline: order.deadline ? new Date(order.deadline).toISOString() : null,
      overdue: order.deadline
        ? new Date(order.deadline).getTime() < now
        : false,
      customer: customerById.get(Number(order.customerId)) ?? null,
    }));

    let inspectionPending = 0;
    let inspectionOverdue = 0;
    const myDeadlines: {
      id: number;
      deviceId: number;
      planDate: string;
      status: string;
    }[] = [];
    for (const inspection of inspections) {
      if (inspection.status !== 'completed') {
        inspectionPending += 1;
        if (new Date(inspection.planDate).getTime() < now) {
          inspectionOverdue += 1;
        }
      }
      if (
        inspection.assigneeId === userId &&
        inspection.status !== 'completed'
      ) {
        myDeadlines.push({
          id: inspection.id,
          deviceId: inspection.deviceId,
          planDate: String(inspection.planDate),
          status: inspection.status,
        });
      }
    }

    const groups = await this.groupStats(context, orders, openStatuses);

    return {
      orders: {
        total: orders.length,
        byStatus,
        urgent,
        overdue,
        awaitingMyAction,
      },
      inspections: {
        total: inspections.length,
        pending: inspectionPending,
        overdue: inspectionOverdue,
      },
      recentOrders,
      groups,
      myDeadlines: myDeadlines.slice(0, 8),
    };
  }

  /**
   * Workload per engineer group, shown on the supervisor landing page. The
   * viewer's own supervision policy gates it, so an engineer never receives
   * another engineer's numbers.
   */
  private async groupStats(
    context: AuthorizationContext,
    orders: OrderLite[],
    openStatuses: readonly string[],
  ): Promise<DashboardGroupStat[]> {
    const policy = await resolvePolicy(
      context,
      'service.orders',
      'supervise',
      'serviceOrders',
    );
    if (policy.effect === 'deny') {
      return [];
    }
    const groups = await this.database
      .query()
      .selectFrom('engineerGroups')
      .select(['id', 'code', 'name'])
      .orderBy('id', 'asc')
      .execute();
    if (groups.length === 0) {
      return [];
    }
    const profiles = await this.database
      .query()
      .selectFrom('engineerProfiles')
      .select(['id', 'groupId', 'appRole'])
      .execute();
    const engineersByGroup = new Map<number, number>();
    for (const profile of profiles) {
      if (String(profile.appRole) !== 'engineer' || profile.groupId == null) {
        continue;
      }
      const groupId = Number(profile.groupId);
      engineersByGroup.set(groupId, (engineersByGroup.get(groupId) ?? 0) + 1);
    }
    const openByGroup = new Map<number, number>();
    for (const order of orders) {
      if (order.groupId == null || !openStatuses.includes(order.status)) {
        continue;
      }
      const groupId = Number(order.groupId);
      openByGroup.set(groupId, (openByGroup.get(groupId) ?? 0) + 1);
    }
    return groups.map((group) => ({
      id: Number(group.id),
      code: String(group.code),
      name: String(group.name),
      engineers: engineersByGroup.get(Number(group.id)) ?? 0,
      openOrders: openByGroup.get(Number(group.id)) ?? 0,
    }));
  }
}
