import { readFileSync } from 'node:fs';
import path from 'node:path';
import { npmInstall, optionalEndpoint, qaHooks, requiredModel, resultEvent, writeJson } from '../agent-adapter.mjs';
import { formatConsoleLine } from '../agent-console.mjs';

export const installation = {
  package: '@anthropic-ai/claude-code', version: '2.1.278',
  versionEnv: ['CLAUDE_CODE_VERSION'], command: 'claude', ignoreScripts: false,
};
// This pinned npm wrapper needs postinstall to link its platform binary.
export const install = (version) => npmInstall(installation, version);
export const credentials = ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_BASE_URL'];
export const parseEvent = resultEvent;

export function createInvocation({ workspace, prompt, agentDir, env }) {
  if (!env.ANTHROPIC_API_KEY && !env.CLAUDE_CODE_OAUTH_TOKEN) {
    throw new Error('ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN is required.');
  }
  const model = requiredModel('CLAUDE_CODE_MODEL', env);
  const effort = (env.FACTORY_AGENT_ROLE === 'qa' && env.CLAUDE_CODE_QA_EFFORT) || env.CLAUDE_CODE_EFFORT;
  if (effort && !['low', 'medium', 'high', 'xhigh', 'max', 'ultracode'].includes(effort)) {
    throw new Error(`Unsupported CLAUDE_CODE_EFFORT: ${effort}`);
  }
  optionalEndpoint(env.ANTHROPIC_BASE_URL, 'ANTHROPIC_BASE_URL');
  const settings = path.join(agentDir, 'settings.json');
  writeJson(settings, {
    permissions: { defaultMode: 'bypassPermissions' },
    ...(env.FACTORY_AGENT_ROLE === 'qa' ? { hooks: qaHooks() } : {}),
  });
  return {
    label: 'Claude Code', command: 'claude', model,
    args: ['--print', '--output-format', 'stream-json', '--verbose',
      '--model', model, ...(effort ? ['--effort', effort] : []),
      '--dangerously-skip-permissions', '--no-session-persistence',
      '--setting-sources', 'user', '--settings', settings,
      '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}'],
    cwd: workspace,
    env: { ...env, CLAUDE_CONFIG_DIR: agentDir,
      DISABLE_TELEMETRY: '1', DISABLE_AUTOUPDATER: '1',
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1', CLAUDE_CODE_DISABLE_CRON: '1',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
    standardInput: readFileSync(prompt, 'utf8'),
    formatConsoleLine,
  };
}
