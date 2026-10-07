import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import type { Application } from '@nocobase/app-server/application';

import {
  IT_TICKETS_SECTION,
  itTicketsCollectionTitle,
  itTicketsResource,
  itTicketsSectionTitle,
  submittedByMe,
} from '../it-tickets/authorization.js';
import {
  createItTicketsService,
  itTicketsServiceToken,
} from '../it-tickets/service.js';
import { IT_TICKETS_COLLECTION } from '../it-tickets/ticket.js';

/**
 * Declares the ticket feature to the permission model and binds its service.
 *
 * All of it happens in `register()`, before the authorization plugin's own
 * `start()` resolves the stored grants: a grant in a Permission Set may only
 * name a collection, a data scope and an action somebody already declared, and
 * one that names anything else is reported and skipped. Only the declaration
 * lives here — what an account may actually do is a Permission Set, which an
 * administrator owns and the feature's seed creates.
 */
export class ItTicketsProvider extends ServiceProvider<Application> {
  public readonly name = 'it-tickets';

  public register(): void {
    // A host that registers no authorization plugin still gets the service, but
    // has no permission model to declare the feature to.
    if (this.app.container.has(authorizationToken)) {
      const authz = this.app.container.resolve(authorizationToken);

      // Opting the table into the permission model is what makes it grantable at
      // all, and is required even for a role that reads every row.
      authz.database.collections.add({
        name: IT_TICKETS_COLLECTION,
        title: itTicketsCollectionTitle,
      });
      authz.recordAccess.define(submittedByMe);
      authz.compositeResources.define(itTicketsResource);
      // Where the operation is listed in the permission-set editor. A resource is
      // placed in a *subsection*, and composites otherwise default to the
      // "Other" subsection of Business; giving the feature one of its own keeps
      // it in one piece when an administrator goes looking for it. Listing it is
      // display only; it grants nothing on its own.
      authz.ui.sections.add({
        name: IT_TICKETS_SECTION,
        parent: 'business',
        title: itTicketsSectionTitle,
      });
      authz.ui.place(itTicketsResource.reference(), {
        section: IT_TICKETS_SECTION,
      });
    }

    this.app.container.singleton(itTicketsServiceToken, (container) =>
      createItTicketsService({
        database: container.resolve<DatabaseManager>(databaseManagerToken),
      }),
    );
  }
}
