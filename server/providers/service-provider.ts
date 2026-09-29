import { ServiceProvider } from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';
import {
  authenticationToken,
  userAdministrationServiceToken,
} from '@nocobase/app-plugin-authentication/server';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import { workflowServiceToken } from '@nocobase/app-plugin-workflow/server';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import type { AppQueueConfig } from '@nocobase/queue';
import type {
  JsonObject,
  ScheduleTargetStartResult,
  TargetValidationResult,
} from '@nocobase/app-plugin-scheduler/server';
import {
  accessServiceToken,
  dashboardServiceToken,
  inspectionServiceToken,
  integrationKeyServiceToken,
  knowledgeServiceToken,
  ledgerServiceToken,
  schedulerRunServiceToken,
  serviceBootstrapToken,
  serviceNotificationToken,
  ticketServiceToken,
} from '../services/contracts.js';
import { AccessService } from '../services/access-service.js';
import { IntegrationKeyService } from '../services/integration-key-service.js';
import { ServiceNotificationService } from '../services/notification-service.js';
import { TicketService } from '../services/ticket-service.js';
import {
  InspectionService,
  DAILY_SCHEDULE_KEYS,
} from '../services/inspection-service.js';
import {
  SchedulerRunService,
  type SchedulerReadService,
} from '../services/scheduler-run-service.js';
import { KnowledgeService } from '../services/knowledge-service.js';
import { LedgerService } from '../services/ledger-service.js';
import { DashboardService } from '../services/dashboard-service.js';
import { ServiceBootstrap } from '../services/bootstrap.js';
import type { ServiceApplicationConfig } from '../config/service.js';

const INSPECTION_TARGET = 'service.inspection-generation';
const REMINDER_TARGET = 'service.overdue-reminders';
const ACCEPTANCE_WORKFLOW_KEY = 'ticket-acceptance';
/**
 * The queue the Scheduler dispatches its `ScheduleDispatchJob` on. The plugin
 * declares this queue itself in `server/config/queue.ts`; the manual trigger
 * needs its name to resolve the connection that holds the schedule rows.
 */
const SCHEDULE_QUEUE = 'schedule';

/**
 * The source-managed workflow loader is reachable through the public
 * `WorkflowService` singleton even though its discovery/materialization methods
 * are not part of the token's published contract. The application declares the
 * narrow shape it relies on here rather than depending on plugin internals.
 */
interface WorkflowArtifact {
  readonly key: string;
  readonly digest: string;
}
interface WorkflowActivationService {
  discoverArtifacts(): Promise<readonly WorkflowArtifact[]>;
  ensureArtifactMaterialized(hash: string): Promise<number | undefined>;
}

/**
 * Brings up the service-domain services, installs the application's roles and
 * sample records, and declares the two daily maintenance schedules.
 *
 * Timing matters here: every plugin token this provider resolves is bound by
 * another provider's `register()`, and all `register()` calls finish before any
 * `boot()` runs — so `boot()` is the earliest safe point to resolve them.
 */
export class ServiceApplicationProvider extends ServiceProvider<Application> {
  readonly name = 'service-application';

  register(): void {
    const container = this.app.container;
    container.singleton(accessServiceToken, (resolver) => {
      return new AccessService(
        resolver.resolve<AppAuthorization>(authorizationToken),
      );
    });
    container.singleton(serviceNotificationToken, (resolver) => {
      // Resolve late: every provider registers its bindings before any boot,
      // and the in-app channel is registered during the in-app provider's own
      // boot, so a reference captured here would miss it.
      return new ServiceNotificationService(() =>
        resolver.has(notificationServiceToken)
          ? resolver.resolve(notificationServiceToken)
          : undefined,
      );
    });
    container.singleton(ledgerServiceToken, (resolver) => {
      return new LedgerService(
        resolver.resolve(databaseManagerToken),
        resolver.resolve(accessServiceToken),
      );
    });
    container.singleton(ticketServiceToken, (resolver) => {
      return new TicketService(
        resolver.resolve(databaseManagerToken),
        resolver.resolve(accessServiceToken),
        resolver.resolve(serviceNotificationToken),
      );
    });
    container.singleton(inspectionServiceToken, (resolver) => {
      return new InspectionService(
        resolver.resolve(databaseManagerToken),
        resolver.resolve(accessServiceToken),
        resolver.resolve(serviceNotificationToken),
        resolver.resolve(ticketServiceToken),
        {
          // The manual "run now" trigger shares the scheduler's enable switch,
          // so disabling a plan in the scheduler stops the app route too.
          isEnabled: async (key: string): Promise<boolean> => {
            if (!resolver.has(schedulerServiceToken)) {
              return true;
            }
            const scheduler = resolver.resolve(
              schedulerServiceToken,
            ) as unknown as SchedulerReadService;
            const list = await scheduler.list();
            const entry = list.find((item) => item.key === key);
            return entry
              ? entry.enabled && entry.lifecycleState === 'active'
              : true;
          },
        },
      );
    });
    container.singleton(schedulerRunServiceToken, (resolver) => {
      // The manual "run now" trigger goes through the Scheduler's own queue
      // schedule, so its execution records and trigger count stay real. The
      // application reads the connection from the same queue configuration the
      // Queue manager resolves.
      const config = this.app.config.get<AppQueueConfig>('queue');
      if (!config) {
        throw new Error(
          'The queue configuration is required to trigger schedules.',
        );
      }
      const scheduler = resolver.resolve(
        schedulerServiceToken,
      ) as unknown as SchedulerReadService;
      return new SchedulerRunService(config, scheduler, {
        queueName: SCHEDULE_QUEUE,
      });
    });
    container.singleton(knowledgeServiceToken, (resolver) => {
      return new KnowledgeService(
        resolver.resolve(databaseManagerToken),
        resolver.resolve(accessServiceToken),
      );
    });
    container.singleton(dashboardServiceToken, (resolver) => {
      return new DashboardService(
        resolver.resolve(databaseManagerToken),
        resolver.resolve(accessServiceToken),
      );
    });
    container.singleton(serviceBootstrapToken, (resolver) => {
      const config = this.app.config.get<ServiceApplicationConfig>('service');
      return new ServiceBootstrap({
        db: resolver.resolve(databaseManagerToken),
        authz: resolver.resolve<AppAuthorization>(authorizationToken),
        users: resolver.resolve(userAdministrationServiceToken),
        enableSampleData: config?.enableSampleData ?? true,
      });
    });
    container.singleton(integrationKeyServiceToken, (resolver) => {
      return new IntegrationKeyService(
        resolver.resolve(databaseManagerToken),
        resolver.resolve(accessServiceToken),
        resolver.resolve(authenticationToken),
        resolver.resolve(userAdministrationServiceToken),
      );
    });
  }

  async boot(): Promise<void> {
    // Authorization and user administration are optional at this level: a
    // minimal runtime (a test scope, an embedding host) may register neither.
    // Without them there are no roles to install and no accounts to create, so
    // the bootstrap is skipped rather than failing the whole boot.
    const ready =
      this.app.container.has(authorizationToken) &&
      this.app.container.has(userAdministrationServiceToken);
    if (ready) {
      await this.app.container.resolve(serviceBootstrapToken).run();
    }
    await this.activateAcceptanceWorkflow();
    this.registerSchedules();
  }

  /**
   * Make the source-managed `ticket-acceptance` workflow usable on a fresh
   * installation.
   *
   * The workflow is registered by the workflow plugin only when something
   * materializes it, and a materialized revision starts disabled. The
   * application owns the definition and requires it for acceptance, so it is
   * discovered, materialized and enabled at boot. This is idempotent: an
   * already-current revision is left alone and only its enable flag is set.
   */
  private async activateAcceptanceWorkflow(): Promise<void> {
    // `resolveIfCreated` would only see a service that something else already
    // instantiated; the workflow service may be registered but not yet built.
    // Resolve it lazily so a fresh installation still materializes its workflow.
    const container = this.app.container;
    if (!container.has(workflowServiceToken)) {
      return;
    }
    const engine = container.resolve(
      workflowServiceToken,
    ) as unknown as WorkflowActivationService;
    let digest: string | undefined;
    try {
      const artifacts = await engine.discoverArtifacts();
      digest = artifacts.find(
        (artifact) => artifact.key === ACCEPTANCE_WORKFLOW_KEY,
      )?.digest;
    } catch {
      return;
    }
    if (!digest) {
      return;
    }
    try {
      await engine.ensureArtifactMaterialized(digest);
    } catch {
      return;
    }
    const db = this.app.container.resolve(databaseManagerToken);
    const workflows = db.repository('workflows');
    // The latest discovered revision becomes current and enabled, and every
    // other revision of the same key is retired, matching what the workflow
    // plugin's own activation does (except that the enable flag stays on).
    await workflows.updateMany({
      filter: { key: ACCEPTANCE_WORKFLOW_KEY },
      values: { current: false, enabled: false },
    });
    await workflows.updateMany({
      filter: { key: ACCEPTANCE_WORKFLOW_KEY, hash: digest },
      values: { current: true, enabled: true },
    });
  }

  private registerSchedules(): void {
    const container = this.app.container;
    if (!container.has(schedulerServiceToken)) {
      return;
    }
    const scheduler = container.resolve(schedulerServiceToken);
    scheduler.registerTarget({
      type: INSPECTION_TARGET,
      title: 'Generate due device inspections',
      validate: (): TargetValidationResult => ({ valid: true }),
      start: async (): Promise<ScheduleTargetStartResult> => {
        const result = await this.app.container
          .resolve(inspectionServiceToken)
          .generateDueInspections();
        return {
          state: 'completed',
          outcome: 'succeeded',
          result: result as unknown as JsonObject,
        };
      },
    });

    scheduler.registerTarget({
      type: REMINDER_TARGET,
      title: 'Remind overdue tickets',
      validate: (): TargetValidationResult => ({ valid: true }),
      start: async (): Promise<ScheduleTargetStartResult> => {
        const result = await this.app.container
          .resolve(inspectionServiceToken)
          .remindOverdueTickets();
        return {
          state: 'completed',
          outcome: 'succeeded',
          result: result as unknown as JsonObject,
        };
      },
    });

    // 09:00 Asia/Shanghai every day, as the business requires.
    scheduler.defineSchedule({
      key: DAILY_SCHEDULE_KEYS.inspection,
      title: 'Daily device inspection generation',
      description:
        'Generates an inspection record for every device that is due, deduplicated per device and day.',
      schedule: { cron: '0 9 * * *', timezone: 'Asia/Shanghai' },
      target: { type: INSPECTION_TARGET, config: {} },
    });
    scheduler.defineSchedule({
      key: DAILY_SCHEDULE_KEYS.reminder,
      title: 'Daily overdue ticket reminders',
      description:
        'Sends at most one overdue reminder per ticket per calendar day.',
      schedule: { cron: '0 9 * * *', timezone: 'Asia/Shanghai' },
      target: { type: REMINDER_TARGET, config: {} },
    });
  }
}
