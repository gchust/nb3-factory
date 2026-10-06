import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server';
import type { Application } from '@nocobase/app-server/application';
import { ServiceProvider } from '@nocobase/service-provider';

import AppAIResources from '../ai/index.js';

/**
 * Registers this application's AI employee and tool with the plugin's AI manager.
 *
 * The plugin owns the manager and creates it before this provider boots; all this does is hand it resources. It
 * runs in `boot()` rather than at module load because the container and the manager both have to exist first, and
 * the tool it registers resolves the knowledge service lazily — at call time, not at registration — so the
 * dependency order between this provider and the knowledge provider does not matter.
 */
export class KnowledgeAIProvider extends ServiceProvider<Application> {
  public readonly name = 'knowledge-ai';

  public override async boot(): Promise<void> {
    // Registered among the application-owned providers, which also boot in a
    // runtime composed without the AI employee plugin. There is no manager to
    // hand resources to in that case, so skip instead of failing startup.
    if (!this.app.container.has(aiManagerToken)) return;

    const ai = this.app.container.resolve(aiManagerToken);
    await new AppAIResources({ source: 'application' }).registerAIResources(ai);
  }
}
