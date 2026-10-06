import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication/server';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';

import {
  DocumentsService,
  documentsServiceToken,
} from '../documents-service.js';
import { registerDocumentsResources } from '../documents-resources.js';

/**
 * The two isolated test identities the acceptance run uses. They are created once, on first start; an
 * existing account is left exactly as an administrator left it, including a changed password or a
 * revoked assignment.
 */
const accounts = [
  {
    name: '主管',
    username: 'supervisor',
    email: 'supervisor@example.com',
    password: 'supervisor123',
    permissionSet: 'documents-supervisor',
  },
  {
    name: '普通同事',
    username: 'colleague',
    email: 'colleague@example.com',
    password: 'colleague123',
    permissionSet: 'documents-staff',
  },
] as const;

/**
 * Owns the documents feature's server side: it binds the reader service, registers the authorization
 * resources the routes and the assistant both check against, and provisions the two test identities.
 */
export default class DocumentsProvider extends ServiceProvider<Application> {
  public readonly name = 'app/documents';

  public override register(): void {
    // The permission model, and with it the documents composite, comes from the authorization plugin.
    // A runtime assembled without that plugin (a minimal fixture, a check that only reads config) has
    // no way to enforce a document's access level, so this provider contributes nothing there rather
    // than binding a service whose every call would throw.
    if (!this.app.container.has(authorizationToken)) return;
    const database = this.app.container.resolve(databaseManagerToken);
    const authz = this.app.container.resolve(authorizationToken);
    this.app.container.instance(
      documentsServiceToken,
      new DocumentsService(database, authz),
    );
  }

  public override async boot(): Promise<void> {
    if (!this.app.container.has(authorizationToken)) return;
    registerDocumentsResources(this.app.container.resolve(authorizationToken));
  }

  public override async start(): Promise<void> {
    if (!this.app.container.has(authorizationToken)) return;
    await this.provisionAccounts();
  }

  /**
   * Best-effort: an environment whose database is not migrated yet (a bare `db apply`, a config check)
   * must still boot. The accounts appear on the next start that has the schema.
   */
  private async provisionAccounts(): Promise<void> {
    try {
      const users = this.app.container.resolve(userAdministrationServiceToken);
      const authz = this.app.container.resolve(authorizationToken);
      for (const account of accounts) {
        const page = await users.list({
          search: account.email,
          pageSize: 5,
        });
        let user = page.items.find((item) => item.email === account.email);
        user ??= await users.create({
          name: account.name,
          username: account.username,
          email: account.email,
          password: account.password,
        });
        const assignments = await authz.permissionSets.listAssignments(
          account.permissionSet,
        );
        const assigned = assignments.some(
          (assignment) =>
            assignment.subject.type === 'user' &&
            assignment.subject.id === user.id,
        );
        if (!assigned) {
          await authz.permissionSets.assign({
            permissionSet: account.permissionSet,
            subject: { type: 'user', id: user.id },
          });
        }
      }
    } catch (error) {
      console.warn(
        '[app/documents] Unable to provision the documents test accounts:',
        error instanceof Error ? error.message : error,
      );
    }
  }
}
