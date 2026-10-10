import type { AIEmployeeManager, ToolsManager } from '@nocobase/ai-employee';
import { AIResourceRegistrar } from '@nocobase/app-plugin-ai-employee/server';

import materialsAssistant from './employees/materials-assistant/index.js';
import readMaterials from './tools/read-materials.js';

/**
 * Hands the application's own AI employee and tool to the plugin's manager.
 *
 * The App runtime owns one `AIManager`; this registrar only adds to it, from
 * the provider's `boot()` so the plugin has created the manager first.
 */
export default class AppAIResources extends AIResourceRegistrar {
  protected override async registerAIEmployees(
    manager: AIEmployeeManager,
  ): Promise<void> {
    await manager.registerEmployee(materialsAssistant);
  }

  protected override async registerTools(manager: ToolsManager): Promise<void> {
    await manager.registerTools(readMaterials);
  }
}
