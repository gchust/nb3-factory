import type { Application } from '@nocobase/app-server/application';
import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server';
import { loggingToken } from '@nocobase/app-server/logging';
import { ServiceProvider } from '@nocobase/service-provider';

import AppAIResources from '../ai/index.js';

/**
 * Registers the application's AI employee and its read tool with the manager
 * the AI Employee plugin already created.
 *
 * The work happens in `boot()` and this provider is added after the AI
 * plugin's own provider, which boots first and initializes the manager. The
 * plugin's container token comes from the package export, never a recreated
 * token: `createServiceToken` keys by identity, so a second `aiManagerToken`
 * would resolve nothing.
 */
export class AIResourcesProvider extends ServiceProvider<Application> {
  readonly name = 'app/ai-resources';

  async boot(): Promise<void> {
    if (!this.app.container.has(aiManagerToken)) {
      return;
    }
    const ai = this.app.container.resolve(aiManagerToken);
    const logger = this.app.container.has(loggingToken)
      ? this.app.container.resolve(loggingToken).getLogger('ai-resources')
      : undefined;
    await new AppAIResources({
      logger,
      source: 'application',
    }).registerAIResources(ai);
  }
}
