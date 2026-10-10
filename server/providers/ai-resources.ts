import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server';
import type { Application } from '@nocobase/app-server/application';
import { ServiceProvider } from '@nocobase/service-provider';

import AppAIResources from '../ai/index.js';

/**
 * Registers the application's AI employee and tool after the AI Employee
 * plugin's own provider has created the manager.
 */
export class AIResourcesProvider extends ServiceProvider<Application> {
  public readonly name = 'app/ai-resources';

  public override async boot(): Promise<void> {
    // The runtime may be assembled without the AI Employee plugin (the
    // runtime-composition tests do). Its manager is what this provider feeds,
    // so there is nothing to register when it is absent.
    if (!this.app.container.has(aiManagerToken)) {
      return;
    }
    const ai = this.app.container.resolve(aiManagerToken);
    await new AppAIResources({ source: 'application' }).registerAIResources(ai);
  }
}
