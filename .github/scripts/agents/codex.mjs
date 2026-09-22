import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { npmInstall, optionalEndpoint, qaHooks, requiredModel, writeJson } from '../agent-adapter.mjs';

export const installation = {
  package: '@openai/codex', version: '0.155.1',
  versionEnv: ['CODEX_VERSION'], command: 'codex', ignoreScripts: true,
};
export const install = (version) => npmInstall(installation, version);
export const credentials = ['CODEX_API_KEY', 'CODEX_BASE_URL'];

export function createInvocation({ workspace, prompt, agentDir, env }) {
  if (!env.CODEX_API_KEY) throw new Error('CODEX_API_KEY is required.');
  const model = requiredModel('CODEX_MODEL', env);
  const effort = (env.FACTORY_AGENT_ROLE === 'qa' && env.CODEX_QA_REASONING_EFFORT) || env.CODEX_REASONING_EFFORT;
  if (effort && !['none', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(effort)) {
    throw new Error(`Unsupported CODEX_REASONING_EFFORT: ${effort}`);
  }
  const endpoint = optionalEndpoint(env.CODEX_BASE_URL, 'CODEX_BASE_URL');
  const isQa = env.FACTORY_AGENT_ROLE === 'qa';
  mkdirSync(agentDir, { recursive: true });
  // Ignore project config/hooks. Only the factory's own QA hook is trusted for
  // this non-interactive invocation; no persisted user login is copied into CI.
  const config = [
    'approval_policy = "never"',
    'sandbox_mode = "danger-full-access"',
    ...(effort ? [`model_reasoning_effort = ${JSON.stringify(effort)}`] : []),
    ...(endpoint ? ['model_provider = "factory"', '[model_providers.factory]',
      'name = "Factory"', `base_url = ${JSON.stringify(endpoint)}`,
      'env_key = "CODEX_API_KEY"', 'wire_api = "responses"'] : []),
    `[projects.${JSON.stringify(workspace)}]`, 'trust_level = "untrusted"',
    '[features]', `hooks = ${isQa}`,
  ];
  writeFileSync(path.join(agentDir, 'config.toml'), config.join('\n') + '\n', { mode: 0o600 });
  writeJson(path.join(agentDir, 'hooks.json'), { hooks: isQa ? qaHooks() : {} });
  return {
    label: 'Codex', command: 'codex', model,
    // Browser QA runs in a factory-owned temporary directory, not a Git checkout.
    args: ['exec', '--skip-git-repo-check', '--json', '--ephemeral', '--model', model,
      '--sandbox', 'danger-full-access', '-c', 'approval_policy="never"',
      ...(isQa ? ['--dangerously-bypass-hook-trust'] : []), '-'],
    cwd: workspace,
    env: { ...env, CODEX_HOME: agentDir },
    standardInput: readFileSync(prompt, 'utf8'),
  };
}

export function parseEvent(event) {
  if (event.type === 'turn.started') return { active: true };
  if (event.type === 'turn.failed') {
    return { complete: true, failure: event.error?.message || 'Codex turn failed' };
  }
  if (event.type === 'error') return { failure: event.message || 'Codex stream error' };
  if (event.type !== 'turn.completed') return undefined;
  const usage = event.usage;
  const input = usage?.input_tokens;
  const cached = usage?.cached_input_tokens;
  return {
    complete: true, failure: null,
    measurements: [{ id: 'turn', usage: usage && {
      // Codex's input includes cached tokens, unlike Pi/Anthropic's input.
      input: Number.isSafeInteger(input) && Number.isSafeInteger(cached) && input >= cached ? input - cached : undefined,
      output: usage.output_tokens,
      cacheRead: cached,
      // Cache writes/reasoning are not exposed by this event. Leave unknown.
      totalTokens: Number.isSafeInteger(input) && Number.isSafeInteger(usage.output_tokens) ? input + usage.output_tokens : undefined,
    } }],
  };
}
