import type { DatabaseManager } from '@nocobase/db';

import type { ServiceActor } from './access.js';
import { hasRole, isManager } from './access.js';
import type { Device, Inspection, Ticket, TicketStatus } from './domain.js';
import { TICKET_STATUSES } from './domain.js';
import { visibleDeviceIds, visibleTicketIds } from './visibility.js';

export interface DashboardSummary {
  readonly scope: 'all' | 'assigned' | 'shared';
  readonly tickets: {
    readonly total: number;
    readonly open: number;
    readonly pending: number;
    readonly urgent: number;
    readonly overdue: number;
    readonly closed: number;
    readonly byStatus: Readonly<Record<TicketStatus, number>>;
  };
  readonly devices: {
    readonly total: number;
    readonly active: number;
    readonly maintenance: number;
    readonly disabled: number;
  };
  readonly inspections: {
    readonly total: number;
    readonly planned: number;
    readonly inProgress: number;
    readonly overdue: number;
    readonly completed: number;
  };
  readonly workload: readonly {
    readonly engineerId: string;
    readonly name: string;
    readonly open: number;
  }[];
  readonly generatedAt: string;
}

export interface DashboardService {
  summary(actor: ServiceActor): Promise<DashboardSummary>;
}

export function createDashboardService(
  database: DatabaseManager,
  options: {
    readonly routing: {
      engineerLoads(): Promise<
        readonly { id: string; name: string; openTickets: number }[]
      >;
    };
  },
): DashboardService {
  const tickets = () => database.repository<Ticket>('tickets');
  const devices = () => database.repository<Device>('devices');
  const inspections = () => database.repository<Inspection>('inspections');

  return {
    async summary(actor) {
      const scope: 'all' | 'assigned' | 'shared' = isManager(actor)
        ? 'all'
        : hasRole(actor, 'engineer')
          ? 'assigned'
          : 'shared';

      const ticketScope = await visibleTicketIds(database, actor);
      let ticketRows = (await tickets().findMany()) ?? [];
      if (ticketScope.kind === 'ids') {
        const allowed = new Set(ticketScope.ids);
        ticketRows = ticketRows.filter((row) => allowed.has(row.id));
      } else if (ticketScope.kind === 'none') {
        ticketRows = [];
      }

      const byStatus = Object.fromEntries(
        TICKET_STATUSES.map((status) => [status, 0]),
      ) as Record<TicketStatus, number>;
      for (const row of ticketRows) {
        if (byStatus[row.status] !== undefined) byStatus[row.status] += 1;
      }
      const openStatuses: readonly TicketStatus[] = [
        'pending',
        'accepted',
        'processing',
        'pending_confirm',
      ];
      const now = new Date().toISOString();

      const deviceScope = await visibleDeviceIds(database, actor);
      let deviceRows = (await devices().findMany()) ?? [];
      if (deviceScope.kind === 'ids') {
        const allowed = new Set(deviceScope.ids);
        deviceRows = deviceRows.filter((row) => allowed.has(row.id));
      } else if (deviceScope.kind === 'none') {
        deviceRows = [];
      }

      let inspectionRows = (await inspections().findMany()) ?? [];
      if (scope !== 'all') {
        const visibleDeviceSet = new Set(deviceRows.map((row) => row.id));
        inspectionRows = inspectionRows.filter((row) =>
          visibleDeviceSet.has(row.deviceId),
        );
      }

      const workload =
        scope === 'all'
          ? (await options.routing.engineerLoads()).map((load) => ({
              engineerId: load.id,
              name: load.name,
              open: load.openTickets,
            }))
          : [];

      return {
        scope,
        tickets: {
          total: ticketRows.length,
          open: ticketRows.filter((row) => openStatuses.includes(row.status))
            .length,
          pending: byStatus.pending ?? 0,
          urgent: ticketRows.filter(
            (row) =>
              row.priority === 'urgent' && openStatuses.includes(row.status),
          ).length,
          overdue: ticketRows.filter(
            (row) =>
              openStatuses.includes(row.status) &&
              row.slaDueAt != null &&
              row.slaDueAt < now,
          ).length,
          closed: byStatus.closed ?? 0,
          byStatus,
        },
        devices: {
          total: deviceRows.length,
          active: deviceRows.filter((row) => row.status === 'active').length,
          maintenance: deviceRows.filter((row) => row.status === 'maintenance')
            .length,
          disabled: deviceRows.filter((row) => row.status === 'disabled')
            .length,
        },
        inspections: {
          total: inspectionRows.length,
          planned: inspectionRows.filter((row) => row.status === 'planned')
            .length,
          inProgress: inspectionRows.filter(
            (row) => row.status === 'in_progress',
          ).length,
          overdue: inspectionRows.filter((row) => row.status === 'overdue')
            .length,
          completed: inspectionRows.filter((row) => row.status === 'completed')
            .length,
        },
        workload,
        generatedAt: new Date().toISOString(),
      };
    },
  };
}
