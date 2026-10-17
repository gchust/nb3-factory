import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { loggingToken } from '@nocobase/app-server/logging';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import type { ScheduleExecutor } from '@nocobase/jobs';
import { ServiceProvider } from '@nocobase/service-provider';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication/server';
import { userManagementServiceToken } from '@nocobase/app-plugin-users/server';
import { createServiceDeskRecordAccess } from '../service-desk/record-access.js';
import { serviceDeskTickets } from '../service-desk/resources.js';
import { ServiceDeskService } from '../service-desk/service.js';
import { serviceDeskServiceToken } from '../service-desk/service-token.js';

export default class ServiceDeskProvider extends ServiceProvider<Application> {
  public readonly name = 'service-desk';

  private executor: ScheduleExecutor | undefined;

  public override register(): void {
    this.app.container.singleton(serviceDeskServiceToken, () => {
      const logger = this.app.container
        .resolve(loggingToken)
        .getLogger('service-desk');
      return new ServiceDeskService({
        database: this.app.container.resolve(databaseManagerToken),
        files: this.app.container.resolve(serverFileRepositoryManagerToken),
        drive: this.app.container.resolve(driveManagerToken),
        notifications: this.app.container.resolve(notificationServiceToken),
        userAdministration: this.app.container.resolve(
          userAdministrationServiceToken,
        ),
        userManagement: this.app.container.resolve(userManagementServiceToken),
        logger,
      });
    });
  }

  public override async boot(): Promise<void> {
    // An embedded runtime may compose the application providers without the
    // authorization plugin; the service desk feature is then unavailable.
    if (!this.app.container.has(authorizationToken)) return;
    const authz = this.app.container.resolve(authorizationToken);
    const database = this.app.container.resolve(databaseManagerToken);

    authz.database.collections.add({
      name: 'serviceDeskTickets',
      title: 'Service desk tickets',
    });
    authz.database.collections.add({
      name: 'serviceDeskComments',
      title: 'Service desk ticket activity',
    });

    for (const access of createServiceDeskRecordAccess(database)) {
      authz.recordAccess.define(access);
    }
    const reference = authz.compositeResources.define(serviceDeskTickets);
    authz.ui.sections.add({
      name: 'service-desk',
      title: 'Service desk',
      parent: 'business',
    });
    authz.ui.place(reference, { section: 'service-desk' });
  }

  public override async start(): Promise<void> {
    // Without the plugins this feature composes, there is no service to scan.
    if (
      !this.app.container.has(serverFileRepositoryManagerToken) ||
      !this.app.container.has(notificationServiceToken) ||
      !this.app.container.has(jobExecutorServiceToken)
    ) {
      return;
    }
    const serviceDesk = this.app.container.resolve(serviceDeskServiceToken);
    this.executor = this.app.container
      .resolve(jobExecutorServiceToken)
      .getScheduleExecutor('@nb3-factory/service-desk');
    await this.executor.addJob({
      name: 'overdue-scan',
      options: { cron: '*/30 * * * *' },
      payload: {},
      execute: async () => {
        await serviceDesk.scanOverdue();
      },
    });
    await this.executor.setup();
  }

  public override async shutdown(): Promise<void> {
    await this.executor?.shutdown();
    this.executor = undefined;
  }
}
