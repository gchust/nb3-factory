import type { Application } from '@nocobase/app-server/application';
import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server';
import { ServiceProvider } from '@nocobase/service-provider';
import AppAIResources from '../ai/index.js';

/**
 * Hands this application's AI employee and tool to the plugin's AIManager.
 *
 * It boots after the AI Employee plugin's provider because application service
 * providers are appended after plugin providers, so the employee and tool are
 * added to the persistent repositories rather than being replaced by the
 * plugin's own initialization.
 */
export default class AIResourcesProvider extends ServiceProvider<Application> {
  public readonly name = 'app/ai-resources';

  public override async boot(): Promise<void> {
    // The AI Employee plugin may be disabled (for example in a runtime that
    // composes only application providers). Without its provider the manager
    // token is unbound, and there is nothing to register the employee with.
    if (!this.app.container.has(aiManagerToken)) {
      return;
    }
    const ai = this.app.container.resolve(aiManagerToken);
    await new AppAIResources({ source: 'application' }).registerAIResources(ai);
  }
}
