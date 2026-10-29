import type { Application } from '@nocobase/app-server/application';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import { i18nToken } from '@nocobase/app-server/i18n';
import { loggingToken } from '@nocobase/app-server/logging';
import { sampleDataToken } from '@nocobase/app-server/sample-data';
import type { DatabaseConnection } from '@nocobase/db';
import { databaseManagerToken } from '@nocobase/db';
import {
  createRepositoryLifecycleStore,
  LifecycleRuntime,
} from '@nocobase/lifecycle';
import {
  createLifecycleJobs,
  type LifecycleJobs,
} from '@nocobase/lifecycle/jobs';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication/server';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

import { setTicketDefaultTranslator } from '../tickets/i18n.js';
import { ticketsLifecycle } from '../tickets/lifecycle.js';
import { InAppTicketNotifier } from '../tickets/notifier.js';
import { TicketPeopleService } from '../tickets/people.js';
import { createHelpdeskSampleData } from '../tickets/sample-data.js';
import {
  engineerTicketsDefinition,
  ownTicketsDefinition,
  ticketResourceDefinition,
} from '../tickets/resources.js';
import { TicketService } from '../tickets/service.js';
import type { TicketPeople, TicketServices } from '../tickets/types.js';

const SCOPE = 'nb3-factory';

export const lifecycleRuntimeToken: ServiceToken<LifecycleRuntime> =
  createServiceToken<LifecycleRuntime>('app/helpdesk-lifecycle-runtime');

export const ticketServiceToken: ServiceToken<TicketService> =
  createServiceToken<TicketService>('app/helpdesk-ticket-service');

export const TICKET_ROLE_KEYS = {
  employee: 'employee',
  engineer: 'support-engineer',
  serviceDesk: 'service-desk',
} as const;

export default class HelpdeskProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/helpdesk-provider';

  private jobs: LifecycleJobs | undefined;
  private runtime: LifecycleRuntime | undefined;

  public override register(): void {
    this.app.container.singleton(lifecycleRuntimeToken, () =>
      this.lifecycleRuntime(),
    );
    this.app.container.singleton(ticketServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return new TicketService(
        database.connection(),
        this.app.container.resolve(lifecycleRuntimeToken),
      );
    });
  }

  public override async boot(): Promise<void> {
    // Minimal applications in tests and embedded servers may compose the
    // runtime without the authorization plugin. There is nothing to register
    // there, and resolving the token would abort their startup.
    if (!this.app.container.has(authorizationToken)) return;
    this.registerAuthorization();
    await this.registerSampleData();
  }

  public override async start(): Promise<void> {
    // The lifecycle tables belong to this application's migrations. A host
    // that has not installed them (a test harness with a mock database, for
    // example) has no effect runs to recover or dispatch.
    if (!this.app.container.has(authorizationToken)) return;
    if (!(await this.lifecycleSchemaAvailable())) return;
    await this.effectJobs().start(this.lifecycleRuntime());
  }

  public override async shutdown(): Promise<void> {
    await this.jobs?.shutdown();
  }

  private registerAuthorization(): void {
    const authz = this.app.container.resolve(authorizationToken);

    for (const collection of [
      'tickets',
      'ticketComments',
      'ticketAttachments',
      'ticket_files',
    ]) {
      authz.database.collections.add({
        name: collection,
        title: collection,
      });
    }

    authz.recordAccess.define(ownTicketsDefinition);
    authz.recordAccess.define(engineerTicketsDefinition);
    const reference = authz.compositeResources.define(ticketResourceDefinition);

    authz.ui.sections.add({
      name: 'helpdesk',
      title: { key: 'helpdesk.authorization.section', ns: 'nb3-factory' },
      parent: 'business',
    });
    authz.ui.place(reference, { section: 'helpdesk' });

    authz.settings.add({
      id: 'workflow-management',
      title: {
        key: 'helpdesk.authorization.workflowSettings',
        ns: 'nb3-factory',
      },
      actions: [
        {
          name: 'read',
          title: { key: 'helpdesk.authorization.read', ns: 'nb3-factory' },
        },
      ],
    });
    authz.ui.sections.add({
      name: 'workflow-administration',
      title: {
        key: 'helpdesk.authorization.workflowSection',
        ns: 'nb3-factory',
      },
      parent: 'administration',
    });
    authz.ui.place(
      { type: 'settings', id: 'workflow-management' },
      { section: 'workflow-administration' },
    );
  }

  private async registerSampleData(): Promise<void> {
    if (
      !this.app.container.has(sampleDataToken) ||
      !this.app.container.has(userAdministrationServiceToken)
    ) {
      return;
    }

    const sampleData = this.app.container.resolve(sampleDataToken);
    sampleData.register({
      name: 'helpdesk-demo',
      packageName: SCOPE,
      run: async () => {
        const database = this.app.container
          .resolve(databaseManagerToken)
          .connection();
        const users = this.app.container.resolve(
          userAdministrationServiceToken,
        );
        const authz = this.app.container.resolve(authorizationToken);
        const tickets = this.app.container.resolve(ticketServiceToken);
        await createHelpdeskSampleData({
          database,
          users,
          authz,
          tickets,
          runtime: this.lifecycleRuntime(),
        });
      },
    });
  }

  private async lifecycleSchemaAvailable(): Promise<boolean> {
    if (!this.app.container.has(databaseManagerToken)) return false;
    const connection = this.app.container
      .resolve(databaseManagerToken)
      .connection() as {
      collections?: { get(name: string): Promise<unknown> };
    };
    if (typeof connection.collections?.get !== 'function') return false;
    const [effectRuns, transitions] = await Promise.all([
      connection.collections.get('lifecycleEffectRuns'),
      connection.collections.get('lifecycleTransitions'),
    ]);
    return Boolean(effectRuns && transitions);
  }

  private lifecycleRuntime(): LifecycleRuntime {
    if (this.runtime) return this.runtime;

    const logger = this.app.container
      .resolve(loggingToken)
      .getLogger('helpdesk');
    const database = this.app.container.resolve(databaseManagerToken);
    const notification = this.app.container.resolve(notificationServiceToken);
    const i18n = this.app.container.resolve(i18nToken);
    const translate = i18n.getFixedT(SCOPE, i18n.getDefaultLocale());
    setTicketDefaultTranslator(translate);

    const runtime = new LifecycleRuntime({
      store: createRepositoryLifecycleStore(database),
      dispatcher: this.effectJobs(),
      logger: {
        warn: (message, details) => logger.warn({ details }, message),
        error: (message, details) => logger.error({ details }, message),
      },
    });

    runtime.register(ticketsLifecycle, {
      services: (handle): TicketServices => {
        const transaction = handle as DatabaseConnection | undefined;
        const people = new TicketPeopleService(
          transaction ?? database.connection(),
        );
        const notifierPeople: TicketPeople = new TicketPeopleService(
          database.connection(),
        );
        return {
          database: transaction ?? database.connection(),
          notifications: new InAppTicketNotifier(
            notification,
            notifierPeople,
            TICKET_ROLE_KEYS.serviceDesk,
            i18n,
          ),
          people,
          translate,
          roleKeys: TICKET_ROLE_KEYS,
        };
      },
    });

    this.runtime = runtime;
    return runtime;
  }

  private effectJobs(): LifecycleJobs {
    if (this.jobs) return this.jobs;
    const executors = this.app.container.resolve(jobExecutorServiceToken);
    this.jobs = createLifecycleJobs({
      jobs: executors.getJobExecutor(SCOPE),
      schedule: executors.getScheduleExecutor(SCOPE),
      jobName: `${SCOPE}/lifecycle-effect`,
      sweepEveryMs: 60_000,
      onSweep: async () => {
        await this.lifecycleRuntime().prune({
          olderThan: new Date(Date.now() - 7 * 86_400_000),
        });
      },
    });
    return this.jobs;
  }
}
