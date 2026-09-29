import { ServiceProvider } from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';
import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server';
import AppAIResources from '../ai/index.js';

/**
 * Hands the application's assistant and its lookup tool to the AI Employee
 * plugin's own manager. Runs after the plugin's provider, which created it.
 */
export class AIResourcesProvider extends ServiceProvider<Application> {
  readonly name = 'service-ai-resources';

  async boot(): Promise<void> {
    const ai = this.app.container.resolveIfCreated(aiManagerToken);
    if (!ai) {
      // The AI Employee plugin is not registered; nothing to hand over.
      return;
    }
    await new AppAIResources({ source: 'application' }).registerAIResources(ai);
  }
}
