import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import { ServiceProvider } from '@nocobase/service-provider';

import {
  devices,
  devicesCollectionTitle,
  devicesSectionTitle,
} from '../devices-resources.js';

/**
 * Registers the device list with the shared authorization instance: the Collection the database permissions read,
 * the composite resource the API and the page check, and where it appears in the authorization workspace.
 *
 * Runs in `boot()` because the authorization instance is created lazily on the first `authorizationToken` resolve,
 * and registration must happen after the plugin's own registrations.
 */
export class DevicesProvider extends ServiceProvider<Application> {
  public readonly name = '@nocobase/nb3-factory/devices';

  public override async boot(): Promise<void> {
    // The authorization plugin owns the service. An application assembled without it
    // (for example a scaffold test with no plugins) still boots its own providers;
    // there is nothing to register against, so leave the container untouched.
    if (!this.app.container.has(authorizationToken)) return;
    const authz = this.app.container.resolve(authorizationToken);

    authz.database.collections.add({
      name: 'devices',
      title: devicesCollectionTitle,
    });

    const reference = authz.compositeResources.define(devices);

    authz.ui.sections.add({
      name: 'devices',
      title: devicesSectionTitle,
      parent: 'business',
    });
    authz.ui.place(reference, { section: 'devices' });
  }
}
