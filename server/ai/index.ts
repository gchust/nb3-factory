import { AIResourceRegistrar } from '@nocobase/app-plugin-ai-employee/server';
import type { AIEmployeeManager, ToolsManager } from '@nocobase/ai-employee';

import documentAssistant from './employees/document-assistant/index.js';
import searchDocuments from './tools/search-documents.js';

/**
 * The application's AI resources: one read-only employee and the single tool it may read through.
 * Registered from the owning provider's `boot()`, which runs after the AI Employee plugin's own.
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
