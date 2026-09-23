// No model request or credentials: exercise the actual installed executable and
// the flags used by the adapter. Protocol behavior is covered by contract tests.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolveAgent } from './agent-registry.mjs';
import { engineEnv } from './agent-adapter.mjs';

const adapter = resolveAgent();
const helpArgs = ['codex', 'opencode'].includes(adapter.id) ? [adapter.id === 'codex' ? 'exec' : 'run', '--help'] : ['--help'];
const help = spawnSync(adapter.command, helpArgs, {
  encoding: 'utf8', timeout: 60_000, env: engineEnv(process.env, []),
});
assert.equal(help.status, 0, help.error?.message ?? help.stderr);
const output = help.stdout + help.stderr;
const required = {
  pi: ['--mode', '--no-session', '--provider', '--thinking', '--extension'],
  codebuddy: ['--print', '--output-format', '--model', '--settings', '--setting-sources'],
  'claude-code': ['--print', '--output-format', '--verbose', '--no-session-persistence', '--settings'],
  codex: ['--json', '--ephemeral', '--sandbox', '--dangerously-bypass-hook-trust'],
  opencode: ['--format', '--model', '--variant', '--auto'],
};
for (const flag of required[adapter.id]) assert.ok(output.includes(flag), `${adapter.id} is missing ${flag}`);
console.log(`${adapter.id} ${adapter.version}: installation, version and headless flags verified (no model request).`);
