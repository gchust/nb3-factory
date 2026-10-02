import type { Application } from '@nocobase/app-server/application';
import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server';
import { ServiceProvider } from '@nocobase/service-provider';

import AppAIResources from '../ai/index.js';

/**
 * Registers the application's own AI employees (and, when they exist, backend
 * tools) with the AI Manager the AI Employee plugin created in its own
 * provider. The plugin's `ai/skills` directory is loaded by the plugin; this
 * provider only adds resources the application owns.
 */
export default class AIResourcesProvider extends ServiceProvider<Application> {
  public readonly name = 'app/ai-resources';

  public override async boot(): Promise<void> {
    // The AI Employee plugin owns the manager token. An application embedded without that plugin has no AI surface
    // to contribute to, so the provider yields instead of failing the whole boot.
    if (!this.app.container.has(aiManagerToken)) {
      return;
    }
    const ai = this.app.container.resolve(aiManagerToken);
    await new AppAIResources({ source: 'application' }).registerAIResources(ai);
  }
}
