import { AIResourceRegistrar } from '@nocobase/app-plugin-ai-employee/server';
import type { AIEmployeeManager, ToolsManager } from '@nocobase/ai-employee';
import documentAssistant from './employees/document-assistant/index.js';
import searchDocuments from './tools/search-documents.js';

/**
 * Registers this application's AI employee and its read-only tool with the
 * AIManager the AI Employee plugin already created. `server/providers/ai-resources.ts`
 * calls it from an App `boot()`, which runs after the plugin's own provider.
 */
export default class AppAIResources extends AIResourceRegistrar {
  protected override async registerAIEmployees(
    manager: AIEmployeeManager,
  ): Promise<void> {
    await manager.registerEmployee(documentAssistant);
  }

  protected override async registerTools(manager: ToolsManager): Promise<void> {
    await manager.registerTools(searchDocuments);
  }
}
