import type { AIEmployeeManager, ToolsManager } from '@nocobase/ai-employee';
import { AIResourceRegistrar } from '@nocobase/app-plugin-ai-employee/server';

import materialsAssistant from './employees/materials-assistant/index.js';
import searchMaterials from './tools/search-materials.js';

/**
 * Registers this application's AI employee and its tool into the runtime the
 * AI Employee plugin already created. Static imports, so a build carries them.
 */
export default class ApplicationAIResources extends AIResourceRegistrar {
  protected override async registerAIEmployees(
    manager: AIEmployeeManager,
  ): Promise<void> {
    await manager.registerEmployee(materialsAssistant);
  }

  protected override async registerTools(manager: ToolsManager): Promise<void> {
    await manager.registerTools(searchMaterials);
  }
}
