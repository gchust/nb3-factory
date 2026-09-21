import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseAgentArgs,
  parseIdleTimeout,
  parseInvocationTimeout,
  parseRunDeadline,
  requiredEnv,
  runAgentInvocation,
} from '../agent-harness.mjs';
import { FACTORY_PROVIDER, parseBoolean } from '../factory-lib.mjs';

const { workspace, prompt, log, agentDir } = parseAgentArgs(
  process.argv.slice(2),
);
const endpoint = requiredEnv('CODE_AGENT_API_ENDPOINT');
const apiKey = requiredEnv('CODE_AGENT_API_KEY');
// Both the JSONL transcript and the live console stream are published artifacts: the console
// output lands in the Actions log and in verify-*.log, so a secret must never reach either.
const secrets = [
  apiKey,
  endpoint,
  process.env.FACTORY_ADMIN_PASSWORD,
  process.env.FACTORY_TEST_PASSWORD,
];
const api = process.env.CODE_AGENT_API_TYPE || 'openai-completions';
const model = requiredEnv('CODE_AGENT_MODEL');
const thinking = process.env.CODE_AGENT_THINKING || 'max';
const invocationTimeoutSeconds = parseInvocationTimeout(
  process.env.CODE_AGENT_INVOCATION_TIMEOUT_SECONDS,
  0,
);
const idleTimeoutSeconds = parseIdleTimeout(
  process.env.CODE_AGENT_IDLE_TIMEOUT_SECONDS,
  600,
);
const runDeadlineEpochSeconds = parseRunDeadline(
  process.env.FACTORY_RUN_DEADLINE_EPOCH_SECONDS,
);
const normalizedModel = model.toLowerCase();
const deepseekV4Variant =
  normalizedModel.match(
    /(?:^|\/)deepseek-v4(?:\.\d+)?-(flash|pro)(?:$|[-:])/u,
  )?.[1] ?? null;
const isDeepseekV4 = api === 'openai-completions' && deepseekV4Variant != null;
const supportedApis = new Set([
  'openai-completions',
  'openai-responses',
  'anthropic-messages',
  'google-generative-ai',
]);
const supportedThinking = new Set([
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);

if (!supportedApis.has(api))
  throw new Error(`Unsupported CODE_AGENT_API_TYPE: ${api}`);
if (!supportedThinking.has(thinking))
  throw new Error(`Unsupported CODE_AGENT_THINKING: ${thinking}`);
const parsedEndpoint = new URL(endpoint);
if (!['http:', 'https:'].includes(parsedEndpoint.protocol)) {
  throw new Error('CODE_AGENT_API_ENDPOINT must use http or https.');
}

mkdirSync(agentDir, { recursive: true });

const provider = {
  baseUrl: endpoint,
  api,
  apiKey: '$CODE_AGENT_API_KEY',
  authHeader: parseBoolean(process.env.CODE_AGENT_AUTH_HEADER, true),
  compat: {
    supportsDeveloperRole: parseBoolean(
      process.env.CODE_AGENT_SUPPORTS_DEVELOPER_ROLE,
      !isDeepseekV4,
    ),
    supportsReasoningEffort: parseBoolean(
      process.env.CODE_AGENT_SUPPORTS_REASONING_EFFORT,
      true,
    ),
    ...(isDeepseekV4
      ? {
          supportsStore: false,
          maxTokensField: 'max_tokens',
          thinkingFormat: 'deepseek',
          requiresReasoningContentOnAssistantMessages: true,
        }
      : {}),
  },
  models: [
    {
      id: model,
      name: model,
      reasoning: parseBoolean(process.env.CODE_AGENT_MODEL_REASONING, true),
      ...(isDeepseekV4
        ? {
            thinkingLevelMap: {
              minimal: null,
              low: deepseekV4Variant === 'flash' ? 'low' : null,
              medium: null,
              high: 'high',
              max: 'max',
            },
          }
        : {}),
    },
  ],
};

writeFileSync(
  path.join(agentDir, 'models.json'),
  `${JSON.stringify({ providers: { [FACTORY_PROVIDER]: provider } }, null, 2)}\n`,
);
writeFileSync(
  path.join(agentDir, 'settings.json'),
  `${JSON.stringify(
    {
      defaultProjectTrust: 'never',
      enableInstallTelemetry: false,
      quietStartup: true,
    },
    null,
    2,
  )}\n`,
);

await runAgentInvocation({
  label: 'Pi',
  command: 'pi',
  args: [
    '--mode',
    'json',
    '--no-session',
    '--approve',
    '--provider',
    FACTORY_PROVIDER,
    '--model',
    model,
    '--thinking',
    thinking,
    ...(process.env.FACTORY_AGENT_ROLE === 'qa'
      ? [
          '--extension',
          fileURLToPath(new URL('./qa-process-guard.mjs', import.meta.url)),
        ]
      : []),
    `@${prompt}`,
  ],
  cwd: workspace,
  env: {
    ...process.env,
    CODE_AGENT_API_KEY: apiKey,
    PI_CODING_AGENT_DIR: agentDir,
    PI_SKIP_VERSION_CHECK: '1',
    PI_TELEMETRY: '0',
  },
  log,
  secrets,
  invocationTimeoutSeconds,
  idleTimeoutSeconds,
  runDeadlineEpochSeconds,
  // Pi may exit 0 after a failed model request. Only the last assistant
  // outcome is authoritative: an internal retry may recover an earlier error.
  getEventFailure: (event) => {
    const message =
      event.type === 'agent_end'
        ? event.messages?.findLast((item) => item.role === 'assistant')
        : ['message_end', 'turn_end'].includes(event.type)
          ? event.message
          : undefined;
    if (message?.role !== 'assistant') return undefined;
    return ['error', 'aborted'].includes(message.stopReason)
      ? message.errorMessage ||
          `Model response ended with ${message.stopReason}`
      : null;
  },
  isCompletionEvent: (event) =>
    ['agent_end', 'agent_settled'].includes(event.type),
  formatConsoleLine: (line, event) => {
    if (event.type === 'message_update') return null;
    if (event.type === 'tool_execution_end') {
      return JSON.stringify({
        type: event.type,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        isError: event.isError,
      });
    }
    return line;
  },
});
