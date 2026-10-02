import type { Application } from '@nocobase/app-server/application';
import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server';
import { ServiceProvider } from '@nocobase/service-provider';

import ApplicationAIResources from '../ai/index.js';

/**
 * Hands this application's employee and tool to the AI runtime after the AI
 * Employee plugin's own provider has booted.
 */
export default class AIResourcesProvider extends ServiceProvider<Application> {
  public readonly name = 'nb3-factory/ai-resources';

  public override async boot(): Promise<void> {
    // Skip when the AI Employee plugin is not part of this runtime; the
    // provider only exists to hand it this application's resources.
    if (!this.app.container.has(aiManagerToken)) {
      return;
    }
    const ai = this.app.container.resolve(aiManagerToken);
    await new ApplicationAIResources({
      source: 'nb3-factory',
    }).registerAIResources(ai);
  }
}
