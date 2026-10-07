/**
 * The HR feature's service provider.
 *
 * `register()` binds the service. `boot()` declares the authorization
 * vocabulary — the collections the feature may reach and the composite every
 * route asks for — before any provider starts, so the authorization workspace
 * validates it. `start()` provisions the Permission Sets, demo accounts and
 * sample data, and `ready()` retries once the application is fully up; both
 * swallow and log a failure so a seeding problem never keeps the app from
 * serving.
 */
import type { Application } from '@nocobase/app-server/application';
import { ServiceProvider } from '@nocobase/service-provider';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { loggingToken } from '@nocobase/app-server/logging';
import { hrPortalDefinition } from '../hr/resources.js';
import { hrServiceToken, HrService } from '../hr/service.js';

/** Collections the HR permission sets reach. Registering them is the opt-in. */
const HR_COLLECTIONS = [
  { name: 'hrDepartments', title: 'HR departments' },
  { name: 'hrEmployees', title: 'HR employees' },
  { name: 'hrLeaveRequests', title: 'HR leave requests' },
  { name: 'hrNotifications', title: 'HR notifications' },
] as const;

export class HrProvider extends ServiceProvider<Application> {
  readonly name = 'hr';

  register(): void {
    this.app.container.singleton(hrServiceToken, () => new HrService(this.app));
  }

  async boot(): Promise<void> {
    // The HR vocabulary only makes sense with the authorization plugin present.
    // A host that composes the runtime without it (a minimal test scope, for
    // example) still boots; HR permissions are simply unavailable there.
    if (!this.app.container.has(authorizationToken)) {
      this.app.container
        .resolve(loggingToken)
        .getLogger('hr')
        .warn(
          'HR: the authorization plugin is not registered; HR permissions are unavailable.',
        );
      return;
    }
    const authz = this.app.container.resolve(authorizationToken);
    for (const collection of HR_COLLECTIONS) {
      authz.database.collections.add(collection);
    }
    const reference = authz.compositeResources.define(hrPortalDefinition);
    // List the composite in the permission workspace; without a placement it is
    // only reported under `business.other` at startup.
    authz.ui.sections.add({
      name: 'hr',
      title: 'HR',
      parent: 'business',
      order: 100,
    });
    authz.ui.place(reference, { section: 'hr' });
  }

  async start(): Promise<void> {
    await this.provision();
  }

  async ready(): Promise<void> {
    await this.provision();
  }

  private async provision(): Promise<void> {
    if (!this.app.container.has(authorizationToken)) return;
    try {
      await this.app.container.resolve(hrServiceToken).ensureProvisioned();
    } catch (error) {
      this.app.container
        .resolve(loggingToken)
        .getLogger('hr')
        .warn(`HR: provisioning failed and will be retried: ${String(error)}`);
    }
  }
}

export default HrProvider;
