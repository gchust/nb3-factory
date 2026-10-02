import { AIResourceRegistrar } from '@nocobase/app-plugin-ai-employee/server';
import type { AIEmployeeManager, ToolsManager } from '@nocobase/ai-employee';

import serviceAssistant from './employees/service-assistant/index.js';

export default class AppAIResources extends AIResourceRegistrar {
  protected override async registerAIEmployees(
    manager: AIEmployeeManager,
  ): Promise<void> {
    await manager.registerEmployee(serviceAssistant);
  }

  protected override async registerTools(
    _manager: ToolsManager,
  ): Promise<void> {
    // The service assistant relies on the plugin's built-in data-query tool for
    // reads and on manual/knowledge retrieval, so the application currently
    // registers no backend tool of its own.
  }
}
