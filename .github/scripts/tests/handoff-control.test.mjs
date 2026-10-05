import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { resolveControlSha, verifyControlSha } from '../handoff-control.mjs';
import { dispatchContinuation } from '../handoff.mjs';

const scripts = path.resolve(import.meta.dirname, '..');
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const event = (extra = {}) => ({ repository: { full_name: 'gchust/nb3-factory' }, action: 'code-agent-continue', client_payload: {
  issue_number: 165, previous_run_id: 12345, continuation: 2, ...extra,
} });
function directory(t) {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'factory-control-pin-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function write(root, file, value) {
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(root, file), JSON.stringify(value));
}
function checkpoint(root, extra = {}, pipeline = { controlSha: A }) {
  write(root, 'handoff.json', { schemaVersion: 1, issueNumber: 165, previousRunId: 12345, continuation: 2, ...extra });
  if (pipeline !== null) write(root, 'pipeline-state.json', pipeline);
}
function cli(file, args, env = {}) {
  return execFileSync(process.execPath, [path.join(scripts, file), ...args], {
    env: {
      ...process.env, FACTORY_CONTROL_SHA: A,
      // Fixtures must not inherit the enclosing Actions run or application base.
      GITHUB_RUN_ID: '', GITHUB_RUN_ATTEMPT: '',
      FACTORY_APPLICATION_BASE_SHA: '', FACTORY_APPLICATION_BASE_REF: '',
      ...env,
    }, encoding: 'utf8', stdio: 'pipe',
  });
}

test('fresh builds pin the triggering checkout; only continuations inherit an older SHA', () => {
  for (const action of ['opened', 'reopened', 'code-agent-task', undefined]) {
    assert.equal(resolveControlSha({ action, client_payload: { control_sha: A } }, B), B);
  }
  assert.equal(resolveControlSha(event({ control_sha: A }), B, undefined, { repository: 'gchust/nb3-factory', issue: { number: 165 }, controlSha: A }), A);
});

test('an explicit invalid pin never silently falls back to develop or the checkpoint', (t) => {
  const root = directory(t); checkpoint(root);
  for (const control_sha of ['', null, undefined, 'develop', 'a'.repeat(7), `${A}\n`, B.toUpperCase()]) {
    assert.throws(() => resolveControlSha(event({ control_sha }), B, root), /full lowercase commit SHA/);
  }
});

test('legacy requests retain their actual pipeline SHA but cannot dispatch beyond the new limit', (t) => {
  const root = directory(t); checkpoint(root);
  assert.equal(resolveControlSha(event(), B, root), A);
  assert.equal(verifyControlSha(event(), A, root), A);
  const file = path.join(root, 'next.json');
  assert.throws(() => cli('handoff.mjs', ['prepare', '--issue', '165', '--run-id', '23456', '--continuation', '3', '--output', file]), /only one five-hour Handoff/);
  assert.equal(existsSync(file), false);
});

test('new pins are bound to the source task artifact before executing prepare code', (t) => {
  const root = directory(t);
  const metadata = { repository: 'gchust/nb3-factory', issue: { number: 165 } };
  for (const source of [null, metadata, { ...metadata, controlSha: B },
    { ...metadata, issue: { number: 171 }, controlSha: A },
    { ...metadata, repository: 'other/repo', controlSha: A }]) {
    assert.throws(() => resolveControlSha(event({ control_sha: A }), B, undefined, source));
  }
  write(root, 'task-metadata.json', metadata);
  cli('handoff-control.mjs', ['record', '--metadata', path.join(root, 'task-metadata.json')]);
  const recorded = JSON.parse(readFileSync(path.join(root, 'task-metadata.json'), 'utf8'));
  assert.deepEqual(recorded, { ...metadata, controlSha: A });
  assert.equal(resolveControlSha(event({ control_sha: A }), B, undefined, recorded), A);
});

test('record persists the explicit run identity and application base for recovery', (t) => {
  const root = directory(t);
  const metadata = {
    repository: 'gchust/nb3-factory', issue: { number: 165 },
    workBranch: 'agent/issue-165', task: { targetBranch: 'issues-165' },
  };
  const file = path.join(root, 'task-metadata.json');
  write(root, 'task-metadata.json', metadata);
  cli('handoff-control.mjs', ['record', '--metadata', file], {
    GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '2',
    FACTORY_APPLICATION_BASE_REF: 'issues-165', FACTORY_APPLICATION_BASE_SHA: B,
  });
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), {
    ...metadata, controlSha: A, run: { id: 12345, attempt: 2 },
    applicationBase: { ref: 'issues-165', sha: B },
  });
});

test('missing legacy provenance fails without selecting the current branch', (t) => {
  const root = directory(t); checkpoint(root, {}, null);
  assert.throws(() => resolveControlSha(event(), B, root), /no recorded factory SHA/);
  assert.throws(() => resolveControlSha(event(), B), /needs its handoff checkpoint/);
});

test('a checkpoint must belong to the exact Issue, source run and continuation', (t) => {
  const root = directory(t);
  for (const extra of [{ issueNumber: 171 }, { previousRunId: 9 }, { continuation: 3 }, { schemaVersion: 2 }]) {
    checkpoint(root, extra);
    assert.throws(() => verifyControlSha(event({ control_sha: A }), A, root), /does not match/);
  }
  for (const extra of [{ issue_number: 0 }, { previous_run_id: 'bad' }, { continuation: -1 }]) {
    assert.throws(() => resolveControlSha(event({ control_sha: A, ...extra }), B), /identity/);
  }
});

test('request, handoff and pipeline pins must agree before patch restoration', (t) => {
  const root = directory(t); checkpoint(root, { controlSha: A });
  assert.equal(verifyControlSha(event({ control_sha: A }), A, root), A);
  assert.throws(() => verifyControlSha(event({ control_sha: B }), B, root), /version change/);
  assert.throws(() => verifyControlSha(event({ control_sha: B }), A, root), /version change/);
  checkpoint(root, { controlSha: B });
  assert.throws(() => resolveControlSha(event(), B, root), /SHAs disagree/);
  writeFileSync(path.join(root, 'pipeline-state.json'), '{broken');
  assert.throws(() => resolveControlSha(event(), B, root), SyntaxError);
});

test('prepare cannot save a checkpoint with an absent or branch-name factory version', (t) => {
  const root = directory(t); const output = path.join(root, 'handoff.json');
  for (const sha of ['', 'develop']) {
    assert.throws(() => cli('handoff.mjs', ['prepare', '--issue', '165', '--run-id', '12345', '--output', output], { FACTORY_CONTROL_SHA: sha }));
    assert.equal(existsSync(output), false);
  }
});

test('dispatch carries the pinned SHA, source run, continuation and build comment without a new trigger type', async (t) => {
  let received;
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received = { method: req.method, url: req.url, body: JSON.parse(Buffer.concat(chunks).toString()) };
    res.writeHead(204).end();
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const child = spawn(process.execPath, [path.join(scripts, 'handoff.mjs'), 'dispatch', '--issue', '165', '--previous-run-id', '23456', '--continuation', '1'], {
    env: { ...process.env, FACTORY_CONTROL_SHA: A, GITHUB_SHA: B, GITHUB_REPOSITORY: 'gchust/nb3-factory', GITHUB_TOKEN: 'test-only', BUILD_COMMENT_ID: '56789', GITHUB_API_URL: `http://127.0.0.1:${server.address().port}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = ''; child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.stdout.resume();
  const timer = setTimeout(() => child.kill(), 5000);
  t.after(() => clearTimeout(timer));
  const [code] = await once(child, 'exit');
  assert.equal(code, 0, stderr);
  assert.deepEqual(received, { method: 'POST', url: '/repos/gchust/nb3-factory/dispatches', body: {
    event_type: 'code-agent-continue', client_payload: {
      issue_number: 165, control_sha: A, build_comment_id: 56789, previous_run_id: 23456, continuation: 1,
    },
  } });
});

// What undici's fetch rejects with when the connection itself failed.
const connectFailure = (code) =>
  Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error(`connect ${code}`), { code }) });

test('dispatch retries a 429 or a connection never made, with bounded backoff', async () => {
  const responses = [
    () => new Response('slow down', { status: 429 }),
    () => { throw connectFailure('ECONNREFUSED'); },
    () => { throw connectFailure('EAI_AGAIN'); },
    () => new Response(null, { status: 204 }),
  ];
  const calls = []; const pauses = [];
  await dispatchContinuation('https://api.test/repos/o/r/dispatches', {
    token: 't', body: { event_type: 'code-agent-continue' },
    fetcher: async (url, options) => { calls.push(options); return responses[calls.length - 1](); },
    pause: async (ms) => { pauses.push(ms); },
  });
  assert.equal(calls.length, 4);
  assert.deepEqual(pauses, [1000, 3000, 8000]);
  for (const options of calls) {
    assert.equal(options.body, JSON.stringify({ event_type: 'code-agent-continue' }));
    assert.ok(options.signal instanceof AbortSignal, 'every attempt is bounded by a timeout');
  }
  // Every address of a dual-stack host refused.
  let attempts = 0;
  await dispatchContinuation('https://api.test/d', {
    token: 't', body: {}, pause: async () => {},
    fetcher: async () => {
      if (++attempts > 1) return new Response(null, { status: 204 });
      throw Object.assign(new TypeError('fetch failed'), { cause: new AggregateError([connectFailure('ECONNREFUSED').cause, connectFailure('ENETUNREACH').cause]) });
    },
  });
  assert.equal(attempts, 2);
});

test('dispatch gives up after its retries and never retries another refusal', async () => {
  let calls = 0;
  await assert.rejects(dispatchContinuation('https://api.test/d', {
    token: 't', body: {}, pause: async () => {},
    fetcher: async () => { calls++; return new Response('rate limited', { status: 429 }); },
  }), /Failed to dispatch continuation: 429 rate limited$/);
  assert.equal(calls, 4);
  calls = 0;
  await assert.rejects(dispatchContinuation('https://api.test/d', {
    token: 't', body: {}, pause: async () => {},
    fetcher: async () => { calls++; throw connectFailure('ENOTFOUND'); },
  }), /ENOTFOUND; the request was never sent/);
  assert.equal(calls, 4);
  for (const status of [401, 403, 404, 422]) {
    calls = 0;
    await assert.rejects(dispatchContinuation('https://api.test/d', {
      token: 't', body: {}, pause: async () => { throw new Error('must not wait'); },
      fetcher: async () => { calls++; return new Response('refused', { status }); },
    }), new RegExp(`Failed to dispatch continuation: ${status} refused`));
    assert.equal(calls, 1, String(status));
  }
});

test('a 5xx may follow an accepted dispatch, so it is never retried', async () => {
  for (const status of [500, 502, 503, 504]) {
    let calls = 0;
    await assert.rejects(dispatchContinuation('https://api.test/d', {
      token: 't', body: {}, pause: async () => { throw new Error('must not wait'); },
      fetcher: async () => { calls++; return new Response('Server Error', { status }); },
    }), (error) => {
      assert.match(error.message, new RegExp(`HTTP ${status} Server Error\\)\\. GitHub may or may not have received it`));
      assert.match(error.message, /before dispatching it manually/);
      return true;
    });
    assert.equal(calls, 1, String(status));
  }
});

test('a 429 waits as long as Retry-After asks, within a cap', async () => {
  const at = Date.parse('2026-10-05T12:00:00Z');
  const responses = [
    new Response(null, { status: 429, headers: { 'retry-after': '7' } }),
    new Response(null, { status: 429, headers: { 'retry-after': new Date(at + 12_000).toUTCString() } }),
    new Response(null, { status: 429, headers: { 'retry-after': 'soon' } }),
    new Response(null, { status: 204 }),
  ];
  const pauses = [];
  await dispatchContinuation('https://api.test/d', {
    token: 't', body: {}, now: () => at,
    fetcher: async () => responses.shift(),
    pause: async (ms) => { pauses.push(ms); },
  });
  // An unreadable header falls back to the backoff for that attempt.
  assert.deepEqual(pauses, [7000, 12000, 8000]);
  let calls = 0;
  await assert.rejects(dispatchContinuation('https://api.test/d', {
    token: 't', body: {}, pause: async () => { throw new Error('must not wait'); },
    fetcher: async () => { calls++; return new Response('slow down', { status: 429, headers: { 'retry-after': '3600' } }); },
  }), /Retry-After asks for 3600 s, more than the 30 s this step waits\. The request was rejected/);
  assert.equal(calls, 1);
});

test('a dispatch that may have reached GitHub is never retried', async () => {
  const mayHaveArrived = [
    ['a reset', () => { throw connectFailure('ECONNRESET'); }, /ECONNRESET/],
    ['a closed socket', () => { throw Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }) }); }, /UND_ERR_SOCKET/],
    ['an unknown error', () => { throw new Error('something else'); }, /something else/],
    ['a mix of refused and reset addresses', () => { throw Object.assign(new TypeError('fetch failed'), { cause: new AggregateError([connectFailure('ECONNREFUSED').cause, connectFailure('ECONNRESET').cause]) }); }, /fetch failed/],
  ];
  for (const [name, failure, message] of mayHaveArrived) {
    let calls = 0;
    await assert.rejects(dispatchContinuation('https://api.test/d', {
      token: 't', body: {}, pause: async () => { throw new Error('must not wait'); },
      fetcher: async () => { calls++; return failure(); },
    }), (error) => {
      assert.match(error.message, message, name);
      assert.match(error.message, /may or may not have received it/, name);
      assert.match(error.message, /before dispatching it manually/, name);
      return true;
    });
    assert.equal(calls, 1, name);
  }
});

test('a dispatch with no response is aborted by its timeout and not retried', async () => {
  let calls = 0;
  await assert.rejects(dispatchContinuation('https://api.test/d', {
    token: 't', body: {}, timeoutMs: 20, pause: async () => { throw new Error('must not wait'); },
    fetcher: (url, { signal }) => {
      calls++;
      return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
    },
  }), /no response in 20 ms\)\. GitHub may or may not have received it/);
  assert.equal(calls, 1);
});

test('a real refused connection is retried and a real hung request is not', async (t) => {
  // Against sockets, not stubs: the error shapes are undici's own.
  const closed = createServer(); closed.listen(0, '127.0.0.1'); await once(closed, 'listening');
  const { port } = closed.address(); closed.close(); await once(closed, 'close');
  let pauses = 0;
  await assert.rejects(dispatchContinuation(`http://127.0.0.1:${port}/d`, {
    token: 't', body: {}, pause: async () => { pauses++; },
  }), /ECONNREFUSED; the request was never sent/);
  assert.equal(pauses, 3);
  let received = 0;
  const hung = createServer(() => { received++; }); hung.listen(0, '127.0.0.1'); await once(hung, 'listening');
  t.after(() => { hung.closeAllConnections(); hung.close(); });
  await assert.rejects(dispatchContinuation(`http://127.0.0.1:${hung.address().port}/d`, {
    token: 't', body: {}, timeoutMs: 200, pause: async () => { throw new Error('must not wait'); },
  }), /no response in 200 ms/);
  assert.equal(received, 1);
});

test('handoff.mjs run through a symlink still runs its command, never a silent no-op', (t) => {
  const root = directory(t);
  const link = path.join(root, 'handoff.mjs');
  symlinkSync(path.join(scripts, 'handoff.mjs'), link);
  const output = path.join(root, 'handoff.json');
  execFileSync(process.execPath, [link, 'prepare', '--issue', '165', '--run-id', '23456', '--output', output], {
    env: { ...process.env, FACTORY_CONTROL_SHA: A }, stdio: 'pipe',
  });
  assert.equal(JSON.parse(readFileSync(output, 'utf8')).previousRunId, 23456);
});

test('real Git A -> B -> C preserves the pinned evaluator but refuses another continuation', (t) => {
  const root = directory(t); const repo = path.join(root, 'repo'); mkdirSync(repo);
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
  git('init', '-b', 'develop'); git('config', 'user.name', 'Factory Test'); git('config', 'user.email', 'factory@example.invalid');
  const pinnedState = path.join(repo, 'pipeline-state.mjs');
  // Pin the production dependency graph too: restore must exercise history
  // preservation from the same control commit, not a mock or the current tree.
  for (const name of ['pipeline-state.mjs', 'task-policy.mjs', 'acceptance-criteria.mjs', 'review-history.mjs', 'history-redaction.mjs']) {
    copyFileSync(path.join(scripts, name), path.join(repo, name));
  }
  writeFileSync(path.join(repo, 'evaluator'), 'A'); git('add', '.'); git('commit', '-m', 'factory A'); const a = git('rev-parse', 'HEAD');
  writeFileSync(path.join(repo, 'evaluator'), 'B'); git('add', '.'); git('commit', '-m', 'factory B'); const b = git('rev-parse', 'HEAD');
  const meta = path.join(root, 'task.json');
  write(root, 'task.json', { issue: { number: 165 }, task: { requirements: 'unchanged', acceptanceCriteria: 'B01. Login\nB06. Preview' } });
  const source = path.join(root, 'checkpoint-1'); mkdirSync(source);
  const runState = (args, runId = '12345') => execFileSync(process.execPath, [pinnedState, ...args], { env: { ...process.env, FACTORY_CONTROL_SHA: a, GITHUB_RUN_ID: runId, GITHUB_RUN_ATTEMPT: '1', FACTORY_TASK_CONTINUATION: '0' }, stdio: 'pipe' });
  const stateFile = path.join(source, 'pipeline-state.json');
  runState(['init', stateFile, meta]);
  runState(['set', stateFile, 'qa-focused', '4', '3', '1800']);
  const state = JSON.parse(readFileSync(stateFile, 'utf8')); state.pendingCriteria = ['B06']; write(source, 'pipeline-state.json', state);
  writeFileSync(path.join(source, 'agent.patch'), 'unchanged patch');
  runState(['seal', stateFile, path.join(source, 'agent.patch')]);
  // An actual pre-pin handoff has no controlSha in handoff.json.
  write(source, 'handoff.json', { schemaVersion: 1, issueNumber: 165, previousRunId: 12345, continuation: 2 });
  write(root, 'event.json', event());
  const output = path.join(root, 'output');
  cli('handoff-control.mjs', ['resolve', '--event', path.join(root, 'event.json'), '--current-sha', b, '--checkpoint', source, '--output', output]);
  assert.equal(readFileSync(output, 'utf8'), `sha=${a}\n`);
  git('checkout', '--detach', a);
  assert.equal(readFileSync(path.join(repo, 'evaluator'), 'utf8'), 'A');
  cli('handoff-control.mjs', ['verify', '--event', path.join(root, 'event.json'), '--checkpoint', source], { FACTORY_CONTROL_SHA: a });
  const restored = path.join(root, 'restored-1'); runState(['restore', source, restored, meta], '23456');
  const first = JSON.parse(readFileSync(path.join(restored, 'pipeline-state.json'), 'utf8'));
  assert.equal(first.controlSha, a); assert.equal(first.phase, 'qa-focused');
  assert.deepEqual(first.pendingCriteria, ['B06']); assert.equal(first.verificationAttempts, 4); assert.equal(first.repairAttempts, 3);
  copyFileSync(path.join(source, 'agent.patch'), path.join(restored, 'agent.patch'));
  assert.throws(() => cli('handoff.mjs', ['prepare', '--issue', '165', '--run-id', '23456', '--continuation', '3', '--phase', 'qa-focused', '--output', path.join(restored, 'handoff.json')], { FACTORY_CONTROL_SHA: a }), /only one five-hour Handoff/);
  git('checkout', 'develop'); writeFileSync(path.join(repo, 'evaluator'), 'C'); git('add', '.'); git('commit', '-m', 'factory C'); const c = git('rev-parse', 'HEAD');
  const next = event({ control_sha: a, previous_run_id: 23456, continuation: 3 });
  const previousTask = { repository: 'gchust/nb3-factory', issue: { number: 165 }, controlSha: a };
  assert.equal(resolveControlSha(next, c, undefined, previousTask), a); // no second full checkpoint download in prepare
  git('checkout', '--detach', a);
  assert.throws(() => runState(['handoff', path.join(restored, 'pipeline-state.json')], '23456'), error => error.status === 76);
  const stopped = JSON.parse(readFileSync(path.join(restored, 'pipeline-state.json'), 'utf8'));
  assert.equal(stopped.controlSha, a); assert.equal(stopped.phase, 'qa-focused');
  assert.deepEqual(stopped.pendingCriteria, ['B06']); assert.equal(stopped.repairAttempts, 3);
  assert.equal(stopped.stopReason.code, 'handoff-limit');
});

test('workflow resolves before task code, verifies before applying a patch and uses bootstrap only for handoff', () => {
  const workflow = readFileSync(path.join(scripts, '../workflows/code-agent-task.yml'), 'utf8');
  const prepare = workflow.split('  prepare:')[1].split('  agent:')[0];
  assert.match(prepare, /actions: read/);
  assert.ok(prepare.indexOf('handoff-control.mjs resolve') < prepare.indexOf('node control/.github/scripts/prepare-task.mjs'));
  assert.ok(prepare.includes('ref: ${{ steps.baseline.outputs.sha }}'));
  assert.match(prepare, /Download legacy handoff control metadata\n\s+if: .*&& !github\.event\.client_payload\.control_sha/);
  const agent = workflow.split('  agent:')[1].split('  verify-final:')[0];
  assert.ok(agent.indexOf('handoff-control.mjs verify') < agent.indexOf('node control/.github/scripts/apply-patch.mjs'));
  assert.match(agent, /node bootstrap\/\.github\/scripts\/handoff.mjs prepare/);
  assert.match(agent, /node bootstrap\/\.github\/scripts\/handoff.mjs dispatch/);
  // The bootstrap only pins the control plane: the handoff protocol, plus the
  // frozen evaluation-sample pin that must run before any task code is checked out.
  assert.doesNotMatch(workflow, /node bootstrap\/\.github\/scripts\/(?!handoff|evaluation-sample\.mjs pin)/);
  assert.ok(prepare.indexOf('evaluation-sample.mjs pin') < prepare.indexOf('handoff-control.mjs resolve'));
  assert.doesNotMatch(agent, /bootstrap\/\.github\/scripts\/evaluation-sample/);
  for (const job of ['agent', 'verify-final', 'publish']) {
    const block = workflow.split(`  ${job}:`)[1].split(/\n  [a-z-]+:\n/u)[0];
    assert.ok(block.includes('ref: ${{ needs.prepare.outputs.control_sha }}'), job);
  }
});
