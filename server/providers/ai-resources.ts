import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server';
import type { Application } from '@nocobase/app-server/application';
import { ServiceProvider } from '@nocobase/service-provider';

import AppAIResources from '../ai/index.js';

/**
 * Hands the application's AI employee and tools to the AI manager the AI
 * Employee plugin already created. Booting after the plugin's own provider
 * means the manager exists; the registrar resolves every name at execution
 * time, so listing a plugin-built-in Skill from the application's employee
 * works regardless of order.
 */
export default class AIResourcesProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/ai-resources-provider';

  public override async boot(): Promise<void> {
    if (!this.app.container.has(aiManagerToken)) return;
    const ai = this.app.container.resolve(aiManagerToken);
    await new AppAIResources({ source: 'application' }).registerAIResources(ai);
  }
}
