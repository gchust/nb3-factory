import type { Application } from '@nocobase/app-server/application';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication/server';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import {
  workflowServiceToken,
  type WorkflowServiceContract,
} from '@nocobase/app-plugin-workflow/server';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import type { ServiceConfig } from '../config/service.js';
import { ServiceAccess } from '../service/access.js';
import { createAssistantService } from '../service/assistant-service.js';
import { registerServiceAuthorization } from '../service/authorization.js';
import { createCatalogService } from '../service/catalog-service.js';
import { createDashboardService } from '../service/dashboard-service.js';
import { createExternalTicketService } from '../service/external-ticket-service.js';
import { createInspectionService } from '../service/inspection-service.js';
import { createServiceInstall } from '../service/install-service.js';
import {
  createServiceNotifier,
  type ServiceNotifier,
} from '../service/notification-service.js';
import { registerServiceRecordAccess } from '../service/record-access.js';
import { ServiceRouting } from '../service/routing-service.js';
import {
  createTicketService,
  type TicketAcceptancePort,
} from '../service/ticket-service.js';
import {
  catalogServiceToken,
  dashboardServiceToken,
  externalTicketServiceToken,
  inspectionServiceToken,
  serviceAccessToken,
  serviceAssistantToken,
  serviceInstallToken,
  serviceNotifierToken,
  serviceRoutingToken,
  ticketServiceToken,
} from '../service/tokens.js';

/** The source directory name of the acceptance Workflow. */
const ACCEPTANCE_WORKFLOW_KEY = 'ticket-acceptance';

/**
 * The runtime-only Workflow methods the acceptance port needs. The public
 * contract exposes `trigger` only; materializing and enabling a source-managed
 * definition before its first trigger require the runtime methods below, which
 * are reached through this explicit cast. Kept in one place so the gray area is
 * visible rather than spread over the module.
 */
interface AcceptanceWorkflowRuntime {
  discoverArtifacts(): Promise<
    readonly { readonly key: string; readonly digest: string }[]
  >;
  ensureArtifactMaterialized(hash: string): Promise<string | undefined>;
}

/**
 * Wires the equipment after-sales service module into the application:
 * binds its services, teaches the authorization workspace about its
 * collections, permission sets and pages, and provisions the demonstration
 * installation. Scheduled work lives in `schedule.ts`, which registers it
 * with the installed Scheduler plugin rather than a private cron process.
 */
export default class ServiceModuleProvider extends ServiceProvider<Application> {
  public readonly name: string = '@app/service-module';

  /** Lazily memoized activation of the acceptance Workflow definition. */
  private acceptanceReady?: Promise<boolean>;

  /**
   * Hands a pending ticket's acceptance to the Workflow runtime, so the
   * registration is the Workflow's business result instead of an inline write.
   * `skipped` means no run will happen; the ticket service answers that receipt
   * by registering the acceptance synchronously, so the business still moves.
   */
  private readonly acceptancePort: TicketAcceptancePort = {
    dispatch: async (input) => {
      const container = this.app.container;
      if (!container.has(workflowServiceToken)) {
        return { status: 'skipped', reason: 'workflow-plugin-absent' };
      }
      const runtime = container.resolve(workflowServiceToken);
      if (!(await this.ensureAcceptanceWorkflow(runtime))) {
        return { status: 'skipped', reason: 'workflow-not-deployed' };
      }
      const receipt = await runtime.trigger(
        ACCEPTANCE_WORKFLOW_KEY,
        {
          ticketId: input.ticketId,
          actorId: input.actorId,
          priority: input.priority,
        },
        { eventKey: input.eventKey },
      );
      if (receipt.status === 'skipped') {
        return { status: 'skipped', reason: receipt.reason };
      }
      return { status: 'accepted', runId: receipt.runId };
    },
  };

  public override register(): void {
    const container = this.app.container;

    container.singleton(
      serviceAccessToken,
      () => new ServiceAccess(this.resolveAuthz()),
    );
    container.singleton(serviceRoutingToken, () => this.createRouting());
    container.singleton(serviceNotifierToken, () => this.createNotifier());
    container.singleton(catalogServiceToken, () =>
      createCatalogService(this.resolveDatabase()),
    );
    container.singleton(ticketServiceToken, () =>
      createTicketService(this.resolveDatabase(), {
        actorName: (id) => this.createRouting().userName(id),
        routing: this.createRouting(),
        notifier: this.createNotifier(),
        authz: this.resolveAuthz(),
        acceptance: this.acceptancePort,
      }),
    );
    container.singleton(inspectionServiceToken, () =>
      createInspectionService(this.resolveDatabase(), {
        routing: this.createRouting(),
        actorName: (id) => this.createRouting().userName(id),
      }),
    );
    container.singleton(dashboardServiceToken, () =>
      createDashboardService(this.resolveDatabase(), {
        routing: {
          engineerLoads: () => this.createRouting().engineerLoads(),
        },
      }),
    );
    container.singleton(externalTicketServiceToken, () =>
      createExternalTicketService(
        this.resolveDatabase(),
        this.app.container.resolve(ticketServiceToken),
      ),
    );
    container.singleton(serviceAssistantToken, () =>
      createAssistantService(this.resolveDatabase()),
    );
    container.singleton(serviceInstallToken, () =>
      createServiceInstall({
        database: this.resolveDatabase(),
        authz: this.resolveAuthz(),
        users: this.app.container.resolve(userAdministrationServiceToken),
        config: this.serviceConfig(),
      }),
    );
  }

  public override async boot(): Promise<void> {
    // The service module enforces its own permissions, so it is only active
    // when the authorization plugin is registered. A runtime that composes
    // providers without that plugin (as some focused tests do) must still
    // start; the business layer simply stays dark rather than crashing.
    if (!this.app.container.has(authorizationToken)) return;
    const authz = this.resolveAuthz();
    registerServiceAuthorization(authz);
    registerServiceRecordAccess(authz);
  }

  public override async start(): Promise<void> {
    await this.activateAcceptanceWorkflow();
    if (!this.app.container.has(authorizationToken)) return;
    try {
      const result = await this.app.container
        .resolve(serviceInstallToken)
        .install();
      console.log(
        `[service] installation ready: ${result.accounts} accounts, ${result.permissionSets} permission sets, ${result.customers} customers, ${result.devices} devices, ${result.tickets} tickets, ${result.inspections} inspections, ${result.articles} articles`,
      );
    } catch (error) {
      // A demonstration installation that cannot be provisioned must not stop
      // the application: the routes and pages still work over whatever data
      // already exists. The failure is reported, never swallowed silently.
      console.error('[service] installation failed', error);
    }
  }

  private resolveDatabase(): DatabaseManager {
    return this.app.container.resolve(databaseManagerToken);
  }

  /**
   * Makes the acceptance definition current and enabled, so the Workflows list
   * shows it as runnable before the first ticket is accepted. A source-managed
   * definition materializes disabled, and no public provisioning API can enable
   * it from a provider, so this activation is needed here. Failures are logged
   * rather than fatal: the ticket service falls back when dispatch is skipped.
   */
  private async activateAcceptanceWorkflow(): Promise<void> {
    if (!this.app.container.has(workflowServiceToken)) return;
    try {
      const ready = await this.ensureAcceptanceWorkflow(
        this.app.container.resolve(workflowServiceToken),
      );
      console.log(
        `[service] acceptance workflow ${ready ? 'enabled' : 'not deployed'}`,
      );
    } catch (error) {
      console.error('[service] acceptance workflow activation failed', error);
    }
  }

  private ensureAcceptanceWorkflow(
    runtime: WorkflowServiceContract,
  ): Promise<boolean> {
    this.acceptanceReady ??= this.materializeAcceptanceWorkflow(runtime).catch(
      (error: unknown) => {
        // Do not memoize a failure: a later acceptance may retry activation.
        this.acceptanceReady = undefined;
        throw error;
      },
    );
    return this.acceptanceReady;
  }

  private async materializeAcceptanceWorkflow(
    runtime: WorkflowServiceContract,
  ): Promise<boolean> {
    const materializer = runtime as unknown as AcceptanceWorkflowRuntime;
    const artifact = (await materializer.discoverArtifacts()).find(
      (candidate) => candidate.key === ACCEPTANCE_WORKFLOW_KEY,
    );
    if (!artifact) return false;
    const workflowId = await materializer.ensureArtifactMaterialized(
      artifact.digest,
    );
    if (workflowId == null) return false;
    const workflows = this.resolveDatabase().repository<{
      id: number;
      enabled: boolean;
    }>('workflows');
    const row = await workflows.findOne({ filter: { id: workflowId } });
    if (!row) return false;
    if (!row.enabled) {
      await workflows.updateOne({
        filter: { id: workflowId },
        values: { enabled: true },
      });
    }
    return true;
  }

  private resolveAuthz() {
    return this.app.container.resolve(authorizationToken);
  }

  private createRouting(): ServiceRouting {
    return new ServiceRouting(
      this.resolveDatabase(),
      this.app.container.resolve(userAdministrationServiceToken),
      this.resolveAuthz().permissionSets,
      this.serviceConfig().acceptance,
    );
  }

  private createNotifier(): ServiceNotifier {
    const container = this.app.container;
    return createServiceNotifier(
      container.has(notificationServiceToken)
        ? container.resolve(notificationServiceToken)
        : undefined,
    );
  }

  private serviceConfig(): ServiceConfig {
    return (
      this.app.config.get<ServiceConfig>('service') ?? {
        demoAccounts: { enabled: false, password: '' },
        acceptance: { autoEnabled: false, internalOnly: true },
        assistant: { employee: 'service-assistant', knowledgeBaseKey: '' },
      }
    );
  }
}
