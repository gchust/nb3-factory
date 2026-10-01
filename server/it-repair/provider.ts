import type { Application } from '@nocobase/app-server/application';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { databaseManagerToken } from '@nocobase/db';
import { APP_NS } from '@nocobase/i18n';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';

import {
  ownSubmittedTickets,
  REPAIR_TICKET_COLLECTION,
  repairTickets,
  repairTicketsResource,
} from './declarations.js';
import { RepairTicketService } from './service.js';

/** The token routes resolve to reach {@link RepairTicketService}. */
export const repairTicketServiceToken =
  createServiceToken<RepairTicketService>('it-repair/tickets');

/**
 * Registers the IT repair workflow with the authorization runtime: the
 * `ownSubmittedTickets` record access, the `it.tickets` composite resource and
 * its placement in the permission workspace. Every plugin has already run
 * `setup()` by the time `boot()` resolves `authorizationToken`, so the built-in
 * `business` section exists before this adds a subsection to it.
 */
export class ItRepairProvider extends ServiceProvider<Application> {
  readonly name = 'it-repair';

  register(): void {
    this.app.container.singleton(repairTicketServiceToken, (container) => {
      const database = container.resolve(databaseManagerToken);
      return new RepairTicketService(database);
    });
  }

  async boot(): Promise<void> {
    // The authorization plugin owns `authorizationToken`. A deliberately
    // minimal runtime without that plugin registers no such service, and there
    // is then no authorization runtime to declare these entries on.
    if (!this.app.container.has(authorizationToken)) return;
    const authz = this.app.container.resolve(authorizationToken);
    authz.database.collections.add({
      name: REPAIR_TICKET_COLLECTION,
      title: { key: 'itRepair.resource.title', ns: APP_NS },
    });
    authz.recordAccess.define(ownSubmittedTickets);
    authz.compositeResources.define(repairTicketsResource);
    authz.ui.sections.add({
      name: 'business.it-repair',
      parent: 'business',
      title: { key: 'itRepair.section.title', ns: APP_NS },
    });
    authz.ui.place(repairTickets, { section: 'business.it-repair' });
  }
}
