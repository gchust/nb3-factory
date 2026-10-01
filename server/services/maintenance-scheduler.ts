import { randomUUID } from 'node:crypto';

import { Schedule, type NocoBaseQueueManager } from '@nocobase/queue';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import { ServiceError } from './errors.js';

/**
 * The business result of one maintenance run. `created` is what the operation
 * actually produced (generated inspections or sent reminders), never a value
 * guessed from the request.
 */
export interface MaintenanceRunOutcome {
  readonly status: 'succeeded' | 'failed';
  readonly created: number;
  readonly reason?: string;
}

/**
 * The narrow seam a maintenance target uses to hand its own result back to the
 * request that triggered it. A cron firing has no request, so `runToken` is
 * absent and the result is simply not correlated.
 */
export interface MaintenanceRunRecorder {
  record(
    targetType: string,
    runToken: string | undefined,
    outcome: MaintenanceRunOutcome,
  ): void;
}

/** Controlled immediate execution of one of the application's Scheduler plans. */
export interface MaintenanceTrigger {
  runImmediately(targetType: string): Promise<MaintenanceRunOutcome>;
}

/**
 * How a route reaches controlled immediate execution. The Scheduler package
 * exposes no run-now entry point, so this application-owned seam triggers the
 * real Scheduler plan and reports the outcome the target itself produced.
 */
export const maintenanceTriggerToken: ServiceToken<MaintenanceTrigger> =
  createServiceToken<MaintenanceTrigger>('app/maintenance-trigger');

/** Reads the correlation token a controlled trigger puts in the target config. */
export const RUN_TOKEN_KEY = 'runToken';

/** Reads the correlation token a controlled trigger puts in the target config. */
export function readRunToken(config: unknown): string | undefined {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return undefined;
  }
  const token = (config as Record<string, unknown>)[RUN_TOKEN_KEY];
  return typeof token === 'string' && token.length > 0 ? token : undefined;
}

/**
 * Correlates a target's own `start()` result with the request that triggered
 * it. The Scheduler records the occurrence, but its history is private to the
 * Scheduler package; this short-lived map is only how the application reports
 * the business count back to the supervisor who asked for the run.
 */
export class MaintenanceRunLog implements MaintenanceRunRecorder {
  readonly #outcomes = new Map<string, MaintenanceRunOutcome>();

  public record(
    _targetType: string,
    runToken: string | undefined,
    outcome: MaintenanceRunOutcome,
  ): void {
    if (runToken) this.#outcomes.set(runToken, outcome);
  }

  public take(runToken: string): MaintenanceRunOutcome | undefined {
    const outcome = this.#outcomes.get(runToken);
    if (outcome) this.#outcomes.delete(runToken);
    return outcome;
  }
}

type ScheduleAdapter = NonNullable<ConstructorParameters<typeof Schedule>[1]>;

/**
 * Runs one of this application's Scheduler plans on the caller's request,
 * through the same target and the same occurrence records the cron schedule
 * uses. The dispatch runs on the in-process synchronous Queue connection, so
 * the caller learns the real business result instead of a fire-and-forget
 * acknowledgement. A failed target is reported as a failure with its own
 * reason, never as success.
 */
export function createMaintenanceTrigger(options: {
  queue: () => NocoBaseQueueManager;
  log: MaintenanceRunLog;
}): MaintenanceTrigger {
  return {
    async runImmediately(targetType: string): Promise<MaintenanceRunOutcome> {
      const manager = options.queue();
      const schedules = await manager.schedules('schedule').list();
      const data = schedules.find(
        (entry) => readTargetType(entry.payload) === targetType,
      );
      if (!data) {
        throw new ServiceError(
          'SCHEDULE_NOT_FOUND',
          503,
          `No Scheduler plan targets ${targetType}.`,
        );
      }

      const runToken = randomUUID();
      const payload = withRunToken(data.payload, targetType, runToken);
      const adapter = manager.use('sync') as ScheduleAdapter;
      try {
        await new Schedule(data, adapter).trigger(payload);
      } catch (error) {
        throw new ServiceError(
          'SCHEDULE_RUN_FAILED',
          500,
          error instanceof Error ? error.message : String(error),
        );
      }

      const outcome = options.log.take(runToken);
      if (!outcome) {
        throw new ServiceError(
          'SCHEDULE_NOT_EXECUTED',
          503,
          `The Scheduler did not execute the ${targetType} target.`,
        );
      }
      if (outcome.status === 'failed') {
        throw new ServiceError(
          'SCHEDULE_RUN_FAILED',
          500,
          outcome.reason ?? 'The scheduled operation failed.',
        );
      }
      return outcome;
    },
  };
}

function readTargetType(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const target = (payload as { target?: unknown }).target;
  if (!target || typeof target !== 'object') return undefined;
  const type = (target as { type?: unknown }).type;
  return typeof type === 'string' ? type : undefined;
}

function withRunToken(
  payload: unknown,
  targetType: string,
  runToken: string,
): Record<string, unknown> {
  const base =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : {};
  const target =
    base.target && typeof base.target === 'object'
      ? (base.target as Record<string, unknown>)
      : {};
  const config =
    target.config &&
    typeof target.config === 'object' &&
    !Array.isArray(target.config)
      ? (target.config as Record<string, unknown>)
      : {};
  return {
    ...base,
    target: {
      ...target,
      type: targetType,
      config: { ...config, [RUN_TOKEN_KEY]: runToken },
    },
  };
}
