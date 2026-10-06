import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server';
import { ServiceProvider } from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';

import AppAIResources from '../ai/index.js';

/**
 * Hands the application's AI resources — the read-only documents assistant and its search tool — to the
 * AI manager the AI Employee plugin already created. This provider boots after the plugin's own, so
 * `aiManagerToken` is available; nothing is resolved at module scope. A runtime assembled without the
 * AI Employee plugin has no manager to register against, so the contribution is skipped rather than
 * failing the whole start.
 */
export default class AIResourcesProvider extends ServiceProvider<Application> {
  public readonly name = 'app/ai-resources';

  public override async boot(): Promise<void> {
    if (!this.app.container.has(aiManagerToken)) return;
    const ai = this.app.container.resolve(aiManagerToken);
    await new AppAIResources({ source: 'application' }).registerAIResources(ai);
  }
}
