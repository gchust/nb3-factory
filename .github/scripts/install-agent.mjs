import { normalizeAgentEnv } from './agent-configuration.mjs';
import { spawnSync } from 'node:child_process';
import { resolveAgent } from './agent-registry.mjs';
import { engineEnv, writeJson } from './agent-adapter.mjs';

const configuredEnv = normalizeAgentEnv(process.env);
const adapter = resolveAgent(configuredEnv);
// Installation is an adapter strategy, not a global assumption about npm.
const env = engineEnv(configuredEnv, []);
for (const { command, args } of adapter.install(adapter.version)) {
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Code Agent installation failed (${result.status ?? result.signal}).`);
}
const probe = spawnSync(adapter.command, ['--version'], { encoding: 'utf8', env, timeout: 30_000 });
if (probe.error) throw probe.error;
if (probe.status !== 0) throw new Error(`${adapter.command} --version failed.`);
const actualVersion = probe.stdout.match(/\b\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\b/u)?.[0];
if (actualVersion !== adapter.version) {
  throw new Error(`Expected ${adapter.id} ${adapter.version}, got ${actualVersion ?? 'unknown'}.`);
}
if (process.env.FACTORY_AGENT_INSTALL_RECORD) {
  writeJson(process.env.FACTORY_AGENT_INSTALL_RECORD, {
    version: 1, engine: adapter.id, configuredVersion: adapter.version, actualVersion,
  });
}
