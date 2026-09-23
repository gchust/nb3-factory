import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { agentIds, resolveAgent } from '../agent-registry.mjs';
import { engineEnv, credentialNames } from '../agent-adapter.mjs';
import { createResult, readResult } from '../agent-result.mjs';
import { collectUsage } from '../task-usage.mjs';
import { FactoryQaGuard } from '../agents/opencode-qa-guard.mjs';

const scripts = path.resolve(import.meta.dirname, '..');
const nativeUsage = { input_tokens: 100, output_tokens: 40, cache_read_input_tokens: 20, cache_creation_input_tokens: 10 };
const piUsage = { input: 100, output: 40, cacheRead: 20, cacheWrite: 10, totalTokens: 170 };
const events = {
  pi: [{ type: 'message_end', message: { role: 'assistant', stopReason: 'stop', usage: piUsage } }, { type: 'agent_end' }],
  codebuddy: [{ type: 'assistant', message: { usage: nativeUsage } }, { type: 'result', subtype: 'success', usage: nativeUsage }],
  'claude-code': [{ type: 'assistant', message: { usage: nativeUsage } }, { type: 'result', subtype: 'success', usage: nativeUsage }],
  codex: [{ type: 'turn.completed', usage: { input_tokens: 120, cached_input_tokens: 20, output_tokens: 40 } }],
  opencode: [{ type: 'step_finish', part: { id: 'part_1', reason: 'tool-calls', tokens: { input: 100, output: 30, reasoning: 10, cache: { read: 20, write: 10 }, total: 170 } } }],
};
const settings = {
  CODE_AGENT_API_ENDPOINT: 'https://pi.example/v1', CODE_AGENT_API_KEY: 'pi-private-test-key', CODE_AGENT_MODEL: 'test-model',
  CODEBUDDY_API_KEY: 'cb-private-test-key', CODEBUDDY_MODEL: 'test-model',
  ANTHROPIC_API_KEY: 'claude-private-test-key', CLAUDE_CODE_MODEL: 'test-model',
  CODEX_API_KEY: 'codex-private-test-key', CODEX_MODEL: 'test-model',
  OPENCODE_API_KEY: 'opencode-private-test-key', OPENCODE_MODEL: 'anthropic/test-model',
};
function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'factory-adapters-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const context = { root, workspace: path.join(root, 'workspace'), prompt: path.join(root, 'prompt.md'), log: path.join(root, 'agent-implement.jsonl'), agentDir: path.join(root, 'agent'), bin: path.join(root, 'bin') };
  mkdirSync(context.workspace); mkdirSync(context.bin);
  writeFileSync(context.prompt, 'Read AGENTS.md and the relevant Skill; implement this task.\n');
  return context;
}

for (const id of agentIds) {
  test(`${id}: pure registry, isolated credentials, pinned installation, and normalized execution`, (t) => {
    const f = fixture(t);
    const adapter = resolveAgent({ CODE_AGENT_ENGINE: id });
    assert.equal(typeof adapter.install, 'function');
    assert.equal(typeof adapter.createInvocation, 'function');
    assert.equal(typeof adapter.parseEvent, 'function');
    assert.equal(adapter.install(adapter.version)[0].command, 'npm');
    const installArgs = adapter.install(adapter.version)[0].args;
    assert.equal(installArgs.includes('--ignore-scripts'), !['claude-code', 'opencode'].includes(id));
    const env = engineEnv({ ...process.env, ...settings, CODE_AGENT_ENGINE: id }, adapter.credentials);
    for (const key of credentialNames) if (!adapter.credentials.includes(key)) assert.equal(env[key], undefined);
    const invocation = adapter.createInvocation({ ...f, env });
    assert.equal(invocation.command, adapter.command);
    assert.equal(invocation.cwd, f.workspace);
    assert.equal(invocation.args.includes('--resume'), false);
    const shim = `#!/usr/bin/env node
import fs from 'node:fs';
const input = ${JSON.stringify(id)} === 'pi' ? fs.readFileSync(process.argv.at(-1).slice(1),'utf8') : fs.readFileSync(0,'utf8');
if (!input.includes('Read AGENTS.md')) process.exit(9);
const allowed = ${JSON.stringify(adapter.credentials)};
for (const key of ${JSON.stringify(credentialNames)}) if (!allowed.includes(key) && process.env[key]) process.exit(8);
fs.writeFileSync('changed.txt', 'implementation fixture');
console.log(JSON.stringify({ diagnostics: process.env[allowed[0]] }));
console.error('plain diagnostic output must not pollute normalized usage');
for (const event of ${JSON.stringify(events[id])}) console.log(JSON.stringify(event));
`;
    writeFileSync(path.join(f.bin, adapter.command), shim, { mode: 0o755 });
    const result = spawnSync(process.execPath, [path.join(scripts, 'run-agent.mjs'),
      '--workspace', f.workspace, '--prompt', f.prompt, '--log', f.log, '--agentDir', f.agentDir], {
      encoding: 'utf8', timeout: 15_000,
      env: { ...process.env, ...settings, CODE_AGENT_ENGINE: id, PATH: `${f.bin}:${process.env.PATH}` },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(path.join(f.workspace, 'changed.txt'), 'utf8'), 'implementation fixture');
    const normalized = readResult(f.log);
    assert.equal(normalized.engine, id);
    assert.equal(normalized.actualVersion, null); // no installation is claimed by a mock
    assert.equal(normalized.status, 'completed');
    assert.equal(normalized.measurements.length, 1);
    assert.equal(normalized.measurements[0].usage.input, 100);
    assert.equal(normalized.measurements[0].usage.output, 40);
    assert.equal(normalized.measurements[0].usage.cacheRead, 20);
    const published = readFileSync(f.log, 'utf8') + readFileSync(`${f.log}.result.json`, 'utf8') + result.stdout;
    for (const [key, value] of Object.entries(settings)) if (key.endsWith('API_KEY')) assert.equal(published.includes(value), false);
  });
}

test('normalized usage replaces raw parsing, deduplicates results and keeps cache semantics', async (t) => {
  for (const id of agentIds) {
    const f = fixture(t);
    const adapter = resolveAgent({ CODE_AGENT_ENGINE: id });
    const result = createResult({ engine: id, completion: adapter.completion ?? 'event' });
    for (const event of [...events[id], ...events[id]]) result.observe(adapter.parseEvent(event) ?? {}, JSON.stringify(event));
    result.save(f.log, { status: 'completed', exitCode: 0 }, (text) => text);
    writeFileSync(f.log, events[id].map((e) => JSON.stringify(e)).join('\n'));
    const usage = await collectUsage(f.root);
    assert.equal(usage.records, 1);
    assert.equal(usage.phases.implementation.input, 100);
    assert.equal(usage.phases.implementation.output, 40);
    assert.equal(usage.phases.implementation.totalTokens, id === 'codex' ? 160 : 170);
    assert.equal(usage.incomplete, id === 'codex' ? 1 : 0); // cache-write breakdown unavailable
  }
});

test('OpenCode tool steps do not finish a run; subagent usage is explicitly incomplete', () => {
  const adapter = resolveAgent({ CODE_AGENT_ENGINE: 'opencode' });
  assert.equal(adapter.parseEvent(events.opencode[0]).complete, undefined);
  assert.equal(adapter.parseEvent({ type: 'tool_use', part: { tool: 'task' } }).incomplete, true);
});

test('all vendor terminal failures override exit code zero', (t) => {
  const failureEvents = {
    pi: { type: 'message_end', message: { role: 'assistant', stopReason: 'error', errorMessage: 'provider failed' } },
    codebuddy: { type: 'result', is_error: true, result: 'provider failed' },
    'claude-code': { type: 'result', subtype: 'error_during_execution', errors: ['provider failed'] },
    codex: { type: 'turn.failed', error: { message: 'provider failed' } },
    opencode: { type: 'error', error: { data: { message: 'provider failed' } } },
  };
  for (const id of agentIds) {
    const f = fixture(t);
    const adapter = resolveAgent({ CODE_AGENT_ENGINE: id });
    writeFileSync(path.join(f.bin, adapter.command), `#!/usr/bin/env node\nconsole.log(${JSON.stringify(JSON.stringify(failureEvents[id]))});\n`, { mode: 0o755 });
    const result = spawnSync(process.execPath, [path.join(scripts, 'run-agent.mjs'), '--workspace', f.workspace, '--prompt', f.prompt, '--log', f.log, '--agentDir', f.agentDir], {
      encoding: 'utf8', timeout: 10_000,
      env: { ...process.env, ...settings, CODE_AGENT_ENGINE: id, PATH: `${f.bin}:${process.env.PATH}` },
    });
    assert.notEqual(result.status, 0, id);
    assert.equal(readResult(f.log).status, 'failed', id);
  }
});

test('unknown usage and malformed sidecars are not zero-cost successful measurements', async (t) => {
  const f = fixture(t);
  writeFileSync(f.log, JSON.stringify(events.codebuddy.at(-1)));
  const result = createResult({ engine: 'claude-code', completion: 'event' });
  result.observe(resolveAgent({ CODE_AGENT_ENGINE: 'claude-code' }).parseEvent({ type: 'result', subtype: 'success' }), '{}');
  result.save(f.log, { status: 'completed', exitCode: 0 }, (text) => text);
  let usage = await collectUsage(f.root);
  assert.equal(usage.records, 0);
  assert.equal(usage.missing, 1);
  writeFileSync(`${f.log}.result.json`, '{broken');
  usage = await collectUsage(f.root);
  assert.equal(usage.records, 0); // must not silently fall back to vendor data
  assert.equal(usage.incomplete, 1);
});

test('new QA adapters enforce the shared process preflight', async (t) => {
  for (const id of ['claude-code', 'codex', 'opencode']) {
    const f = fixture(t);
    const adapter = resolveAgent({ CODE_AGENT_ENGINE: id });
    const invocation = adapter.createInvocation({ ...f, env: engineEnv({ ...settings, FACTORY_AGENT_ROLE: 'qa' }, adapter.credentials) });
    if (id === 'opencode') {
      assert.match(JSON.parse(invocation.env.OPENCODE_CONFIG_CONTENT).plugin[0], /opencode-qa-guard\.mjs$/);
      const plugin = await FactoryQaGuard();
      await assert.rejects(plugin['tool.execute.before']({ tool: 'bash' }, { args: { command: 'sleep 1; pkill -f agent-browser' } }), /QA must not terminate/);
      await plugin['tool.execute.before']({ tool: 'bash' }, { args: { command: 'agent-browser close' } });
    } else {
      const file = path.join(f.agentDir, id === 'codex' ? 'hooks.json' : 'settings.json');
      assert.match(readFileSync(file, 'utf8'), /pre-tool-use-qa-guard/);
      if (id === 'codex') {
        assert.ok(invocation.args.includes('--dangerously-bypass-hook-trust'));
        assert.match(readFileSync(path.join(f.agentDir, 'config.toml'), 'utf8'), /trust_level = "untrusted"/);
      }
      for (const [command, status] of [['pkill -f agent-browser', 2], ['agent-browser close', 0]]) {
        const blocked = spawnSync(process.execPath, [path.join(scripts, 'agents/pre-tool-use-qa-guard.mjs')], {
          encoding: 'utf8', input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
        });
        assert.equal(blocked.status, status);
        if (status === 2) assert.match(blocked.stderr, /QA must not terminate/);
      }
    }
  }
});

test('native engine parameters do not accidentally inherit Pi reasoning settings', (t) => {
  for (const id of ['claude-code', 'codex', 'opencode']) {
    const f = fixture(t);
    const adapter = resolveAgent({ CODE_AGENT_ENGINE: id });
    const invocation = adapter.createInvocation({ ...f, env: engineEnv({ ...settings, FACTORY_AGENT_ROLE: 'qa', FACTORY_QA_THINKING: 'max' }, adapter.credentials) });
    assert.equal(invocation.args.includes('--effort'), false);
    assert.equal(invocation.args.includes('--variant'), false);
  }
});

test('installer verifies the actual executable and persists the selected pin', (t) => {
  for (const id of agentIds) {
    const f = fixture(t);
    const adapter = resolveAgent({ CODE_AGENT_ENGINE: id });
    const record = path.join(f.root, 'installed.json');
    writeFileSync(path.join(f.bin, 'npm'), '#!/usr/bin/env node\n', { mode: 0o755 });
    writeFileSync(path.join(f.bin, adapter.command), `#!/usr/bin/env node\nconsole.log('${adapter.version}');\n`, { mode: 0o755 });
    const env = { ...process.env, CODE_AGENT_ENGINE: id, PATH: `${f.bin}:${process.env.PATH}`, FACTORY_AGENT_INSTALL_RECORD: record };
    const success = spawnSync(process.execPath, [path.join(scripts, 'install-agent.mjs')], { encoding: 'utf8', env });
    assert.equal(success.status, 0, success.stderr);
    assert.equal(JSON.parse(readFileSync(record)).actualVersion, adapter.version);
    writeFileSync(path.join(f.bin, adapter.command), '#!/usr/bin/env node\nconsole.log("0.0.0");\n', { mode: 0o755 });
    const failure = spawnSync(process.execPath, [path.join(scripts, 'install-agent.mjs')], { encoding: 'utf8', env });
    assert.notEqual(failure.status, 0);
    assert.match(failure.stderr, /Expected .* got 0\.0\.0/);
  }
});


test('interrupted/stalled/handoff calls retain known usage but mark it incomplete', async (t) => {
  for (const status of ['stalled', 'handoff', 'timed_out', 'failed']) {
    const f = fixture(t);
    const result = createResult({ engine: 'pi', completion: 'event' });
    result.observe(resolveAgent().parseEvent(events.pi[0]), JSON.stringify(events.pi[0]));
    result.save(f.log, { status, exitCode: null }, (text) => text);
    writeFileSync(f.log, JSON.stringify(events.pi[0]));
    const usage = await collectUsage(f.root);
    assert.equal(usage.records, 1);
    assert.equal(usage.incomplete, 1);
  }
});
