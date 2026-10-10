import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { loggingToken } from '@nocobase/app-server/logging';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import {
  defineSchedule,
  type ScheduleTargetStartResult,
} from '@nocobase/app-plugin-scheduler/server';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import { generateDueInspections } from '../services/inspections.js';
import { sendOverdueReminders } from '../services/orders.js';
import { manualIndexServiceToken } from '../services/tokens.js';
import type { DeviceManualRow } from '../services/types.js';
import type { ServiceRuntime } from '../services/context.js';

/**
 * The two background scans the service system runs on a schedule.
 *
 * Both are short, in-process scans: each one finishes inside `start()` and
 * reports `completed`, so no asynchronous job handle is needed. Each one is
 * idempotent through date-stamped idempotency keys, which is what makes a
 * repeated or overlapping run safe.
 */
export const INSPECTION_TARGET = 'app.inspection-generate';
export const OVERDUE_TARGET = 'app.overdue-reminder';
export const MANUAL_INDEX_TARGET = 'app.manual-index';

export default class ServiceSchedulerProvider extends ServiceProvider<Application> {
  public readonly name = 'app/service-scheduler';

  public override async boot(): Promise<void> {
    if (!this.app.container.has(schedulerServiceToken)) {
      this.app.container
        .resolve(loggingToken)
        .getLogger()
        .warn(
          'The scheduler is not registered; service scans were not scheduled.',
        );
      return;
    }
    const scheduler = this.app.container.resolve(schedulerServiceToken);

    scheduler.registerTarget({
      type: INSPECTION_TARGET,
      title: 'Generate due device inspections',
      validate: () => ({ valid: true }),
      start: async () =>
        this.runScan('inspection', async (runtime) => {
          const { created, notified } = await generateDueInspections(runtime);
          return { created, notified };
        }),
    });
    scheduler.registerTarget({
      type: OVERDUE_TARGET,
      title: 'Remind assignees about overdue orders',
      validate: () => ({ valid: true }),
      start: async () =>
        this.runScan('overdue', async (runtime) => {
          const sent = await sendOverdueReminders(runtime);
          return { sent };
        }),
    });
    scheduler.registerTarget({
      type: MANUAL_INDEX_TARGET,
      title: 'Load pending device manuals into the AI knowledge base',
      validate: () => ({ valid: true }),
      start: async () =>
        this.runScan('manual-index', async () => this.indexPendingManuals()),
    });

    scheduler.defineSchedule(
      defineSchedule({
        key: 'app.daily-inspection-scan',
        title: 'Daily device inspection scan',
        description:
          'Plans an inspection for every device whose next inspection date has arrived.',
        schedule: { cron: '0 9 * * *', timezone: 'Asia/Shanghai' },
        target: { type: INSPECTION_TARGET, config: {} },
      }),
    );
    // A controlled way to observe the same target and its execution record
    // without waiting for the daily firing. Scheduler exposes no "run now"
    // route, so an accelerated schedule is the only path that still goes
    // through the target, its occurrence history and its idempotency keys.
    // Both scans are date-stamped and safe to run repeatedly.
    scheduler.defineSchedule(
      defineSchedule({
        key: 'app.inspection-scan-test',
        title: 'Device inspection scan (accelerated test)',
        description:
          'Runs the same inspection target and records the same executions as the daily scan, every five minutes, for controlled testing.',
        schedule: { cron: '*/5 * * * *', timezone: 'Asia/Shanghai' },
        target: { type: INSPECTION_TARGET, config: {} },
      }),
    );
    scheduler.defineSchedule(
      defineSchedule({
        key: 'app.overdue-reminder-scan',
        title: 'Overdue service order reminders',
        description:
          'Notifies the assignee of every open order past its due date.',
        schedule: { cron: '0 */2 * * *', timezone: 'Asia/Shanghai' },
        target: { type: OVERDUE_TARGET, config: {} },
      }),
    );
    scheduler.defineSchedule(
      defineSchedule({
        key: 'app.overdue-reminder-test',
        title: 'Overdue service order reminders (accelerated test)',
        description:
          'Runs the same overdue-reminder target and records the same executions as the scheduled scan, every five minutes, for controlled testing.',
        schedule: { cron: '*/5 * * * *', timezone: 'Asia/Shanghai' },
        target: { type: OVERDUE_TARGET, config: {} },
      }),
    );
    scheduler.defineSchedule(
      defineSchedule({
        key: 'app.manual-index-scan',
        title: 'Device manual knowledge-base ingestion',
        description:
          'Retries knowledge-base ingestion for device manuals that are not loaded yet, and records the real outcome.',
        schedule: { cron: '30 6 * * *', timezone: 'Asia/Shanghai' },
        target: { type: MANUAL_INDEX_TARGET, config: {} },
      }),
    );
  }

  /**
   * Ingests every manual that is not in the knowledge base yet. The outcome is
   * whatever ingestion actually reported: a manual stays `uploaded`/`failed`
   * with the reason when the vector database or embedding model is missing.
   */
  private async indexPendingManuals(): Promise<Record<string, number>> {
    if (!this.app.container.has(manualIndexServiceToken)) {
      return { indexed: 0, ready: 0, failed: 0 };
    }
    const database = this.app.container.resolve(databaseManagerToken);
    const manuals = database.repository<DeviceManualRow>('device_manuals');
    const pending = await manuals.findMany({
      filter: (builder) =>
        builder.or([
          builder.string('status').eq('uploaded'),
          builder.string('status').eq('failed'),
        ]),
      limit: 50,
    });
    const index = this.app.container.resolve(manualIndexServiceToken);
    let ready = 0;
    let failed = 0;
    for (const manual of pending) {
      const outcome = await index.indexManual(manual.id);
      if (outcome.status === 'ready') {
        ready += 1;
      } else {
        failed += 1;
      }
    }
    return { indexed: pending.length, ready, failed };
  }

  private buildRuntime(): ServiceRuntime {
    const container = this.app.container;
    return {
      database: container.resolve(databaseManagerToken),
      notification: container.has(notificationServiceToken)
        ? container.resolve(notificationServiceToken)
        : undefined,
      drive: container.has(driveManagerToken)
        ? container.resolve(driveManagerToken)
        : undefined,
      logger: container
        .resolve(loggingToken)
        .getLogger()
        .child({ module: 'service-scheduler' }),
    };
  }

  private async runScan(
    label: string,
    scan: (runtime: ServiceRuntime) => Promise<Record<string, number>>,
  ): Promise<ScheduleTargetStartResult> {
    const logger = this.app.container.resolve(loggingToken).getLogger();
    try {
      const result = await scan(this.buildRuntime());
      logger.info({ scan: label, result }, 'Service scan finished');
      return { state: 'completed', outcome: 'succeeded', result };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      logger.error({ scan: label, error }, 'Service scan failed');
      return { state: 'failed', reason };
    }
  }
}
