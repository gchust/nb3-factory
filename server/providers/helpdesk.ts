import type { Application } from '@nocobase/app-server/application';
import { i18nToken } from '@nocobase/app-server/i18n';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import { userManagementServiceToken } from '@nocobase/app-plugin-users/server';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  createRepositoryLifecycleStore,
  LifecycleRuntime,
} from '@nocobase/lifecycle';
import {
  createLifecycleJobs,
  type LifecycleJobs,
} from '@nocobase/lifecycle/jobs';
import { ServiceProvider } from '@nocobase/service-provider';

import { registerTicketLifecycle } from '../helpdesk/lifecycle-provider.js';
import { HelpdeskNotifications } from '../helpdesk/notifications.js';
import { provisionHelpdesk } from '../helpdesk/provision.js';
import {
  assignedRecordAccess,
  reporterRecordAccess,
  tickets,
} from '../helpdesk/resources.js';
import { HelpdeskService, helpdeskServiceToken } from '../helpdesk/service.js';

/**
 * Owns the help desk's server side.
 *
 * Registration happens in `register()` because the permission sets written later must already resolve against a
 * registered composite resource and its record-access scopes. The lifecycle runtime and its jobs belong to `start()`,
 * once the plugins that supply the database, notification and jobs services are up; `shutdown()` stops the jobs and
 * nothing else. See `server/AGENTS.md`.
 */
export class HelpdeskProvider extends ServiceProvider<Application> {
  readonly name = 'helpdesk';

  private runtime?: LifecycleRuntime;
  private jobs?: LifecycleJobs;
  /**
   * False when the authorization plugin is absent. A host or a test may compose the runtime without it, and the help
   * desk has no permissions to declare then; it stays dormant rather than failing the whole start. The real
   * application always registers the plugin.
   */
  private enabled = false;

  register(): void {
    if (!this.app.container.has(authorizationToken)) return;
    this.enabled = true;
    const authorization = this.app.container.resolve(authorizationToken);
    this.registerAuthorization(authorization);
    this.app.container.singleton(helpdeskServiceToken, () => {
      if (!this.runtime) {
        throw new Error('The help desk lifecycle runtime has not started.');
      }
      return new HelpdeskService(
        this.app.container.resolve(databaseManagerToken),
        this.runtime,
        this.app.container.resolve(authorizationToken),
      );
    });
  }

  async start(): Promise<void> {
    if (!this.enabled) return;
    const database = this.app.container.resolve(databaseManagerToken);
    // The help-desk Collections come from this application's own migration. A runtime started before that migration has
    // been applied — the embedded-runtime tests, or a branch that has not run `pnpm nocobase db apply` — has no table
    // to work on, so stay dormant instead of crashing the start on the first query.
    const ready = await this.isReady(database);
    if (!ready) return;
    const notifications = new HelpdeskNotifications(
      this.app.container.resolve(notificationServiceToken),
      database,
      this.app.container.resolve(i18nToken),
    );
    const executors = this.app.container.resolve(jobExecutorServiceToken);
    this.jobs = createLifecycleJobs({
      jobs: executors.getJobExecutor('helpdesk'),
      schedule: executors.getScheduleExecutor('helpdesk'),
      jobName: 'helpdesk/effect',
    });
    this.runtime = new LifecycleRuntime({
      store: createRepositoryLifecycleStore(database),
      dispatcher: this.jobs,
    });
    registerTicketLifecycle(this.runtime, notifications);
    await this.jobs.start(this.runtime);
    await provisionHelpdesk({
      database,
      authorization: this.app.container.resolve(authorizationToken),
      users: this.app.container.resolve(userManagementServiceToken),
      runtime: this.runtime,
    });
  }

  async shutdown(): Promise<void> {
    await this.jobs?.shutdown();
  }

  private async isReady(database: DatabaseManager): Promise<boolean> {
    try {
      return Boolean(await database.collections().get('tickets'));
    } catch {
      return false;
    }
  }

  private registerAuthorization(authorization: AppAuthorization): void {
    authorization.recordAccess.define(reporterRecordAccess);
    authorization.recordAccess.define(assignedRecordAccess);
    const reference = authorization.compositeResources.define(tickets);
    // The permission workspace is shown in the browser; descriptor titles resolve against the application's own locale.
    authorization.ui.sections.add({
      name: 'helpdesk',
      title: { key: 'helpdesk.workspace.section', ns: 'app' },
      parent: 'business',
    });
    authorization.ui.place(reference, { section: 'helpdesk' });
    authorization.database.collections.add({
      name: 'tickets',
      title: { key: 'helpdesk.collections.tickets', ns: 'app' },
    });
    authorization.database.collections.add({
      name: 'ticketComments',
      title: { key: 'helpdesk.collections.ticketComments', ns: 'app' },
    });
    authorization.database.collections.add({
      name: 'ticketAttachments',
      title: { key: 'helpdesk.collections.ticketAttachments', ns: 'app' },
    });
  }
}

export default HelpdeskProvider;
