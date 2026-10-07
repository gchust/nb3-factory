// A continuation that failed before restoring keeps the handed-off checkpoint
// (code-agent-task.yml, "Keep the handed-off checkpoint"). What it publishes
// must be restorable: this runs the step's own script on a repair-phase
// checkpoint and restores the result.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  initialize,
  inputHash,
  readState,
  restoreState,
} from '../pipeline-state.mjs';

const repo = path.resolve(import.meta.dirname, '../../..');
const workflow = readFileSync(
  path.join(repo, '.github/workflows/code-agent-task.yml'),
  'utf8',
);
const keepScript = workflow
  .split('- name: Keep the handed-off checkpoint\n')[1]
  .split('\n      - ')[0]
  .split('run: |\n')[1]
  .replace(/^ {10}/gm, '');
const C = 'c'.repeat(40);

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'factory-kept-checkpoint-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // The step runs node bootstrap/... and node control/... from its cwd. Real
  // copies, as in CI: a CLI behind a symlinked path does not recognise itself
  // as the entry point and would silently do nothing.
  for (const checkout of ['bootstrap', 'control'])
    cpSync(
      path.join(repo, '.github', 'scripts'),
      path.join(root, checkout, '.github', 'scripts'),
      {
        recursive: true,
        filter: (source) => !source.includes(`${path.sep}tests`),
      },
    );
  const metadata = {
    issue: { number: 7 },
    task: { targetBranch: 'apps/demo', acceptanceCriteria: 'B02. Save' },
  };
  mkdirSync(path.join(root, 'task'));
  writeFileSync(
    path.join(root, 'task', 'task-metadata.json'),
    JSON.stringify(metadata),
  );
  // The handed-off factory-agent-N of a run that stopped during repair.
  const handoff = path.join(root, 'handoff');
  mkdirSync(path.join(handoff, 'repair-context'), { recursive: true });
  mkdirSync(path.join(handoff, 'history'), { recursive: true });
  const patch = Buffer.from('diff --git a/x b/x\n');
  writeFileSync(path.join(handoff, 'agent.patch'), patch);
  initialize(path.join(handoff, 'pipeline-state.json'), metadata);
  const state = readState(path.join(handoff, 'pipeline-state.json'));
  Object.assign(state, {
    phase: 'repair',
    outcome: 'handoff',
    controlSha: C,
    patchHash: createHash('sha256').update(patch).digest('hex'),
    inputHash: inputHash(metadata),
  });
  writeFileSync(
    path.join(handoff, 'pipeline-state.json'),
    JSON.stringify(state),
  );
  writeFileSync(
    path.join(handoff, 'repair-context', 'verification.log'),
    'lint failed\n',
  );
  writeFileSync(path.join(handoff, 'history', 'agent-implement.jsonl'), '{}\n');
  writeFileSync(path.join(handoff, 'retro.json'), '{}');
  writeFileSync(path.join(handoff, 'handoff.json'), '{"previousRunId":1}');
  writeFileSync(path.join(handoff, 'live-progress.pid'), '1');
  symlinkSync('/etc/hostname', path.join(handoff, 'linked.txt'));
  const runnerTemp = path.join(root, 'runner');
  mkdirSync(runnerTemp);
  const keep = () =>
    spawnSync('bash', ['-c', keepScript], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        RUNNER_TEMP: runnerTemp,
        FACTORY_CONTROL_SHA: C,
        GITHUB_RUN_ID: '900',
      },
    });
  return {
    root,
    handoff,
    metadata,
    keep,
    kept: path.join(runnerTemp, 'agent-artifacts'),
  };
}

test('a kept repair-phase checkpoint is complete and restorable', (t) => {
  const f = fixture(t);
  const run = f.keep();
  assert.equal(run.status, 0, run.stderr);
  for (const file of [
    'repair-context/verification.log',
    'history/agent-implement.jsonl',
    'retro.json',
    'agent.patch',
    'task-metadata.json',
  ])
    assert.ok(existsSync(path.join(f.kept, file)), file);
  // Not the handoff request, the source observer's files or a symlink.
  for (const file of ['handoff.json', 'live-progress.pid', 'linked.txt'])
    assert.equal(existsSync(path.join(f.kept, file)), false, file);
  assert.equal(
    readState(path.join(f.kept, 'pipeline-state.json')).outcome,
    'failed',
  );

  // A recovery from this run restores it.
  const saved = {
    attempt: process.env.GITHUB_RUN_ATTEMPT,
    control: process.env.FACTORY_CONTROL_SHA,
  };
  t.after(() => {
    for (const [key, value] of [
      ['GITHUB_RUN_ATTEMPT', saved.attempt],
      ['FACTORY_CONTROL_SHA', saved.control],
    ])
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  });
  delete process.env.GITHUB_RUN_ATTEMPT;
  process.env.FACTORY_CONTROL_SHA = C;
  const restored = restoreState(
    f.kept,
    path.join(f.root, 'restored'),
    f.metadata,
  );
  assert.equal(restored.phase, 'repair');
  assert.ok(
    existsSync(
      path.join(f.root, 'restored', 'repair-context', 'verification.log'),
    ),
  );
});

test('a repair checkpoint without its context is not kept', (t) => {
  const f = fixture(t);
  rmSync(path.join(f.handoff, 'repair-context'), { recursive: true });
  const run = f.keep();
  assert.notEqual(run.status, 0);
  assert.match(
    run.stderr,
    /Repair checkpoint is missing its diagnostic context/,
  );
  assert.equal(existsSync(path.join(f.kept, 'pipeline-state.json')), false);
});
