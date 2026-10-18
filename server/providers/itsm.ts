import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';
import { ensureItsmPermissionSets } from '../itsm/permission-sets.js';
import { registerItsmRecordAccess } from '../itsm/record-access.js';
import { registerItsmResources } from '../itsm/resources.js';
import { registerItsmSampleData } from '../itsm/sample-data.js';
import { TicketService, ticketServiceToken } from '../itsm/service.js';

/** How often the service desk's overdue reminders are checked. */
const OVERDUE_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Owns the service desk: binds the ticket service, registers the authorization
 * resources and role Permission Sets once the application boots, and runs the
 * overdue reminder check for as long as the application is started.
 */
export class ItsmProvider extends ServiceProvider<Application> {
  readonly name = 'application/service-desk';
  private timer: ReturnType<typeof setInterval> | undefined;
  private booted = false;

  override register(): void {
    this.app.container.singleton(
      ticketServiceToken,
      () => new TicketService(this.app),
    );
  }

  override async boot(): Promise<void> {
    if (this.booted) return;
    this.booted = true;
    // The sample-data service belongs to the database provider, which may register after this provider, so the
    // registration waits for boot: by then every provider has registered and the sample runs after all are ready.
    registerItsmSampleData(this.app);
    // The authorization and database services are contributed by plugins. An application assembled without them
    // (as some embedding hosts and tests do) still boots; it simply has no service desk authorization metadata to
    // register, rather than failing the whole start-up.
    if (!this.app.container.has(authorizationToken)) return;
    const authz = this.app.container.resolve(authorizationToken);
    await ensureItsmPermissionSets(authz);
    registerItsmResources(authz);
    if (!this.app.container.has(databaseManagerToken)) return;
    registerItsmRecordAccess(
      authz,
      this.app.container.resolve(databaseManagerToken),
    );
  }

  override async start(): Promise<void> {
    const tickets = this.app.container.resolve(ticketServiceToken);
    const runReminders = (): void => {
      tickets.runOverdueReminders().catch((error: unknown) => {
        console.warn('[itsm] overdue reminder check failed:', error);
      });
    };
    // Remind as soon as the application serves, so a ticket that went overdue while the application was down is
    // reported without waiting for the next interval.
    runReminders();
    this.timer = setInterval(runReminders, OVERDUE_INTERVAL_MS);
    this.timer.unref?.();
  }

  override async shutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
