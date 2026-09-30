// @vitest-environment node
import { Schedule } from '@nocobase/queue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppQueueConfig } from '@nocobase/queue';

import {
  DAILY_INSPECTION_SCHEDULE,
  OVERDUE_REMINDER_SCHEDULE,
  ServiceScheduleNotFoundError,
  ServiceScheduleService,
  scheduleConnection,
} from '../../server/providers/service-schedules.js';

vi.mock('@nocobase/queue', () => ({
  Schedule: { list: vi.fn() },
}));

const listMock = vi.mocked(Schedule.list);

const databaseConfig: AppQueueConfig = {
  default: 'database',
  connections: {
    database: { driver: 'database' },
    sync: { driver: 'sync' },
  },
  queues: { schedule: { connection: 'database' } },
};

const syncConfig: AppQueueConfig = {
  default: 'sync',
  connections: { sync: { driver: 'sync' } },
};

function fakeManager(): Record<string, unknown> {
  const manager: Record<string, unknown> = {
    init: vi.fn(async () => undefined),
  };
  // The service reaches the queue's real adapter through this method.
  manager['use'] = () => ({});
  return manager;
}

function fakeApp(config: AppQueueConfig | undefined): never {
  return {
    config: { get: () => config },
    container: { has: () => true, resolve: () => fakeManager() },
  } as never;
}

interface ProjectionOptions {
  readonly runCount?: number;
  readonly lastRunAt?: Date | null;
  readonly nextRunAt?: Date | null;
  readonly status?: string;
  readonly id?: string;
}

/** A queue projection shaped like the `Schedule` instance the real queue returns. */
function projection(targetType: string, options: ProjectionOptions = {}) {
  return {
    id: options.id ?? `id-${targetType}`,
    status: options.status ?? 'active',
    runCount: options.runCount ?? 0,
    lastRunAt: options.lastRunAt ?? null,
    nextRunAt: options.nextRunAt ?? null,
    payload: { target: { type: targetType } },
    trigger: vi.fn(async () => undefined),
  };
}

describe('schedule connection resolution', () => {
  it('ignores a queue whose connection cannot store schedules', () => {
    expect(scheduleConnection(fakeApp(syncConfig))).toBeUndefined();
  });

  it('uses the schedule queue connection when one is configured', () => {
    expect(scheduleConnection(fakeApp(databaseConfig))).toBe('database');
  });

  it('ignores a missing queue configuration', () => {
    expect(scheduleConnection(fakeApp(undefined))).toBeUndefined();
  });
});

describe('ServiceScheduleService', () => {
  beforeEach(() => {
    listMock.mockReset();
  });

  it('merges the queue projection over each domain schedule', async () => {
    const lastRunAt = new Date('2026-01-01T01:00:00.000Z');
    const nextRunAt = new Date('2026-01-02T01:00:00.000Z');
    listMock.mockResolvedValue([
      projection(DAILY_INSPECTION_SCHEDULE.targetType, {
        runCount: 4,
        lastRunAt,
        nextRunAt,
      }),
    ] as never);

    const service = new ServiceScheduleService(
      fakeApp(databaseConfig),
      'database',
    );
    const schedules = await service.list();

    expect(schedules).toHaveLength(2);
    expect(schedules[0]).toEqual({
      key: DAILY_INSPECTION_SCHEDULE.key,
      title: DAILY_INSPECTION_SCHEDULE.title,
      targetType: DAILY_INSPECTION_SCHEDULE.targetType,
      cron: DAILY_INSPECTION_SCHEDULE.cron,
      timezone: DAILY_INSPECTION_SCHEDULE.timezone,
      scheduleId: `id-${DAILY_INSPECTION_SCHEDULE.targetType}`,
      enabled: true,
      nextRunAt: nextRunAt.toISOString(),
      lastRunAt: lastRunAt.toISOString(),
      runCount: 4,
    });
    // The other definition still appears, without runtime state.
    expect(schedules[1]).toMatchObject({
      key: OVERDUE_REMINDER_SCHEDULE.key,
      scheduleId: null,
      enabled: false,
      runCount: 0,
    });
  });

  it('reports a paused projection as disabled', async () => {
    listMock.mockResolvedValue([
      projection(DAILY_INSPECTION_SCHEDULE.targetType, { status: 'paused' }),
    ] as never);

    const service = new ServiceScheduleService(
      fakeApp(databaseConfig),
      'database',
    );
    const [daily] = await service.list();

    expect(daily.enabled).toBe(false);
  });

  it('returns no schedules when the queue has no schedule connection', async () => {
    const service = new ServiceScheduleService(fakeApp(syncConfig), undefined);
    await expect(service.list()).resolves.toEqual([
      expect.objectContaining({ scheduleId: null }),
      expect.objectContaining({ scheduleId: null }),
    ]);
    expect(listMock).not.toHaveBeenCalled();
  });

  it('rejects an unregistered schedule key', async () => {
    const service = new ServiceScheduleService(
      fakeApp(databaseConfig),
      'database',
    );
    await expect(service.trigger('service.unknown')).rejects.toBeInstanceOf(
      ServiceScheduleNotFoundError,
    );
    expect(listMock).not.toHaveBeenCalled();
  });

  it('triggers the real projection for a known schedule', async () => {
    const daily = projection(DAILY_INSPECTION_SCHEDULE.targetType);
    listMock.mockResolvedValue([daily] as never);

    const service = new ServiceScheduleService(
      fakeApp(databaseConfig),
      'database',
    );
    const view = await service.trigger(DAILY_INSPECTION_SCHEDULE.key);

    expect(daily.trigger).toHaveBeenCalledTimes(1);
    expect(view.scheduleId).toBe(daily.id);
  });
});
