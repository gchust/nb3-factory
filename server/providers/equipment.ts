import { databaseManagerToken } from '@nocobase/db';
import type { Application } from '@nocobase/app-server/application';
import { ServiceProvider } from '@nocobase/service-provider';

import {
  createEquipmentService,
  equipmentServiceToken,
} from '../services/equipment.js';

/** Binds the equipment ledger service for the application's routes. */
export class EquipmentProvider extends ServiceProvider<Application> {
  name = 'equipment';

  register(): void {
    this.app.container.singleton(equipmentServiceToken, (container) =>
      createEquipmentService(container.resolve(databaseManagerToken)),
    );
  }
}
