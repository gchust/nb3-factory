import type {
  AIEmployeeManager,
  AIManager,
  ToolsManager,
} from '@nocobase/ai-employee';
import { AIResourceRegistrar } from '@nocobase/app-plugin-ai-employee/server';
import { materialsAssistant } from './employees/materials-assistant/index.js';
import { readMaterialsTool } from './tools/read-materials.js';

/**
 * Registers the application's own AI resources.
 *
 * It uses the same registrar the plugin uses for its built-ins, so the application's employee and tool are reconciled the
 * same way and appear beside Atlas instead of replacing it.
 */
export class MaterialsAIResources extends AIResourceRegistrar {
  protected async registerTools(toolsManager: ToolsManager): Promise<void> {
    await toolsManager.registerTools(readMaterialsTool);
  }

  protected async registerAIEmployees(
    aiEmployeeManager: AIEmployeeManager,
  ): Promise<void> {
    await aiEmployeeManager.registerEmployee(materialsAssistant);
  }
}

export async function registerMaterialsAIResources(
  ai: AIManager,
): Promise<void> {
  await new MaterialsAIResources().registerAIResources(ai);
}
