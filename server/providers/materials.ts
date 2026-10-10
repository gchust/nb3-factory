import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';

import {
  createMaterialService,
  type MaterialService,
} from './materials-service.js';

/**
 * The internal document library service, resolved by `server/routes/materials.ts`
 * and bound to the database manager the application already owns.
 */
export const materialServiceToken =
  createServiceToken<MaterialService>('app/materials');

export class MaterialsProvider extends ServiceProvider<Application> {
  name = 'app/materials';

  register(): void {
    this.app.container.singleton(materialServiceToken, (resolver) =>
      createMaterialService(resolver.resolve(databaseManagerToken)),
    );
  }
}
