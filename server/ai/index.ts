import type { AIEmployeeManager, ToolsManager } from '@nocobase/ai-employee';
import { AIResourceRegistrar } from '@nocobase/app-plugin-ai-employee/server';

import materialsAssistant from './employees/materials-assistant/index.js';
import searchMaterials from './tools/search-materials.js';

/**
 * The application-owned AI resources.
 *
 * `AIResourceRegistrar` runs its stages in a fixed order — tools, then skills,
 * then employees — so the tool the employee names already exists when the
 * employee is registered. The application registers no skills of its own; this
 * assistant is deliberately tool-only and read-only.
 */
export class ApplicationAIResources extends AIResourceRegistrar {
  protected async registerTools(toolsManager: ToolsManager): Promise<void> {
    await toolsManager.registerTools(searchMaterials);
  }

  protected async registerAIEmployees(
    aiEmployeeManager: AIEmployeeManager,
  ): Promise<void> {
    await aiEmployeeManager.registerEmployee(materialsAssistant);
    await restrictToolsToSearch(aiEmployeeManager, materialsAssistant.username);
  }
}

/**
 * Pins the assistant's tool allow-list to its one read-only tool.
 *
 * `defineAIEmployee` cannot express `enabledTools`, and the AI plugin marks
 * every built-in tool it ships — form filling, charting, data queries, web
 * search and the sub-agent orchestration tools — `GENERAL`, which makes all of
 * them eligible for any employee that does not narrow the list. The materials
 * assistant must only ever be able to search materials, so its first
 * registration records the allow-list; a later administrator selection is left
 * untouched.
 */
async function restrictToolsToSearch(
  aiEmployeeManager: AIEmployeeManager,
  username: string,
): Promise<void> {
  const employee = await aiEmployeeManager.getEmployee(username);
  if (!employee || employee.skillSettings?.enabledTools != null) return;
  await aiEmployeeManager.upsertEmployee({
    ...employee,
    skillSettings: {
      ...employee.skillSettings,
      enabledTools: ['search-materials'],
    },
  });
}
