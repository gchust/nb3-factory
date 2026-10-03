import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import { ServiceProvider } from '@nocobase/service-provider';
import {
  IT_TICKETS_COLLECTION,
  itSubmittedByMe,
} from '../it-tickets/record-access.js';
import { itTicketsResource } from '../it-tickets/resources.js';

/**
 * Registers the IT repair-request permission model.
 *
 * Registration declares what the feature can do; it grants nobody anything.
 * Which job may see or handle requests is configuration, delivered by the
 * permission-set seed and editable in the authorization settings afterwards.
 *
 * `boot()` runs after the authorization provider has registered its own
 * registries and before its stored-grant scan, so the declarations below are
 * in place when existing grants are checked.
 */
export class ItTicketsProvider extends ServiceProvider<Application> {
  readonly name = '@nocobase/it-tickets';

  async boot(): Promise<void> {
    // The permission model only exists to extend the authorization plugin. A
    // runtime composed without it (an embedded scope, or a deployment that
    // removed the plugin) must still start, so stay silent rather than fail.
    if (!this.app.container.has(authorizationToken)) return;
    const authz = this.app.container.resolve(authorizationToken);
    // The record access has to exist before a stored grant can name it.
    authz.recordAccess.define(itSubmittedByMe);
    // Opting the collection in is what lets any action reach it, including for
    // an unrestricted identity.
    authz.database.collections.add({
      name: IT_TICKETS_COLLECTION,
      title: 'IT repair requests',
    });
    const reference = authz.compositeResources.define(itTicketsResource);
    authz.ui.sections.add({
      name: 'it-support',
      title: 'IT support',
      parent: 'business',
    });
    authz.ui.place(reference, { section: 'it-support' });
  }
}

export default ItTicketsProvider;
