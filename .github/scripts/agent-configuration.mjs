// Coordinator and executor share defaults/aliases. Credentials and Pi's secret
// endpoint never enter this document. Rotate CODE_AGENT_PROVIDER_ID whenever a
// secret endpoint changes; the coordinator cannot observe that change itself.
import { createHash } from 'node:crypto';
import { resolveAgent } from './agent-registry.mjs';
import { parseBoolean } from './factory-lib.mjs';

const names = [
  'CODE_AGENT_ENGINE CODE_AGENT_VERSION PI_VERSION CODEBUDDY_VERSION CLAUDE_CODE_VERSION CODEX_VERSION OPENCODE_VERSION',
  'CODE_AGENT_MODEL PI_MODEL CODEBUDDY_MODEL CLAUDE_CODE_MODEL CODEX_MODEL OPENCODE_MODEL',
  'CODE_AGENT_API_TYPE PI_API_TYPE CODE_AGENT_THINKING PI_THINKING CODEBUDDY_THINKING',
  'CODE_AGENT_AUTH_HEADER PI_AUTH_HEADER CODE_AGENT_SUPPORTS_DEVELOPER_ROLE PI_SUPPORTS_DEVELOPER_ROLE',
  'CODE_AGENT_SUPPORTS_REASONING_EFFORT PI_SUPPORTS_REASONING_EFFORT CODE_AGENT_MODEL_REASONING',
  'CODE_AGENT_INVOCATION_TIMEOUT_SECONDS PI_INVOCATION_TIMEOUT_SECONDS CODE_AGENT_IDLE_TIMEOUT_SECONDS',
  'CLAUDE_CODE_EFFORT CLAUDE_CODE_QA_EFFORT CODEX_REASONING_EFFORT CODEX_QA_REASONING_EFFORT OPENCODE_VARIANT OPENCODE_QA_VARIANT',
  'CODEBUDDY_BASE_URL CODEBUDDY_INTERNET_ENVIRONMENT ANTHROPIC_BASE_URL CODEX_BASE_URL OPENCODE_BASE_URL',
  'CODE_AGENT_PROVIDER_ID FACTORY_QA_THINKING FACTORY_REVIEW_THINKING FACTORY_BUILD_REVIEW',
  'FACTORY_BUILD_REVIEW_TIMEOUT_SECONDS FACTORY_BUILD_REVIEW_IDLE_TIMEOUT_SECONDS AGENT_BROWSER_VERSION',
]
  .join(' ')
  .split(/\s+/);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const supplied = (value) => typeof value === 'string' && value.trim() !== '';

export function normalizeAgentEnv(source = process.env) {
  const variables = JSON.parse(source.FACTORY_AGENT_CONFIG_JSON || '{}');
  if (!variables || typeof variables !== 'object' || Array.isArray(variables))
    throw new Error('Invalid factory Agent settings');
  const env = { ...source };
  delete env.FACTORY_AGENT_CONFIG_JSON;
  // Never import arbitrary repository variables, executable paths or secrets.
  for (const name of names)
    env[name] = supplied(source[name])
      ? source[name].trim()
      : supplied(variables[name])
        ? variables[name].trim()
        : '';
  const fallback = (name, alias, value) => {
    env[name] ||= env[alias] || value;
  };
  fallback('CODE_AGENT_ENGINE', '', 'pi');
  fallback('CODE_AGENT_MODEL', 'PI_MODEL', '');
  fallback('CODE_AGENT_API_TYPE', 'PI_API_TYPE', 'openai-completions');
  fallback('CODE_AGENT_THINKING', 'PI_THINKING', 'max');
  fallback('CODE_AGENT_AUTH_HEADER', 'PI_AUTH_HEADER', 'true');
  fallback(
    'CODE_AGENT_SUPPORTS_REASONING_EFFORT',
    'PI_SUPPORTS_REASONING_EFFORT',
    'true',
  );
  const deepseek =
    env.CODE_AGENT_API_TYPE === 'openai-completions' &&
    /(?:^|\/)deepseek-v4(?:\.\d+)?-(flash|pro)(?:$|[-:])/u.test(
      env.CODE_AGENT_MODEL.toLowerCase(),
    );
  fallback(
    'CODE_AGENT_SUPPORTS_DEVELOPER_ROLE',
    'PI_SUPPORTS_DEVELOPER_ROLE',
    String(!deepseek),
  );
  fallback('CODE_AGENT_MODEL_REASONING', '', 'true');
  fallback(
    'CODE_AGENT_INVOCATION_TIMEOUT_SECONDS',
    'PI_INVOCATION_TIMEOUT_SECONDS',
    '0',
  );
  fallback('CODE_AGENT_IDLE_TIMEOUT_SECONDS', '', '600');
  fallback('CODEBUDDY_THINKING', '', 'max');
  fallback('FACTORY_REVIEW_THINKING', '', 'medium');
  fallback('FACTORY_BUILD_REVIEW', '', 'full');
  fallback('FACTORY_BUILD_REVIEW_TIMEOUT_SECONDS', '', '900');
  fallback('FACTORY_BUILD_REVIEW_IDLE_TIMEOUT_SECONDS', '', '600');
  fallback('AGENT_BROWSER_VERSION', '', '0.36.0');
  return env;
}

export function agentConfig(source = process.env) {
  const env = normalizeAgentEnv(source);
  const agent = resolveAgent(env);
  const values = {
    CONFIG_SCHEMA_VERSION: '2',
    CODE_AGENT_ENGINE: agent.id,
    AGENT_VERSION: agent.version,
  };
  const copy = (name) => {
    values[name] = env[name] || '';
  };
  for (const name of [
    'CODE_AGENT_INVOCATION_TIMEOUT_SECONDS',
    'CODE_AGENT_IDLE_TIMEOUT_SECONDS',
    'FACTORY_REVIEW_THINKING',
    'FACTORY_BUILD_REVIEW',
    'FACTORY_BUILD_REVIEW_TIMEOUT_SECONDS',
    'FACTORY_BUILD_REVIEW_IDLE_TIMEOUT_SECONDS',
    'AGENT_BROWSER_VERSION',
    'CODE_AGENT_PROVIDER_ID',
  ])
    copy(name);
  const modelKey = {
    pi: 'CODE_AGENT_MODEL',
    codebuddy: 'CODEBUDDY_MODEL',
    'claude-code': 'CLAUDE_CODE_MODEL',
    codex: 'CODEX_MODEL',
    opencode: 'OPENCODE_MODEL',
  }[agent.id];
  copy(modelKey);
  if (agent.id === 'pi') {
    copy('CODE_AGENT_API_TYPE');
    copy('CODE_AGENT_THINKING');
    values.FACTORY_QA_THINKING =
      env.FACTORY_QA_THINKING || env.CODE_AGENT_THINKING;
    for (const name of [
      'CODE_AGENT_AUTH_HEADER',
      'CODE_AGENT_SUPPORTS_DEVELOPER_ROLE',
      'CODE_AGENT_SUPPORTS_REASONING_EFFORT',
      'CODE_AGENT_MODEL_REASONING',
    ])
      values[name] = String(parseBoolean(env[name], true));
  } else if (agent.id === 'codebuddy') {
    copy('CODEBUDDY_THINKING');
    copy('CODEBUDDY_INTERNET_ENVIRONMENT');
    values.FACTORY_QA_THINKING =
      env.FACTORY_QA_THINKING || env.CODEBUDDY_THINKING;
  } else {
    const [main, qa] = {
      'claude-code': ['CLAUDE_CODE_EFFORT', 'CLAUDE_CODE_QA_EFFORT'],
      codex: ['CODEX_REASONING_EFFORT', 'CODEX_QA_REASONING_EFFORT'],
      opencode: ['OPENCODE_VARIANT', 'OPENCODE_QA_VARIANT'],
    }[agent.id];
    copy(main);
    values[qa] = env[qa] || env[main];
  }
  const endpointName = {
    codebuddy: 'CODEBUDDY_BASE_URL',
    'claude-code': 'ANTHROPIC_BASE_URL',
    codex: 'CODEX_BASE_URL',
    opencode: 'OPENCODE_BASE_URL',
  }[agent.id];
  // Public repository endpoints are digested rather than printed. Never hash
  // CODE_AGENT_API_ENDPOINT / PI_API_ENDPOINT secrets or authentication keys.
  values.PROVIDER_ENDPOINT_SHA256 = endpointName
    ? hash(env[endpointName] || 'vendor-default')
    : '';
  for (const [name, value] of Object.entries(values)) {
    if (value.length > 200) values[name] = 'sha256:' + hash(value);
  }
  const ordered = Object.fromEntries(
    Object.entries(values).sort(([a], [b]) => a.localeCompare(b)),
  );
  return { fingerprint: hash(JSON.stringify(ordered)), values: ordered };
}
