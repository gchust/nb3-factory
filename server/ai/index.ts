import { AIResourceRegistrar } from '@nocobase/app-plugin-ai-employee/server';
import type { AIEmployeeManager, ToolsManager } from '@nocobase/ai-employee';

import serviceAssistant from './employees/service-assistant/index.js';
import workOrderContext from './tools/work-order-context.js';

/**
 * Registers the application's own AI resources with the plugin's existing AI
 * manager. The manager is created by the AI Employee plugin; the application
 * only hands it employees and tools, which is why this runs from a provider's
 * `boot()` and not from module scope.
 */
export default class AppAIResources extends AIResourceRegistrar {
  protected override async registerAIEmployees(
    manager: AIEmployeeManager,
  ): Promise<void> {
    await manager.registerEmployee(serviceAssistant);
  }

  protected override async registerTools(manager: ToolsManager): Promise<void> {
    await manager.registerTools(workOrderContext);
  }
}
