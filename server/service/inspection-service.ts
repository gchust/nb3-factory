import type { DatabaseManager, Repository } from '@nocobase/db';

import type { ServiceActor } from './access.js';
import { hasRole, isManager } from './access.js';
import type { Device, Inspection, InspectionStatus, Ticket } from './domain.js';
import {
  ServiceConflictError,
  ServiceForbiddenError,
  ServiceNotFoundError,
  ServiceValidationError,
} from './errors.js';
import type { ServiceRouting } from './routing-service.js';

export interface InspectionListQuery {
  readonly status?: InspectionStatus;
  readonly assigneeId?: number;
  readonly deviceId?: number;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface InspectionCreateInput {
  readonly deviceId?: number | null;
  readonly plannedDate?: string | null;
  readonly assigneeId?: number | null;
  readonly notes?: string | null;
}

export interface InspectionService {
  list(
    query: InspectionListQuery,
    actor: ServiceActor,
  ): Promise<{
    items: readonly (Inspection & {
      deviceNo?: string;
      deviceModel?: string;
      assigneeName?: string;
    })[];
    total: number;
    page: number;
    pageSize: number;
  }>;
  create(
    input: InspectionCreateInput,
    actor: ServiceActor,
  ): Promise<Inspection>;
  update(
    id: number,
    input: { notes?: string | null; assigneeId?: number | null },
    actor: ServiceActor,
  ): Promise<Inspection>;
  start(id: number, actor: ServiceActor): Promise<Inspection>;
  complete(
    id: number,
    input: {
      result?: string | null;
      notes?: string | null;
      createTicket?: boolean;
    },
    actor: ServiceActor,
  ): Promise<Inspection>;
  /** Plans one inspection per device whose next inspection date has arrived. */
  planDue(now?: Date): Promise<{ created: number; overdue: number }>;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function todayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function createInspectionService(
  database: DatabaseManager,
  options: {
    readonly routing: ServiceRouting;
    readonly actorName: (id: string) => Promise<string | undefined>;
  },
): InspectionService {
  const inspections = (): Repository<Inspection> =>
    database.repository<Inspection>('inspections');
  const devices = (): Repository<Device> =>
    database.repository<Device>('devices');
  const tickets = (): Repository<Ticket> =>
    database.repository<Ticket>('tickets');

  function scopeRows(rows: readonly Inspection[], actor: ServiceActor) {
    if (isManager(actor)) return rows;
    if (hasRole(actor, 'engineer')) {
      return rows.filter((row) => String(row.assigneeId ?? '') === actor.id);
    }
    return [];
  }

  async function requireInspection(id: number): Promise<Inspection> {
    const row = await inspections().findOne({ filter: { id } });
    if (!row) throw new ServiceNotFoundError('Inspection not found');
    return row;
  }

  return {
    async list(query, actor) {
      const pageSize = Math.min(Math.max(query.pageSize ?? 50, 1), 200);
      const page = Math.max(query.page ?? 1, 1);
      let rows = scopeRows((await inspections().findMany()) ?? [], actor);
      if (query.status)
        rows = rows.filter((row) => row.status === query.status);
      if (query.assigneeId) {
        rows = rows.filter((row) => row.assigneeId === query.assigneeId);
      }
      if (query.deviceId) {
        rows = rows.filter((row) => row.deviceId === query.deviceId);
      }
      rows = [...rows].sort((left, right) =>
        left.plannedDate === right.plannedDate
          ? left.id - right.id
          : left.plannedDate.localeCompare(right.plannedDate),
      );
      const deviceRows = (await devices().findMany()) ?? [];
      const deviceMap = new Map(
        deviceRows.map((device) => [device.id, device]),
      );
      const assigneeNames = new Map<number, string>();
      await Promise.all(
        rows
          .map((row) => row.assigneeId)
          .filter((id): id is number => id != null)
          .map(async (id) => {
            const name = await options.actorName(String(id));
            if (name) assigneeNames.set(id, name);
          }),
      );
      const all = rows.map((row) => ({
        ...row,
        deviceNo: deviceMap.get(row.deviceId)?.deviceNo,
        deviceModel: deviceMap.get(row.deviceId)?.model,
        assigneeName:
          row.assigneeId != null
            ? assigneeNames.get(row.assigneeId)
            : undefined,
      }));
      return {
        items: all.slice((page - 1) * pageSize, page * pageSize),
        total: all.length,
        page,
        pageSize,
      };
    },

    async create(input, actor) {
      if (!isManager(actor)) {
        throw new ServiceForbiddenError(
          'Only a supervisor may plan inspections',
        );
      }
      if (input.deviceId == null) {
        throw new ServiceValidationError('A device is required', {
          deviceId: 'required',
        });
      }
      if (!input.plannedDate || !DATE_ONLY.test(input.plannedDate)) {
        throw new ServiceValidationError('A planned date is required', {
          plannedDate: 'invalid',
        });
      }
      const device = await devices().findOne({
        filter: { id: input.deviceId },
      });
      if (!device) {
        throw new ServiceValidationError('Device does not exist', {
          deviceId: 'unknown',
        });
      }
      const duplicate = await inspections().findOne({
        filter: { deviceId: input.deviceId, plannedDate: input.plannedDate },
      });
      if (duplicate) {
        throw new ServiceConflictError(
          'An inspection already exists for that device and date',
        );
      }
      const nowIso = new Date().toISOString();
      const created = await inspections().createOne({
        values: {
          deviceId: input.deviceId,
          plannedDate: input.plannedDate,
          status: 'planned',
          assigneeId: input.assigneeId ?? null,
          result: null,
          notes: input.notes ?? null,
          ticketId: null,
          completedAt: null,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      });
      return created.record;
    },

    async update(id, input, actor) {
      const inspection = await requireInspection(id);
      const manager = isManager(actor);
      const assignee = String(inspection.assigneeId ?? '') === actor.id;
      if (!manager && !assignee) {
        throw new ServiceForbiddenError(
          'Only a supervisor or the assigned engineer may edit an inspection',
        );
      }
      if (inspection.status === 'completed') {
        throw new ServiceConflictError('A completed inspection is read-only');
      }
      const updated = await inspections().updateOne({
        filter: { id },
        values: {
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.assigneeId !== undefined && manager
            ? { assigneeId: input.assigneeId }
            : {}),
          updatedAt: new Date().toISOString(),
        },
      });
      return updated.record;
    },

    async start(id, actor) {
      const inspection = await requireInspection(id);
      const manager = isManager(actor);
      const assignee = String(inspection.assigneeId ?? '') === actor.id;
      if (!manager && !assignee) {
        throw new ServiceForbiddenError(
          'Only a supervisor or the assigned engineer may start an inspection',
        );
      }
      if (inspection.status === 'completed') {
        throw new ServiceConflictError('A completed inspection is read-only');
      }
      const updated = await inspections().updateOne({
        filter: { id },
        values: { status: 'in_progress', updatedAt: new Date().toISOString() },
      });
      return updated.record;
    },

    async complete(id, input, actor) {
      const inspection = await requireInspection(id);
      const manager = isManager(actor);
      const assignee = String(inspection.assigneeId ?? '') === actor.id;
      if (!manager && !assignee) {
        throw new ServiceForbiddenError(
          'Only a supervisor or the assigned engineer may complete an inspection',
        );
      }
      if (inspection.status === 'completed') {
        throw new ServiceConflictError('This inspection is already complete');
      }
      const nowIso = new Date().toISOString();
      let ticketId = inspection.ticketId;
      if (input.createTicket) {
        const device = await devices().findOne({
          filter: { id: inspection.deviceId },
        });
        const total = await tickets().count();
        const date = todayIso().replace(/-/g, '');
        const created = await tickets().createOne({
          values: {
            ticketNo: `T-${date}-${String(total + 1).padStart(4, '0')}`,
            title: `巡检发现故障：${device?.deviceNo ?? inspection.deviceId}`,
            description: input.notes ?? '巡检中发现设备故障',
            status: 'pending',
            priority: 'high',
            confidential: false,
            customerId: device?.customerId ?? null,
            deviceId: inspection.deviceId,
            assigneeId: inspection.assigneeId ?? null,
            reporterId: Number(actor.id) || null,
            source: 'internal',
            slaDueAt: null,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
        });
        ticketId = created.record.id;
      }
      const updated = await inspections().updateOne({
        filter: { id },
        values: {
          status: 'completed',
          result: input.result ?? 'normal',
          notes: input.notes ?? inspection.notes,
          ticketId,
          completedAt: nowIso,
          updatedAt: nowIso,
        },
      });
      const device = await devices().findOne({
        filter: { id: inspection.deviceId },
      });
      if (device) {
        const next = new Date();
        next.setMonth(next.getMonth() + 6);
        await devices().updateOne({
          filter: { id: device.id },
          values: { nextInspectionAt: next.toISOString(), updatedAt: nowIso },
        });
      }
      return updated.record;
    },

    async planDue(now = new Date()) {
      const today = todayIso(now);
      let createdCount = 0;
      let overdueCount = 0;
      const allInspections = (await inspections().findMany()) ?? [];
      const deviceRows = (await devices().findMany()) ?? [];
      const covered = new Set(
        allInspections
          .filter(
            (row) => row.status === 'planned' || row.status === 'in_progress',
          )
          .map((row) => `${row.deviceId}`),
      );
      for (const device of deviceRows) {
        if (device.status === 'disabled') continue;
        if (covered.has(`${device.id}`)) continue;
        if (!device.nextInspectionAt) continue;
        if (device.nextInspectionAt > now.toISOString()) continue;
        const plannedDate = today;
        if (
          allInspections.some(
            (row) =>
              row.deviceId === device.id && row.plannedDate === plannedDate,
          )
        ) {
          continue;
        }
        const engineer = await options.routing.pickEngineer();
        const nowIso = new Date().toISOString();
        await inspections().createOne({
          values: {
            deviceId: device.id,
            plannedDate,
            status: 'planned',
            assigneeId: engineer ? Number(engineer.id) || null : null,
            result: null,
            notes: null,
            ticketId: null,
            completedAt: null,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
        });
        createdCount += 1;
      }
      const stale = (await inspections().findMany()) ?? [];
      for (const row of stale) {
        if (
          (row.status === 'planned' || row.status === 'in_progress') &&
          row.plannedDate < today
        ) {
          await inspections().updateOne({
            filter: { id: row.id },
            values: { status: 'overdue', updatedAt: new Date().toISOString() },
          });
          overdueCount += 1;
        }
      }
      return { created: createdCount, overdue: overdueCount };
    },
  };
}
