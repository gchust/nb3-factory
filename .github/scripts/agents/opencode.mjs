import { readFileSync } from 'node:fs';
import path from 'node:path';
import { npmInstall, optionalEndpoint, requiredModel, writeJson } from '../agent-adapter.mjs';
import { formatConsoleLine } from '../agent-console.mjs';

export const installation = {
  package: 'opencode-ai', version: '1.18.32', versionEnv: ['OPENCODE_VERSION'],
  command: 'opencode', ignoreScripts: false,
};
export const install = (version) => npmInstall(installation, version);
export const completion = 'exit';
export const credentials = ['OPENCODE_API_KEY', 'OPENCODE_BASE_URL'];

export function createInvocation({ workspace, prompt, agentDir, env }) {
  if (!env.OPENCODE_API_KEY) throw new Error('OPENCODE_API_KEY is required.');
  const model = requiredModel('OPENCODE_MODEL', env);
  const slash = model.indexOf('/');
  if (slash <= 0 || slash === model.length - 1) throw new Error('OPENCODE_MODEL must be provider/model.');
  const provider = model.slice(0, slash);
  const endpoint = optionalEndpoint(env.OPENCODE_BASE_URL, 'OPENCODE_BASE_URL');
  const variant = (env.FACTORY_AGENT_ROLE === 'qa' && env.OPENCODE_QA_VARIANT) || env.OPENCODE_VARIANT;
  const config = {
    $schema: 'https://opencode.ai/config.json',
    model, autoupdate: false, share: 'disabled',
    enabled_providers: [provider],
    provider: { [provider]: { options: {
      apiKey: '{env:OPENCODE_API_KEY}', ...(endpoint ? { baseURL: endpoint } : {}),
    } } },
    permission: 'allow',
    plugin: env.FACTORY_AGENT_ROLE === 'qa'
      ? [new URL('./opencode-qa-guard.mjs', import.meta.url).href] : [],
  };
  const configFile = path.join(agentDir, 'opencode.json');
  writeJson(configFile, config);
  return {
    label: 'OpenCode', command: 'opencode', model,
    args: ['run', '--format', 'json', '--model', model, '--auto',
      ...(variant ? ['--variant', variant] : [])],
    cwd: workspace,
    env: { ...env, OPENCODE_CONFIG: configFile, OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
      OPENCODE_DISABLE_PROJECT_CONFIG: '1', OPENCODE_DISABLE_AUTOUPDATE: '1',
      XDG_CONFIG_HOME: path.join(agentDir, 'config'), XDG_DATA_HOME: path.join(agentDir, 'data'),
      XDG_STATE_HOME: path.join(agentDir, 'state'), XDG_CACHE_HOME: path.join(agentDir, 'cache') },
    // Native instructions can be disabled with project config; the shared Factory
    // prompt still explicitly tells the agent to read AGENTS.md and relevant Skills.
    standardInput: readFileSync(prompt, 'utf8'),
    formatConsoleLine,
  };
}

export function parseEvent(event) {
  // The CLI streams only root-session parts; child-task usage is not included.
  if (event.type === 'tool_use' && event.part?.tool === 'task') return { incomplete: true };
  if (event.type === 'error') return { failure: event.error?.data?.message || event.error?.name || 'OpenCode session failed' };
  if (event.type === 'step_start') return { active: true };
  if (event.type !== 'step_finish') return undefined;
  const part = event.part;
  const tokens = part?.tokens;
  return {
    // A tool-call step is NOT the end of the invocation. Let OpenCode exit on
    // session.idle rather than killing it while a later tool/compaction runs.
    measurements: [{ id: part?.id, usage: tokens && {
      input: tokens.input,
      // OpenCode 1.18.32 Session.getUsage subtracts reasoning from output.
      output: Number.isSafeInteger(tokens.output) && Number.isSafeInteger(tokens.reasoning)
        ? tokens.output + tokens.reasoning : undefined,
      cacheRead: tokens.cache?.read, cacheWrite: tokens.cache?.write,
      reasoning: tokens.reasoning, totalTokens: tokens.total,
    } }],
  };
}
