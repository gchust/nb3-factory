import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  aggregate,
  collectUsage,
  emptyUsage,
  marker,
  recordsFromComments,
  renderUsage,
  selectSource,
  validateRecord,
} from '../task-usage.mjs';

const repository = 'owner/factory';
const begin = Date.parse('2026-09-07T01:00:00Z');
const iso = (seconds) => new Date(begin + seconds * 1000).toISOString();
const measured = {
  input: 100,
  output: 20,
  cacheRead: 800,
  cacheWrite: 50,
  reasoning: 5,
  totalTokens: 970,
};
const message = (timestamp, usage = measured) => ({
  type: 'message_end',
  message: {
    role: 'assistant',
    timestamp,
    responseId: 'proxy-reuses-id',
    usage,
    content: [{ text: 'secret must never be echoed' }],
  },
});
const run = {
  id: 10,
  run_attempt: 1,
  status: 'completed',
  conclusion: 'success',
  created_at: iso(0),
  run_started_at: iso(10),
  updated_at: iso(205),
  path: '.github/workflows/code-agent-task.yml',
  head_repository: { full_name: repository },
  event: 'issues',
  head_branch: 'develop',
};
const job = (id, name, start, end, extra = {}) => ({
  id,
  name,
  run_id: 10,
  started_at: iso(start),
  completed_at: iso(end),
  conclusion: 'success',
  ...extra,
});
const jobs = [
  job(1, 'prepare', 20, 30),
  job(2, 'agent', 40, 140, {
    steps: [
      {
        name: 'Run Code Agent implementation',
        started_at: iso(50),
        conclusion: 'success',
      },
    ],
  }),
  job(3, 'verify-final', 150, 180),
  job(4, 'publish', 190, 200),
];
const artifacts = [
  { id: 1, name: 'factory-task-21', created_at: iso(25) },
  { id: 2, name: 'factory-agent-21', created_at: iso(139) },
];
function directory(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'factory-usage-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function log(root, name, events) {
  const file = path.join(root, name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(
    file,
    events
      .map((e) => (typeof e === 'string' ? e : JSON.stringify(e)))
      .join('\n') + '\n',
  );
}
function record(overrides = {}) {
  const usage = emptyUsage();
  usage.records = 1;
  usage.phases.implementation = { ...measured };
  return {
    ...selectSource(run, jobs, artifacts, repository),
    usage,
    ...overrides,
  };
}
const botComment = (r) => ({
  user: { login: 'github-actions[bot]' },
  body: renderUsage(r, [r]),
});

test('counts only completed responses plus compaction, across every repair and QA round', async (t) => {
  const root = directory(t);
  const one = message(1);
  log(root, 'agent-implement.jsonl', [
    { type: 'agent_start' },
    { type: 'message_start', message: one.message },
    { type: 'message_update', message: one.message },
    one,
    one,
    message(2),
    { type: 'turn_end', message: one.message },
    {
      type: 'compaction_end',
      result: {
        usage: measured,
        tokensBefore: 1000000,
        estimatedTokensAfter: 100000,
      },
    },
    { type: 'agent_end', messages: [one.message] },
  ]);
  log(root, 'agent-repair-1.jsonl', [message(3), { type: 'agent_end' }]);
  log(root, 'agent-repair-2.jsonl', [message(4), { type: 'agent_end' }]);
  log(root, 'verify-1/browser-acceptance/agent-browser-acceptance.jsonl', [
    message(5),
    { type: 'agent_end' },
  ]);
  log(root, 'verify-3/browser-acceptance/agent-browser-report-repair-2.jsonl', [
    message(6),
    { type: 'agent_settled' },
  ]);
  log(root, 'not-an-agent.jsonl', [message(7)]);
  const usage = await collectUsage(root);
  assert.equal(usage.records, 7);
  assert.equal(usage.missing + usage.incomplete, 0);
  assert.equal(usage.phases.implementation.totalTokens, 1940);
  assert.equal(usage.phases.repair.totalTokens, 1940);
  assert.equal(usage.phases.qa.totalTokens, 1940);
  assert.equal(usage.phases.compaction.totalTokens, 970);
  assert.equal(aggregate([record({ usage })]).total, 6790); // reasoning is not added a second time
});

test('missing, interrupted, malformed and zero-filled error usage is not reported as free', async (t) => {
  const root = directory(t);
  log(root, 'agent-implement.jsonl', [
    message(1, { input: 0, output: 0, totalTokens: 0 }),
    message(2, { input: -10 }),
    '{"type":',
    'normal stderr',
  ]);
  const usage = await collectUsage(root);
  assert.equal(usage.records, 0);
  assert.equal(usage.missing, 2);
  assert.ok(usage.incomplete > 0);
  assert.match(renderUsage(record({ usage }), [record({ usage })]), /未知/);
  assert.doesNotMatch(
    renderUsage(record({ usage }), [record({ usage })]),
    /normal stderr|secret must/,
  );
});

test('partial breakdown is marked incomplete and missing total falls back to the four token categories', async (t) => {
  const root = directory(t);
  log(root, 'agent-implement.jsonl', [
    message(1, { ...measured, totalTokens: undefined }),
    message(2, { input: 2, output: 3, totalTokens: 9 }),
    { type: 'agent_end' },
  ]);
  const usage = await collectUsage(root);
  assert.equal(usage.phases.implementation.totalTokens, 979);
  assert.equal(usage.incomplete, 1);
});

test('missing artifacts and symlink evidence do not pretend to supply full usage', async (t) => {
  const root = directory(t);
  assert.ok((await collectUsage(path.join(root, 'absent'))).incomplete);
  symlinkSync('/etc/passwd', path.join(root, 'agent-implement.jsonl'));
  assert.ok((await collectUsage(root)).incomplete);
});

test('completion reports include all build jobs, but no media or reporting jobs', () => {
  const source = selectSource(
    run,
    [
      ...jobs,
      job(5, 'report-failure', 201, 205),
      job(6, 'publish-media', 202, 206),
    ],
    artifacts,
    repository,
  );
  const totals = aggregate([{ ...source, usage: emptyUsage() }]);
  assert.equal(totals.seconds, 150);
  assert.equal(totals.elapsed, 200); // first-run queue is included only in elapsed time
  assert.equal(source.status, 'delivered');
  assert.equal(source.artifact, 'factory-agent-21');
});

test('handoff, failure and cancelled tasks are reportable and artifact expiry is explicit', () => {
  assert.equal(
    selectSource(
      { ...run, conclusion: 'failure' },
      jobs.slice(0, 2),
      artifacts,
      repository,
    ).status,
    'failure',
  );
  const handoff = selectSource(
    run,
    [
      jobs[0],
      {
        ...jobs[1],
        steps: [{ name: 'Dispatch continuation run', conclusion: 'success' }],
      },
    ],
    artifacts,
    repository,
  );
  assert.equal(handoff.status, 'handoff');
  assert.equal(
    selectSource(
      { ...run, conclusion: 'cancelled' },
      jobs.slice(0, 2),
      artifacts.map((a) => ({ ...a, expired: true })),
      repository,
    ).artifact,
    null,
  );
  assert.equal(selectSource(run, [], [], repository), null);
});

test('rejects foreign runs and ambiguous Issue artifacts; old run artifacts cannot measure a new agent job', () => {
  assert.throws(() =>
    selectSource(
      { ...run, head_repository: { full_name: 'foreign/repo' } },
      jobs,
      artifacts,
      repository,
    ),
  );
  assert.throws(() =>
    selectSource(
      run,
      jobs,
      [...artifacts, { name: 'factory-agent-22' }],
      repository,
    ),
  );
  assert.equal(
    selectSource(
      { ...run, run_attempt: 2, run_started_at: iso(300) },
      [job(9, 'agent', 300, 400)],
      artifacts,
      repository,
    ).artifact,
    null,
  );
});

test('handoff and retry totals deduplicate run attempts and reused jobs, including out-of-order reporting', () => {
  const initial = record();
  const retry = record({
    attempt: 2,
    start: begin + 300000,
    end: begin + 350000,
    jobs: [
      { id: 2, name: 'agent', seconds: 100 },
      { id: 8, name: 'publish', seconds: 10 },
    ],
  });
  const next = record({
    runId: 11,
    agentJobId: 12,
    start: begin + 400000,
    end: begin + 500000,
    jobs: [{ id: 12, name: 'agent', seconds: 100 }],
  });
  const total = aggregate([next, retry, initial, initial]);
  assert.equal(total.total, 1940);
  assert.equal(total.seconds, 260);
  assert.equal(total.elapsed, 500);
  assert.equal(total.runs, 2);
  assert.equal(total.attempts, 3);
  assert.equal(
    aggregate([initial, { ...retry, usage: emptyUsage() }]).total,
    970,
  );
});

test('only factory bot data is accepted, counters are validated and raw output is never displayed', () => {
  const r = record();
  assert.deepEqual(
    recordsFromComments(
      [botComment(r), { ...botComment(r), user: { login: 'stranger' } }],
      repository,
      21,
    ),
    [r],
  );
  assert.throws(() => validateRecord({ ...r, issue: 22 }, repository, 21));
  assert.throws(() =>
    validateRecord(
      { ...r, usage: { ...r.usage, missing: -1 } },
      repository,
      21,
    ),
  );
  assert.throws(() =>
    recordsFromComments(
      [
        {
          ...botComment(r),
          body: botComment(r).body.replace(marker(r), 'wrong'),
        },
      ],
      repository,
      21,
    ),
  );
  assert.match(renderUsage(r, [r]), /970/);
});

function exec(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.resolve(import.meta.dirname, '../report-task-usage.mjs'), ...args],
      { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let text = '';
    child.stdout.on('data', (chunk) => {
      text += chunk;
    });
    child.stderr.on('data', (chunk) => {
      text += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(text) : reject(new Error(text)),
    );
  });
}

test('reporter posts to the correct Issue, replay updates without double counting, expired artifacts preserve counters', async (t) => {
  const root = directory(t);
  let comments = [];
  const writes = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://local');
    const route = url.pathname.replace(`/repos/${repository}`, '');
    let payload = '';
    for await (const chunk of request) payload += chunk;
    const send = (data) => {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(data));
    };
    if (request.method !== 'GET') {
      writes.push({ route, body: JSON.parse(payload).body });
      comments = [
        {
          id: 99,
          user: { login: 'github-actions[bot]' },
          body: JSON.parse(payload).body,
        },
      ];
      return send(comments[0]);
    }
    if (route === '') return send({ default_branch: 'develop' });
    if (route === '/actions/runs/10') return send(run);
    if (route === '/actions/runs/10/attempts/1/jobs') return send({ jobs });
    if (route === '/actions/runs/10/artifacts') return send({ artifacts });
    if (route === '/issues/21')
      return send({ number: 21, user: { login: 'owner' } });
    if (route === '/issues/21/comments') return send(comments);
    response.statusCode = 404;
    response.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const env = {
    GITHUB_REPOSITORY: repository,
    GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`,
    GITHUB_TOKEN: 'test-token',
    GITHUB_OUTPUT: path.join(root, 'output'),
    GITHUB_STEP_SUMMARY: path.join(root, 'step-summary'),
  };
  const source = path.join(root, 'source.json');
  const summary = path.join(root, 'summary.json');
  const logs = path.join(root, 'logs');
  log(logs, 'agent-implement.jsonl', [message(1), { type: 'agent_end' }]);
  await exec(['select', '--run-id', '10', '--source', source], env);
  const publish = [
    'publish',
    '--run-id',
    '10',
    '--source',
    source,
    '--artifacts',
    logs,
    '--summary',
    summary,
  ];
  await exec(publish, env);
  await exec(publish, env);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].route, '/issues/21/comments');
  assert.equal(JSON.parse(readFileSync(summary)).cumulative.total, 970);
  log(logs, 'agent-implement.jsonl', [
    message(1),
    message(2),
    { type: 'agent_end' },
  ]);
  await exec(publish, env);
  assert.equal(writes[1].route, '/issues/comments/99');
  assert.equal(JSON.parse(readFileSync(summary)).cumulative.total, 1940);
  rmSync(logs, { recursive: true });
  await exec(publish, env);
  assert.equal(writes.length, 2);
  assert.equal(JSON.parse(readFileSync(summary)).cumulative.total, 1940);
  assert.doesNotMatch(
    writes.map((w) => w.body).join(''),
    /test-token|secret must never/,
  );
});

test('usage workflow runs independently on any completion and can replay old attempts without extra secrets', () => {
  const workflow = readFileSync(
    path.resolve(import.meta.dirname, '../../workflows/report-task-usage.yml'),
    'utf8',
  );
  assert.match(workflow, /types: \[completed\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /issues: write/);
  assert.doesNotMatch(
    workflow,
    /secrets\.|conclusion == 'success'|pnpm|npm install/,
  );
});

test('all browser runners install fonts before capture, and the real smoke test verifies actual glyphs', () => {
  const task = readFileSync(
    path.resolve(import.meta.dirname, '../../workflows/code-agent-task.yml'),
    'utf8',
  );
  const refresh = readFileSync(
    path.resolve(import.meta.dirname, '../../workflows/refresh-template.yml'),
    'utf8',
  );
  assert.equal(
    task.match(/bash control\/\.github\/scripts\/install-browser-fonts\.sh/g)
      .length,
    2,
  );
  assert.match(
    refresh,
    /bash control\/\.github\/scripts\/install-browser-fonts\.sh/,
  );
  const smoke = readFileSync(
    path.join(import.meta.dirname, 'browser-fonts-smoke.mjs'),
    'utf8',
  );
  assert.match(smoke, /CSS.getPlatformFontsForNode/);
  assert.match(smoke, /glyphCount > 0/);
});
