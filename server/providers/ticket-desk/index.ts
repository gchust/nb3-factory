/**
 * Registers the ticket desk's domain service.
 *
 * The service is a singleton built on first use: it reads the database, the
 * drive and the lifecycle runtime, none of which exist while providers are
 * being registered, so the factory resolves them when the first route or
 * guard asks.
 */
import type { Application } from '@nocobase/app-server/application';
import { loggingToken } from '@nocobase/app-server/logging';
import { ServiceProvider } from '@nocobase/service-provider';

import { defaultDriveDisk } from '../lifecycles.js';
import { ticketDeskServiceToken } from '../tokens.js';
import { TicketDeskService } from './service.js';

export { TicketDeskService } from './service.js';
export type {
  CreateTicketInput,
  TicketDeskServiceOptions,
  TicketListQuery,
  TicketRequest,
  TicketViewer,
} from './service.js';

export class TicketDeskProvider extends ServiceProvider<Application> {
  public readonly name: string = 'ticket-desk-provider';

  public override register(): void {
    this.app.container.singleton(ticketDeskServiceToken, (resolver) => {
      const logger = this.app.container
        .resolve(loggingToken)
        .getLogger('ticket-desk');
      return new TicketDeskService({
        resolve: resolver,
        defaultDisk: () => defaultDriveDisk(this.app),
        logger,
      });
    });
  }
}
