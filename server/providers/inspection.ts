import type { Application } from '@nocobase/app-server/application';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { databaseManagerToken } from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import {
  createInspectionService,
  type InspectionService,
} from './inspection-service.js';
import { ensureInspectionRoles } from './inspection-roles.js';

export const inspectionServiceToken: ServiceToken<InspectionService> =
  createServiceToken<InspectionService>('app/inspection-service');

export default class InspectionProvider extends ServiceProvider<Application> {
  public readonly name = 'app/inspection';

  public override register(): void {
    this.app.container.singleton(inspectionServiceToken, () =>
      createInspectionService(this.app.container.resolve(databaseManagerToken)),
    );
  }

  public override async start(): Promise<void> {
    if (!this.app.container.has(authorizationToken)) return;
    try {
      await ensureInspectionRoles(
        this.app.container.resolve(authorizationToken),
      );
    } catch {
      // Best effort at startup; routes that need the roles ensure them lazily
      // and surface a real error if the database is still unavailable.
    }
  }
}
