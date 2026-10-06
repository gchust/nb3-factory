import { APP_NS } from '@nocobase/i18n';
import type { Application } from '@nocobase/app-server/application';
import { ServiceProvider } from '@nocobase/service-provider';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import {
  REPAIR_TICKETS_COLLECTION,
  repairTickets,
  submittedByMeAccess,
} from '../tickets-resources.js';

/** The workspace subsection the repair-ticket permission lives under. */
const UI_SECTION = 'it-support';

/**
 * Registers the IT repair-ticket business operations with the application's
 * authorization service.
 *
 * Registration declares what the product supports; it grants nobody access.
 * The initial grants are written by the installation seeds, and administrators
 * keep editing them in the authorization backend.
 */
export class RepairTicketsProvider extends ServiceProvider<Application> {
  readonly name = 'nb3-factory/tickets';

  /**
   * Boot, not register: the authorization provider binds its token in
   * `register`, and this provider is added to the application after every
   * plugin provider, so the token is present by the time this runs. An
   * application assembled without authorization simply skips the feature.
   */
  override async boot(): Promise<void> {
    if (!this.app.container.has(authorizationToken)) {
      return;
    }

    const authz = this.app.container.resolve(authorizationToken);

    authz.database.collections.add({
      name: REPAIR_TICKETS_COLLECTION,
      title: { key: 'tickets.authz.collection', ns: APP_NS },
      description: { key: 'tickets.authz.collectionDescription', ns: APP_NS },
      // The workflow never deletes a ticket; delete is not offered.
      actions: ['read', 'create', 'update'],
    });
    authz.recordAccess.define(submittedByMeAccess);

    const reference = authz.compositeResources.define(repairTickets);

    if (!authz.ui.sections.has(UI_SECTION)) {
      authz.ui.sections.add({
        name: UI_SECTION,
        title: { key: 'tickets.authz.section', ns: APP_NS },
        parent: 'business',
        order: 20,
      });
    }
    authz.ui.place(reference, { section: UI_SECTION });
  }
}
