import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const script = path.resolve(import.meta.dirname, '../run-agent.mjs');
function run(t, phase, overrides = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'factory-reply-completion-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'bin'));
  writeFileSync(path.join(root, 'prompt.md'), 'Answer the question');
  writeFileSync(path.join(root, 'bin/pi'), `#!/usr/bin/env node
require('node:fs').writeFileSync(process.env.PARTIAL_REPLY, 'Incomplete answer');
console.log(JSON.stringify({type:'agent_start'}));
setInterval(() => {}, 10000);
`, { mode: 0o755 });
  const log = path.join(root, phase === 'reply' ? 'comment-agent.jsonl' : 'agent-implement.jsonl');
  const env = { ...process.env, PATH: `${root}/bin:${process.env.PATH}`,
    CODE_AGENT_ENGINE: 'pi', CODE_AGENT_MODEL: 'fixture', CODE_AGENT_API_KEY: 'test-only',
    CODE_AGENT_API_ENDPOINT: 'https://example.invalid/v1',
    CODE_AGENT_IDLE_TIMEOUT_SECONDS: '1', CODE_AGENT_INVOCATION_TIMEOUT_SECONDS: '0',
    FACTORY_RUN_DEADLINE_EPOCH_SECONDS: '', FACTORY_AGENT_ROLE: '',
    PARTIAL_REPLY: path.join(root, 'comment-reply.md'), ...overrides };
  delete env.FACTORY_AGENT_INSTALL_RECORD;
  const result = spawnSync(process.execPath, [script, '--workspace', root, '--prompt', path.join(root, 'prompt.md'),
    '--log', log, '--agentDir', path.join(root, 'agent')], { env, encoding: 'utf8', timeout: 10000 });
  return { root, log, result };
}

test('stalled comment with a partial answer fails without publishing it as completed', t => {
  const { root, log, result } = run(t, 'reply');
  assert.equal(readFileSync(path.join(root, 'comment-reply.md'), 'utf8'), 'Incomplete answer');
  assert.equal(JSON.parse(readFileSync(`${log}.result.json`, 'utf8')).status, 'stalled');
  assert.equal(result.status, 1, result.stderr);
  assert.equal(JSON.parse(readFileSync(`${log}.invocation.json`, 'utf8')).status, 'failed');
});

test('stalled implementation still hands its partial workspace to verification', t => {
  const { log, result } = run(t, 'implementation');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(readFileSync(`${log}.result.json`, 'utf8')).status, 'stalled');
});

test('invalid timeout configuration is recorded as not invoked', t => {
  const { log, result } = run(t, 'reply', { CODE_AGENT_INVOCATION_TIMEOUT_SECONDS: 'invalid' });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(readFileSync(`${log}.invocation.json`, 'utf8')).invoked, false);
});
