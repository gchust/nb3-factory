import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';

import { registerItRecordAccess } from './record-access.js';
import { IT_TICKETS_COLLECTION, itTitle, itTickets } from './resources.js';
import { ItTicketService, itTicketServiceToken } from './service.js';

/** The IT support subsection of the permission workspace. */
export const IT_PERMISSION_SECTION = 'it-support';

export { itTicketServiceToken };

/**
 * Declares the IT ticket permission model and binds the domain service.
 *
 * Everything authorization reads is registered in `boot()`: it runs after every
 * provider has registered, and the authorization provider validates UI
 * placements only in `start()`, so the section and composite are always in place
 * before that check.
 */
export default class ItTicketsProvider extends ServiceProvider<Application> {
  public readonly name: string = 'nb3-factory/it-tickets-provider';

  public override register(): void {
    this.app.container.singleton(itTicketServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return new ItTicketService(database);
    });
  }

  public override boot(): Promise<void> {
    // The authorization plugin is optional here: an embedded runtime can be
    // composed without it (the template's own test composes one). Nothing can
    // authorize a ticket request in that runtime, so this provider contributes
    // no permission model and `server/it/routes.ts` mounts no ticket API. The
    // application's `server/plugins.ts` always registers the plugin.
    if (!this.app.container.has(authorizationToken)) {
      return Promise.resolve();
    }
    const authz = this.app.container.resolve(authorizationToken);

    authz.database.collections.add({
      name: IT_TICKETS_COLLECTION,
      title: itTitle('it.collection.tickets'),
      // Delete is deliberately absent: a ticket is retained once completed.
      actions: ['read', 'create', 'update'],
    });
    registerItRecordAccess(authz);

    const tickets = authz.compositeResources.define(itTickets);

    authz.ui.sections.add({
      name: IT_PERMISSION_SECTION,
      title: itTitle('it.section.title'),
      parent: 'business',
      order: 100,
    });
    authz.ui.place(tickets, { section: IT_PERMISSION_SECTION, order: 10 });

    return Promise.resolve();
  }
}
