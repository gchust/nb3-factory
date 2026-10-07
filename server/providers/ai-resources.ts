import type { Application } from '@nocobase/app-server/application';
import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server';
import { ServiceProvider } from '@nocobase/service-provider';
import { registerMaterialsAIResources } from '../ai/index.js';

/**
 * Registers the materials assistant and its tool once the AI Employee plugin has booted.
 *
 * The plugin registers its own manager in `register()` and loads its built-in resources in `boot()`; the application's
 * providers boot after the plugins', so the manager is ready to accept this application's employee and tool here.
 */
export class MaterialsAIProvider extends ServiceProvider<Application> {
  readonly name = 'materials-ai';

  async boot(): Promise<void> {
    // The manager this registers into belongs to the AI Employee plugin; without it there is nothing to register.
    if (!this.app.container.has(aiManagerToken)) {
      return;
    }
    await registerMaterialsAIResources(
      this.app.container.resolve(aiManagerToken),
    );
  }
}
