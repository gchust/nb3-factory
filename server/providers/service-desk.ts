import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication/server';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import { workflowServiceToken } from '@nocobase/app-plugin-workflow/server';
import type { Application } from '@nocobase/app-server/application';
import { i18nToken } from '@nocobase/app-server/i18n';
import { loggingToken } from '@nocobase/app-server/logging';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import { provisionServiceDesk } from '../business/provision.js';
import { registerServiceResources } from '../business/register.js';
import { registerServiceRecordAccess } from '../business/record-access.js';
import {
  createAutoAcceptGateway,
  materializeAutoAcceptWorkflow,
  type AutoAcceptWorkflowRuntime,
} from '../services/automation.js';
import { createNotificationGateway } from '../services/notification-gateway.js';
import { createServerTranslator } from '../services/translator.js';
import {
  createServiceDesk,
  serviceDeskToken,
} from '../services/service-desk.js';

/**
 * Wires the after-sales service domain: it binds the business service, registers
 * the domain's permission resources, and prepares the initial permission
 * configuration and demonstration records for a fresh installation.
 */
export default class ServiceDeskProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/service-desk-provider';

  public override register(): void {
    this.app.container.singleton(serviceDeskToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      const authz = this.app.container.resolve(authorizationToken);
      const notifications = createNotificationGateway(() =>
        this.app.container.has(notificationServiceToken)
          ? this.app.container.resolve(notificationServiceToken)
          : undefined,
      );
      const automation = createAutoAcceptGateway(() =>
        this.resolveWorkflowRuntime(),
      );
      const translator = createServerTranslator(() =>
        this.app.container.has(i18nToken)
          ? this.app.container.resolve(i18nToken)
          : undefined,
      );
      return createServiceDesk({
        database,
        authz,
        notifications,
        automation,
        translator,
      });
    });
  }

  public override async boot(): Promise<void> {
    // The authorization plugin is optional from this provider's point of view:
    // a minimal host that registers the runtime without it has no permission
    // model to extend, and must still start.
    if (!this.app.container.has(authorizationToken)) return;
    const authz = this.app.container.resolve(authorizationToken);
    const database = this.app.container.resolve(databaseManagerToken);
    registerServiceResources(authz);
    registerServiceRecordAccess(authz, database);
  }

  public override async start(): Promise<void> {
    // The application owns its workflow definition, so it activates its own
    // materialized revision before serving requests. A deployment without the
    // workflow plugin, or one where the definition was edited away, simply has
    // no automation and acceptance falls back to a direct message.
    try {
      const workflowId = await materializeAutoAcceptWorkflow(() =>
        this.resolveWorkflowRuntime(),
      );
      if (workflowId) {
        this.logger().info(`auto-accept workflow activated (${workflowId})`);
      }
    } catch (error) {
      this.logger().warn(
        `auto-accept workflow activation skipped: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    // Install mode starts providers before the business tables are migrated.
    // Provisioning a database that does not exist yet is expected to fail, so a
    // missing table must not stop the application from starting.
    try {
      const result = await provisionServiceDesk({
        database: this.app.container.resolve(databaseManagerToken),
        authz: this.app.container.resolve(authorizationToken),
        users: this.app.container.resolve(userAdministrationServiceToken),
      });
      const parts: string[] = [];
      if (result.permissionSetsCreated.length > 0) {
        parts.push(
          `permission sets: ${result.permissionSetsCreated.join(', ')}`,
        );
      }
      if (result.accountsCreated.length > 0) {
        parts.push(`accounts: ${result.accountsCreated.join(', ')}`);
      }
      if (result.assignmentsCreated > 0) {
        parts.push(`assignments: ${result.assignmentsCreated}`);
      }
      if (result.demoDataCreated) parts.push('demo records');
      if (parts.length > 0) {
        this.logger().info(`service desk provisioned (${parts.join('; ')})`);
      }
    } catch (error) {
      this.logger().warn(
        `service desk provisioning skipped: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private resolveWorkflowRuntime(): AutoAcceptWorkflowRuntime | undefined {
    if (!this.app.container.has(workflowServiceToken)) return undefined;
    // The workflow provider registers the full service under the public token;
    // only the smaller contract is part of its typed surface.
    return this.app.container.resolve(
      workflowServiceToken,
    ) as unknown as AutoAcceptWorkflowRuntime;
  }

  private logger() {
    return this.app.container.resolve(loggingToken).getLogger('service-desk');
  }
}
