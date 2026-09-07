import type { Application } from '@nocobase/app-server/application';
import { workflowServiceToken } from '@nocobase/app-plugin-workflow/server';
import { createCronJobManager, type CronJobManager } from '@nocobase/cron';
import { ServiceProvider } from '@nocobase/service-provider';

const APP_PACKAGE_NAME = '@nocobase/app-template-default';

/**
 * Schedules the daily overdue follow-up reminder. The job triggers the
 * `overdue-follow-up-reminder` workflow with the current UTC date and an
 * eventKey derived from that date, so the same day is never reminded twice
 * even if the job fires more than once.
 */
export default class OverdueReminderSchedulerProvider extends ServiceProvider<Application> {
  public readonly name: string = `${APP_PACKAGE_NAME}/overdue-reminder-scheduler`;

  private readonly manager: CronJobManager = createCronJobManager();

  public override async start(): Promise<void> {
    const workflow = this.app.container.resolve(workflowServiceToken);
    this.manager.addJob({
      cronTime: '0 1 * * *',
      start: true,
      runOnInit: false,
      timeZone: 'UTC',
      onTick: () => {
        const date = new Date().toISOString().slice(0, 10);
        void workflow
          .trigger(
            'overdue-follow-up-reminder',
            { date },
            { eventKey: `overdue-reminder:${date}` },
          )
          .catch((error: unknown) => {
            console.error(
              'Failed to trigger overdue follow-up reminder workflow',
              error,
            );
          });
      },
    });
    this.manager.start();
  }

  public override async shutdown(): Promise<void> {
    this.manager.close();
  }
}
