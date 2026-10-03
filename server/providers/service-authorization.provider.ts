import { ServiceProvider } from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';

import {
  assignedToMeAccess as assignedToMeAccessDefinition,
  noRecordsAccess as noRecordsAccessDefinition,
  publishedOnlyAccess as publishedOnlyAccessDefinition,
  sharedOrderAccess as sharedOrderAccessDefinition,
} from '../service/record-access.js';
import { serviceResources } from '../service/resources.js';

/** Collections that take part in the service permission model. */
const collections = [
  { name: 'customers', title: 'Customers' },
  { name: 'devices', title: 'Devices' },
  { name: 'engineerGroups', title: 'Engineer groups' },
  { name: 'engineerProfiles', title: 'Engineer profiles' },
  { name: 'knowledgeArticles', title: 'Knowledge articles' },
  { name: 'serviceOrders', title: 'Service orders' },
  { name: 'serviceOrderShares', title: 'Order shares' },
  { name: 'serviceOrderFiles', title: 'Order files' },
  { name: 'serviceFiles', title: 'Service files' },
  { name: 'inspections', title: 'Inspections' },
] as const;

const uiSections = [
  { name: 'service', title: 'After-sales service', parent: 'business' },
  { name: 'service.knowledge', title: 'Repair knowledge', parent: 'business' },
] as const;

/**
 * Registers the service domain into the application's authorization model.
 *
 * Runs in `register()` so the model exists before any provider boots: the
 * authorization plugin has already bound `authorizationToken` (it is a plugin
 * provider, registered before application providers), and stored permission
 * sets are scanned at startup after this provider registers.
 *
 * A composition without the authorization plugin (a focused test, or a host
 * that mounts the application runtime with no plugins) simply has no model to
 * extend, so registration is skipped instead of failing the boot.
 */
export class ServiceAuthorizationProvider extends ServiceProvider<Application> {
  name = 'service/authorization';

  register(): void {
    if (!this.app.container.has(authorizationToken)) {
      return;
    }
    const authz: AppAuthorization =
      this.app.container.resolve(authorizationToken);

    for (const collection of collections) {
      authz.database.collections.add(collection);
    }

    authz.recordAccess.define(assignedToMeAccessDefinition);
    authz.recordAccess.define(noRecordsAccessDefinition);
    authz.recordAccess.define(publishedOnlyAccessDefinition);
    authz.recordAccess.define(sharedOrderAccessDefinition);

    for (const section of uiSections) {
      authz.ui.sections.add(section);
    }

    for (const resource of serviceResources) {
      const reference = authz.compositeResources.define(resource);
      authz.ui.place(reference, { section: 'service' });
    }
  }
}
