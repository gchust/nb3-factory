import { AIResourceRegistrar } from '@nocobase/app-plugin-ai-employee/server';
import type { AIEmployeeManager, ToolsManager } from '@nocobase/ai-employee';

import knowledgeAssistant from './employees/knowledge-assistant/index.js';
import readKnowledgeMaterials from './tools/read-knowledge-materials.js';

/**
 * The AI resources this application owns, handed to the AI Employee plugin's own manager.
 *
 * The plugin creates the manager; an application only supplies resources. Aggregating them with static imports, in
 * one registrar, is what keeps the plugin's built-in employee and tools registered exactly once and this
 * application's additions visible to any conversation that asks for them by name.
 */
export default class AppAIResources extends AIResourceRegistrar {
  protected override async registerAIEmployees(
    manager: AIEmployeeManager,
  ): Promise<void> {
    await manager.registerEmployee(knowledgeAssistant);
  }

  protected override async registerTools(manager: ToolsManager): Promise<void> {
    await manager.registerTools(readKnowledgeMaterials);
  }
}
