import type { Application } from '@nocobase/app-server/application';
import { ServiceProvider } from '@nocobase/service-provider';
import { databaseManagerToken } from '@nocobase/db';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';
import type { ServiceModuleConfig } from '../config/service.js';
import {
  authorizationToken,
  type SubjectOption,
} from '@nocobase/app-plugin-authorization/server';
import {
  defineSchedule,
  type JsonObject,
} from '@nocobase/app-plugin-scheduler/server';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import { textValue } from '../service/text.js';
import {
  createServiceAccessService,
  SERVICE_TEAM_SUBJECT_TYPE,
  serviceAccessToken,
} from '../service/access.js';
import {
  createServiceAssistantService,
  serviceAssistantToken,
} from '../service/assistant.js';
import {
  createServiceAttachmentService,
  serviceAttachmentToken,
} from '../service/attachments.js';
import {
  createServiceInspectionService,
  SERVICE_INSPECTION_TARGET,
  SERVICE_OVERDUE_TARGET,
  serviceInspectionToken,
} from '../service/inspections.js';
import {
  createServiceIntegrationService,
  serviceIntegrationToken,
} from '../service/integration.js';
import {
  createServiceNotificationService,
  serviceNotificationToken,
} from '../service/notifications.js';
import {
  createServiceTicketService,
  serviceTicketToken,
} from '../service/tickets.js';

/**
 * Wires the after-sales service module into the application.
 *
 * The provider owns three things that are not a route or a schema change:
 * the business services behind their tokens, the `service-team-member`
 * authorization subject type that makes team jobs inheritable, and the two
 * scheduler targets with their daily and hourly schedules.
 */
export class ServiceModuleProvider extends ServiceProvider<Application> {
  readonly name = 'service';

  register(): void {
    const container = this.app.container;
    const config = this.app.config.get<ServiceModuleConfig>(
      'service',
    ) as ServiceModuleConfig;
    const registeredChannels = Object.keys(
      this.app.config.get<NotificationConfig>('notification')?.channels ?? {},
    );

    container.singleton(serviceAccessToken, (resolver) =>
      createServiceAccessService(resolver),
    );
    container.singleton(serviceTicketToken, (resolver) =>
      createServiceTicketService(resolver),
    );
    container.singleton(serviceNotificationToken, (resolver) =>
      createServiceNotificationService(resolver, config, registeredChannels),
    );
    container.singleton(serviceInspectionToken, (resolver) =>
      createServiceInspectionService(resolver, config),
    );
    container.singleton(serviceAttachmentToken, (resolver) =>
      createServiceAttachmentService(resolver, config),
    );
    container.singleton(serviceIntegrationToken, (resolver) =>
      createServiceIntegrationService(resolver),
    );
    container.singleton(serviceAssistantToken, (resolver) =>
      createServiceAssistantService(
        resolver,
        config,
        (this.app.config.get<{ llmServices?: readonly unknown[] }>('ai')
          ?.llmServices?.length ?? 0) > 0,
      ),
    );

    this.registerSubjectType();
    this.registerSchedules();
  }

  /**
   * A team membership is an authorization subject: the membership row owns the
   * job assignment, so leaving the team removes the inherited job while the
   * account's own assignments stay untouched.
   */
  private registerSubjectType(): void {
    // Authorization is an optional plugin in a bare test application; only
    // extend its subject registry when it is actually present.
    if (!this.app.container.has(authorizationToken)) return;
    const authz = this.app.container.resolve(authorizationToken);
    const database = this.app.container.resolve(databaseManagerToken);

    authz.subjects.add(SERVICE_TEAM_SUBJECT_TYPE, {
      async resolveFor(principal) {
        if (principal.type !== 'user') return [];
        const rows = await database
          .query()
          .selectFrom('service_team_members')
          .select(['id'])
          .where('userId', '=', principal.id)
          .execute<Record<string, unknown>>();
        return rows.map((row) => String(row.id));
      },
      async filterActive(ids) {
        if (ids.length === 0) return [];
        const rows = await database
          .query()
          .selectFrom('service_team_members')
          .select(['service_team_members.id as id'])
          .innerJoin(
            'service_teams',
            'service_teams.id',
            'service_team_members.teamId',
          )
          .where(
            'service_team_members.id',
            'in',
            ids.map((id) => Number(id)),
          )
          .where('service_teams.enabled', '=', true)
          .execute<Record<string, unknown>>();
        return rows.map((row) => String(row.id));
      },
      administration: {
        title: 'Service team member',
        selection: {
          type: 'collection',
          async list(query) {
            const rows = await database
              .query()
              .selectFrom('service_team_members')
              .select(['id', 'userName', 'jobKey', 'teamId'])
              .where((eb) =>
                query.search
                  ? eb('userName', 'like', `%${query.search}%`)
                  : eb('id', '>', 0),
              )
              .orderBy('id', 'asc')
              .limit(query.pageSize)
              .offset((query.page - 1) * query.pageSize)
              .execute<Record<string, unknown>>();
            const totalRow = await database
              .query()
              .selectFrom('service_team_members')
              .select(({ fn }) => [fn.countAll().as('count')])
              .executeTakeFirst<Record<string, unknown>>();
            return {
              items: rows.map(toSubjectOption),
              total: Number(totalRow?.count ?? 0),
            };
          },
          async resolve(ids) {
            if (ids.length === 0) return [];
            const rows = await database
              .query()
              .selectFrom('service_team_members')
              .select(['id', 'userName', 'jobKey'])
              .where(
                'id',
                'in',
                ids.map((id) => Number(id)),
              )
              .execute<Record<string, unknown>>();
            return rows.map(toSubjectOption);
          },
        },
      },
    });
  }

  /** Daily inspection creation and the hourly overdue sweep. */
  private registerSchedules(): void {
    const container = this.app.container;
    if (!container.has(schedulerServiceToken)) return;
    const scheduler = container.resolve(schedulerServiceToken);
    const config = this.app.config.get<ServiceModuleConfig>(
      'service',
    ) as ServiceModuleConfig;

    scheduler.registerTarget<JsonObject>({
      type: SERVICE_INSPECTION_TARGET,
      title: 'Service inspection run',
      validate: () => ({ valid: true }),
      async start() {
        const inspections = container.resolve(serviceInspectionToken);
        const result = await inspections.runInspectionTasks({
          triggeredBy: 'schedule',
        });
        return {
          state: 'completed',
          outcome: 'succeeded',
          result: { ...result } as unknown as JsonObject,
        };
      },
    });

    scheduler.registerTarget<JsonObject>({
      type: SERVICE_OVERDUE_TARGET,
      title: 'Service overdue ticket check',
      validate: () => ({ valid: true }),
      async start() {
        const inspections = container.resolve(serviceInspectionToken);
        const result = await inspections.checkOverdue();
        return {
          state: 'completed',
          outcome: 'succeeded',
          result: { ...result } as unknown as JsonObject,
        };
      },
    });

    scheduler.defineSchedule(
      defineSchedule({
        key: 'service.inspection.daily',
        title: 'Daily device inspection',
        description:
          'Creates one inspection task per enabled device at the configured local time.',
        schedule: {
          cron: config.inspection.cron,
          timezone: config.inspection.timezone,
        },
        target: { type: SERVICE_INSPECTION_TARGET, config: {} },
      }),
    );

    scheduler.defineSchedule(
      defineSchedule({
        key: 'service.overdue.hourly',
        title: 'Overdue service ticket check',
        description:
          'Flags open tickets past their service level deadline and notifies the assignee once a day.',
        schedule: { cron: '0 * * * *', timezone: config.inspection.timezone },
        target: { type: SERVICE_OVERDUE_TARGET, config: {} },
      }),
    );
  }
}

function toSubjectOption(row: Record<string, unknown>): SubjectOption {
  return {
    id: String(row.id),
    title: `${textValue(row.userName, 'Member')} · ${textValue(row.jobKey)}`,
  };
}

export default ServiceModuleProvider;
