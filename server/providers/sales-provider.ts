import type { Application } from '@nocobase/app-server/application';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { workflowServiceToken } from '@nocobase/app-plugin-workflow/server';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import { setupSalesAuthorization } from './sales-authz.js';
import {
  createRoleSubjectMiddleware,
  type AuthorizationWithMiddlewareChain,
} from './sales-role-subjects.js';
import { DefaultSalesService, salesServiceToken } from './sales-service.js';

const APP_PACKAGE_NAME = '@nocobase/app-template-default';

/** The sales workflows shipped with the application. */
const SALES_WORKFLOW_KEYS = [
  'lead-assignment-notification',
  'opportunity-win-notification',
  'overdue-follow-up-reminder',
] as const;

/**
 * Runtime surface of the workflow service used to materialize and enable the
 * shipped workflows. The public contract only exposes `trigger`, so the
 * materialization methods are reached through a structural cast.
 */
interface WorkflowMaterializer {
  discoverArtifacts(): Promise<readonly { key: string; digest: string }[]>;
  ensureArtifactMaterialized(hash: string): Promise<unknown>;
}

export default class SalesProvider extends ServiceProvider<Application> {
  public readonly name: string = `${APP_PACKAGE_NAME}/sales-provider`;

  public override register(): void {
    this.app.container.instance(
      salesServiceToken,
      new DefaultSalesService(this.app.container.resolve(databaseManagerToken)),
    );
  }

  public override async start(): Promise<void> {
    const authz = this.app.container.resolve(authorizationToken);
    const database = this.app.container.resolve(databaseManagerToken);
    await setupSalesAuthorization(authz, database);
    this.installRoleSubjectMiddleware(database);
    await this.enableSalesWorkflows(database);
  }

  /**
   * The authorization plugin's identity middleware only resolves the `user`
   * principal and the `authenticated:*` subject, so permission-set grants
   * assigned to `role:<key>` subjects never match — every page-level access
   * check (`/api/authz/permissions`) and any route using
   * `authorization.middleware()` would deny sales, sales-manager and visitor
   * users. This appends a middleware that reads the user's roles from the
   * application's own roles/userRoles tables and adds them as subjects, so
   * the role-assigned permission sets take effect for every request.
   */
  private installRoleSubjectMiddleware(database: DatabaseManager): void {
    const authz = this.app.container.resolve(
      authorizationToken,
    ) as unknown as AuthorizationWithMiddlewareChain;
    authz.middlewares.push(createRoleSubjectMiddleware(database));
  }

  /**
   * Materializes and enables the shipped sales workflows. The workflow plugin
   * registers artifacts lazily on first trigger and a freshly materialized
   * revision is never enabled, so without this step every trigger would be
   * skipped with `disabled` and no notification would ever be sent.
   */
  private async enableSalesWorkflows(database: DatabaseManager): Promise<void> {
    const workflow = this.app.container.resolve(
      workflowServiceToken,
    ) as unknown as WorkflowMaterializer;
    const artifacts = await workflow.discoverArtifacts();
    for (const artifact of artifacts) {
      if (!(SALES_WORKFLOW_KEYS as readonly string[]).includes(artifact.key)) {
        continue;
      }
      await workflow.ensureArtifactMaterialized(artifact.digest);
    }
    await database
      .query()
      .updateTable('workflows')
      .set({ enabled: true })
      .where('key', 'in', [...SALES_WORKFLOW_KEYS])
      .where('current', '=', true)
      .execute();
  }
}
