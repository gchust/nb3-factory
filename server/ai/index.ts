import { AIResourceRegistrar } from '@nocobase/app-plugin-ai-employee/server';
import type { AIEmployeeManager, ToolsManager } from '@nocobase/ai-employee';

import materialsDesk from './employees/materials-desk/index.js';
import materialsLookup from './tools/materials-lookup.js';

/**
 * The application's own AI resources.
 *
 * The App does not create an `AIManager`; the plugin already made one. This
 * registrar only hands it the employee and the read tool, and the provider
 * that runs it boots after the plugin's own provider has booted, so the
 * registrations land in the runtime the plugin built.
 */
export default class AppAIResources extends AIResourceRegistrar {
  protected override async registerAIEmployees(
    manager: AIEmployeeManager,
  ): Promise<void> {
    await manager.registerEmployee(materialsDesk);
  }

  protected override async registerTools(manager: ToolsManager): Promise<void> {
    await manager.registerTools(materialsLookup);
  }
}
