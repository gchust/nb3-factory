import { AIResourceRegistrar } from '@nocobase/app-plugin-ai-employee/server';
import type {
  AIEmployeeEntity,
  AIEmployeeManager,
  ToolsManager,
} from '@nocobase/ai-employee';

import serviceAssistant from './employees/service-assistant/index.js';
import { DEVICE_MANUAL_KNOWLEDGE_BASE_KEY } from './manuals/manuals.js';
import knowledgeLookup from './tools/service-knowledge-lookup.js';

/**
 * The application's AI resources: one retrieval tool and the assistant that
 * uses it. They are handed to the plugin's existing `AIManager`; the
 * application never creates one.
 */
export default class AppAIResources extends AIResourceRegistrar {
  protected override async registerAIEmployees(
    manager: AIEmployeeManager,
  ): Promise<void> {
    await manager.registerEmployee(serviceAssistant);
    await this.enableDeviceManualKnowledgeBase(manager);
  }

  /**
   * Points the assistant at the internal device-manual knowledge base.
   *
   * The field cannot be passed through `registerEmployee` — the plugin's
   * registration contract has no knowledge-base input and preserves whatever
   * the saved employee already carries — so it is read back and updated
   * through the manager's public `upsertEmployee`. Keys an administrator added
   * are kept; the device-manual base is merged in.
   */
  private async enableDeviceManualKnowledgeBase(
    manager: AIEmployeeManager,
  ): Promise<void> {
    const employee = await manager.getEmployee(serviceAssistant.username);
    if (!employee) {
      return;
    }
    const knowledgeBase = employee.knowledgeBase ?? {};
    const keys = new Set([
      ...(knowledgeBase.knowledgeBaseKeys ?? []),
      DEVICE_MANUAL_KNOWLEDGE_BASE_KEY,
    ]);
    const next: AIEmployeeEntity = {
      ...employee,
      enableKnowledgeBase: true,
      knowledgeBase: {
        topK: knowledgeBase.topK ?? 5,
        score: knowledgeBase.score ?? 0.35,
        retrievalStrategy: knowledgeBase.retrievalStrategy ?? 'onDemand',
        ...knowledgeBase,
        knowledgeBaseKeys: [...keys],
      },
    };
    await manager.upsertEmployee(next);
  }

  protected override async registerTools(manager: ToolsManager): Promise<void> {
    await manager.registerTools(knowledgeLookup);
  }
}
