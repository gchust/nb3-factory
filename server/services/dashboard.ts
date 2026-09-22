import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import {
  regionScopeOf,
  requireCapability,
  seesEveryRegion,
  sharedTicketIds,
  ticketAccessible,
  type ServiceCaller,
  type TicketScopeRow,
} from './service-auth.js';
import { todayInShanghai } from './inspections.js';
import { asText } from './values.js';

interface DashboardTicketRow extends TicketScopeRow {
  ticketNo: string;
  title: string;
  status: string;
  priority: string;
  updatedAt: Date | string;
  customerId: number;
}

export class DashboardService {
  constructor(private readonly app: Application) {}

  private get database() {
    return this.app.container.resolve(databaseManagerToken);
  }

  private get query() {
    return this.database.query();
  }

  async summary(caller: ServiceCaller) {
    await requireCapability(caller, 'dashboard.view');
    const tickets = (await this.query
      .selectFrom('serviceTickets')
      .select([
        'id',
        'ticketNo',
        'title',
        'status',
        'priority',
        'region',
        'confidential',
        'assigneeId',
        'reporterId',
        'customerId',
        'updatedAt',
      ])
      .orderBy('updatedAt', 'desc')
      .limit(500)
      .execute()) as unknown as DashboardTicketRow[];
    const shared = await sharedTicketIds(this.database, caller.id);
    const visible: DashboardTicketRow[] = [];
    for (const ticket of tickets) {
      if (await ticketAccessible(caller, ticket, shared)) visible.push(ticket);
    }
    const byStatus: Record<string, number> = {};
    for (const ticket of visible)
      byStatus[ticket.status] = (byStatus[ticket.status] ?? 0) + 1;

    // Region distribution and engineer workload, both computed over the same
    // visibility-scoped set the caller may see, never a static figure.
    const byRegion: Record<string, number> = {};
    const assigneeCounts = new Map<string, number>();
    for (const ticket of visible) {
      const region = String(ticket.region);
      byRegion[region] = (byRegion[region] ?? 0) + 1;
      if (ticket.assigneeId)
        assigneeCounts.set(
          ticket.assigneeId,
          (assigneeCounts.get(ticket.assigneeId) ?? 0) + 1,
        );
    }
    const assigneeIds = [...assigneeCounts.keys()];
    const users = assigneeIds.length
      ? await this.query
          .selectFrom('user')
          .select(['id', 'name', 'username'])
          .where('id', 'in', assigneeIds)
          .execute()
      : [];
    const userNameById = new Map(
      users.map((user) => [
        String(user.id),
        (user.name as string | null) ??
          (user.username as string | null) ??
          null,
      ]),
    );
    const byAssignee = assigneeIds
      .map((id) => ({
        assigneeId: id,
        name: userNameById.get(id) ?? null,
        count: assigneeCounts.get(id) ?? 0,
      }))
      .sort((left, right) => right.count - left.count);

    const recent = visible.slice(0, 8);
    const recentCustomerIds = [
      ...new Set(recent.map((ticket) => Number(ticket.customerId))),
    ];
    const recentCustomers = recentCustomerIds.length
      ? await this.query
          .selectFrom('serviceCustomers')
          .select(['id', 'name'])
          .where('id', 'in', recentCustomerIds)
          .execute()
      : [];
    const customerNameById = new Map(
      recentCustomers.map((customer) => [Number(customer.id), customer.name]),
    );

    const devices = await this.query
      .selectFrom('serviceDevices')
      .select(['id', 'region'])
      .execute();
    const regionById = new Map(
      devices.map((device) => [Number(device.id), String(device.region)]),
    );
    const tasks = await this.query
      .selectFrom('serviceInspectionTasks')
      .select(['taskDate', 'status', 'deviceId', 'assigneeId'])
      .limit(2000)
      .execute();
    const scoped = tasks.filter((task) => {
      if (
        caller.capabilities['inspections.manage'] === true ||
        seesEveryRegion(caller)
      )
        return true;
      if (caller.region)
        return regionById.get(Number(task.deviceId)) === caller.region;
      return asText(task.assigneeId) === caller.id;
    });
    const today = todayInShanghai();
    const overdue = scoped.filter(
      (task) => String(task.taskDate) < today && task.status !== 'completed',
    ).length;
    const todayOpen = scoped.filter(
      (task) => String(task.taskDate) === today && task.status !== 'completed',
    ).length;

    let deviceQuery = this.query
      .selectFrom('serviceDevices')
      .select(({ fn }) => [fn.countAll().as('count')]);
    const deviceScope = regionScopeOf(caller);
    if (deviceScope)
      deviceQuery = deviceQuery.where('region', '=', deviceScope);
    const deviceCount = await deviceQuery.executeTakeFirst();

    return {
      generatedAt: new Date().toISOString(),
      byStatus,
      total: visible.length,
      open: visible.filter(
        (ticket) => ticket.status !== 'closed' && ticket.status !== 'cancelled',
      ).length,
      overdueInspections: overdue,
      todayOpenInspections: todayOpen,
      deviceCount: Number(deviceCount?.count ?? 0),
      byRegion,
      byAssignee,
      recent: recent.map((ticket) => ({
        id: ticket.id,
        ticketNo: ticket.ticketNo,
        title: ticket.title,
        status: ticket.status,
        priority: ticket.priority,
        region: String(ticket.region),
        customerName: customerNameById.get(Number(ticket.customerId)) ?? null,
        updatedAt: ticket.updatedAt,
      })),
      myTasks: await this.query
        .selectFrom('serviceInspectionTasks')
        .selectAll()
        .where('assigneeId', '=', caller.id)
        .where('status', '!=', 'completed')
        .orderBy('taskDate', 'asc')
        .limit(8)
        .execute(),
    };
  }
}
