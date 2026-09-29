import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import { IT_TICKET_COLLECTION } from './domain.js';
import { itTicketsResource } from './resources.js';
import {
  ItTicketServiceImplementation,
  itTicketServiceToken,
} from './service.js';

const NS = 'nb3-factory';

/** The subsection the permission workspace lists the IT ticket resource under. */
export const IT_TICKETS_SECTION = 'itTickets';

/**
 * Registers the ticket collection and its composite resource with the
 * application's Authorization, places it in the permission workspace, and
 * binds the service. Registration describes what the feature supports; it
 * grants nobody access — the permission sets in the seed do that.
 *
 * This provider must be registered after the Authorization plugin so
 * `authorizationToken` resolves in `boot()`.
 */
export class ItTicketsProvider extends ServiceProvider<Application> {
  public readonly name: string = 'nb3-factory/it-tickets';

  public override register(): void {
    this.app.container.singleton(
      itTicketServiceToken,
      (resolver) =>
        new ItTicketServiceImplementation(
          resolver.resolve(databaseManagerToken),
        ),
    );
  }

  public override async boot(): Promise<void> {
    // Composite resources, the collection registry and the permission workspace
    // all come from the Authorization plugin. When that plugin is not part of
    // the assembly there is no registry to extend, so the feature registers
    // nothing and its routes stay unmounted; a full application always includes
    // it.
    if (!this.app.container.has(authorizationToken)) {
      return;
    }
    const authz = this.app.container.resolve(authorizationToken);

    authz.database.collections.add({
      name: IT_TICKET_COLLECTION,
      title: { key: 'itTickets.collection.title', ns: NS },
    });

    const reference = authz.compositeResources.define(itTicketsResource);

    authz.ui.sections.add({
      name: IT_TICKETS_SECTION,
      parent: 'business',
      title: { key: 'itTickets.section.title', ns: NS },
      order: 400,
    });
    authz.ui.place(reference, { section: IT_TICKETS_SECTION });
  }
}
