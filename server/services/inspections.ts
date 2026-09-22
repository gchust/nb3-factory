import type { Application } from '@nocobase/app-server/application';
import { loggingToken } from '@nocobase/app-server/logging';
import { databaseManagerToken, type Row } from '@nocobase/db';
import {
  requireCapability,
  seesEveryRegion,
  type ServiceCaller,
} from './service-auth.js';
import { insertReturning, updateReturning } from './db.js';
import { ServiceRuleError } from './tickets.js';
import { asText } from './values.js';

export interface GenerateResult {
  date: string;
  created: number;
  skipped: number;
}

export interface JobRunInput {
  kind: string;
  referenceId?: number | null;
  status: 'succeeded' | 'failed';
  result?: unknown;
  error?: string | null;
  triggeredBy: string;
  startedAt: Date;
}

export function todayInShanghai(now = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now);
}

export class InspectionService {
  constructor(private readonly app: Application) {}

  private get database() {
    return this.app.container.resolve(databaseManagerToken);
  }

  private get query() {
    return this.database.query();
  }

  /**
   * Idempotent daily generation: `(deviceId, taskDate)` is unique, so running
   * the schedule twice on the same day creates nothing the second time.
   */
  async generate(
    input: {
      planId?: number;
      date?: string;
      triggeredBy?: string;
      enabledOnly?: boolean;
    } = {},
  ): Promise<GenerateResult> {
    const date = input.date ?? todayInShanghai();
    const startedAt = new Date();
    try {
      const result = await this.generateOnce({
        ...input,
        date,
        enabledOnly: input.enabledOnly ?? true,
      });
      await this.recordRun({
        kind: 'inspection',
        referenceId: input.planId ?? null,
        status: 'succeeded',
        result,
        triggeredBy: input.triggeredBy ?? 'schedule',
        startedAt,
      });
      return result;
    } catch (error) {
      await this.recordRun({
        kind: 'inspection',
        referenceId: input.planId ?? null,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        triggeredBy: input.triggeredBy ?? 'schedule',
        startedAt,
      });
      throw error;
    }
  }

  private async generateOnce(input: {
    planId?: number;
    date: string;
    enabledOnly: boolean;
  }): Promise<GenerateResult> {
    const date = input.date;
    let planQuery = this.query.selectFrom('serviceInspectionPlans').selectAll();
    if (input.enabledOnly) planQuery = planQuery.where('enabled', '=', true);
    if (input.planId) planQuery = planQuery.where('id', '=', input.planId);
    const plans = await planQuery.execute();
    let created = 0;
    let skipped = 0;
    for (const plan of plans) {
      let deviceQuery = this.query
        .selectFrom('serviceDevices')
        .selectAll()
        .where('enabled', '=', true);
      if (plan.region)
        deviceQuery = deviceQuery.where('region', '=', asText(plan.region));
      const devices = await deviceQuery.execute();
      let planAssignee: string | null = null;
      if (plan.region) {
        const engineer = await this.query
          .selectFrom('serviceMembers')
          .select('userId')
          .where('region', '=', asText(plan.region))
          .orderBy('id', 'asc')
          .executeTakeFirst();
        planAssignee = engineer ? String(engineer.userId) : null;
      }
      for (const device of devices) {
        const existing = await this.query
          .selectFrom('serviceInspectionTasks')
          .select('id')
          .where('deviceId', '=', Number(device.id))
          .where('taskDate', '=', date)
          .executeTakeFirst();
        if (existing) {
          skipped += 1;
          continue;
        }
        const now = new Date();
        await this.query
          .insertInto('serviceInspectionTasks')
          .values({
            planId: Number(plan.id),
            deviceId: Number(device.id),
            taskDate: date,
            status: 'pending',
            assigneeId:
              (device.ownerId ? asText(device.ownerId) : null) ?? planAssignee,
            note: null,
            completedAt: null,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        created += 1;
      }
      await this.query
        .updateTable('serviceInspectionPlans')
        .set({ lastRunAt: new Date(), updatedAt: new Date() })
        .where('id', '=', Number(plan.id))
        .execute();
    }
    return { date, created, skipped };
  }

  /** Append an execution record. History is never updated in place. */
  private async recordRun(input: JobRunInput): Promise<void> {
    const now = new Date();
    try {
      await this.query
        .insertInto('serviceJobRuns')
        .values({
          kind: input.kind,
          referenceId: input.referenceId ?? null,
          status: input.status,
          result: input.result === undefined ? null : input.result,
          error: input.error ?? null,
          triggeredBy: input.triggeredBy,
          startedAt: input.startedAt,
          finishedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    } catch (error) {
      // Reporting must never break the job it reports on. If the history table
      // is unavailable the execution still succeeds and the reason is logged.
      if (this.app.container.has(loggingToken))
        this.app.container
          .resolve(loggingToken)
          .getLogger()
          .warn(
            { error: error instanceof Error ? error.message : String(error) },
            'Service job run could not be recorded',
          );
    }
  }

  /** Tasks with device labels attached; the join is done in memory to keep the portable builder simple. */
  async list(
    caller: ServiceCaller,
    filters: {
      date?: string;
      status?: string;
      region?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    await requireCapability(caller, 'inspections.view');
    const deviceRegion = filters.region ?? null;
    const globalRead =
      caller.capabilities['inspections.manage'] === true ||
      seesEveryRegion(caller);
    const scopeRegion = globalRead ? null : caller.region;
    const region = deviceRegion ?? scopeRegion;
    let query = this.query.selectFrom('serviceInspectionTasks').selectAll();
    if (filters.date) query = query.where('taskDate', '=', filters.date);
    if (filters.status) query = query.where('status', '=', filters.status);
    if (!globalRead && !caller.region) {
      // A caller with no region scope only sees tasks assigned to them.
      query = query.where('assigneeId', '=', caller.id);
    }
    const tasks = await query
      .orderBy('taskDate', 'desc')
      .orderBy('id', 'asc')
      .limit(500)
      .execute();

    const deviceIds = [...new Set(tasks.map((task) => Number(task.deviceId)))];
    const devices = deviceIds.length
      ? await this.query
          .selectFrom('serviceDevices')
          .selectAll()
          .where('id', 'in', deviceIds)
          .execute()
      : [];
    const deviceById = new Map(
      devices.map((device) => [Number(device.id), device]),
    );
    const decorated = tasks
      .map((task) => {
        const device = deviceById.get(Number(task.deviceId));
        return {
          ...task,
          deviceName: device?.name ?? null,
          deviceCode: device?.code ?? null,
          deviceRegion: device?.region ?? null,
        };
      })
      .filter((task) => (region ? task.deviceRegion === region : true));

    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 50));
    const start = (page - 1) * pageSize;
    const plans = await this.listPlans(caller);
    return {
      date: filters.date ?? todayInShanghai(),
      plans,
      items: decorated.slice(start, start + pageSize),
      total: decorated.length,
      page,
      pageSize,
    };
  }

  /** Inspection plans the caller may see, newest first. */
  async listPlans(caller: ServiceCaller) {
    await requireCapability(caller, 'inspections.view');
    const globalRead =
      caller.capabilities['inspections.manage'] === true ||
      seesEveryRegion(caller);
    let query = this.query.selectFrom('serviceInspectionPlans').selectAll();
    if (!globalRead && caller.region) {
      const region = caller.region;
      query = query.where((builder) =>
        builder.or([
          builder('region', 'is', null),
          builder('region', '=', region),
        ]),
      );
    }
    return await query.orderBy('id', 'asc').execute();
  }

  /** Enable or disable a plan without deleting it, so its history survives. */
  async setPlanEnabled(caller: ServiceCaller, id: number, enabled: boolean) {
    await requireCapability(caller, 'inspections.manage');
    const plan = await this.query
      .selectFrom('serviceInspectionPlans')
      .select('id')
      .where('id', '=', id)
      .executeTakeFirst();
    if (!plan) throw new ServiceRuleError('Inspection plan not found', 404);
    return await updateReturning(
      this.query,
      'serviceInspectionPlans',
      { enabled, updatedAt: new Date() },
      { id },
    );
  }

  /**
   * A controlled immediate execution entry point for a business administrator.
   * It runs the same generation path as the schedule and records a run with the
   * operator as the trigger, so the result can be verified without waiting a
   * day. It is reachable only through `inspections.manage`.
   */
  async runPlan(caller: ServiceCaller, id: number, date?: string) {
    await requireCapability(caller, 'inspections.manage');
    const plan = await this.query
      .selectFrom('serviceInspectionPlans')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!plan) throw new ServiceRuleError('Inspection plan not found', 404);
    const result = await this.generate({
      planId: id,
      date,
      enabledOnly: false,
      triggeredBy: `manual:${caller.name}`,
    });
    return { plan, result };
  }

  /** Append-only execution history for the inspection schedule. */
  async listRuns(
    caller: ServiceCaller,
    filters: { page?: number; pageSize?: number } = {},
  ) {
    await requireCapability(caller, 'inspections.view');
    const rows = await this.query
      .selectFrom('serviceJobRuns')
      .selectAll()
      .where('kind', '=', 'inspection')
      .orderBy('id', 'desc')
      .limit(200)
      .execute();
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    const start = (page - 1) * pageSize;
    return {
      items: rows.slice(start, start + pageSize),
      total: rows.length,
      page,
      pageSize,
    };
  }

  async complete(
    caller: ServiceCaller,
    id: number,
    note?: string,
  ): Promise<Row> {
    const task = await this.query
      .selectFrom('serviceInspectionTasks')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!task) throw new ServiceRuleError('Inspection task not found', 404);
    const isAssignee = asText(task.assigneeId) === caller.id;
    if (!caller.capabilities['inspections.manage'] && !isAssignee)
      throw new ServiceRuleError('Inspection task is not accessible', 403);
    if (String(task.status) === 'completed') return task;
    const now = new Date();
    return updateReturning(
      this.query,
      'serviceInspectionTasks',
      {
        status: 'completed',
        note: note ?? null,
        completedAt: now,
        updatedAt: now,
      },
      { id },
    );
  }

  async createPlan(
    caller: ServiceCaller,
    input: { name: string; region?: string; cron?: string; timezone?: string },
  ) {
    await requireCapability(caller, 'inspections.manage');
    if (!input.name?.trim()) throw new ServiceRuleError('Name is required');
    const now = new Date();
    return insertReturning(
      this.query,
      'serviceInspectionPlans',
      {
        name: input.name.trim(),
        region: input.region ?? null,
        cron: input.cron ?? '0 9 * * *',
        timezone: input.timezone ?? 'Asia/Shanghai',
        enabled: true,
        lastRunAt: null,
        createdAt: now,
        updatedAt: now,
      },
      { name: input.name.trim() },
    );
  }
}
