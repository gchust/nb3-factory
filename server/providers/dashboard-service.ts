import type { DatabaseManager, RepositoryPolicy } from '@nocobase/db';
import type {
  ServiceInspectionRecord,
  ServiceTicketRecord,
} from './records.js';

/**
 * Aggregated counts for the dashboard. Every count runs through the caller's
 * Repository Policy, so a read-only observer sees the non-confidential totals
 * and an engineer sees only their own work — the dashboard cannot leak records
 * the user is not allowed to read.
 */

export interface DashboardPolicies {
  tickets: RepositoryPolicy;
  inspections: RepositoryPolicy;
  customers: RepositoryPolicy;
  devices: RepositoryPolicy;
}

export interface DashboardSummary {
  tickets: {
    total: number;
    pendingAcceptance: number;
    pendingProcessing: number;
    processing: number;
    pendingConfirmation: number;
    closed: number;
    overdue: number;
  };
  inspections: {
    total: number;
    scheduled: number;
    overdue: number;
    completed: number;
  };
  customers: number;
  devices: number;
  /**
   * Per-group and per-member open/total workload. Counts run through the same
   * ticket policy as the totals, so an engineer sees only their own share and an
   * observer only the non-confidential share rather than every member's full
   * queue.
   */
  teams: {
    id: number;
    code: string;
    name: string;
    open: number;
    total: number;
    members: {
      id: string;
      name: string;
      open: number;
      total: number;
    }[];
  }[];
  recentTickets: Record<string, unknown>[];
}

const OPEN_TICKET_STATUSES = [
  'pending_acceptance',
  'pending_processing',
  'processing',
  'pending_confirmation',
];

export class ServiceDashboardService {
  public constructor(private readonly database: DatabaseManager) {}

  public async summary(
    policies: DashboardPolicies,
    now: Date = new Date(),
  ): Promise<DashboardSummary> {
    const timestamp = now.toISOString();
    const ticketRepository = this.database
      .repository<ServiceTicketRecord>('serviceTickets')
      .withPolicy(policies.tickets);
    const inspectionRepository = this.database
      .repository<ServiceInspectionRecord>('serviceInspections')
      .withPolicy(policies.inspections);

    const statuses = [
      'pending_acceptance',
      'pending_processing',
      'processing',
      'pending_confirmation',
      'closed',
    ] as const;
    const statusCounts = await Promise.all(
      statuses.map((status) => ticketRepository.count({ filter: { status } })),
    );
    const inspectionStatuses = ['scheduled', 'overdue', 'completed'] as const;
    const inspectionCounts = await Promise.all(
      inspectionStatuses.map((status) =>
        inspectionRepository.count({ filter: { status } }),
      ),
    );

    const [
      totalTickets,
      overdueTickets,
      totalInspections,
      customers,
      devices,
      recentTickets,
      teams,
    ] = await Promise.all([
      ticketRepository.count(),
      ticketRepository.count({
        filter: (filter) =>
          filter.and([
            filter.or(
              OPEN_TICKET_STATUSES.map((status) =>
                filter.string('status').eq(status),
              ),
            ),
            filter.date('dueAt').before(timestamp),
          ]),
      }),
      inspectionRepository.count(),
      this.database
        .repository('serviceCustomers')
        .withPolicy(policies.customers)
        .count(),
      this.database
        .repository('serviceDevices')
        .withPolicy(policies.devices)
        .count(),
      ticketRepository.findMany({
        sort: (sort) => sort.field('createdAt').desc(),
        limit: 5,
      }),
      this.teamWorkload(policies.tickets),
    ]);

    return {
      tickets: {
        total: totalTickets,
        pendingAcceptance: statusCounts[0],
        pendingProcessing: statusCounts[1],
        processing: statusCounts[2],
        pendingConfirmation: statusCounts[3],
        closed: statusCounts[4],
        overdue: overdueTickets,
      },
      inspections: {
        total: totalInspections,
        scheduled: inspectionCounts[0],
        overdue: inspectionCounts[1],
        completed: inspectionCounts[2],
      },
      customers,
      devices,
      teams,
      recentTickets: recentTickets,
    };
  }

  private async teamWorkload(
    policy: RepositoryPolicy,
  ): Promise<DashboardSummary['teams']> {
    const ticketRepository = this.database
      .repository<ServiceTicketRecord>('serviceTickets')
      .withPolicy(policy);
    const [teamRows, memberRows] = await Promise.all([
      this.database
        .query()
        .selectFrom('service_teams')
        .select(['id', 'code', 'name'])
        .orderBy('code', 'asc')
        .execute(),
      this.database
        .query()
        .selectFrom('service_team_members')
        .select(['teamId', 'userId'])
        .execute(),
    ]);
    const userIds = [...new Set(memberRows.map((row) => String(row.userId)))];
    const nameById = new Map<string, string>();
    if (userIds.length > 0) {
      const users = await this.database
        .query()
        .selectFrom('user')
        .select(['id', 'name', 'username'])
        .where('id', 'in', userIds)
        .execute();
      for (const row of users) {
        nameById.set(
          String(row.id),
          String(row.name ?? row.username ?? row.id),
        );
      }
    }
    const counts = new Map<string, { open: number; total: number }>();
    for (const id of userIds) {
      const [total, open] = await Promise.all([
        ticketRepository.count({ filter: { assigneeId: id } }),
        ticketRepository.count({
          filter: (filter) =>
            filter.and([
              filter.string('assigneeId').eq(id),
              filter.or(
                OPEN_TICKET_STATUSES.map((status) =>
                  filter.string('status').eq(status),
                ),
              ),
            ]),
        }),
      ]);
      counts.set(id, { total, open });
    }
    return teamRows.map((team) => {
      const members = memberRows
        .filter((row) => Number(row.teamId) === Number(team.id))
        .map((row) => {
          const id = String(row.userId);
          const count = counts.get(id) ?? { open: 0, total: 0 };
          return { id, name: nameById.get(id) ?? id, ...count };
        });
      return {
        id: Number(team.id),
        code: String(team.code),
        name: String(team.name),
        open: members.reduce((sum, member) => sum + member.open, 0),
        total: members.reduce((sum, member) => sum + member.total, 0),
        members,
      };
    });
  }
}
