import type { Application } from '@nocobase/app-server/application';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import { databaseManagerToken } from '@nocobase/db';
import { sampleDataToken } from '@nocobase/app-server/sample-data';
import { ServiceProvider } from '@nocobase/service-provider';

import { createTicketNotifier } from './notifier.js';
import { registerTicketAuthorization } from './resources.js';
import { buildTicketSampleData } from './sample-data.js';
import { createTicketService } from './service.js';
import { ticketServiceToken } from './token.js';

export class TicketProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/tickets';

  private authorizationRegistered = false;

  private reminderTimer: NodeJS.Timeout | undefined;

  private sampleDataRegistered = false;

  public override register(): void {
    this.app.container.singleton(ticketServiceToken, (resolver) => {
      const database = resolver.resolve(databaseManagerToken);
      const channels =
        this.app.config.get<{
          channels?: Readonly<Record<string, { provider?: string }>>;
        }>('notification')?.channels ?? {};
      const channel = Object.entries(channels).find(
        ([, config]) => config.provider === 'in-app',
      )?.[0];
      const notifier = createTicketNotifier({
        database,
        channel,
        notifications: resolver.has(notificationServiceToken)
          ? resolver.resolve(notificationServiceToken)
          : undefined,
      });
      return createTicketService(
        database,
        resolver.resolve(serverFileRepositoryManagerToken),
        resolver.resolve(driveManagerToken),
        notifier,
      );
    });
  }

  public override async boot(): Promise<void> {
    // Authorization is installed by the application's plugin set. A runtime
    // assembled without it (a focused test harness) has no resources to
    // register, and must still boot this provider.
    if (!this.app.container.has(authorizationToken)) return;
    if (!this.authorizationRegistered) {
      const authz = this.app.container.resolve(authorizationToken);
      const database = this.app.container.resolve(databaseManagerToken);
      registerTicketAuthorization(authz, database);
      this.authorizationRegistered = true;
    }
    this.registerSampleData();
  }

  private registerSampleData(): void {
    if (this.sampleDataRegistered || !this.app.container.has(sampleDataToken)) {
      return;
    }
    this.app.container.resolve(sampleDataToken).register({
      name: 'support/service-desk-demo',
      packageName: 'nb3-factory',
      run: () => buildTicketSampleData(this.app),
    });
    this.sampleDataRegistered = true;
  }

  public override async ready(): Promise<void> {
    // A focused runtime can register this provider without the file plugin.
    // Routing is unavailable there, and so is the reminder job; the full app
    // always has both file services registered before providers become ready.
    if (
      !this.app.container.has(serverFileRepositoryManagerToken) ||
      !this.app.container.has(driveManagerToken)
    ) {
      return;
    }
    const service = this.app.container.resolve(ticketServiceToken);
    const check = () => {
      void service.remindOverdue().catch(() => undefined);
    };
    check();
    this.reminderTimer = setInterval(check, 15 * 60 * 1000);
    this.reminderTimer.unref();
  }

  public override async shutdown(): Promise<void> {
    if (this.reminderTimer) clearInterval(this.reminderTimer);
    this.reminderTimer = undefined;
  }
}
