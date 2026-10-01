import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import { ServiceProvider } from '@nocobase/service-provider';

import {
  IT_SUPPORT_UI_SECTION,
  IT_TICKETS_ACTION,
  IT_TICKETS_COLLECTION,
  IT_TICKETS_RESOURCE,
} from './constants.js';
import { itOwnTickets } from './record-access.js';
import { itTicketsComposite } from './resources.js';

function localizedTitle(key: string): {
  readonly key: string;
  readonly ns: string;
} {
  return { key, ns: 'nb3-factory' };
}

/**
 * Registers everything the ticket feature needs from the authorization
 * system: the governed Collection, the record access that scopes a submitter
 * to their own rows, the `it.tickets` composite resource, and where the
 * permission workspace lists it.
 *
 * Registration is idempotent because boot may run more than once in an
 * embedded host.
 */
export class ItSupportProvider extends ServiceProvider<Application> {
  public readonly name: string = 'nb3-factory/it-support';

  public override boot(): Promise<void> {
    const { container } = this.app;

    // The ticket feature is built on the authorization plugin. An embedding host that strips
    // that plugin has nothing for this provider to declare, so it is skipped rather than
    // failing the whole application's startup; the real runtime always registers it.
    if (!container.has(authorizationToken)) {
      return Promise.resolve();
    }

    const authorization: AppAuthorization =
      container.resolve(authorizationToken);

    authorization.database.collections.add({
      name: IT_TICKETS_COLLECTION,
      title: localizedTitle('itSupport.collection.tickets'),
      description: localizedTitle('itSupport.collection.ticketsDescription'),
    });

    if (!authorization.recordAccess.get(itOwnTickets.build().key)) {
      authorization.recordAccess.define(itOwnTickets);
    }

    if (
      !authorization.compositeResources.getAction(
        IT_TICKETS_RESOURCE,
        IT_TICKETS_ACTION.view,
      )
    ) {
      authorization.compositeResources.define(itTicketsComposite);
    }

    if (!authorization.ui.sections.has(IT_SUPPORT_UI_SECTION)) {
      authorization.ui.sections.add({
        name: IT_SUPPORT_UI_SECTION,
        title: localizedTitle('itSupport.section'),
        parent: 'business',
        order: 10,
      });
    }

    authorization.ui.place(
      { type: 'composite', id: IT_TICKETS_RESOURCE },
      { section: IT_SUPPORT_UI_SECTION },
    );

    return Promise.resolve();
  }
}
