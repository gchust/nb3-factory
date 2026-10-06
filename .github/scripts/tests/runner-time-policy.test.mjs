import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { collectAgentFailure } from '../agent-failure.mjs';

const workflows = path.resolve(import.meta.dirname, '..', '..', 'workflows');
const read = (name) => readFileSync(path.join(workflows, name), 'utf8');
const task = read('code-agent-task.yml');
const jobOf = (source, name) => {
  const start = source.indexOf(`\n  ${name}:\n`);
  assert.ok(start >= 0, `missing job ${name}`);
  const rest = source.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[\w-]+:\n/);
  return next < 0 ? rest : rest.slice(0, next + 1);
};
const stepOf = (job, name) => {
  const start = job.indexOf(`- name: ${name}\n`);
  assert.ok(start >= 0, `missing step ${name}`);
  const end = job.indexOf('\n      - ', start);
  return end < 0 ? job.slice(start) : job.slice(start, end);
};

test('only the Agent job checks out full application history', () => {
  const full = [...task.matchAll(/fetch-depth: 0/g)];
  assert.equal(full.length, 1);
  assert.match(
    stepOf(jobOf(task, 'agent'), 'Check out application base'),
    /fetch-depth: 0/,
  );
  for (const name of ['verify-final', 'publish', 'preview-build-failed']) {
    const checkout = stepOf(
      jobOf(task, name),
      'Check out fresh application base',
    );
    assert.match(
      checkout,
      /ref: \$\{\{ needs\.prepare\.outputs\.base_sha \}\}/,
    );
    assert.doesNotMatch(checkout, /fetch-depth/, name);
  }
});

test('publication keeps an explicit lease that needs no tracking refs', () => {
  const publish = jobOf(task, 'publish');
  assert.match(
    publish,
    /lease="refs\/heads\/\$\{WORK_BRANCH\}:\$\{BASE_SHA\}"/,
  );
  assert.match(publish, /lease="refs\/heads\/\$\{WORK_BRANCH\}:"/);
  assert.match(publish, /git push --force-with-lease="\$lease"/);
});

test('publication chooses its base after the verified patch is applied', () => {
  for (const name of ['publish', 'publish-failed']) {
    const job = jobOf(task, name);
    assert.match(job, /steps: (?:&|\*)publication-steps/, name);
  }
  const publish = jobOf(task, 'publish');
  const order = [
    'Apply preserved patch to the task branch',
    'Choose the publication base',
    'Commit and push task branch',
    'Create or update Pull Request',
  ].map((step) => publish.indexOf(`- name: ${step}\n`));
  assert.ok(
    order.every((index, i) => index > (order[i - 1] ?? -1)),
    String(order),
  );
  const choose = stepOf(publish, 'Choose the publication base');
  assert.match(choose, /publication-base\.mjs/);
  assert.match(choose, /--base-sha "\$BASE_SHA"/);
  assert.match(choose, /--record agent-artifacts\/publication-base\.json/);
  assert.doesNotMatch(choose, /\$\{\{[^}]*\}\}" \\/);
  const push = stepOf(publish, 'Commit and push task branch');
  assert.match(push, /without `workflows` permission/);
  assert.match(push, /::error::GitHub refused/);
  assert.match(
    stepOf(publish, 'Create or update Pull Request'),
    /--publication agent-artifacts\/publication-base\.json/,
  );
});

test('downstream jobs download only the small patch artifact', () => {
  const name = '${{ needs.prepare.outputs.issue_number }}';
  for (const [job, target] of [
    ['verify-final', 'agent-artifacts'],
    ['publish', 'agent-artifacts'],
    ['preview-build-failed', 'agent-artifacts'],
    ['report-failure', 'failure-artifacts'],
  ]) {
    const source = jobOf(task, job);
    const copy = source
      .split('\n      - name: ')
      .find((step) => step.includes(`name: factory-patch-${name}\n`));
    assert.ok(copy?.includes(`path: ${target}`), job);
    assert.match(copy, /id: patch_copy\n {8}continue-on-error: true\n/, job);
    // The complete record is read only when the small copy is missing.
    const fallback = stepOf(
      source,
      'Fall back to the complete Code Agent artifact',
    );
    assert.match(
      fallback,
      /if: steps\.patch_copy\.outcome == 'failure'\n/,
      job,
    );
    assert.ok(
      fallback.includes(
        `name: factory-agent-${name}\n          path: ${target}`,
      ),
      job,
    );
  }
  // The complete diagnostics are still uploaded once, for reports and
  // recovery, and downloaded only by the four fallbacks above.
  const agent = jobOf(task, 'agent');
  assert.equal([...task.matchAll(/name: factory-agent-\$/g)].length, 5);
  assert.equal(
    [
      ...task.matchAll(
        /- name: Fall back to the complete Code Agent artifact\n/g,
      ),
    ].length,
    4,
  );
  assert.ok(
    agent.indexOf('- name: Upload Code Agent patch and diagnostics') <
      agent.indexOf('- name: Upload the patch for downstream jobs'),
  );
  const upload = stepOf(agent, 'Upload the patch for downstream jobs');
  assert.match(upload, /if: always\(\)/);
  // Downstream jobs fall back to factory-agent-N; a failed copy must not fail
  // the agent job or block the continuation dispatch.
  assert.match(upload, /continue-on-error: true/);
  assert.match(
    stepOf(agent, 'Stage the patch for downstream jobs'),
    /continue-on-error: true/,
  );
  assert.ok(upload.includes(`name: factory-patch-${name}`));
  assert.ok(upload.includes('path: ${{ runner.temp }}/patch-artifacts'));
});

test('patch staging keeps every file the downstream jobs read', () => {
  const stage = stepOf(
    jobOf(task, 'agent'),
    'Stage the patch for downstream jobs',
  );
  assert.match(stage, /if: always\(\)/);
  const script = stage.split('run: |\n')[1].replace(/^ {10}/gm, '');
  const root = mkdtempSync(path.join(os.tmpdir(), 'factory-patch-stage-'));
  try {
    const artifacts = path.join(root, 'agent-artifacts');
    const failed = {
      version: 1,
      phase: 'repair',
      status: 'failed',
      endedAt: 20,
      error: 'HTTP 503 service unavailable',
    };
    const files = {
      'agent.patch': 'diff --git a/a b/a\n',
      'change-summary.json': '{"counts":{"files":1},"files":["a"]}\n',
      'task-metadata.json': '{"issue":{"number":7}}\n',
      'pipeline-state.json': '{"outcome":"failed","phase":"verify"}\n',
      'agent-implement.jsonl.result.json': JSON.stringify({
        ...failed,
        phase: 'implementation',
        status: 'succeeded',
        endedAt: 10,
      }),
      'verify-2/agent-repair-2.jsonl.result.json': JSON.stringify(failed),
      // Large raw evidence stays in factory-agent-N only.
      'agent-implement.jsonl': '{"type":"event"}\n',
      'verify-2/browser-acceptance/screenshot.png': 'png',
    };
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(artifacts, file)), { recursive: true });
      writeFileSync(path.join(artifacts, file), content);
    }
    const run = (temp) =>
      spawnSync('bash', ['-e', '-c', script], {
        cwd: root,
        env: { ...process.env, RUNNER_TEMP: temp },
        encoding: 'utf8',
      });
    const result = run(root);
    assert.equal(result.status, 0, result.stderr);
    const staged = path.join(root, 'patch-artifacts');
    for (const file of [
      'agent.patch',
      'change-summary.json',
      'task-metadata.json',
      'pipeline-state.json',
      'agent-implement.jsonl.result.json',
      'verify-2/agent-repair-2.jsonl.result.json',
    ]) {
      assert.equal(
        readFileSync(path.join(staged, file), 'utf8'),
        files[file],
        file,
      );
    }
    assert.equal(existsSync(path.join(staged, 'agent-implement.jsonl')), false);
    assert.equal(
      existsSync(path.join(staged, 'verify-2/browser-acceptance')),
      false,
    );
    // mark-failure.mjs reaches the same conclusion from the small copy.
    assert.deepEqual(
      collectAgentFailure(staged),
      collectAgentFailure(artifacts),
    );
    assert.equal(collectAgentFailure(staged).category, 'provider_unavailable');

    // A job that failed before any artifact existed still stages nothing quietly.
    const empty = path.join(root, 'empty');
    mkdirSync(empty);
    const nothing = run(empty);
    assert.equal(nothing.status, 0, nothing.stderr);
    assert.equal(existsSync(path.join(empty, 'patch-artifacts')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const [file, job, lockfile, install, next] of [
  [
    'framework-fix.yml',
    'review',
    'workspace/pnpm-lock.yaml',
    'Install nocobase3 dependencies',
    'Re-check and fix the problem with Claude Code',
  ],
  [
    'source-baseline.yml',
    'source-baseline',
    'source/pnpm-lock.yaml',
    'Verify checkout identity and install source dependencies',
    'Build and publish only to an isolated loopback registry',
  ],
]) {
  test(`${file}: the monorepo pnpm store is cached on its lockfile and saved before later work`, () => {
    const source = jobOf(read(file), job);
    const restore = stepOf(source, 'Restore the nocobase3 pnpm store');
    assert.match(
      restore,
      /uses: actions\/cache\/restore@[0-9a-f]{40} # v6\.\d+\.\d+/,
    );
    assert.ok(
      restore.includes(
        `key: nocobase3-pnpm-store-\${{ runner.os }}-pnpm\${{ steps.pnpm-store.outputs.version }}-\${{ hashFiles('${lockfile}') }}`,
      ),
    );
    assert.match(restore, /path: \$\{\{ steps\.pnpm-store\.outputs\.path \}\}/);
    // A post-step cache would also save what later steps add to the store.
    assert.doesNotMatch(source, /uses: actions\/cache@/);
    const save = source.indexOf('uses: actions/cache/save@');
    assert.ok(save > source.indexOf(`- name: ${install}\n`));
    assert.ok(save < source.indexOf(`- name: ${next}\n`));
    assert.ok(
      source.indexOf('- name: Locate the pnpm store') <
        source.indexOf('- name: Restore the nocobase3 pnpm store'),
    );
    assert.ok(
      source.indexOf('- name: Restore the nocobase3 pnpm store') <
        source.indexOf(`- name: ${install}\n`),
    );
    const saveStep = source.slice(source.lastIndexOf('- name:', save));
    assert.match(
      saveStep,
      /if: .*steps\.pnpm-cache\.outputs\.cache-hit != 'true'/,
    );
    assert.match(
      saveStep,
      /key: \$\{\{ steps\.pnpm-cache\.outputs\.cache-primary-key \}\}/,
    );
    assert.match(saveStep, /continue-on-error: true/);
  });
}

test('framework-fix saves the store only after a successful install', () => {
  const review = jobOf(read('framework-fix.yml'), 'review');
  const save = stepOf(
    review,
    'Save the nocobase3 pnpm store before the Agent starts',
  );
  assert.match(save, /steps\.dependencies\.outcome == 'success'/);
});
