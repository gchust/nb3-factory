import type {
  AIEmployeeManager,
  AIManager,
  ToolsManager,
} from '@nocobase/ai-employee';
import {
  AIResourceRegistrar,
  type AIResourceRegistrarOptions,
} from '@nocobase/app-plugin-ai-employee/server';
import employees from './employees/index.js';
import tools from './tools/index.js';
import { SEARCH_MATERIALS_TOOL } from './tools/search-materials.js';

/**
 * The application-owned AI resources: one read-only materials assistant and the
 * single backend tool it may call.
 *
 * Registration happens after the plugin's own registrar has run, so the plugin's
 * built-in employee and tools are already present. `enabledTools` is then
 * narrowed to exactly the search tool: the general data, chart, report, form and
 * sub-agent tools stay out of this assistant's model, which is what keeps it
 * read-only and single-agent rather than relying on the prompt alone.
 */
export class AppAIResources extends AIResourceRegistrar {
  constructor(options: AIResourceRegistrarOptions = {}) {
    super({ source: 'nb3-factory', ...options });
  }

  protected async registerTools(toolsManager: ToolsManager): Promise<void> {
    for (const tool of tools) {
      await toolsManager.registerTools(tool);
    }
  }

  protected async registerAIEmployees(
    employeeManager: AIEmployeeManager,
  ): Promise<void> {
    for (const employee of employees) {
      await employeeManager.registerEmployee(employee);

      const current = await employeeManager.getEmployee(employee.username);
      if (!current) {
        continue;
      }

      await employeeManager.upsertEmployee({
        ...current,
        skillSettings: {
          ...current.skillSettings,
          enabledSkills: [],
          enabledTools: [SEARCH_MATERIALS_TOOL],
        },
      });
    }
  }
}

/** Registers the application's employees and tools into a live AI manager. */
export async function registerMaterialsAIResources(
  ai: AIManager,
): Promise<void> {
  await new AppAIResources().registerAIResources(ai);
}
