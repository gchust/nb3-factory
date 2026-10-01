import type { Application } from '@nocobase/app-server/application';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { ServiceProvider } from '@nocobase/service-provider';
import { registerMaterialsResources } from '../materials/resources.js';
import {
  materialsServiceToken,
  MaterialsService,
} from '../materials/service.js';

/**
 * Binds the materials service to its container token during `register()` and
 * registers the materials business model with the application's Authorization
 * during `boot()`.
 *
 * The Authorization resources are registered in `boot()` rather than
 * `register()` because provider registration order puts plugin providers ahead
 * of application providers: when the Authorization plugin is present its
 * provider has already bound `authorizationToken` by boot time, and a runtime
 * without that plugin (an embedded or test runtime) simply has no
 * Authorization to register into. `boot()` still runs before any provider's
 * `start()`, so the startup scan of stored Permission Sets already sees the
 * composites.
 */
export default class MaterialsProvider extends ServiceProvider<Application> {
  public readonly name = 'app/materials';

  public override register(): void {
    this.app.container.singleton(
      materialsServiceToken,
      () => new MaterialsService(this.app),
    );
  }

  public override async boot(): Promise<void> {
    if (!this.app.container.has(authorizationToken)) return;
    const authz = this.app.container.resolve(authorizationToken);
    registerMaterialsResources(authz);
  }
}
