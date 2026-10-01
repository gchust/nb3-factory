import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import { loggingToken } from '@nocobase/app-server/logging';
import { queueManagerToken } from '@nocobase/app-server/queue';
import { ServiceProvider } from '@nocobase/service-provider';

import {
  createInspectionGenerationTarget,
  createOverdueReminderTarget,
  createScheduleDefinitions,
} from '../business/scheduled-tasks.js';
import {
  createMaintenanceTrigger,
  MaintenanceRunLog,
  maintenanceTriggerToken,
} from '../services/maintenance-scheduler.js';
import { serviceDeskToken } from '../services/service-desk.js';

/**
 * Declares this application's two recurring maintenance tasks. Registration
 * happens in `boot()`: the scheduler plugin registers its service during
 * `register()`, and schedules must be defined before the scheduler syncs them
 * during `start()`. The scheduler plugin is optional, so a missing token is a
 * normal condition and leaves the rest of the application working.
 */
export default class ScheduledTasksProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/scheduled-tasks-provider';

  public override async boot(): Promise<void> {
    if (!this.app.container.has(schedulerServiceToken)) return;
    const scheduler = this.app.container.resolve(schedulerServiceToken);
    const getService = () => this.app.container.resolve(serviceDeskToken);
    // One recorder is shared by the targets and by the controlled-trigger
    // service, so a supervisor's run-now request learns the real business
    // count the target produced. Cron firings have no request to answer and
    // simply do not correlate.
    const runLog = new MaintenanceRunLog();

    scheduler.registerTarget(
      createInspectionGenerationTarget(getService, runLog),
    );
    scheduler.registerTarget(createOverdueReminderTarget(getService, runLog));
    for (const definition of createScheduleDefinitions()) {
      scheduler.defineSchedule(definition);
    }

    // Bound only when the Scheduler is present: without it there is no plan to
    // trigger, and the maintenance routes fall back to running the operation
    // directly.
    this.app.container.singleton(maintenanceTriggerToken, () =>
      createMaintenanceTrigger({
        queue: () => this.app.container.resolve(queueManagerToken),
        log: runLog,
      }),
    );

    this.app.container
      .resolve(loggingToken)
      .getLogger('service-desk')
      .info('scheduled tasks registered (inspections, overdue reminders)');
  }
}
