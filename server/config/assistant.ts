import {
  defineAppConfig,
  envInteger,
  envString,
  type AppConfigFactory,
} from '@nocobase/app-server/config';

/**
 * Settings for the read-only 资料助手. The assistant always works without an
 * AI service: it answers from the materials the asker may read and cites them.
 * When an OpenAI-compatible endpoint is supplied (the factory's disclosed
 * test-only AI service) the matched materials are handed to it to phrase the
 * answer; if it is missing or fails, the assistant falls back to the material
 * text and says so instead of inventing an answer.
 */
export interface AssistantConfig {
  /** OpenAI-compatible chat-completions base URL. Empty disables the AI call. */
  baseURL: string;
  apiKey: string;
  model: string;
  /** Request timeout in milliseconds. */
  timeoutMs: number;
}

const assistant: AppConfigFactory<AssistantConfig> = defineAppConfig({
  defaults: {
    baseURL: '',
    apiKey: '',
    model: '',
    timeoutMs: 20000,
  },
  env: {
    FACTORY_BUSINESS_MODEL_ENDPOINT: envString('baseURL'),
    FACTORY_BUSINESS_API_KEY: envString('apiKey'),
    FACTORY_BUSINESS_MODEL: envString('model'),
    ASSISTANT_TIMEOUT_MS: envInteger('timeoutMs'),
  },
});

export default assistant;
