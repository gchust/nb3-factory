import type { Application } from '@nocobase/app-server/application';
import { loggingToken } from '@nocobase/app-server/logging';
import { databaseManagerToken } from '@nocobase/db';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import { workflowServiceToken } from '@nocobase/app-plugin-workflow/server';
import {
  ServiceProvider,
  type ServiceResolver,
} from '@nocobase/service-provider';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseManager } from '@nocobase/db';
import type { Logger } from '@nocobase/logging';

import {
  SERVICE_TEAM_SUBJECT,
  registerServiceRecordAccess,
  serviceCollections,
  serviceCompositeResources,
} from '../service-resources.js';
import type { ServiceTeamRecord } from './records.js';
import {
  serviceAcceptanceServiceToken,
  serviceAttachmentServiceToken,
  serviceAssistantServiceToken,
  serviceDashboardServiceToken,
  serviceDirectoryServiceToken,
  serviceInspectionServiceToken,
  serviceKnowledgeServiceToken,
  serviceScheduleServiceToken,
  serviceTicketServiceToken,
} from './tokens.js';
import { ServiceDirectoryService } from './directory-service.js';
import { ServiceKnowledgeService } from './knowledge-service.js';
import { ServiceDashboardService } from './dashboard-service.js';
import { ServiceAttachmentService } from './attachment-service.js';
import { ServiceNotifier } from './notifier.js';
import { ServiceTicketService } from './ticket-service.js';
import {
  ServiceAcceptanceService,
  TICKET_ACCEPTANCE_WORKFLOW,
} from './acceptance-service.js';
import { ServiceInspectionService } from './inspection-service.js';
import {
  ServiceAssistantService,
  type AssistantGenerator,
} from './assistant-service.js';
import {
  DAILY_INSPECTION_SCHEDULE,
  OVERDUE_REMINDER_SCHEDULE,
  ServiceScheduleService,
  scheduleConnection,
} from './service-schedules.js';

/**
 * Wires the after-sales service domain into the application: the domain
 * services, the authorization model the routes authorize against, and the two
 * scheduled tasks. Nothing here talks to the database at import time.
 *
 * The authorization and scheduler registrations are guarded: the providers
 * that own those services may legitimately be absent, and the domain services
 * still resolve for the routes that use them.
 */

const DAILY_INSPECTION_TARGET = DAILY_INSPECTION_SCHEDULE.targetType;
const OVERDUE_REMINDER_TARGET = OVERDUE_REMINDER_SCHEDULE.targetType;

export class ServiceDomainProvider extends ServiceProvider<Application> {
  public readonly name = 'app/service-domain';

  private removeTeamSubject: (() => void) | undefined;

  public register(): void {
    const container = this.app.container;
    const logger = (name: string): Logger =>
      container.resolve(loggingToken).getLogger(name);

    container.singleton(
      serviceDirectoryServiceToken,
      (resolver) =>
        new ServiceDirectoryService(resolver.resolve(databaseManagerToken)),
    );
    container.singleton(
      serviceKnowledgeServiceToken,
      (resolver) =>
        new ServiceKnowledgeService(resolver.resolve(databaseManagerToken), {
          vectorIndexAvailable: () => this.vectorIndexAvailable(),
        }),
    );
    container.singleton(
      serviceDashboardServiceToken,
      (resolver) =>
        new ServiceDashboardService(resolver.resolve(databaseManagerToken)),
    );
    container.singleton(
      serviceAttachmentServiceToken,
      (resolver) =>
        new ServiceAttachmentService(
          resolver.resolve(databaseManagerToken),
          resolver,
          logger('service.attachment'),
          this.app.config.get<string>('drive.default') ?? 'local',
        ),
    );
    container.singleton(
      serviceTicketServiceToken,
      (resolver) =>
        new ServiceTicketService(
          resolver.resolve(databaseManagerToken),
          resolver.resolve(serviceDirectoryServiceToken),
          notifierFrom(resolver, logger('service.notification')),
        ),
    );
    container.singleton(
      serviceAcceptanceServiceToken,
      (resolver) =>
        new ServiceAcceptanceService(resolver, logger('service.acceptance')),
    );
    container.singleton(
      serviceInspectionServiceToken,
      (resolver) =>
        new ServiceInspectionService(
          resolver.resolve(databaseManagerToken),
          resolver.resolve(serviceDirectoryServiceToken),
          notifierFrom(resolver, logger('service.notification')),
        ),
    );
    container.singleton(
      serviceAssistantServiceToken,
      (resolver) =>
        new ServiceAssistantService(
          resolver.resolve(serviceKnowledgeServiceToken),
          blockedGenerator(),
        ),
    );
    container.singleton(
      serviceScheduleServiceToken,
      () => new ServiceScheduleService(this.app, scheduleConnection(this.app)),
    );
  }

  public override async boot(): Promise<void> {
    this.registerAuthorization();
    this.registerSchedules();
    await this.provisionAcceptanceWorkflow();
    await this.reconcileManualIndexes();
  }

  public override async shutdown(): Promise<void> {
    this.removeTeamSubject?.();
    this.removeTeamSubject = undefined;
  }

  private registerAuthorization(): void {
    const container = this.app.container;
    if (
      !container.has(authorizationToken) ||
      !container.has(databaseManagerToken)
    )
      return;
    const authz = container.resolve<AppAuthorization>(authorizationToken);
    const database = container.resolve<DatabaseManager>(databaseManagerToken);

    for (const collection of serviceCollections) {
      authz.database.collections.add({
        name: collection.name,
        title: collection.title,
      });
    }

    authz.ui.sections.add({
      name: 'service',
      title: 'After-sales service',
      parent: 'business',
    });

    for (const resource of serviceCompositeResources) {
      const reference = authz.compositeResources.define(resource.build());
      authz.ui.place(reference, { section: 'service' });
    }
    registerServiceRecordAccess(authz, database);

    // The engineer groups are an authorization subject type, not a second
    // permission model: membership alone carries the group's permission set.
    this.removeTeamSubject = authz.subjects.add(SERVICE_TEAM_SUBJECT, {
      async resolveFor(principal) {
        if (principal.type !== 'user') return [];
        const rows = await database
          .query()
          .selectFrom('serviceTeamMembers')
          .select('teamId')
          .where('userId', '=', principal.id)
          .execute();
        return rows.map((row) => String(row.teamId));
      },
      async filterActive(ids) {
        if (ids.length === 0) return [];
        const rows = await database
          .query()
          .selectFrom('serviceTeams')
          .select('id')
          .where(
            'id',
            'in',
            ids.map((id) => Number(id)),
          )
          .execute();
        return rows.map((row) => String(row.id));
      },
      administration: teamAdministration(database),
    });
  }

  /**
   * Whether the knowledge base can actually vectorize manually uploaded
   * documents. The application ships no embedding or vector service, so this
   * reads what an administrator has configured: a manual with text but no
   * configured service is reported `blocked` rather than silently pretending
   * to be indexed.
   */
  private vectorIndexAvailable(): boolean {
    const ai = this.app.config.get<{
      llmServices?: readonly unknown[];
      aiKnowledgeBase?: { vectorDatabases?: readonly unknown[] };
    }>('ai');
    if (!ai) return false;
    return (
      (ai.llmServices?.length ?? 0) > 0 &&
      (ai.aiKnowledgeBase?.vectorDatabases?.length ?? 0) > 0
    );
  }

  /**
   * Give every manual an honest index state at startup. Rows seeded before
   * the body column existed arrive without one, and nothing else would ever
   * write it.
   */
  private async reconcileManualIndexes(): Promise<void> {
    const container = this.app.container;
    if (!container.has(serviceKnowledgeServiceToken)) return;
    const logger = container
      .resolve(loggingToken)
      .getLogger('service.knowledge');
    try {
      await container.resolve(serviceKnowledgeServiceToken).reconcileManuals();
    } catch (error) {
      logger.warn(
        { err: error },
        'Manual index status could not be reconciled; manuals keep their stored status.',
      );
    }
  }

  private registerSchedules(): void {
    const container = this.app.container;
    if (!container.has(schedulerServiceToken)) return;
    const scheduler = container.resolve(schedulerServiceToken);

    scheduler.registerTarget({
      type: DAILY_INSPECTION_TARGET,
      title: 'Daily inspection generation',
      validate: validateEmpty,
      start: async () => {
        const service = container.resolve(serviceInspectionServiceToken);
        const summary = await service.runDailyGeneration();
        return {
          state: 'completed',
          outcome: 'succeeded',
          result: { created: summary.created, skipped: summary.skipped },
        };
      },
    });

    scheduler.registerTarget({
      type: OVERDUE_REMINDER_TARGET,
      title: 'Overdue reminder dispatch',
      validate: validateEmpty,
      start: async () => {
        const service = container.resolve(serviceInspectionServiceToken);
        const summary = await service.sendOverdueReminders();
        return {
          state: 'completed',
          outcome: 'succeeded',
          result: { created: summary.created, notified: summary.notified },
        };
      },
    });

    scheduler.defineSchedule({
      key: DAILY_INSPECTION_SCHEDULE.key,
      title: DAILY_INSPECTION_SCHEDULE.title,
      schedule: {
        cron: DAILY_INSPECTION_SCHEDULE.cron,
        timezone: DAILY_INSPECTION_SCHEDULE.timezone,
      },
      target: { type: DAILY_INSPECTION_TARGET, config: {} },
    });

    scheduler.defineSchedule({
      key: OVERDUE_REMINDER_SCHEDULE.key,
      title: OVERDUE_REMINDER_SCHEDULE.title,
      schedule: {
        cron: OVERDUE_REMINDER_SCHEDULE.cron,
        timezone: OVERDUE_REMINDER_SCHEDULE.timezone,
      },
      target: { type: OVERDUE_REMINDER_TARGET, config: {} },
    });
  }

  /**
   * Make the acceptance workflow runnable on a fresh installation.
   *
   * A deployed source workflow is inert until a revision is current and
   * enabled, and the plugin exposes that transition only through workflow
   * management. The application ships this workflow as part of the
   * requirement, so it materializes the revision the same way an operator
   * clicking "Enable" would and then enables the current revision. The step is
   * idempotent and best-effort: if the workflow runtime or the workflow tables
   * are absent, ticket creation still accepts tickets through
   * ServiceAcceptanceService's direct fallback, and the warning says so.
   */
  private async provisionAcceptanceWorkflow(): Promise<void> {
    const container = this.app.container;
    const logger = container
      .resolve(loggingToken)
      .getLogger('service.acceptance');
    if (
      !container.has(workflowServiceToken) ||
      !container.has(databaseManagerToken)
    )
      return;
    const database = container.resolve<DatabaseManager>(databaseManagerToken);
    if (!(await database.collections().get('workflows'))) return;
    const runtime = container.resolve(workflowServiceToken) as unknown as {
      discoverArtifacts(): Promise<readonly { key: string; digest: string }[]>;
      ensureArtifactMaterialized(digest: string): Promise<unknown>;
    };
    try {
      const artifacts = await runtime.discoverArtifacts();
      const artifact = artifacts.find(
        (item) => item.key === TICKET_ACCEPTANCE_WORKFLOW,
      );
      if (!artifact) {
        logger.warn(
          `Workflow "${TICKET_ACCEPTANCE_WORKFLOW}" was not found in this build; enable it in workflow management or rebuild before relying on it.`,
        );
        return;
      }
      await runtime.ensureArtifactMaterialized(artifact.digest);
      const workflows = database.repository<{
        id: number;
        key: string;
        enabled: boolean | null;
        current: boolean | null;
      }>('workflows');
      const current = await workflows.findOne({
        filter: { key: TICKET_ACCEPTANCE_WORKFLOW, current: true },
      });
      if (!current) return;
      if (current.enabled !== true) {
        await workflows.updateOne({
          filter: { id: Number(current.id) },
          values: { enabled: true },
        });
        logger.info(
          `Enabled the "${TICKET_ACCEPTANCE_WORKFLOW}" workflow for automatic ticket acceptance.`,
        );
      }
    } catch (error) {
      logger.warn(
        { err: error },
        `The "${TICKET_ACCEPTANCE_WORKFLOW}" workflow could not be enabled automatically; new tickets still accept through the direct service until an administrator enables it.`,
      );
    }
  }
}

function notifierFrom(
  resolver: ServiceResolver,
  logger: Logger,
): ServiceNotifier {
  return new ServiceNotifier(resolver, logger);
}

/**
 * The assistant's model integration is not part of this application: an
 * answer is only generated when a real language model is configured and wired
 * in. Until then the assistant is honest about it and returns the real
 * knowledge-search hits instead of an invented reply.
 */
function blockedGenerator(): AssistantGenerator {
  return {
    ready: () => false,
    reason:
      'No language model service is connected to this application, so a generated answer is unavailable. The knowledge-base results below are real.',
    generate: async () => {
      throw new Error('No language model service is configured.');
    },
  };
}

function validateEmpty(config: unknown): { valid: boolean; reason?: string } {
  return config !== null && typeof config === 'object' && !Array.isArray(config)
    ? { valid: true }
    : { valid: false, reason: 'config-must-be-an-object' };
}

function teamAdministration(database: DatabaseManager) {
  return {
    title: 'Engineer groups',
    selection: {
      type: 'collection' as const,
      async list(query: { search?: string; page: number; pageSize: number }) {
        const repository =
          database.repository<ServiceTeamRecord>('serviceTeams');
        const [rows, total] = await Promise.all([
          repository.findMany({
            filter: (filter) =>
              filter.and([
                ...(query.search
                  ? [filter.string('name').includes(query.search)]
                  : []),
              ]),
            sort: (sort) => sort.field('code').asc(),
            offset: (query.page - 1) * query.pageSize,
            limit: query.pageSize,
          }),
          repository.count(),
        ]);
        return {
          items: rows.map((row) => ({
            id: String(row.id),
            title: `${row.code} · ${row.name}`,
          })),
          total,
        };
      },
      async resolve(ids: readonly string[]) {
        if (ids.length === 0) return [];
        const rows = await database
          .repository<ServiceTeamRecord>('serviceTeams')
          .findMany({
            filter: (filter) =>
              filter.or(ids.map((id) => filter.number('id').eq(Number(id)))),
          });
        return rows.map((row) => ({
          id: String(row.id),
          title: `${row.code} · ${row.name}`,
        }));
      },
    },
  };
}
