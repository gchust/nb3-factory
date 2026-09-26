import assert from 'node:assert/strict';
import test from 'node:test';
import { agentConfig, normalizeAgentEnv } from '../agent-configuration.mjs';
import { resolveAgent } from '../agent-registry.mjs';

test('fingerprints include effective aliases, compatibility flags and timeout values', () => {
  for (const [key, a, b] of [
    ['PI_API_TYPE', 'openai-completions', 'anthropic-messages'],
    ['PI_INVOCATION_TIMEOUT_SECONDS', '0', '600'],
    ['CODE_AGENT_SUPPORTS_DEVELOPER_ROLE', 'true', 'false'],
    ['PI_AUTH_HEADER', 'true', 'false'],
    ['CODE_AGENT_MODEL_REASONING', 'true', 'false'],
    ['FACTORY_BUILD_REVIEW_IDLE_TIMEOUT_SECONDS', '600', '300'],
  ])
    assert.notEqual(
      agentConfig({ [key]: a }).fingerprint,
      agentConfig({ [key]: b }).fingerprint,
      key,
    );
  assert.equal(
    agentConfig({ PI_MODEL: 'model-a' }).fingerprint,
    agentConfig({ CODE_AGENT_MODEL: 'model-a' }).fingerprint,
  );
  assert.equal(
    agentConfig({}).fingerprint,
    agentConfig({
      CODE_AGENT_ENGINE: 'pi',
      CODE_AGENT_INVOCATION_TIMEOUT_SECONDS: '0',
      CODE_AGENT_THINKING: 'max',
    }).fingerprint,
  );
  assert.equal(
    normalizeAgentEnv({ PI_MODEL: 'deepseek-v4.1-flash' })
      .CODE_AGENT_SUPPORTS_DEVELOPER_ROLE,
    'false',
  );
  assert.equal(
    normalizeAgentEnv({ PI_MODEL: 'another-model' })
      .CODE_AGENT_SUPPORTS_DEVELOPER_ROLE,
    'true',
  );
});
test('only the selected engine and effective version affect the fingerprint', () => {
  const env = { CODE_AGENT_ENGINE: 'codex', CODEX_MODEL: 'model-a' };
  assert.equal(
    agentConfig(env).fingerprint,
    agentConfig({ ...env, PI_MODEL: 'ignored', PI_VERSION: '1.2.3' })
      .fingerprint,
  );
  assert.notEqual(
    agentConfig({ ...env, CODEX_BASE_URL: 'https://a.invalid/v1' }).fingerprint,
    agentConfig({ ...env, CODEX_BASE_URL: 'https://b.invalid/v1' }).fingerprint,
  );
  assert.equal(
    agentConfig(env).values.AGENT_VERSION,
    resolveAgent(env).version,
  );
  assert.notEqual(
    agentConfig(env).fingerprint,
    agentConfig({ ...env, CODEX_VERSION: '1.2.3' }).fingerprint,
  );
});
test('shared repository settings are allowlisted, with explicit invocation overrides', () => {
  const source = {
    FACTORY_AGENT_CONFIG_JSON: JSON.stringify({
      PI_MODEL: 'alias',
      PI_THINKING: 'high',
      PATH: '/evil',
      NODE_OPTIONS: '--import evil',
      CODE_AGENT_API_KEY: 'must-not-import',
      CODE_AGENT_API_ENDPOINT: 'https://secret.invalid',
      unrelated: 'ignored',
    }),
    CODE_AGENT_MODEL: 'override',
    CODE_AGENT_API_KEY: 'actual-secret',
    PATH: '/trusted',
  };
  const env = normalizeAgentEnv(source);
  assert.equal(env.CODE_AGENT_MODEL, 'override');
  assert.equal(env.CODE_AGENT_THINKING, 'high');
  assert.equal(env.CODE_AGENT_API_KEY, 'actual-secret');
  assert.equal(env.PATH, '/trusted');
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.equal(env.FACTORY_AGENT_CONFIG_JSON, undefined);
  assert.equal(env.CODE_AGENT_API_ENDPOINT, undefined);
  assert.equal(agentConfig(source).fingerprint, agentConfig(env).fingerprint);
});
test('credentials and secret endpoints are neither printed nor hashed', () => {
  const one = {
    CODE_AGENT_API_KEY: 'secret-a',
    CODE_AGENT_API_ENDPOINT: 'https://secret-a.invalid',
    PI_API_KEY: 'secret-b',
  };
  const two = {
    CODE_AGENT_API_KEY: 'changed',
    CODE_AGENT_API_ENDPOINT: 'https://changed.invalid',
  };
  assert.equal(agentConfig(one).fingerprint, agentConfig(two).fingerprint);
  assert.doesNotMatch(
    JSON.stringify(agentConfig(one)),
    /secret|API_KEY|API_ENDPOINT/,
  );
  assert.notEqual(
    agentConfig({ CODE_AGENT_PROVIDER_ID: 'provider-v1' }).fingerprint,
    agentConfig({ CODE_AGENT_PROVIDER_ID: 'provider-v2' }).fingerprint,
  );
});
