import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

import { tickets, ticketOwnership } from './resources.js';
import { createTicketService, type TicketService } from './service.js';

export const ticketServiceToken: ServiceToken<TicketService> =
  createServiceToken<TicketService>('app/ticket-service');

/** The permission workspace subsection this feature is listed under. */
const IT_SUPPORT_SECTION = 'it-support';

/**
 * Registers the ticket service and, at boot, the authorization declarations it
 * depends on: the governed collection, the "submitted by me" record access and
 * the composite business operation.
 */
export default class TicketsProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/tickets';

  public override register(): void {
    this.app.container.singleton(ticketServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return createTicketService(database);
    });
  }

  public override async boot(): Promise<void> {
    const container = this.app.container;
    if (!container.has(authorizationToken)) {
      // A composition without the authorization plugin — the application
      // runtime test builds one — keeps the service but registers no rules.
      return;
    }

    const authz: AppAuthorization = container.resolve(authorizationToken);

    authz.database.collections.add({ name: 'tickets', title: 'IT tickets' });
    authz.recordAccess.define(ticketOwnership);

    const reference = authz.compositeResources.define(tickets);

    authz.ui.sections.add({
      name: IT_SUPPORT_SECTION,
      parent: 'business',
      title: 'IT support',
    });
    authz.ui.place(reference, { section: IT_SUPPORT_SECTION });
  }
}
