import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type {
  AIApplicationConfig,
  AIEmployeeLLMServiceConfig,
} from '@nocobase/app-plugin-ai-employee/server/config';

/**
 * When the factory discloses a test-only OpenAI-compatible AI service, register
 * it as an LLM service so the AI Employees settings surface and the 资料助手
 * can both use it. Without the three variables nothing is registered, and the
 * assistant stays fully functional in its grounded, service-free mode.
 */
function disclosedLLMService(): AIEmployeeLLMServiceConfig[] {
  const baseURL = process.env.FACTORY_BUSINESS_MODEL_ENDPOINT?.trim();
  const apiKey = process.env.FACTORY_BUSINESS_API_KEY?.trim();
  const model = process.env.FACTORY_BUSINESS_MODEL?.trim();
  if (!baseURL || !apiKey || !model) return [];
  return [
    {
      name: 'business-assistant',
      title: '业务助手（测试）',
      provider: 'openai-completions',
      options: { apiKey, baseURL },
      enabledModels: [{ label: model, value: model }],
      overrideEnabledModels: true,
      enabled: true,
      sort: 0,
    },
  ];
}

const ai: AppConfigFactory<AIApplicationConfig> = defineAppConfig(
  (_runtime) => ({
    storage: {},
    aiEmployee: { storage: {} },
    aiKnowledgeBase: {
      storage: {},
      vectorDatabases: [],
      manifests: [],
    },
    llmServices: disclosedLLMService(),
    skills: { paths: [] },
    mcpServers: {},
  }),
);

export default ai;
