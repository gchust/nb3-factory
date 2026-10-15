import type { Application } from '@nocobase/app-server/application';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import { loggingToken } from '@nocobase/app-server/logging';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import type { ScheduleExecutor } from '@nocobase/jobs';
import {
  ServiceProvider,
  type ServiceResolver,
} from '@nocobase/service-provider';

import { assignedToMe, myTickets, serviceDeskTickets } from './resources.js';
import { TicketWorkflow } from './service.js';
import { serviceDeskServiceToken } from './tokens.js';

/** The app-owned scope the recurring overdue scan runs under. */
const SCHEDULE_SCOPE = 'service-desk';
/** A schedule job name may not contain a colon. */
const OVERDUE_JOB = 'service-desk-overdue-scan';

/**
 * Wires the service desk into the application: the portable permission model,
 * the workflow service and the recurring overdue scan. Nothing here creates
 * schema — the migration does that — and nothing here grants access — the seed
 * creates the editable permission sets. The demonstration accounts and tickets
 * are installation data, installed by
 * `database/main/seeds/202611010003_service_desk_demo_data.ts`.
 */
export default class ServiceDeskProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/service-desk';

  private executor: ScheduleExecutor | undefined;

  public override register(): void {
    this.app.container.singleton(serviceDeskServiceToken, (resolver) =>
      createServiceDeskService(resolver),
    );
  }

  public override async boot(): Promise<void> {
    // The permission model belongs to the authorization plugin. An application
    // runtime without that plugin — a test scope or a stripped-down host — has
    // no permission system to declare it to, so skip rather than fail startup.
    if (!this.app.container.has(authorizationToken)) {
      return;
    }

    const authz = this.app.container.resolve(authorizationToken);

    // Code declares what the business supports; nobody is granted anything yet.
    authz.database.collections.add({
      name: 'tickets',
      title: 'Service tickets',
    });
    authz.recordAccess.define(assignedToMe);
    authz.recordAccess.define(myTickets);
    const reference = authz.compositeResources.define(serviceDeskTickets);

    // The permission workspace lists the composite under a business subsection
    // instead of the "Other" bucket an unplaced composite falls into.
    authz.ui.sections.add({
      name: 'serviceDesk',
      parent: 'business',
      title: 'Service desk',
      order: 100,
    });
    authz.ui.place(reference, { section: 'serviceDesk' });
  }

  public override async start(): Promise<void> {
    if (!this.app.container.has(authorizationToken)) {
      return;
    }

    const service = this.app.container.resolve(serviceDeskServiceToken);
    this.executor = this.app.container
      .resolve(jobExecutorServiceToken)
      .getScheduleExecutor(SCHEDULE_SCOPE);
    await this.executor.addJob({
      name: OVERDUE_JOB,
      // Hourly is enough: a ticket is overdue once it has been untouched for a
      // day, and `overdueNotifiedAt` stops the reminder from repeating.
      options: { cron: '0 * * * *', tz: 'UTC' },
      payload: {},
      execute: async () => {
        await service.sendOverdueReminders();
      },
    });
    await this.executor.setup();

    // Scan once at startup so overdue reminders are not held until the next
    // top of the hour. The run is idempotent: every ticket it notifies is
    // stamped with `overdueNotifiedAt`.
    void this.scanOverdue(service);
  }

  private async scanOverdue(service: TicketWorkflow): Promise<void> {
    try {
      await service.sendOverdueReminders();
    } catch (error) {
      this.app.container
        .resolveIfCreated(loggingToken)
        ?.getLogger('service-desk')
        .warn(`The startup overdue scan failed: ${String(error)}`);
    }
  }

  public override async shutdown(): Promise<void> {
    await this.executor?.shutdown();
  }
}

function createServiceDeskService(resolver: ServiceResolver): TicketWorkflow {
  const database: DatabaseManager = resolver.resolve(databaseManagerToken);
  const authorization = resolver.resolve(authorizationToken);
  // Notifications are optional, but must be created when the plugin is present:
  // `resolveIfCreated` only sees an instance someone else already asked for, and
  // this service is built while the routes are registered, before any provider's
  // `start()` has created the notification runtime. Assignments, resolutions and
  // the overdue scan would then silently send nothing.
  const notifications = resolver.has(notificationServiceToken)
    ? resolver.resolve(notificationServiceToken)
    : undefined;
  const logging = resolver.resolveIfCreated(loggingToken);
  const logger = logging?.getLogger('service-desk');
  return new TicketWorkflow({
    database,
    authorization,
    ...(notifications ? { notifications } : {}),
    ...(logger ? { logger } : {}),
  });
}
