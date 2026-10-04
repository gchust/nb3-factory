import {
  defineAppConfig,
  envBoolean,
  envString,
  type AppConfigFactory,
} from '@nocobase/app-server/config';

/**
 * Settings for the equipment after-sales service module.
 *
 * `demoAccounts` seeds the demonstration accounts the module ships with. It is
 * meant for a demonstration or evaluation installation: turn it off (or point
 * `SERVICE_DEMO_PASSWORD` at nothing) where the accounts would be reachable.
 *
 * `acceptance` controls the ticket acceptance Workflow. When `autoEnabled` is
 * false a supervisor must accept every ticket by hand, which is the behaviour
 * of an installation that has not opted in.
 */
export interface ServiceDemoAccountsConfig {
  enabled: boolean;
  password: string;
}
export interface ServiceAcceptanceConfig {
  autoEnabled: boolean;
  /**
   * Only internally submitted tickets are handed to the acceptance Workflow on
   * creation. External events always wait for a supervisor to accept them, so
   * a platform retry cannot move a ticket without a person acting.
   */
  internalOnly: boolean;
}
/**
 * The AI employee the module registers and, when the knowledge base exists, the
 * manuals it retrieves from. `knowledgeBaseKey` matches the key a supervisor
 * chooses when creating the AI knowledge base; the binding is harmless before
 * that base exists and starts returning passages once it is usable.
 */
export interface ServiceAssistantConfig {
  employee: string;
  knowledgeBaseKey: string;
}
export interface ServiceConfig {
  demoAccounts: ServiceDemoAccountsConfig;
  acceptance: ServiceAcceptanceConfig;
  assistant: ServiceAssistantConfig;
}

const service: AppConfigFactory<ServiceConfig> = defineAppConfig({
  defaults: {
    demoAccounts: { enabled: true, password: 'Service@2026' },
    acceptance: { autoEnabled: true, internalOnly: true },
    assistant: {
      employee: 'service-assistant',
      knowledgeBaseKey: 'service-manuals',
    },
  },
  env: {
    SERVICE_DEMO_ACCOUNTS_ENABLED: envBoolean('demoAccounts.enabled'),
    SERVICE_DEMO_PASSWORD: envString('demoAccounts.password'),
    SERVICE_AUTO_ACCEPTANCE_ENABLED: envBoolean('acceptance.autoEnabled'),
    SERVICE_AUTO_ACCEPTANCE_INTERNAL_ONLY: envBoolean(
      'acceptance.internalOnly',
    ),
    SERVICE_ASSISTANT_EMPLOYEE: envString('assistant.employee'),
    SERVICE_ASSISTANT_KNOWLEDGE_BASE_KEY: envString(
      'assistant.knowledgeBaseKey',
    ),
  },
});

export default service;
