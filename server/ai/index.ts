import { AIResourceRegistrar } from '@nocobase/app-plugin-ai-employee/server';
import type { AIEmployeeManager, ToolsManager } from '@nocobase/ai-employee';

import documentAssistant from './employees/document-assistant/index.js';
import knowledgeSearch from './tools/knowledge-search.js';

/**
 * Application-owned AI resources. The AI Employee plugin boots its own
 * registrar first; the App provider that calls this one boots after it, so the
 * employee below can name the tool this registrar installs in the same run.
 * The App root's `ai/skills` directory is already scanned by the plugin, so it
 * is deliberately not listed here.
 */
export default class KnowledgeAIResources extends AIResourceRegistrar {
  protected override async registerAIEmployees(
    manager: AIEmployeeManager,
  ): Promise<void> {
    await manager.registerEmployee(documentAssistant);
  }

  protected override async registerTools(manager: ToolsManager): Promise<void> {
    await manager.registerTools(knowledgeSearch);
  }
}
