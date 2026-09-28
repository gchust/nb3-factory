import {
  defineAppConfig,
  envString,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AppRuntimeContext } from '@nocobase/app-server/runtime';
import type {
  AIApplicationConfig,
  AIEmployeeLLMServiceConfig,
} from '@nocobase/app-plugin-ai-employee/server/config';

/**
 * The address of the application's own AI service.
 *
 * This application is tested against a test-only AI service and carries no
 * production credentials. The settings below come from the environment, so an
 * application without them starts with no model configured — and the assistant
 * page then says so plainly instead of pretending to answer.
 */
export interface MaterialsBusinessServiceConfig {
  readonly model?: string;
  readonly apiKey?: string;
  readonly endpoint?: string;
}

/** `AIApplicationConfig` has an index signature, so the section may carry this as well. */
export type ApplicationAIConfig = AIApplicationConfig & {
  readonly businessService?: MaterialsBusinessServiceConfig;
};

export const BUSINESS_LLM_SERVICE_NAME = 'factory-business';

function readEnv(runtime: AppRuntimeContext, name: string): string | undefined {
  const value = runtime.env[name];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

/** The effective test-service settings, read from the environment the runtime was resolved with. */
export function resolveBusinessService(
  runtime: AppRuntimeContext,
): MaterialsBusinessServiceConfig {
  return {
    model: readEnv(runtime, 'FACTORY_BUSINESS_MODEL'),
    apiKey: readEnv(runtime, 'FACTORY_BUSINESS_API_KEY'),
    endpoint: readEnv(runtime, 'FACTORY_BUSINESS_MODEL_ENDPOINT'),
  };
}

/**
 * Providers want the base URL and append their own path, so a full
 * `.../chat/completions` endpoint has to lose that suffix before it is stored.
 */
function normaliseEndpoint(endpoint: string | undefined): string | undefined {
  if (!endpoint) {
    return undefined;
  }
  return (
    endpoint.replace(/\/+$/u, '').replace(/\/chat\/completions$/u, '') ||
    undefined
  );
}

/**
 * Turns the environment settings into the plugin's `llmServices` entry.
 *
 * `openai-completions` speaks the OpenAI wire format, which is what an internal
 * gateway exposes. `overrideEnabledModels` is on because the model list is
 * declared in configuration here and an administrator editing it in the AI
 * settings page would otherwise silently diverge from the deployment.
 */
export function resolveLLMServices(
  runtime: AppRuntimeContext,
): AIEmployeeLLMServiceConfig[] {
  const service = resolveBusinessService(runtime);
  const endpoint = normaliseEndpoint(service.endpoint);
  if (!service.model) {
    return [];
  }

  return [
    {
      name: BUSINESS_LLM_SERVICE_NAME,
      title: 'Factory test AI service',
      provider: 'openai-completions',
      enabled: true,
      options: {
        ...(service.apiKey ? { apiKey: service.apiKey } : {}),
        ...(endpoint ? { baseURL: endpoint } : {}),
      },
      enabledModels: [{ label: service.model, value: service.model }],
      overrideEnabledModels: true,
    },
  ];
}

const ai: AppConfigFactory<ApplicationAIConfig> = defineAppConfig({
  defaults: (runtime) => {
    const businessService = resolveBusinessService(runtime);
    return {
      storage: {},
      aiEmployee: { storage: {} },
      aiKnowledgeBase: {
        storage: {},
        vectorDatabases: [],
        manifests: [],
      },
      skills: { paths: [] },
      mcpServers: {},
      // Mirrored so the effective settings are visible in `config check`. The
      // AI service itself is built from the environment below, because section
      // environment mappings are applied after these defaults.
      businessService,
      llmServices: resolveLLMServices(runtime),
    };
  },
  env: {
    FACTORY_BUSINESS_MODEL: envString('businessService.model'),
    // Declared, and deliberately not in `public`: the key must never reach the browser.
    FACTORY_BUSINESS_API_KEY: envString('businessService.apiKey'),
    FACTORY_BUSINESS_MODEL_ENDPOINT: envString('businessService.endpoint'),
  },
});

export default ai;
