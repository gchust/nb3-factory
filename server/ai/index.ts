import type { AIEmployeeManager, ToolsManager } from '@nocobase/ai-employee';
import {
  AIResourceRegistrar,
  type AIResourceRegistrarOptions,
} from '@nocobase/app-plugin-ai-employee/server';

import { materialsAssistantEmployee } from './employees/index.js';
import { lookupMaterialsTool } from './tools/lookup-materials.js';

/** Registers this application's AI employee and its read-only tool. */
export class AppAIResources extends AIResourceRegistrar {
  constructor(options: AIResourceRegistrarOptions = {}) {
    super(options);
  }

  protected async registerAIEmployees(
    employeeManager: AIEmployeeManager,
  ): Promise<void> {
    await employeeManager.registerEmployee(materialsAssistantEmployee);
  }

  protected async registerTools(toolsManager: ToolsManager): Promise<void> {
    await toolsManager.registerTools(lookupMaterialsTool);
  }
}
