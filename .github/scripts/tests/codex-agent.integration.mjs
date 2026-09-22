// Invoked explicitly by Agent CLI compatibility after installing the pinned Codex.
// The executable is real; the only model endpoint is a loopback Responses fixture.
import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { createInvocation, installation } from '../agents/codex.mjs';
import { readResult } from '../agent-result.mjs';

const execFileAsync = promisify(execFile);
function execute(command, args, options) {
  const result = execFileAsync(command, args, options);
  // Codex consumes piped stdin even with a positional prompt; signal EOF.
  result.child.stdin?.end();
  return result;
}
const scripts = path.resolve(import.meta.dirname, '..');

test('real Codex completes QA outside Git; removing the flag reproduces the startup failure', { timeout: 90_000 }, async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'factory-codex-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'browser-agent-workspace');
  const home = path.join(root, 'home');
  const agentDir = path.join(root, 'agent');
  const prompt = path.join(root, 'prompt.md');
  const log = path.join(root, 'agent-browser-acceptance.jsonl');
  mkdirSync(workspace);
  mkdirSync(home);
  writeFileSync(prompt, 'Reply with factory-codex-smoke-ok. Do not use tools.\n');
  assert.notEqual(spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: workspace }).status, 0);

  let requests = 0;
  const message = { id: 'msg_fixture', type: 'message', role: 'assistant', status: 'completed',
    content: [{ type: 'output_text', text: 'factory-codex-smoke-ok', annotations: [] }] };
  const events = [
    { type: 'response.created', response: { id: 'resp_fixture', status: 'in_progress' } },
    { type: 'response.output_item.added', output_index: 0, item: { ...message, status: 'in_progress', content: [] } },
    { type: 'response.output_item.done', output_index: 0, item: message },
    { type: 'response.completed', response: { id: 'resp_fixture', status: 'completed', output: [message],
      usage: { input_tokens: 12, input_tokens_details: { cached_tokens: 2 }, output_tokens: 3, total_tokens: 15 } } },
  ];
  const server = createServer((request, response) => {
    request.resume();
    if (request.method !== 'POST' || request.url !== '/v1/responses') {
      response.writeHead(404).end();
      return;
    }
    requests++;
    response.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'close' });
    response.end(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  // Do not inherit developer credentials, saved auth, proxy settings or run deadlines.
  const env = {
    PATH: process.env.PATH, HOME: home, TMPDIR: root,
    CODE_AGENT_ENGINE: 'codex', FACTORY_AGENT_ROLE: 'qa',
    CODEX_API_KEY: 'fixture-not-a-real-key', CODEX_MODEL: 'gpt-5-codex',
    CODEX_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
    CODE_AGENT_INVOCATION_TIMEOUT_SECONDS: '30', CODE_AGENT_IDLE_TIMEOUT_SECONDS: '20',
  };
  const { stdout: version } = await execute('codex', ['--version'], { env, timeout: 10_000 });
  assert.ok(version.includes(installation.version), version);
  t.diagnostic(version.trim());
  const invocation = createInvocation({ workspace, prompt, agentDir, env });
  const originalArgs = invocation.args.filter((arg) => arg !== '--skip-git-repo-check');
  // Use the same prompt as an argv value for the negative control, avoiding a stdin wait.
  const original = await execute(invocation.command, [...originalArgs.slice(0, -1), readFileSync(prompt, 'utf8')], {
    cwd: invocation.cwd, env: invocation.env, timeout: 15_000,
  }).then(() => null, (error) => error);
  assert.ok(original, 'without the flag Codex must reject this non-Git workspace');
  assert.equal(original.code, 1, original.stderr);
  assert.match(original.stderr, /Not inside a trusted directory.*--skip-git-repo-check/);
  assert.equal(requests, 0, 'the original invocation must fail before contacting the provider');
  t.diagnostic('Without the flag: exit 1 before any Responses request.');

  const { stdout, stderr } = await execute(process.execPath, [path.join(scripts, 'run-agent.mjs'),
    '--workspace', workspace, '--prompt', prompt, '--log', log, '--agentDir', agentDir], {
    cwd: workspace, env, timeout: 45_000, killSignal: 'SIGKILL', maxBuffer: 2 * 1024 * 1024,
  });
  assert.equal(requests, 1, stderr);
  assert.match(stdout, /factory-codex-smoke-ok/);
  const result = readResult(log);
  assert.equal(result.engine, 'codex');
  assert.equal(result.role, 'qa');
  assert.equal(result.status, 'completed', stderr);
  assert.equal(result.terminalEvent, true);
  assert.equal(result.measurements.length, 1);
  assert.equal(result.measurements[0].usage.input, 10);
  assert.equal(result.measurements[0].usage.cacheRead, 2);
  assert.equal(result.measurements[0].usage.output, 3);
  assert.equal(existsSync(path.join(workspace, '.git')), false);
  assert.match(readFileSync(path.join(agentDir, 'config.toml'), 'utf8'), /trust_level = "untrusted"/);
  t.diagnostic('With the adapter flag: exit 0, local Responses request, completed QA result and normalized usage.');
});
