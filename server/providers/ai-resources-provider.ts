import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server';
import { ServiceProvider } from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';

import { ApplicationAIResources } from '../ai/index.js';

/**
 * Registers the application's AI employee and tool with the running AI manager.
 *
 * The AI Employee plugin's own provider boots first, so `aiManagerToken` is
 * already bound when this runs; registering here rather than at module scope
 * keeps the resources out of any process that merely imports the application.
 */
export class AIResourcesProvider extends ServiceProvider<Application> {
  readonly name = 'nb3-factory/ai-resources';

  async boot(): Promise<void> {
    // The AI Employee plugin owns this token. Without it there is no AI
    // manager to register with, and the application must still start.
    if (!this.app.container.has(aiManagerToken)) return;
    const ai = this.app.container.resolve(aiManagerToken);
    await new ApplicationAIResources().registerAIResources(ai);
  }
}
