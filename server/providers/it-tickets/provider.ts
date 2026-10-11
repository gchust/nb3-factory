import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import type { ScheduleExecutor } from '@nocobase/jobs';
import {
  ServiceProvider,
  type ServiceResolver,
} from '@nocobase/service-provider';

import {
  createItTicketService,
  itTicketServiceToken,
  type ItTicketService,
} from './service.js';
import { registerItTicketSampleData } from './sample-data.js';

/**
 * The scope the service desk's recurring reminder job belongs to. The jobs service names a queue and a state file
 * after it, so it is a package-shaped name rather than a path.
 */
const JOB_SCOPE = '@nb3-factory/it-tickets';
const REMINDER_JOB = 'it-ticket-overdue-reminder';

/**
 * Binds the service desk service and starts the one recurring job it needs:
 * every fifteen minutes it asks the service whether a ticket has waited over
 * a day, and the service sends the reminders and records that it did. `start`
 * only decides when `scanOverdueReminders` runs; the behavior stays testable
 * by calling that method directly.
 */
export default class ItTicketsProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/it-tickets-provider';

  private executor: ScheduleExecutor | undefined;

  public override register(): void {
    this.app.container.singleton(
      itTicketServiceToken,
      (resolver: ServiceResolver) =>
        createItTicketService({
          app: this.app,
          database: resolver.resolve(databaseManagerToken),
          authz: resolver.has(authorizationToken)
            ? resolver.resolve(authorizationToken)
            : undefined,
          config: this.app.config,
        }),
    );
  }

  public override boot(): Promise<void> {
    // Example data goes through the users plugin and the ticket service, so it is built after every provider's
    // `boot()` rather than by a seed, which only sees `idGeneratorToken`.
    registerItTicketSampleData(this.app);
    return Promise.resolve();
  }

  public override async start(): Promise<void> {
    const jobService = this.app.container.resolve(jobExecutorServiceToken);
    this.executor = jobService.getScheduleExecutor(JOB_SCOPE);
    await this.executor.addJob({
      name: REMINDER_JOB,
      options: { cron: '*/15 * * * *' },
      payload: {},
      execute: async (): Promise<void> => {
        const service =
          this.app.container.resolve<ItTicketService>(itTicketServiceToken);
        await service.scanOverdueReminders();
      },
    });
    await this.executor.setup();
  }

  public override async shutdown(): Promise<void> {
    await this.executor?.shutdown();
    this.executor = undefined;
  }
}
