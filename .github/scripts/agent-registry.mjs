// Only control-plane adapters may execute. Imports are deliberately side-effect
// free: neither reading usage nor resolving an engine may start a CLI.
import * as pi from './agents/pi.mjs';
import * as codebuddy from './agents/codebuddy.mjs';
import * as claudeCode from './agents/claude-code.mjs';
import * as codex from './agents/codex.mjs';
import * as opencode from './agents/opencode.mjs';

const adapters = new Map([
  ['pi', pi], ['codebuddy', codebuddy], ['claude-code', claudeCode],
  ['codex', codex], ['opencode', opencode],
]);
export const agentIds = [...adapters.keys()];

export function resolveAgent(env = process.env) {
  const id = env.CODE_AGENT_ENGINE?.trim() || 'pi';
  const adapter = adapters.get(id);
  if (!adapter) throw new Error(`Unsupported CODE_AGENT_ENGINE: ${id}`);
  const [name, version] = adapter.installation.versionEnv
    .map((candidate) => [candidate, env[candidate]?.trim()])
    .find(([, value]) => value) ?? [adapter.installation.versionEnv[0], adapter.installation.version];
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`${name} must be a pinned semantic version.`);
  }
  return { id, ...adapter, ...adapter.installation, version };
}
