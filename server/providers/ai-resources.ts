import { ServiceProvider } from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';
import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server';

import { AppAIResources } from '../ai/index.js';

/**
 * Registers this application's AI employee and tools with the AI Employee
 * plugin. It is a no-op when the plugin is not part of the application, so the
 * rest of the application keeps working without it.
 */
export class AIResourcesProvider extends ServiceProvider<Application> {
  readonly name = 'nb3-factory/ai-resources';

  async boot(): Promise<void> {
    const ai = this.app.container.resolveIfCreated(aiManagerToken);
    if (!ai) {
      return;
    }
    await new AppAIResources().registerAIResources(ai);
  }
}

export default AIResourcesProvider;
