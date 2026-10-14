import type { Application } from '@nocobase/app-server/application';
import { loggingToken } from '@nocobase/app-server/logging';
import { databaseManagerToken } from '@nocobase/db';
import {
  createRepositoryLifecycleStore,
  LifecycleRuntime,
} from '@nocobase/lifecycle';
import { createDiagnosticLogger } from '@nocobase/logging';
import { ServiceProvider } from '@nocobase/service-provider';

import { ticketLifecycle } from '../it-service-desk/lifecycle.js';
import { createTicketNotifier } from '../it-service-desk/notifier.js';
import { ItServiceDeskService } from '../it-service-desk/service.js';
import {
  itServiceDeskToken,
  itTicketRuntimeToken,
} from '../it-service-desk/tokens.js';

/** How often the process sweeps overdue reminders and unfinished effect runs. */
const SWEEP_INTERVAL_MS = 60_000;

/**
 * Owns the ticket lifecycle runtime and the service desk service. The store is created lazily, so registering before
 * the database connects is safe, and the sweep runs in this process because the application has one server.
 */
export class ItServiceDeskProvider extends ServiceProvider<Application> {
  name = 'it-service-desk';

  private sweepTimer?: NodeJS.Timeout;

  register(): void {
    const app = this.app;

    this.app.container.singleton(itTicketRuntimeToken, (container) => {
      const logging = container.resolve(loggingToken);
      const runtime = new LifecycleRuntime({
        store: createRepositoryLifecycleStore(
          container.resolve(databaseManagerToken),
        ),
        logger: createDiagnosticLogger(
          logging.getLogger('it-service-desk.lifecycle'),
        ),
      });
      runtime.register(ticketLifecycle, {
        services: { notify: createTicketNotifier(app) },
      });
      return runtime;
    });

    this.app.container.singleton(
      itServiceDeskToken,
      (container) =>
        new ItServiceDeskService(app, container.resolve(itTicketRuntimeToken)),
    );
  }

  async start(): Promise<void> {
    const runtime = this.app.container.resolve(itTicketRuntimeToken);
    await this.sweep(runtime);
    this.sweepTimer = setInterval(() => {
      void this.sweep(runtime);
    }, SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
  }

  async shutdown(): Promise<void> {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = undefined;
    }
  }

  private async sweep(runtime: LifecycleRuntime): Promise<void> {
    try {
      await runtime.recover();
      await runtime.runTriggers();
      await runtime.reclaim();
    } catch (error) {
      createDiagnosticLogger(
        this.app.container
          .resolve(loggingToken)
          .getLogger('it-service-desk.lifecycle'),
      ).error('The IT service desk sweep failed.', error);
    }
  }
}
