import type { AppConfigFactory } from '@nocobase/app-server/config';
import { envString } from '@nocobase/app-server/config';
import {
  defineAIConfig,
  type AIApplicationConfig,
} from '@nocobase/app-plugin-ai-employee/server/config';

const ai: AppConfigFactory<AIApplicationConfig> = defineAIConfig({
  // A test-only LLM service. It is the only service this application declares,
  // and it is deliberately unconfigured by default: without a key there is no
  // enabled model, so the document assistant reports that the AI service is
  // unavailable instead of answering, and reading the documents by hand keeps
  // working. Map a test credential in to exercise the assistant and nothing
  // else: this service must never point at real customer data.
  env: {
    AI_TEST_API_KEY: envString('llmServices.test.options.apiKey'),
    AI_TEST_BASE_URL: envString('llmServices.test.options.baseURL'),
  },
  defaults: () => ({
    storage: {},
    aiEmployee: { storage: {} },
    aiKnowledgeBase: {
      storage: {},
      vectorDatabases: [],
      manifests: [],
    },
    llmServices: {
      test: {
        title: 'AI 测试服务',
        provider: 'openai-completions',
        options: {},
      },
    },
    skills: { paths: [] },
    mcpServers: {},
  }),
});

export default ai;
