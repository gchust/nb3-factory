import type { Application } from '@nocobase/app-server/application';
import {
  authorizationToken,
  type AppAuthorizationService,
} from '@nocobase/app-plugin-authorization';
import { databaseManagerToken } from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';

import { TICKETS_COLLECTION, TICKETS_PAGE } from '../../tickets-resources.js';
import { ticketsSubmitted } from './record-access.js';
import { TicketsService } from './service.js';

export const ticketsServiceToken =
  createServiceToken<TicketsService>('tickets-service');

/**
 * Owns the ticket feature's place in the authorization model.
 *
 * The collection, the page and the record-access scope are registered here, in
 * the provider that owns them, so the model is complete before any grant is
 * resolved. The service token is bound separately, and lazily, so a request
 * that never touches tickets never constructs the service.
 */
export class TicketsProvider extends ServiceProvider<Application> {
  readonly name = 'tickets';

  register(): void {
    this.app.container.singleton(
      ticketsServiceToken,
      (container) =>
        new TicketsService(
          container.resolve(databaseManagerToken),
          container.resolve(authorizationToken),
        ),
    );
  }

  async boot(): Promise<void> {
    // The authorization model only exists with the authorization plugin. When
    // it is not registered there is nothing to contribute to, and the
    // provider must still boot; the ticket routes resolve the same token and
    // are only mounted when the plugin is present.
    if (!this.app.container.has(authorizationToken)) {
      return;
    }
    const authorization = this.app.container.resolve(authorizationToken);
    registerTicketsAuthorization(authorization);
  }
}

function registerTicketsAuthorization(
  authorization: AppAuthorizationService,
): void {
  authorization.recordAccess.add(ticketsSubmitted());
  authorization.db.collections.add({
    name: TICKETS_COLLECTION,
    title: { key: 'tickets.collection.title', ns: 'crm' },
  });
  authorization.pages.add({
    name: TICKETS_PAGE,
    title: { key: 'navigation.tickets', ns: 'crm' },
    actions: ['access'],
  });
}
