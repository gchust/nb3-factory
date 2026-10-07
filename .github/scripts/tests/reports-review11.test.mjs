import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  summarizeConsoleEvent,
  summarizeFailureText,
} from '../agent-harness.mjs';
import { subjectKeyOf } from '../evaluation-report.mjs';
import {
  decide,
  publicationClaim,
  pullRequestBody,
  reportDecision,
} from '../framework-fix.mjs';
import { readTaskMetadata, selectRetroArtifact } from '../publish-retro.mjs';
import { findingsExtractorVersion } from '../report-pages.mjs';

const workflows = path.resolve(import.meta.dirname, '../../workflows');
const workflow = (name) => readFileSync(path.join(workflows, name), 'utf8');
const jobOf = (text, name) =>
  text.split(`\n  ${name}:\n`)[1].split(/\n {2}[a-z][a-z-]*:\n/)[0];
const temp = (t, prefix) => {
  const root = mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
};

// --- 1. A retro for an Agent that stopped before copying its metadata -------

test("the retro selects prepare's task artifact from the same attempt", () => {
  const run = {
    path: '.github/workflows/code-agent-task.yml',
    head_repository: { full_name: 'owner/repo' },
    event: 'issues',
    status: 'completed',
  };
  const jobs = [
    {
      name: 'prepare',
      started_at: '2026-10-06T01:00:00Z',
      completed_at: '2026-10-06T01:05:00Z',
    },
    {
      name: 'agent',
      started_at: '2026-10-06T02:00:00Z',
      completed_at: '2026-10-06T03:00:00Z',
    },
  ];
  const agent = {
    id: 9,
    name: 'factory-agent-42',
    created_at: '2026-10-06T02:30:00Z',
  };
  const task = {
    id: 7,
    name: 'factory-task-42',
    created_at: '2026-10-06T01:04:00Z',
  };
  const earlier = {
    id: 3,
    name: 'factory-task-42',
    created_at: '2026-10-05T01:04:00Z',
  };
  const other = {
    id: 8,
    name: 'factory-task-43',
    created_at: '2026-10-06T01:04:00Z',
  };
  assert.equal(
    selectRetroArtifact(run, [agent, task, earlier, other], 'owner/repo', jobs)
      .task.id,
    7,
  );
  assert.equal(
    selectRetroArtifact(
      run,
      [agent, { ...task, expired: true }],
      'owner/repo',
      jobs,
    ).task,
    null,
  );
  // Without a prepare window nothing ties a task artifact to this attempt.
  assert.equal(
    selectRetroArtifact(run, [agent, task], 'owner/repo', jobs.slice(1)).task,
    null,
  );
});

test('the retro reads task metadata from prepare first, then from the Agent artifact', (t) => {
  const root = temp(t, 'retro-metadata-');
  const task = path.join(root, 'task');
  const agent = path.join(root, 'agent');
  mkdirSync(task);
  mkdirSync(agent);
  // The Agent stopped before copying the file (run 37491864466).
  writeFileSync(
    path.join(task, 'task-metadata.json'),
    JSON.stringify({ from: 'prepare' }),
  );
  assert.equal(readTaskMetadata([task, agent]).from, 'prepare');
  // A missing download directory is skipped too.
  assert.equal(
    readTaskMetadata([path.join(root, 'absent'), task]).from,
    'prepare',
  );
  writeFileSync(
    path.join(agent, 'task-metadata.json'),
    JSON.stringify({ from: 'agent' }),
  );
  assert.equal(readTaskMetadata([undefined, agent]).from, 'agent');
  assert.throws(() => readTaskMetadata([path.join(root, 'absent')]), {
    code: 'ENOENT',
  });
  // Damaged metadata is an error, not a reason to read another copy.
  writeFileSync(path.join(task, 'task-metadata.json'), '{');
  assert.throws(() => readTaskMetadata([task, agent]), SyntaxError);
});

test('the retro workflow downloads the task artifact and passes it to publish', () => {
  const text = workflow('publish-retro.yml');
  const download = text
    .split('- name: Download normalized task metadata when available\n')[1]
    .split('\n\n')[0];
  assert.match(
    download,
    /if: steps\.source\.outputs\.ready == 'true' && steps\.source\.outputs\.task_artifact_id != ''/,
  );
  assert.match(download, /continue-on-error: true/);
  assert.match(
    download,
    /artifact-ids: \$\{\{ steps\.source\.outputs\.task_artifact_id \}\}/,
  );
  assert.match(download, /run-id: \$\{\{ env\.SOURCE_RUN_ID \}\}/);
  assert.match(text, /--task "\$RUNNER_TEMP\/retro-task"/);
});

// --- 2. Receiver data stays out of the public Actions log -------------------

test('summary console lines carry only the event type and size', () => {
  const line = JSON.stringify({
    type: 'tool_result',
    content: '{"id":332,"title":"文件内容字节路由默认公开"}',
  });
  const summary = summarizeConsoleEvent(line, JSON.parse(line));
  assert.equal(
    summary,
    `[agent event: tool_result, ${Buffer.byteLength(line)} bytes]`,
  );
  assert.equal(
    summarizeConsoleEvent('{}', { type: 'content_block_delta' }),
    null,
  );
  assert.equal(summarizeConsoleEvent('{}', { type: 'stream_event' }), null);
  // A type is the engine's, but is still never echoed verbatim.
  assert.match(
    summarizeConsoleEvent('{}', { type: 'a b"c<d>' }),
    /^\[agent event: abcd,/,
  );
  assert.match(summarizeConsoleEvent('[]', []), /^\[agent event: object,/);
});

test('summary mode keeps tool results out of stdout but complete in the JSONL', (t) => {
  const root = temp(t, 'harness-summary-');
  const log = path.join(root, 'agent.jsonl');
  const secretEvent = JSON.stringify({
    type: 'user',
    tool_result: 'TESTMANAGE-FEATURE-TREE',
  });
  const engine = [
    `console.log(${JSON.stringify(secretEvent)});`,
    "console.log('plain TESTMANAGE-PLAIN-OUTPUT');",
    "console.log(JSON.stringify({ type: 'result' }));",
  ].join('');
  const harness = path.resolve(import.meta.dirname, '../agent-harness.mjs');
  const run = (consoleDetail) =>
    spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { runAgentInvocation } from ${JSON.stringify(harness)};
await runAgentInvocation({ label: 'fixture', command: process.execPath, args: ['-e', ${JSON.stringify(engine)}],
  cwd: ${JSON.stringify(root)}, env: process.env, log: ${JSON.stringify(log)}, retryDelaysSeconds: [],
  consoleDetail: ${JSON.stringify(consoleDetail)} });`,
      ],
      { encoding: 'utf8', timeout: 20_000 },
    );
  const summary = run('summary');
  assert.equal(summary.status, 0, summary.stderr);
  assert.doesNotMatch(summary.stdout, /TESTMANAGE-/);
  assert.match(summary.stdout, /\[agent event: user, \d+ bytes\]/);
  assert.match(summary.stdout, /\[agent output: \d+ bytes\]/);
  assert.match(
    readFileSync(log, 'utf8'),
    /TESTMANAGE-FEATURE-TREE[\s\S]*TESTMANAGE-PLAIN-OUTPUT/,
  );
  // Every other caller keeps the readable log.
  const full = run('full');
  assert.equal(full.status, 0, full.stderr);
  assert.match(full.stdout, /TESTMANAGE-FEATURE-TREE/);
  const invalid = run('loud');
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /Unknown consoleDetail: loud/);
});

test('the problem classifier is the summary-mode caller', () => {
  const source = readFileSync(
    path.resolve(import.meta.dirname, '../problem-classification.mjs'),
    'utf8',
  );
  assert.match(source, /consoleDetail: 'summary'/);
});

// --- 2b/3. framework-fix: what publish may see, and a cancel still reports ---

const claim = {
  runId: '0b9b2a3e-5d76-4c1a-9a2b-7f3e1c4d5e6f',
  inputs: { problemId: 12, baseRef: 'develop', externalRunId: '' },
  baseSha: 'a'.repeat(40),
  claimedAt: '2026-10-07T00:00:00.000Z',
  snapshot: {
    version: 1,
    problemUrl: 'https://testmanage.example/problems/12',
    problem: {
      id: 12,
      title: 'Staff-only title',
      description: 'Internal description',
      factorySource: {
        reportUrl: 'https://gchust.github.io/nb3-factory/r.html',
        issueUrl: 'https://x/1',
      },
    },
    comments: [{ authorName: 'A staff member', content: 'internal note' }],
  },
};

test('publish gets identifiers and https links, never the problem text or comments', () => {
  const pub = publicationClaim(claim);
  const text = JSON.stringify(pub);
  for (const secret of [
    'Staff-only title',
    'Internal description',
    'A staff member',
    'internal note',
  ])
    assert.ok(!text.includes(secret), secret);
  assert.deepEqual(pub, {
    runId: claim.runId,
    inputs: { problemId: 12, baseRef: 'develop' },
    baseSha: claim.baseSha,
    claimedAt: claim.claimedAt,
    snapshot: {
      problemUrl: 'https://testmanage.example/problems/12',
      problem: {
        id: 12,
        factorySource: {
          reportUrl: 'https://gchust.github.io/nb3-factory/r.html',
        },
      },
    },
  });
  const unsafe = publicationClaim({
    ...claim,
    snapshot: {
      ...claim.snapshot,
      problemUrl: 'javascript:alert(1)',
      problem: {
        ...claim.snapshot.problem,
        factorySource: { reportUrl: 'http://x' },
      },
    },
  });
  assert.equal(unsafe.snapshot.problemUrl, null);
  assert.equal(unsafe.snapshot.problem.factorySource.reportUrl, null);
  const decision = { pullRequest: { body: 'Body' }, usage: null };
  const body = pullRequestBody({
    decision,
    snapshot: unsafe.snapshot,
    runUrl: 'https://github.com/o/r/actions/runs/1',
    baseSha: claim.baseSha,
  });
  assert.match(body, /- TestManage problem: #12\n/);
  assert.doesNotMatch(body, /javascript:|http:\/\/x/);
});

test('framework-fix keeps the full claim for review only and publishes after a cancel', () => {
  const text = workflow('framework-fix.yml');
  const claimJob = jobOf(text, 'claim');
  assert.match(
    claimJob,
    /framework-fix\.mjs claim \\\n\s+--output "\$RUNNER_TEMP\/fix-input" --publication "\$RUNNER_TEMP\/fix-claim"/,
  );
  assert.match(
    claimJob,
    /name: framework-fix-input-\$\{\{ github\.run_id \}\}\n\s+path: \$\{\{ runner\.temp \}\}\/fix-input\n\s+retention-days: 1\n/,
  );
  assert.match(
    claimJob,
    /name: framework-fix-claim-\$\{\{ github\.run_id \}\}\n\s+path: \$\{\{ runner\.temp \}\}\/fix-claim\n/,
  );
  const review = jobOf(text, 'review');
  assert.match(review, /name: framework-fix-input-/);
  assert.match(review, /!\$\{\{ runner\.temp \}\}\/fix-output\/prompt\.md/);
  const publish = jobOf(text, 'publish');
  assert.doesNotMatch(publish, /framework-fix-input-/);
  assert.match(
    publish,
    /name: framework-fix-claim-\$\{\{ github\.run_id \}\}\n\s+path: fix-input/,
  );
  assert.match(
    publish,
    /^ {4}if: \$\{\{ always\(\) && needs\.claim\.outputs\.run_id != '' \}\}$/m,
  );
  // Every step the report needs runs after a cancel; the PR steps do not.
  const steps = publish.split('\n      - ').slice(1);
  const reportNeeds = steps.filter((step) =>
    /actions\/checkout@[^\n]*\n\s+if: always\(\)\n\s+with:\n\s+ref: \$\{\{ needs\.claim|setup-node|download-artifact|Report the result/.test(
      step,
    ),
  );
  assert.equal(reportNeeds.length, 5);
  for (const step of reportNeeds)
    assert.match(step, /\n\s+if: always\(\)\n/, step.split('\n')[0]);
  for (const step of steps.filter((step) =>
    /steps\.decision\.outputs\.publish == 'true'/.test(step),
  ))
    assert.doesNotMatch(step, /always\(\)|cancelled\(\)/, step.split('\n')[0]);
  // A real cancellation comes from the run-cancelled job: status functions
  // work only in `if:`, and a step-level cancelled() in this always() job is
  // always false.
  assert.match(publish, /^ {4}needs: \[claim, review, run-cancelled\]$/m);
  assert.match(
    publish,
    /- name: Read the decision\n\s+id: decision\n\s+if: needs\.run-cancelled\.result != 'success'\n/,
  );
  const prSteps = steps.filter((step) =>
    /steps\.decision\.outputs\.publish == 'true'/.test(step),
  );
  assert.equal(prSteps.length, 2);
  for (const step of prSteps)
    assert.match(
      step,
      /if: steps\.decision\.outputs\.publish == 'true' && needs\.run-cancelled\.result != 'success'\n/,
    );
  const cancelled = jobOf(text, 'run-cancelled');
  assert.match(cancelled, /^ {4}needs: \[claim, review\]$/m);
  assert.match(cancelled, /^ {4}if: cancelled\(\)$/m);
  assert.match(cancelled, /^ {4}permissions: \{\}$/m);
  assert.match(cancelled, /^ {4}timeout-minutes: 1$/m);
});

test('the claim CLI writes the full and the publication claim', () => {
  const source = readFileSync(
    path.resolve(import.meta.dirname, '../framework-fix.mjs'),
    'utf8',
  );
  assert.match(
    source,
    /writeFile\(path\.join\(args\.publication, 'claim\.json'\), `\$\{JSON\.stringify\(publicationClaim\(full\), null, 2\)\}\\n`\)/,
  );
  // Every field publish reads exists in the publication claim.
  const pub = publicationClaim(claim);
  assert.equal(pub.inputs.problemId, 12);
  assert.equal(pub.inputs.baseRef, 'develop');
  assert.equal(pub.baseSha, claim.baseSha);
  assert.ok(!Number.isNaN(Date.parse(pub.claimedAt)));
});

// --- 4. Independent review budget ---------------------------------------------

test('the independent review may run 6000 s inside its job budget', () => {
  const text = workflow('independent-review.yml');
  const review = jobOf(text, 'review');
  assert.match(review, /CODE_AGENT_INVOCATION_TIMEOUT_SECONDS: 6000\n/);
  const minutes = Number(/^ {4}timeout-minutes: (\d+)$/m.exec(review)[1]);
  const install = Number(
    /- name: Install selected pinned reviewer\n[\s\S]*?timeout-minutes: (\d+)/.exec(
      review,
    )[1],
  );
  // The review's own timeout must fire first, with at least 25 minutes for
  // two checkouts, four large downloads and the always() upload, which never
  // runs once the job itself times out.
  assert.ok(minutes * 60 >= 6000 + install * 60 + 25 * 60, `${minutes} min`);
});

// --- 5. Report gate: runs that ran no model ----------------------------------

function gate(t, jobs, workflowName = 'publish-retro.yml') {
  const source = workflow('report-dispatch-gate.yml');
  const script = source.split('        run: |\n')[1].split('\n      - name:')[0].replace(/^ {10}/gm, '');
  const root = temp(t, 'gate-idle-');
  const bin = path.join(root, 'bin');
  mkdirSync(bin);
  const listing = path.join(root, 'jobs.json');
  writeFileSync(listing, JSON.stringify({ jobs }));
  writeFileSync(
    path.join(bin, 'gh'),
    `#!/usr/bin/env bash
while [[ $# -gt 0 && "$1" != --jq ]]; do shift; done
jq -r "$2" ${JSON.stringify(listing)}
`,
    { mode: 0o755 },
  );
  const output = path.join(root, 'output');
  writeFileSync(output, '');
  const result = spawnSync('bash', ['-c', `set -euo pipefail\n${script}`], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      GITHUB_REPOSITORY: 'o/r',
      GITHUB_OUTPUT: output,
      GH_TOKEN: 'x',
      RUN_ID: '123',
      ATTEMPT: '1',
      WORKFLOW: workflowName,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  return { out: readFileSync(output, 'utf8').trim(), log: result.stdout };
}

const job = (name, conclusion, steps = []) => ({ name, conclusion, steps });

test('a task run that ran no model is covered: there is nothing to report', (t) => {
  // A preset Issue: prepare decided, every later job skipped.
  const idle = [
    job('prepare', 'success'),
    job('agent', 'skipped'),
    job('reply', 'skipped'),
    job('dispatch-reports', 'skipped'),
    job('dispatch-reply-history', 'skipped'),
    job('wake-comment-queue', 'success'),
  ];
  const result = gate(t, idle);
  assert.equal(result.out, 'covered=true');
  assert.match(result.log, /ran no model and requested no report/);
  // One merged dispatcher job counts the same way.
  assert.equal(
    gate(t, [job('agent', 'skipped'), job('dispatch-task-reports', 'skipped')])
      .out,
    'covered=true',
  );
});

test('the gate still fails open whenever a model may have run', (t) => {
  const base = [
    job('dispatch-reports', 'skipped'),
    job('dispatch-reply-history', 'skipped'),
  ];
  // The agent ran but its report requests did not go out.
  assert.equal(
    gate(t, [...base, job('agent', 'failure')]).out,
    'covered=false',
  );
  assert.equal(
    gate(t, [...base, job('agent', 'skipped'), job('reply', 'success')]).out,
    'covered=false',
  );
  // A dispatcher ran (and failed) without requesting this report.
  assert.equal(
    gate(t, [job('agent', 'skipped'), job('dispatch-reports', 'failure')]).out,
    'covered=false',
  );
  // No dispatcher job at all: an unknown run shape.
  assert.equal(gate(t, [job('agent', 'skipped')]).out, 'covered=false');
  // A request that went out is still covered.
  const requested = [
    job('agent', 'success'),
    job('dispatch-reports', 'success', [
      { name: 'Request publish-retro.yml', conclusion: 'success' },
    ]),
  ];
  assert.equal(gate(t, requested).out, 'covered=true');
});

// --- 6. Report notifications queue per Issue ----------------------------------

test('report notifications queue per Issue, keyed by the archived report', () => {
  const text = workflow('report-task-usage.yml');
  const pages = jobOf(text, 'pages');
  assert.match(
    pages,
    /^ {6}issue: \$\{\{ steps\.archive\.outputs\.issue \}\}$/m,
  );
  const notify = jobOf(text, 'notify');
  assert.match(
    notify,
    /group: factory-report-notify-\$\{\{ needs\.pages\.outputs\.issue \}\}\n/,
  );
  const source = readFileSync(
    path.resolve(import.meta.dirname, '../report-pages.mjs'),
    'utf8',
  );
  assert.match(source, /\\nissue=\$\{publication\.manifest\.issue\}\\n/);
});

// --- 7. Findings cache key -----------------------------------------------------

test('the findings cache key stands in subjectKeyOf for evaluation-report', () => {
  const version = findingsExtractorVersion();
  assert.match(version, /^[a-f0-9]{16}$/);
  // subjectKeyOf must stay self-contained: its source is all the key hashes.
  const calls = [
    ...String(subjectKeyOf).matchAll(/([A-Za-z_$][\w$]*)\s*\(/g),
  ].map((m) => m[1]);
  for (const name of calls)
    assert.ok(
      ['subjectKeyOf', 'if', 'test', 'exec', 'replace'].includes(name),
      `subjectKeyOf calls ${name}`,
    );
  // The extractor imports only subjectKeyOf from it, in the plain form.
  const index = readFileSync(
    path.resolve(import.meta.dirname, '../../reports/findings-index.mjs'),
    'utf8',
  );
  assert.match(
    index,
    /import \{ subjectKeyOf \} from '\.\.\/scripts\/evaluation-report\.mjs';/,
  );
});

test('the findings cache key changes with the extractor and ignores evaluation-report internals', (t) => {
  // Copy the extractor closure, edit one file, and compare keys in a fresh process.
  const root = temp(t, 'findings-key-');
  const github = path.resolve(import.meta.dirname, '../..');
  const copy = spawnSync('cp', [
    '-r',
    path.join(github, 'scripts'),
    path.join(github, 'reports'),
    root,
  ]);
  assert.equal(copy.status, 0, String(copy.stderr));
  rmSync(path.join(root, 'scripts', 'tests'), { recursive: true, force: true });
  const key = () => {
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { findingsExtractorVersion } from ${JSON.stringify(path.join(root, 'scripts', 'report-pages.mjs'))}; console.log(findingsExtractorVersion());`,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const append = (file, text) =>
    writeFileSync(file, readFileSync(file, 'utf8') + text);
  const original = key();
  // A change behind evaluation-report (task-usage, the adapters) keeps the cache.
  append(path.join(root, 'scripts', 'task-usage.mjs'), '\n// unrelated\n');
  append(
    path.join(root, 'scripts', 'evaluation-report.mjs'),
    '\n// unrelated\n',
  );
  assert.equal(key(), original);
  // A change to the extractor or to what it validates with starts a new cache.
  append(path.join(root, 'scripts', 'build-review.mjs'), '\n// changed\n');
  const changed = key();
  assert.notEqual(changed, original);
  append(path.join(root, 'reports', 'findings-index.mjs'), '\n// changed\n');
  assert.notEqual(key(), changed);
});

// --- Review follow-up -----------------------------------------------------------

test('a cancelled framework fix is reported as cancelled, claiming no fix', () => {
  const usage = {
    tokens: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, total: 3 },
  };
  const fixed = {
    ...decide({
      agentStatus: 0,
      verdict: {
        value: {
          version: 1,
          verdict: 'confirmed',
          fixed: true,
          summary: '已修复',
          analysis: 'a',
          verification: [],
          pullRequest: { title: 'fix(x): y', body: 'b' },
        },
      },
      changedFiles: ['a.ts'],
    }),
    usage,
  };
  assert.equal(fixed.publish, true);
  for (const input of [
    { decision: fixed, cancelled: true },
    { decision: fixed, reviewResult: 'cancelled' },
    // Killed mid-Agent: the decision says "exit code 1".
    {
      decision: decide({ agentStatus: 1, verdict: { error: 'missing' } }),
      cancelled: true,
    },
    { decision: null, cancelled: true },
  ]) {
    const reported = reportDecision(input);
    assert.equal(reported.verdict, 'error');
    assert.equal(reported.publish, false);
    assert.equal(reported.pullRequest, null);
    assert.match(reported.summary, /运行已取消/);
    assert.doesNotMatch(reported.summary, /退出码|已修复/);
    assert.deepEqual(reported.usage, input.decision?.usage ?? null);
  }
  // A PR opened before the cancel is the real result.
  const url = 'https://github.com/nocobase/nocobase3/pull/9';
  assert.equal(
    reportDecision({ decision: fixed, cancelled: true, pullRequestUrl: url }),
    fixed,
  );
  assert.equal(
    reportDecision({ decision: fixed, reviewResult: 'success' }),
    fixed,
  );
  assert.match(
    reportDecision({ decision: null, reviewResult: 'failure' }).summary,
    /没有产出结论（review 作业结果：failure）/,
  );
  const publish = jobOf(workflow('framework-fix.yml'), 'publish');
  const report = publish.split('- name: Report the result to TestManage\n')[1];
  assert.match(
    report,
    /RUN_CANCELLED: \$\{\{ needs\.run-cancelled\.result == 'success' \}\}/,
  );
  assert.match(report, /--cancelled "\$RUN_CANCELLED"/);
  const source = readFileSync(
    path.resolve(import.meta.dirname, '../framework-fix.mjs'),
    'utf8',
  );
  assert.match(source, /cancelled: args\.cancelled === 'true'/);
});

test('an engine error reaches the public error as category, status and a short head', () => {
  const quoted = `Request failed with status 529: overloaded {"tool_result":"${'TESTMANAGE '.repeat(50)}"}`;
  const summary = summarizeFailureText(quoted);
  assert.equal(
    summary,
    `provider_unavailable 529: Request failed with status 529: overloaded (${quoted.length} chars on the runner)`,
  );
  assert.doesNotMatch(summary, /TESTMANAGE|tool_result/);
  assert.equal(
    summarizeFailureText('Codex turn failed'),
    'agent_failure: Codex turn failed',
  );
  assert.ok(summarizeFailureText('x'.repeat(1000)).length < 260);
  assert.match(
    summarizeFailureText('first line\nsecond TESTMANAGE line'),
    /^agent_failure: first line \(\d+ chars on the runner\)$/,
  );
});

test('summary mode keeps engine errors and stderr short in public, full on the runner', (t) => {
  const root = temp(t, 'harness-failure-');
  const log = path.join(root, 'agent.jsonl');
  const engine = [
    "process.stderr.write('stderr quoting TESTMANAGE-STDERR-DATA\\n');",
    `console.log(${JSON.stringify(JSON.stringify({ type: 'error', message: 'Request failed {"quoted":"TESTMANAGE-EVENT-DATA"}' }))});`,
    'process.exitCode = 1;',
  ].join('');
  const harness = path.resolve(import.meta.dirname, '../agent-harness.mjs');
  const run = (consoleDetail) =>
    spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { runAgentInvocation } from ${JSON.stringify(harness)};
try {
  await runAgentInvocation({ label: 'fixture', command: process.execPath, args: ['-e', ${JSON.stringify(engine)}],
    cwd: ${JSON.stringify(root)}, env: process.env, log: ${JSON.stringify(log)}, retryDelaysSeconds: [],
    getEventFailure: (event) => event.type === 'error' ? event.message : undefined,
    consoleDetail: ${JSON.stringify(consoleDetail)} });
} catch (error) { console.log('THROWN ' + error.message); }`,
      ],
      { encoding: 'utf8', timeout: 20_000 },
    );
  const summary = run('summary');
  assert.equal(summary.status, 0, summary.stderr);
  assert.doesNotMatch(summary.stdout + summary.stderr, /TESTMANAGE-/);
  assert.match(
    summary.stdout,
    /THROWN fixture model invocation failed: agent_failure: Request failed \(\d+ chars on the runner\)/,
  );
  assert.match(summary.stderr, /\[agent stderr: \d+ bytes\]/);
  const transcript = readFileSync(log, 'utf8');
  assert.match(transcript, /TESTMANAGE-EVENT-DATA/);
  assert.match(transcript, /TESTMANAGE-STDERR-DATA/);
  const full = run('full');
  assert.match(
    full.stdout,
    /THROWN fixture model invocation failed: Request failed \{"quoted":"TESTMANAGE-EVENT-DATA"\}/,
  );
  assert.match(full.stderr, /TESTMANAGE-STDERR-DATA/);
});

test('no workflow uses a status function in an expression outside if:', () => {
  // GitHub accepts cancelled(), always(), success() and failure() only in
  // jobs.<id>.if and steps.if; in an env, with or output the whole workflow
  // file is rejected.
  const status = /\b(?:cancelled|always|success|failure)\(\)/;
  const directories = [workflows, path.resolve(workflows, '../actions')];
  let checked = 0;
  for (const directory of directories) {
    const files = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (/\.ya?ml$/.test(entry.name)) files.push(file);
      }
    };
    walk(directory);
    for (const file of files) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          for (const [expression] of line.matchAll(/\$\{\{[\s\S]*?\}\}/g)) {
            if (!status.test(expression)) continue;
            checked++;
            assert.match(
              line,
              /^\s*(?:- )?if: /,
              `${path.relative(workflows, file)}:${index + 1}: ${line.trim()}`,
            );
          }
        });
    }
  }
  assert.ok(checked > 10, `${checked} expressions checked`);
});
