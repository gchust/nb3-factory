import type { Application } from '@nocobase/app-server/application';
import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server';
import { ServiceProvider } from '@nocobase/service-provider';

import AppAIResources from '../ai/index.js';
import type { ServiceConfig } from '../config/service.js';

/**
 * Registers the AI resources this application owns — the 服务助手 employee and
 * its read-only draft tool — with the AI manager the plugin already built.
 * Registration is idempotent: `registerAIResources` upserts by name, so a
 * restart refreshes the definition instead of duplicating it.
 */
export default class ServiceAIProvider extends ServiceProvider<Application> {
  public readonly name: string = '@app/service-ai';

  public override async boot(): Promise<void> {
    if (!this.app.container.has(aiManagerToken)) return;
    const ai = this.app.container.resolve(aiManagerToken);
    await new AppAIResources({
      source: 'application',
    }).registerAIResources(ai);
    console.log('[service] ai employee service-assistant registered');
  }

  /**
   * Enables the employee and binds the manuals knowledge base. The binding is a
   * settings decision the plugin stores on the employee record, not part of the
   * definition; `upsertEmployee` is the same entry the AI settings page uses.
   * A knowledge base with no vectors yet is still a valid binding, so this runs
   * whether or not the supervisor has created it.
   */
  public override async start(): Promise<void> {
    if (!this.app.container.has(aiManagerToken)) return;
    const config = this.serviceConfig().assistant;
    const manager = this.app.container.resolve(aiManagerToken).employeeManager;
    const employee = await manager.getEmployee(config.employee);
    if (!employee) return;
    const knowledgeBaseKeys = config.knowledgeBaseKey
      ? [config.knowledgeBaseKey]
      : [];
    await manager.upsertEmployee({
      ...employee,
      enabled: true,
      enableKnowledgeBase: knowledgeBaseKeys.length > 0,
      knowledgeBase: {
        knowledgeBaseKeys,
        topK: 4,
        score: 0.35,
        retrievalStrategy: 'onDemand',
      },
    });
    console.log(
      `[service] ai employee ${config.employee} bound to ${
        config.knowledgeBaseKey || 'no knowledge base'
      }`,
    );
  }

  private serviceConfig(): ServiceConfig {
    return (
      this.app.config.get<ServiceConfig>('service') ?? {
        demoAccounts: { enabled: false, password: '' },
        acceptance: { autoEnabled: false, internalOnly: true },
        assistant: { employee: 'service-assistant', knowledgeBaseKey: '' },
      }
    );
  }
}
