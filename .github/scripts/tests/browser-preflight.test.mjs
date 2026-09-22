import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { preflight, PREFLIGHT_TIMEOUTS } from '../browser-preflight.mjs';

const execute = promisify(execFile);
const budgets = { startup: 2_000, command: 500, cleanup: 200, total: 5_000 };

function fixture(t, plan = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'factory-preflight-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const executable = path.join(root, 'browser.mjs');
  const output = path.join(root, 'report.json');
  writeFileSync(executable, `#!${process.execPath}
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const root = ${JSON.stringify(root)};
const plan = ${JSON.stringify(plan)};
const args = process.argv.slice(2);
const stage = args[0] === '--version' ? 'version'
  : args[0] === 'open' ? (args[1] ? 'navigation' : 'startup')
  : args[0] === 'get' ? 'ready' : args[0];
appendFileSync(root + '/calls.jsonl', JSON.stringify({stage, args,
  namespace: process.env.AGENT_BROWSER_NAMESPACE,
  allowedDomains: process.env.AGENT_BROWSER_ALLOWED_DOMAINS,
  boundaries: process.env.AGENT_BROWSER_CONTENT_BOUNDARIES,
  noWebmcp: process.env.AGENT_BROWSER_NO_WEBMCP,
}) + '\\n');
if (plan.hang?.includes(stage)) {
  process.on('SIGTERM', () => {});
  setInterval(() => {}, 1000);
  await new Promise(() => {});
}
if (plan.delay?.[stage]) await sleep(plan.delay[stage]);
if (plan.fail === stage) {
  console.error('fixture failure: ' + stage);
  process.exit(9);
}
if (stage === 'version') console.log('agent-browser fixture');
if (stage === 'ready') console.log('about:blank');
if (stage === 'navigation') {
  writeFileSync(root + '/url', args[1]);
  await fetch(args[1]).then(r => r.text());
  if (!plan.omitCapabilities) await fetch(new URL('/result', args[1]), {method: 'POST',
    body: JSON.stringify({capabilities: {classicWorker: true, moduleWorker: false}})});
}
if (stage === 'upload' || stage === 'click') {
  await fetch(new URL('/result', readFileSync(root + '/url', 'utf8')), {method: 'POST',
    body: JSON.stringify(stage === 'upload' ? {upload: true} : {interaction: true})});
}
if (stage === 'download') {
  const data = await fetch(new URL('/download', readFileSync(root + '/url', 'utf8'))).then(r => r.text());
  writeFileSync(args[2], data);
}
if (stage === 'close') {
  // The first failure must already be on disk even when cleanup hangs/fails.
  const report = JSON.parse(readFileSync(root + '/report.json', 'utf8'));
  writeFileSync(root + '/before-cleanup.json', JSON.stringify(report));
}
`, { mode: 0o755 });
  return {
    executable, output,
    calls: () => readFileSync(path.join(root, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse),
  };
}

test('preflight separates cold startup, readiness and navigation, retaining QA safeguards and checks', async (t) => {
  const f = fixture(t, { delay: { startup: 800 } });
  const report = await preflight(f.output, f.executable, budgets);
  assert.equal(report.basic, true, JSON.stringify(report));
  assert.deepEqual(report.errors, []);
  assert.equal(report.capabilities.moduleWorker, false, 'optional capabilities are not a pass gate');
  assert.deepEqual(f.calls().map(c => c.stage), ['version', 'startup', 'ready', 'navigation', 'snapshot', 'upload', 'click', 'download', 'close']);
  assert.deepEqual(f.calls()[1].args, ['open'], 'startup must not navigate to the fixture');
  assert.deepEqual(f.calls().at(-1).args, ['close'], 'close this session, not all sessions');
  assert.equal(new Set(f.calls().map(c => c.namespace)).size, 1);
  for (const c of f.calls()) {
    assert.equal(c.allowedDomains, '127.0.0.1');
    assert.equal(c.boundaries, '1');
    assert.equal(c.noWebmcp, '1');
  }
  const startup = report.commands.find(c => c.stage === 'startup');
  assert.equal(startup.timeoutMs, budgets.startup);
  assert.ok(startup.durationMs > budgets.command, 'cold startup can exceed the normal command budget');
  assert.equal(report.commands.find(c => c.stage === 'navigation').timeoutMs, budgets.command);
  assert.deepEqual(JSON.parse(readFileSync(f.output, 'utf8')), report);
});

for (const [failure, phase] of [['startup', 'startup'], ['ready', 'ready'], ['navigation', 'navigation'], ['upload', 'upload']]) {
  test(`preflight stops at ${phase} without retrying or running downstream checks`, async (t) => {
    const f = fixture(t, { fail: failure });
    const report = await preflight(f.output, f.executable, budgets);
    assert.equal(report.basic, false);
    assert.equal(report.failedStage, phase);
    const error = report.commands.find(c => c.stage === phase);
    assert.equal(error.code, 9);
    assert.match(error.stderr, /fixture failure/);
    assert.equal(f.calls().filter(c => c.stage === failure).length, 1);
    assert.equal(f.calls().at(-1).stage, 'close');
    assert.equal(f.calls().some(c => c.stage === 'download'), false);
    const beforeCleanup = JSON.parse(readFileSync(path.join(path.dirname(f.output), 'before-cleanup.json'), 'utf8'));
    assert.equal(beforeCleanup.failedStage, phase);
  });
}

test('hung startup and cleanup have separate short test budgets and preserve the first failure', async (t) => {
  const f = fixture(t, { hang: ['startup', 'close'] });
  const limits = { ...budgets, startup: 350, cleanup: 150 };
  const report = await preflight(f.output, f.executable, limits);
  assert.equal(report.failedStage, 'startup');
  assert.equal(report.basic, false);
  assert.equal(report.commands.find(c => c.stage === 'startup').timedOut, true);
  assert.equal(report.commands.at(-1).stage, 'cleanup');
  assert.equal(report.commands.at(-1).timedOut, true);
  assert.equal(report.commands.at(-1).timeoutMs, 150);
  assert.ok(report.durationMs < 2_000, `timeout chain took ${report.durationMs}ms`);
  assert.equal(f.calls().some(c => c.stage === 'navigation'), false);
});

test('navigation cannot borrow the longer startup allowance', async (t) => {
  const f = fixture(t, { hang: ['navigation'] });
  const report = await preflight(f.output, f.executable, budgets);
  assert.equal(report.failedStage, 'navigation');
  assert.equal(report.commands.find(c => c.stage === 'navigation').timedOut, true);
  assert.equal(report.commands.find(c => c.stage === 'navigation').timeoutMs, budgets.command);
});

test('total budget caps the current command and reserves time for cleanup', async (t) => {
  const f = fixture(t, { hang: ['startup', 'close'] });
  const limits = { startup: 3_000, command: 2_000, cleanup: 200, total: 800 };
  const report = await preflight(f.output, f.executable, limits);
  const startup = report.commands.find(c => c.stage === 'startup');
  assert.equal(report.failedStage, 'startup');
  assert.ok(startup.timeoutMs <= 600);
  assert.ok(report.commands.at(-1).timeoutMs <= 200);
  assert.ok(report.durationMs < 1_500, `total budget took ${report.durationMs}ms`);
});

test('capability callback waiting also respects the total budget', async (t) => {
  const f = fixture(t, { omitCapabilities: true });
  const report = await preflight(f.output, f.executable, { startup: 2_000, command: 1_000, cleanup: 200, total: 1_800 });
  assert.equal(report.basic, false);
  assert.equal(report.failedStage, 'capabilities');
  assert.match(report.errors[0], /total budget/);
  assert.ok(report.durationMs < 2_500);
});

test('missing browser fails before attempting startup or cleanup', async (t) => {
  const f = fixture(t);
  const report = await preflight(f.output, f.executable + '-missing', budgets);
  assert.equal(report.failedStage, 'version');
  assert.equal(report.commands[0].code, 'ENOENT');
  assert.equal(report.commands.length, 1);
});

test('CLI keeps exit 20 for an environment failure and names the failed stage', async (t) => {
  const f = fixture(t, { fail: 'startup' });
  await assert.rejects(execute(process.execPath, [path.resolve(import.meta.dirname, '../browser-preflight.mjs'), f.output], {
    env: { ...process.env, FACTORY_REAL_AGENT_BROWSER: f.executable }, timeout: 5_000,
  }), error => {
    assert.equal(error.code, 20);
    assert.match(error.stderr, /failed at startup/);
    assert.match(error.stderr, /No application repair requested/);
    return true;
  });
});

test('default budgets cover native cold startup without enlarging all commands', () => {
  assert.ok(PREFLIGHT_TIMEOUTS.startup >= 3 * 30_000 + 1_000);
  assert.equal(PREFLIGHT_TIMEOUTS.command, 20_000);
  assert.equal(PREFLIGHT_TIMEOUTS.cleanup, 5_000);
  assert.equal(PREFLIGHT_TIMEOUTS.total, 180_000);
});
