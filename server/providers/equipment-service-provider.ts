import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import {
  TicketService,
  ticketServiceToken,
} from '../service/ticket-service.js';
import { registerServiceAuthorization } from '../service-authorization.js';

/**
 * Registers the after-sales service business service and opts the
 * application's collections into the authorization model.
 *
 * The HTTP guards that keep repair attachments private are composed in
 * `server/app.ts` from `../middleware/equipment-service.js`, because the
 * application is route-immutable once `start()` runs and providers register
 * inside it. This provider only owns the container binding and the boot-time
 * authorization contribution.
 */
export default class EquipmentServiceProvider extends ServiceProvider<Application> {
  public readonly name = 'app/equipment-service';

  public override register(): void {
    const container = this.app.container;
    const database = container.resolve(databaseManagerToken);
    container.instance(
      ticketServiceToken,
      new TicketService(database, container),
    );
  }

  public override async boot(): Promise<void> {
    if (!this.app.container.has(authorizationToken)) {
      return;
    }
    const database = this.app.container.resolve(databaseManagerToken);
    registerServiceAuthorization(
      this.app.container.resolve(authorizationToken),
      database,
    );
  }
}
