import type { Application } from '@nocobase/app-server/application';
import type { AppQueueConfig, NocoBaseQueueManager } from '@nocobase/queue';
import { Schedule } from '@nocobase/queue';
import { queueManagerToken } from '@nocobase/app-server/queue';

/**
 * The two scheduled tasks the after-sales domain registers, and the pieces the
 * run-now surface needs to describe them.
 *
 * The Scheduler plugin's Settings page and API are read-only: it has no
 * trigger, and its store, target registry and occurrence history are private
 * to the package. The application therefore owns the controlled immediate run
 * and reaches the *same* schedule through the Queue package's public
 * `Schedule.trigger()` — the queue projects every schedule the Scheduler
 * materializes, and `trigger()` dispatches the real `ScheduleDispatchJob` with
 * the real schedule id and payload, so the execution record the Scheduler
 * shows is the one this call produced.
 */
export interface ServiceScheduleDefinition {
  /** Stable identity of the schedule, matching `defineSchedule({ key })`. */
  readonly key: string;
  /** English fallback; the client renders its own localized title. */
  readonly title: string;
  /** The Scheduler target type the schedule fires. */
  readonly targetType: string;
  /** Cron expression the Scheduler materializes. */
  readonly cron: string;
  /** IANA timezone of the cron expression. */
  readonly timezone: string;
}

export const DAILY_INSPECTION_SCHEDULE: ServiceScheduleDefinition = {
  key: 'service.daily-inspection',
  title: 'Daily device inspection',
  targetType: 'app.service.daily-inspections',
  cron: '0 9 * * *',
  timezone: 'Asia/Shanghai',
};

export const OVERDUE_REMINDER_SCHEDULE: ServiceScheduleDefinition = {
  key: 'service.overdue-reminder',
  title: 'Overdue work-order reminder',
  targetType: 'app.service.overdue-reminders',
  cron: '30 9 * * *',
  timezone: 'Asia/Shanghai',
};

export const SERVICE_SCHEDULE_DEFINITIONS: readonly ServiceScheduleDefinition[] =
  [DAILY_INSPECTION_SCHEDULE, OVERDUE_REMINDER_SCHEDULE];

/** One schedule with the queue projection merged over its definition. */
export interface ServiceScheduleView {
  readonly key: string;
  readonly title: string;
  readonly targetType: string;
  readonly cron: string;
  readonly timezone: string;
  /** The queue schedule id, absent when the manifest has not been synced yet. */
  readonly scheduleId: string | null;
  readonly enabled: boolean;
  readonly nextRunAt: string | null;
  readonly lastRunAt: string | null;
  readonly runCount: number;
}

export class ServiceScheduleNotFoundError extends Error {
  public constructor(key: string) {
    super(`Schedule "${key}" is not registered.`);
    this.name = 'ServiceScheduleNotFoundError';
  }
}

/**
 * Runs one of the domain schedules on demand through the queue's public
 * schedule API. Reads only the queue projection, never the Scheduler plugin's
 * private store; the Scheduler still owns the occurrence record the run
 * produces.
 */
export class ServiceScheduleService {
  public constructor(
    private readonly app: Application,
    private readonly connection: string | undefined,
  ) {}

  /** The registered schedules, each merged with its live queue projection. */
  public async list(): Promise<readonly ServiceScheduleView[]> {
    const schedules = await this.load();
    return SERVICE_SCHEDULE_DEFINITIONS.map((definition) => {
      const schedule = schedules.find(
        (candidate) => targetTypeOf(candidate) === definition.targetType,
      );
      return viewOf(definition, schedule);
    });
  }

  /**
   * Dispatches the schedule's real target immediately. The call honours the
   * schedule's own `limit` (through the queue) and does not require the
   * automatic schedule to be enabled: this is an explicit operator action, so
   * an administrator can exercise a paused schedule to verify it.
   */
  public async trigger(key: string): Promise<ServiceScheduleView> {
    const definition = SERVICE_SCHEDULE_DEFINITIONS.find(
      (candidate) => candidate.key === key,
    );
    if (!definition) throw new ServiceScheduleNotFoundError(key);
    const schedules = await this.load();
    const schedule = schedules.find(
      (candidate) => targetTypeOf(candidate) === definition.targetType,
    );
    if (!schedule) throw new ServiceScheduleNotFoundError(key);
    await schedule.trigger();
    return viewOf(definition, schedule);
  }

  private async load(): Promise<readonly Schedule[]> {
    const manager = this.manager();
    if (!manager || !this.connection) return [];
    await manager.init();
    const adapter = manager.use(this.connection) as never;
    return Schedule.list({}, { adapter: () => adapter });
  }

  private manager(): NocoBaseQueueManager | undefined {
    const container = this.app.container;
    if (!container.has(queueManagerToken)) return undefined;
    return container.resolve(queueManagerToken);
  }
}

/**
 * The connection the `schedule` queue projects to, or `undefined` when the
 * application has no scheduler (the default `sync` connection cannot store
 * schedules).
 */
export function scheduleConnection(app: Application): string | undefined {
  const config = app.config.get<AppQueueConfig>('queue');
  if (!config) return undefined;
  const connection = config.queues?.schedule?.connection ?? config.default;
  return config.connections[connection]?.driver === 'sync'
    ? undefined
    : connection;
}

function targetTypeOf(schedule: Schedule): string | undefined {
  const payload: unknown = schedule.payload;
  if (!payload || typeof payload !== 'object') return undefined;
  const target = (payload as { target?: unknown }).target;
  if (!target || typeof target !== 'object') return undefined;
  const type = (target as { type?: unknown }).type;
  return typeof type === 'string' ? type : undefined;
}

function viewOf(
  definition: ServiceScheduleDefinition,
  schedule: Schedule | undefined,
): ServiceScheduleView {
  return {
    key: definition.key,
    title: definition.title,
    targetType: definition.targetType,
    cron: definition.cron,
    timezone: definition.timezone,
    scheduleId: schedule?.id ?? null,
    enabled: schedule?.status === 'active',
    nextRunAt: isoOf(schedule?.nextRunAt ?? null),
    lastRunAt: isoOf(schedule?.lastRunAt ?? null),
    runCount: schedule?.runCount ?? 0,
  };
}

function isoOf(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
