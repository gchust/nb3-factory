import type { Application } from '@nocobase/app-server/application';
import { notificationExtensionRegistryToken } from '@nocobase/app-plugin-notification/server';
import { ServiceProvider } from '@nocobase/service-provider';

import { createTestWebhookProviderDefinition } from '../notifications/test-webhook-provider.js';

/**
 * Registers the application's external test Provider with the Notification plugin.
 *
 * Registration happens in `boot()`: the Notification plugin creates the extension registry in its own `register()`,
 * every `register()` runs before any `boot()`, and the manager validates the channel configuration in `start()`. That
 * ordering is what lets the application add a provider to a plugin-owned registry without the plugin knowing about
 * it, and it is how the plugin's own built-in providers are registered.
 */
export class TestNotificationProvider extends ServiceProvider<Application> {
  readonly name = 'test-notification';

  async boot(): Promise<void> {
    // The template can run without the Notification plugin; then there is no registry to extend and the channel
    // configuration is simply never consulted.
    if (!this.app.container.has(notificationExtensionRegistryToken)) {
      return;
    }
    this.app.container
      .resolve(notificationExtensionRegistryToken)
      .registerProvider(createTestWebhookProviderDefinition());
  }
}

export default TestNotificationProvider;
