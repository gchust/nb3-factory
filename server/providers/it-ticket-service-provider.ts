import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import { loggingToken } from '@nocobase/app-server/logging';
import { sampleDataToken } from '@nocobase/app-server/sample-data';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication/server';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import { userManagementServiceToken } from '@nocobase/app-plugin-users/server';
import { databaseManagerToken } from '@nocobase/db';
import type { ScheduleExecutor } from '@nocobase/jobs';
import { ServiceProvider } from '@nocobase/service-provider';

import {
  itTickets,
  itTicketsAssigned,
  itTicketsOwn,
} from '../it-ticket-resources.js';
import { seedItTicketSampleData } from '../sample-data/it-tickets.js';
import { ItTicketNotifier } from '../services/it-ticket-notifier.js';
import { ItTicketService } from '../services/it-ticket-service.js';
import { itTicketServiceToken } from '../services/it-ticket-token.js';

export const IT_TICKET_SCHEDULE_SCOPE = 'it-service-desk';

export default class ItTicketServiceProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/it-ticket-service-provider';

  private executor: ScheduleExecutor | undefined;

  public override register(): void {
    const container = this.app.container;
    // A minimal host may omit the plugins this feature integrates with. Their
    // absence leaves the service unregistered rather than failing startup.
    if (
      !container.has(databaseManagerToken) ||
      !container.has(authorizationToken) ||
      !container.has(userAdministrationServiceToken) ||
      !container.has(userManagementServiceToken) ||
      !container.has(notificationServiceToken)
    ) {
      return;
    }

    container.singleton(itTicketServiceToken, (services) => {
      const notifier = new ItTicketNotifier(
        services.resolve(notificationServiceToken),
        services.resolve(loggingToken).getLogger(IT_TICKET_SCHEDULE_SCOPE),
      );
      return new ItTicketService({
        database: services.resolve(databaseManagerToken),
        authz: services.resolve(authorizationToken),
        users: services.resolve(userAdministrationServiceToken),
        userManagement: services.resolve(userManagementServiceToken),
        notifier,
        publicBasePath: this.app.publicBasePath,
        drive: container.has(driveManagerToken)
          ? container.resolve(driveManagerToken)
          : undefined,
      });
    });
  }

  public override async boot(): Promise<void> {
    const container = this.app.container;
    if (!container.has(authorizationToken)) return;
    const authz = container.resolve(authorizationToken);

    authz.database.collections.add({ name: 'itTickets', title: 'IT tickets' });
    authz.recordAccess.define(itTicketsOwn);
    authz.recordAccess.define(itTicketsAssigned);
    const reference = authz.compositeResources.define(itTickets);
    authz.ui.sections.add({
      name: 'it-service-desk',
      title: 'IT service desk',
      parent: 'business',
    });
    authz.ui.place(reference, { section: 'it-service-desk' });

    if (container.has(sampleDataToken)) {
      container.resolve(sampleDataToken).register({
        name: 'it-service-desk/tickets',
        packageName: 'it-service-desk',
        run: () =>
          seedItTicketSampleData({
            database: container.resolve(databaseManagerToken),
            authz,
            userManagement: container.resolve(userManagementServiceToken),
          }),
      });
    }
  }

  public override async start(): Promise<void> {
    const container = this.app.container;
    if (
      !container.has(itTicketServiceToken) ||
      !container.has(jobExecutorServiceToken)
    ) {
      return;
    }
    const service = container.resolve(itTicketServiceToken);
    this.executor = container
      .resolve(jobExecutorServiceToken)
      .getScheduleExecutor(IT_TICKET_SCHEDULE_SCOPE);
    await this.executor.addJob({
      name: 'overdue-ticket-reminder',
      options: { every: 15 * 60 * 1000 },
      payload: {},
      execute: async () => {
        await service.remindOverdue();
      },
    });
    await this.executor.setup();
    // Remind about tickets that became overdue while the application was down
    // instead of waiting for the first interval to elapse.
    try {
      await service.remindOverdue();
    } catch (error) {
      container
        .resolve(loggingToken)
        .getLogger(IT_TICKET_SCHEDULE_SCOPE)
        .warn(
          `IT ticket overdue reminder failed at startup: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
    }
  }

  public override async shutdown(): Promise<void> {
    await this.executor?.shutdown();
  }
}
