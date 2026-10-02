import type { Application } from '@nocobase/app-server/application';
import { loggingToken } from '@nocobase/app-server/logging';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import {
  defineSchedule,
  type JsonObject,
} from '@nocobase/app-plugin-scheduler/server';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import {
  INSPECTION_SCHEDULE,
  INSPECTION_TARGET,
  SERVICE_NS,
} from '../service/constants.js';
import { createDashboardService } from '../service/dashboard.js';
import { createInspectionService } from '../service/inspections.js';
import { createIntegrationService } from '../service/integration.js';
import { createServiceAttachmentService } from '../service/attachments.js';
import {
  serviceRecordAccessBuilders,
  bindServiceRecordAccessConnection,
} from '../service/record-access.js';
import {
  registerServiceCompositeResources,
  serviceCollections,
  serviceCustomers,
  serviceDirectory,
  serviceEquipment,
  serviceInspections,
  serviceIntegration,
  serviceKnowledge,
  serviceManuals,
  serviceWorkOrders,
} from '../service/resources.js';
import { createWorkOrderService } from '../service/work-orders.js';
import {
  ensureAcceptanceWorkflowEnabled,
  triggerAcceptanceWorkflow,
} from '../service/acceptance.js';
import { provisionServiceLedger } from '../service/provisioning.js';
import {
  dashboardServiceToken,
  inspectionServiceToken,
  integrationServiceToken,
  serviceAttachmentServiceToken,
  workOrderServiceToken,
} from '../service/tokens.js';

const PROVIDER_NAME = 'nb3-factory/service-ledger';

function title(key: string): { key: string; ns: string } {
  return { key, ns: SERVICE_NS };
}

/**
 * Wires the equipment after-sales service desk into the application.
 *
 * The domain services in `server/service` are pure declaration and logic: nothing there registers itself with a
 * container, an authorization registry or the scheduler. This provider is the single place that binds them and
 * decides when each registration may happen:
 *
 * - `register()` binds the five business services and nothing else, so they are resolvable once the lifecycle
 *   reaches `boot()`.
 * - `boot()` registers the authorization model — composite resources, database collections, the UI subsection
 *   and its placements, and the record-access resolvers — then the scheduler targets and schedules. The
 *   authorization plugin boots before application providers, so `authorizationToken` is ready here. Schedules
 *   are read during `start()`, so defining them any later would have no effect.
 * - `start()` binds the database connection the record-access resolvers evaluate against. Resolvers run per
 *   request, after every provider has started.
 * - `ready()` provisions the permission sets, the demonstration accounts and the sample ledger, once, when the
 *   database is empty. That has to happen after the authentication and authorization plugins are ready, which
 *   is exactly why it is not a database seed: a seed runs before either plugin exists.
 */
export class ServiceLedgerProvider extends ServiceProvider<Application> {
  readonly name = PROVIDER_NAME;

  register(): void {
    const container = this.app.container;

    container.singleton(workOrderServiceToken, (resolver) =>
      createWorkOrderService({
        database: resolver.resolve(databaseManagerToken),
        triggerAcceptance: (input) =>
          triggerAcceptanceWorkflow(resolver, input),
      }),
    );
    container.singleton(inspectionServiceToken, (resolver) =>
      createInspectionService({
        database: resolver.resolve(databaseManagerToken),
      }),
    );
    container.singleton(integrationServiceToken, (resolver) =>
      createIntegrationService({
        database: resolver.resolve(databaseManagerToken),
      }),
    );
    container.singleton(dashboardServiceToken, (resolver) =>
      createDashboardService({
        database: resolver.resolve(databaseManagerToken),
      }),
    );
    container.singleton(serviceAttachmentServiceToken, (resolver) =>
      createServiceAttachmentService({
        database: resolver.resolve(databaseManagerToken),
      }),
    );
  }

  async boot(): Promise<void> {
    const container = this.app.container;
    // A minimal runtime (a test embedding the application, or an application built without the authorization
    // plugin) has no authorization service. The pages and routes still register; only the shared permission
    // model is skipped, so the provider never makes an unrelated boot fail.
    if (container.has(authorizationToken)) {
      const authz = container.resolve(authorizationToken);

      for (const build of serviceRecordAccessBuilders) {
        authz.recordAccess.define(build);
      }
      registerServiceCompositeResources(authz.compositeResources);

      for (const collection of serviceCollections) {
        authz.database.collections.add({
          name: collection,
          title: title(`service.collection.${collection}`),
        });
      }

      authz.ui.sections.add({
        name: 'service',
        parent: 'business',
        order: 50,
        title: title('service.section.title'),
      });
      const placements = [
        serviceWorkOrders,
        serviceCustomers,
        serviceEquipment,
        serviceInspections,
        serviceKnowledge,
        serviceManuals,
        serviceIntegration,
        serviceDirectory,
      ] as const;
      for (const [index, resource] of placements.entries()) {
        authz.ui.place(resource, {
          section: 'service',
          order: index * 10,
        });
      }
    }

    if (container.has(schedulerServiceToken)) {
      this.registerSchedules();
    }
  }

  async start(): Promise<void> {
    const database = this.app.container.resolve(databaseManagerToken);
    bindServiceRecordAccessConnection(database.connection());
  }

  async ready(): Promise<void> {
    const container = this.app.container;
    const logger = container.resolve(loggingToken).getLogger(PROVIDER_NAME);
    const provisioningLogger = {
      info: (message: string) => logger.info(message),
      warn: (message: string) => logger.warn(message),
      error: (message: string) => logger.error(message),
    };

    try {
      const database = container.resolve(databaseManagerToken);
      const authz = container.resolve(authorizationToken);
      const users = container.resolve(userAdministrationServiceToken);
      await provisionServiceLedger({
        connection: database.connection(),
        users,
        permissionSets: authz.permissionSets,
        logger: provisioningLogger,
      });
    } catch (error) {
      // A provisioning failure must not stop the application from starting: the pages, the API and the
      // permission model are already registered, and an administrator can create the missing rows by hand.
      // The next boot retries whatever did not finish.
      provisioningLogger.error(
        `Service ledger provisioning failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    // The acceptance decision is a source-managed Workflow. Materializing and enabling it is part of the
    // application's own configuration, not an operator step: without it the first work order would sit pending
    // acceptance with no one to accept it. Failures are logged and never block startup.
    try {
      await ensureAcceptanceWorkflowEnabled(container, provisioningLogger);
    } catch (error) {
      provisioningLogger.warn(
        `Could not enable the acceptance workflow: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private registerSchedules(): void {
    const container = this.app.container;
    const scheduler = container.resolve(schedulerServiceToken);

    scheduler.registerTarget<JsonObject>({
      type: INSPECTION_TARGET.GENERATE,
      title: 'Inspection plan generation',
      validate: () => ({ valid: true }),
      start: async () => {
        const inspections = container.resolve(inspectionServiceToken);
        const result = await inspections.generatePlans();
        return {
          state: 'completed',
          outcome: 'succeeded',
          result: { created: result.created },
        };
      },
    });

    scheduler.registerTarget<JsonObject>({
      type: INSPECTION_TARGET.OVERDUE,
      title: 'Overdue inspection and work-order sweep',
      validate: () => ({ valid: true }),
      start: async () => {
        const inspections = container.resolve(inspectionServiceToken);
        const result = await inspections.flagOverdue();
        return {
          state: 'completed',
          outcome: 'succeeded',
          result: {
            workOrders: result.workOrders.length,
            notified: result.notified,
          },
        };
      },
    });

    scheduler.defineSchedule(
      defineSchedule({
        key: INSPECTION_SCHEDULE.GENERATE,
        title: '每日生成巡检计划',
        description:
          '每天 09:00（Asia/Shanghai）为已启用且到达巡检日期的设备生成巡检计划。',
        schedule: { cron: '0 9 * * *', timezone: 'Asia/Shanghai' },
        target: { type: INSPECTION_TARGET.GENERATE, config: {} },
      }),
    );
    scheduler.defineSchedule(
      defineSchedule({
        key: INSPECTION_SCHEDULE.OVERDUE,
        title: '每日巡检与工单逾期提醒',
        description:
          '每天 09:00（Asia/Shanghai）标记逾期巡检与工单，并最多提醒一次。',
        schedule: { cron: '0 9 * * *', timezone: 'Asia/Shanghai' },
        target: { type: INSPECTION_TARGET.OVERDUE, config: {} },
      }),
    );
  }
}

export default ServiceLedgerProvider;
