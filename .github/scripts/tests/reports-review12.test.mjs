import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { taskRunIssue } from '../wait-for-task-run.mjs';

const workflows = path.resolve(import.meta.dirname, '../../workflows');
const workflow = (name) => readFileSync(path.join(workflows, name), 'utf8');
const jobOf = (source, name) =>
  source.split(`\n  ${name}:\n`)[1].split(/\n {2}[a-z][a-z-]*:\n/)[0];
const stepOf = (source, name) =>
  source.split(`- name: ${name}\n`)[1].split(/\n {6}- /)[0];
const runOf = (step) =>
  step
    .split(/\n {8}run: \|\n/)[1]
    .split('\n')
    .map((line) => line.slice(10))
    .join('\n');

test('the Issue of a task run comes only from the task run-name', () => {
  assert.equal(
    taskRunIssue({ display_title: 'Factory issue #42 build 0 from 0' }),
    '42',
  );
  assert.equal(
    taskRunIssue({
      display_title: 'Factory issue #7 build 913 from 5 request batch-1',
    }),
    '7',
  );
  for (const display_title of [
    undefined,
    '',
    'Factory issue # build 0 from 0',
    'Factory issue #0 build 0 from 0',
    'Factory issue #42',
    'Deliver Evaluation Results (scan)',
    'x Factory issue #42 build 0 from 0',
  ])
    assert.equal(taskRunIssue({ display_title }), '', String(display_title));
  assert.equal(taskRunIssue(null), '');
});

test('the usage report queues per Issue and keeps the global lock only for Pages', () => {
  const source = workflow('report-task-usage.yml');
  assert.match(
    jobOf(source, 'wait-for-source'),
    /\n {6}issue: \$\{\{ steps\.wait\.outputs\.issue \}\}\n/,
  );
  const report = jobOf(source, 'report');
  assert.match(
    report,
    /group: \$\{\{ needs\.wait-for-source\.outputs\.issue && format\('factory-task-usage-issue-\{0\}', needs\.wait-for-source\.outputs\.issue\) \|\| 'factory-task-usage' \}\}\n/,
  );
  // It writes nothing that other Issues' jobs share: no gh-pages writes, no
  // contents: write, only its own Issue's comment.
  assert.match(report, /\n {6}contents: read\n/);
  assert.doesNotMatch(report, /contents: write|report-pages\.mjs/);
  assert.match(jobOf(source, 'pages'), /group: factory-task-usage\n/);
  assert.doesNotMatch(source, /The lock covers only archive and deploy: the/);
});

// The dispatcher with a fake gh; returns each `gh workflow run` argument list.
function dispatch(t, workflows, env = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'review12-dispatch-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const log = path.join(root, 'calls.json');
  writeFileSync(
    path.join(root, 'gh'),
    `#!/usr/bin/env node
const fs = require('node:fs');
const file = ${JSON.stringify(log)};
const calls = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
calls.push(process.argv.slice(2));
fs.writeFileSync(file, JSON.stringify(calls));
`,
  );
  chmodSync(path.join(root, 'gh'), 0o755);
  const result = spawnSync(
    'bash',
    [
      path.resolve(import.meta.dirname, '../dispatch-task-reports.sh'),
      ...workflows,
    ],
    {
      env: {
        ...process.env,
        PATH: `${root}:${process.env.PATH}`,
        GITHUB_REPOSITORY: 'owner/factory',
        SOURCE_RUN_ID: '123',
        SOURCE_ATTEMPT: '2',
        FACTORY_REPORT_REF: 'develop',
        GH_TOKEN: 'fixture-token',
        ...env,
      },
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0, result.stderr);
  return existsSync(log) ? JSON.parse(readFileSync(log, 'utf8')) : [];
}

test('the dispatcher names the Issue for the progress queue only', (t) => {
  const calls = dispatch(
    t,
    ['report-task-progress.yml', 'report-task-usage.yml'],
    {
      ISSUE_NUMBER: '42',
    },
  );
  assert.deepEqual(
    calls.map((args) => args.slice(2).filter((arg) => arg !== '--field')),
    [
      [
        'report-task-progress.yml',
        '--repo',
        'owner/factory',
        '--ref',
        'develop',
        'run_id=123',
        'attempt=2',
        'issue=42',
      ],
      [
        'report-task-usage.yml',
        '--repo',
        'owner/factory',
        '--ref',
        'develop',
        'run_id=123',
        'attempt=2',
      ],
    ],
  );
  // Without a valid Issue the request is unchanged (the run's own group).
  for (const ISSUE_NUMBER of ['', '0', '4 2', '42; echo'])
    assert.doesNotMatch(
      JSON.stringify(
        dispatch(t, ['report-task-progress.yml'], { ISSUE_NUMBER }),
      ),
      /issue=/,
      ISSUE_NUMBER,
    );
});

test('the task passes its Issue to the progress request', () => {
  const step = stepOf(
    workflow('code-agent-task.yml'),
    'Request report-task-progress.yml',
  );
  assert.match(
    step,
    /\n {10}ISSUE_NUMBER: \$\{\{ needs\.prepare\.outputs\.issue_number \}\}\n {8}run: bash dispatcher\/\.github\/scripts\/dispatch-task-reports\.sh report-task-progress\.yml/,
  );
});

test('a delivery scan run is titled by its mode', () => {
  assert.match(
    workflow('deliver-evaluation.yml'),
    /^name: Deliver Evaluation Results\n(?:#.*\n)*run-name: "Deliver Evaluation Results \(\$\{\{ inputs\.mode \|\| 'scan' \}\}\)"\n/,
  );
});

// Runs the registration's request step with a fake gh whose `api` answers
// with the given runs through the step's own jq filter.
function requestDelivery(t, runs, { apiFails = false } = {}) {
  const step = stepOf(
    jobOf(workflow('report-task-usage.yml'), 'evaluation'),
    'Request delivery without waiting',
  );
  const root = mkdtempSync(path.join(os.tmpdir(), 'review12-scan-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const log = path.join(root, 'calls.log');
  writeFileSync(
    path.join(root, 'runs.json'),
    JSON.stringify({ workflow_runs: runs }),
  );
  writeFileSync(
    path.join(root, 'gh'),
    `#!/usr/bin/env bash
printf '%s\\n' "$*" >> ${JSON.stringify(log)}
if [[ "$1" == api ]]; then
  ${apiFails ? 'echo "HTTP 502" >&2; exit 1' : `jq "$4" ${JSON.stringify(path.join(root, 'runs.json'))}`}
fi
`,
  );
  chmodSync(path.join(root, 'gh'), 0o755);
  const result = spawnSync('bash', ['-eo', 'pipefail', '-c', runOf(step)], {
    env: {
      ...process.env,
      PATH: `${root}:${process.env.PATH}`,
      GITHUB_REPOSITORY: 'owner/factory',
      REPORT_REF: 'develop',
      GH_TOKEN: 'fixture-token',
    },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    readFileSync(log, 'utf8'),
    /^api repos\/owner\/factory\/actions\/workflows\/deliver-evaluation\.yml\/runs\?branch=develop&per_page=30 --jq /,
  );
  return /workflow run deliver-evaluation\.yml --repo owner\/factory --ref develop --field mode=scan/.test(
    readFileSync(log, 'utf8'),
  );
}

test('a registration requests a scan only when none is waiting to start', (t) => {
  const scan = (status, mode = 'scan') => ({
    status,
    display_title: `Deliver Evaluation Results (${mode})`,
  });
  // A scan that has not started reads the outbox when it does.
  for (const status of ['queued', 'pending', 'waiting', 'requested'])
    assert.equal(requestDelivery(t, [scan(status)]), false, status);
  // Started scans may have read the outbox already; other modes never scan
  // it; runs from before run-name carry no mode.
  assert.equal(
    requestDelivery(t, [
      scan('in_progress'),
      scan('completed'),
      scan('queued', 'replay'),
      scan('queued', 'backfill'),
      scan('queued', 'retry-rejected'),
      { status: 'queued', display_title: 'Deliver Evaluation Results' },
    ]),
    true,
  );
  assert.equal(requestDelivery(t, []), true);
  // Listing failures fall through to the request.
  assert.equal(requestDelivery(t, [scan('queued')], { apiFails: true }), true);
});
