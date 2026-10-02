import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';
import {
  IT_TICKETS_BUSINESS_SECTION,
  IT_TICKETS_COLLECTION,
  IT_TICKETS_COMPOSITE,
  IT_TICKETS_NAMESPACE,
  IT_TICKETS_OWN_RECORD_ACCESS,
  itTickets,
  ownTicketsRecordAccess,
} from '../it-tickets-resources.js';
import {
  ItTicketsService,
  itTicketsServiceToken,
} from '../it-tickets-service.js';

const title = (key: string) => ({ key, ns: IT_TICKETS_NAMESPACE });

/**
 * Registers the IT repair ticket feature with the application: the table as
 * part of the permission model, the record access that scopes a ticket to its
 * submitter, the composite business operation and its workspace placement.
 *
 * Declarations happen in `boot()` rather than at module scope because the
 * authorization service only exists after every provider has registered, and
 * they are guarded so a second application in the same process does not
 * re-register what it already holds.
 */
export class ItTicketsProvider extends ServiceProvider<Application> {
  readonly name = 'it-tickets';

  register(): void {
    this.app.container.singleton(itTicketsServiceToken, (resolver) => {
      return new ItTicketsService(resolver.resolve(databaseManagerToken));
    });
  }

  async boot(): Promise<void> {
    // A runtime assembled without the authorization plugin — a focused test or a
    // deliberately minimal embedded application — has no service to register
    // against. Skip rather than fail the whole boot: the feature's routes are
    // only mounted by a runtime that also mounts the plugin.
    if (!this.app.container.has(authorizationToken)) {
      return;
    }
    const authz: AppAuthorization =
      this.app.container.resolve(authorizationToken);

    if (!authz.database.collections.has(IT_TICKETS_COLLECTION)) {
      authz.database.collections.add({
        name: IT_TICKETS_COLLECTION,
        title: title('resource'),
        description: title('resourceDescription'),
        actions: ['read', 'create', 'update'],
      });
    }

    if (!authz.recordAccess.get(IT_TICKETS_OWN_RECORD_ACCESS)) {
      authz.recordAccess.define(ownTicketsRecordAccess);
    }

    if (
      !authz.compositeResources
        .list()
        .some((resource) => resource.name === IT_TICKETS_COMPOSITE)
    ) {
      const reference = authz.compositeResources.define(itTickets);
      authz.ui.sections.add({
        name: IT_TICKETS_BUSINESS_SECTION,
        title: title('sections.support'),
        parent: 'business',
      });
      authz.ui.place(reference, { section: IT_TICKETS_BUSINESS_SECTION });
    }
  }
}
