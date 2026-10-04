import type { AIEmployeeManager, ToolsManager } from '@nocobase/ai-employee';
import { AIResourceRegistrar } from '@nocobase/app-plugin-ai-employee/server';

import serviceAssistant from './employees/service-assistant/index.js';
import serviceTicketDraft from './tools/service-ticket-draft.js';

/**
 * Aggregates the AI resources this application owns. The plugin already built
 * the managers; this registrar only hands them what belongs to the after-sales
 * service module, so the plugin's built-in employees and tools are untouched.
 */
export default class AppAIResources extends AIResourceRegistrar {
  protected override async registerAIEmployees(
    manager: AIEmployeeManager,
  ): Promise<void> {
    await manager.registerEmployee(serviceAssistant);
  }

  protected override async registerTools(manager: ToolsManager): Promise<void> {
    await manager.registerTools(serviceTicketDraft);
  }
}
