import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  initialize,
  readState,
  saveState,
  restoreState,
  canStart,
} from '../pipeline-state.mjs';

const scripts = path.resolve(import.meta.dirname, '..');
function directory(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'factory-pipeline-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function write(root, name, value, mode) {
  const file = path.join(root, name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, value, { mode });
  return file;
}
const task = {
  issue: { number: 161 },
  task: {
    requirements: 'Business',
    acceptanceCriteria: 'B01. Open\nB06. Upload file\nB16. Dashboard',
  },
};

function harness(t, codes, repairs = []) {
  const root = directory(t);
  const control = path.join(root, 'control');
  const dest = path.join(control, '.github/scripts');
  const workspace = path.join(root, 'workspace');
  mkdirSync(dest, { recursive: true });
  mkdirSync(workspace);
  for (const file of [
    'qa-retest.mjs',
    'acceptance-criteria.mjs',
    'timed-command.mjs',
    'timing.mjs',
    'apply-database.sh',
  ])
    copyFileSync(path.join(scripts, file), path.join(dest, file));
  write(
    dest,
    'create-runtime-config.mjs',
    "import {writeFileSync} from 'node:fs';writeFileSync(process.argv[process.argv.indexOf('--output')+1], 'config');",
  );
  write(
    dest,
    'verify.sh',
    '#!/bin/bash\necho verify >> "$TRACE"\necho verification-output\n',
    0o755,
  );
  write(
    dest,
    'build-repair-prompt.mjs',
    "import {writeFileSync,readFileSync} from 'node:fs';if(!readFileSync(process.argv[process.argv.indexOf('--log')+1],'utf8')) throw new Error('lost repair context');writeFileSync(process.argv[process.argv.indexOf('--output')+1],'repair');",
  );
  write(
    dest,
    'run-agent.mjs',
    `import fs from 'node:fs';
const list=JSON.parse(fs.readFileSync(process.env.REPAIRS));
fs.appendFileSync(process.env.TRACE,'repair\\n');
const code=list.shift() || 0; fs.writeFileSync(process.env.REPAIRS,JSON.stringify(list));process.exit(code);`,
  );
  write(root, 'bin/pnpm', '#!/bin/bash\necho "$1" >> "$TRACE"\n', 0o755);
  write(
    dest,
    'browser-acceptance.sh',
    `#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path');
const [control,workspace,metadata,config,artifact]=process.argv.slice(2);
const m=JSON.parse(fs.readFileSync(metadata));const list=JSON.parse(fs.readFileSync(process.env.CODES));
if(!list.length) throw new Error('unexpected extra QA');
const code=list.shift();fs.writeFileSync(process.env.CODES,JSON.stringify(list));
fs.appendFileSync(process.env.TRACE,(m.task.qaScope||'full')+':'+(m.task.qaCriteriaIds||[]).join(',')+'\\n');
fs.mkdirSync(artifact,{recursive:true});
const checks=(m.task.qaCriteriaIds||['B01','B06','B16']).map(id=>({id,criterion:id,status:code===10&&id==='B06'?'failed':'passed',actions:['real action'],evidence:['real observation'],screenshots:[]}));
fs.writeFileSync(path.join(artifact,'report.json'),JSON.stringify({checks}));
process.exit(code);
`,
    0o755,
  );
  const metadata = write(root, 'metadata.json', JSON.stringify(task));
  const prompt = write(root, 'task.md', 'Business');
  const codesFile = write(root, 'codes.json', JSON.stringify(codes));
  const repairsFile = write(root, 'repairs.json', JSON.stringify(repairs));
  const trace = path.join(root, 'trace');
  function run(name, env = {}) {
    const artifacts = path.join(root, name);
    const result = spawnSync(
      'bash',
      [
        path.join(scripts, 'verify-and-repair.sh'),
        control,
        workspace,
        prompt,
        metadata,
        artifacts,
        path.join(root, `${name}-state`),
      ],
      {
        encoding: 'utf8',
        timeout: 15_000,
        env: {
          ...process.env,
          PATH: `${root}/bin:${process.env.PATH}`,
          TRACE: trace,
          CODES: codesFile,
          REPAIRS: repairsFile,
          ...env,
        },
      },
    );
    return {
      ...result,
      artifacts,
      checkpoint: path.join(artifacts, 'pipeline-state.json'),
    };
  }
  function restore(from, next) {
    write(from.artifacts, 'agent.patch', 'same application patch');
    execFileSync(process.execPath, [
      path.join(scripts, 'pipeline-state.mjs'),
      'seal',
      from.checkpoint,
      path.join(from.artifacts, 'agent.patch'),
    ]);
    restoreState(from.artifacts, path.join(root, next), task);
  }
  return {
    root,
    run,
    restore,
    events: () => readFileSync(trace, 'utf8').trim().split('\n'),
  };
}

test('B-coded QA follows full -> focused failure -> focused success -> fresh full', (t) => {
  const h = harness(t, [10, 10, 0, 0]);
  const result = h.run('one');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    h.events().filter((e) => e.includes(':')),
    ['full:', 'focused:B06', 'focused:B06', 'full:'],
  );
  assert.equal(h.events().filter((e) => e === 'repair').length, 2);
  assert.equal(readState(result.checkpoint).phase, 'done');
});

test('a repair handoff restores failure context and repairs before another full QA', (t) => {
  const h = harness(t, [10, 0, 0], [75, 0]);
  const first = h.run('one');
  assert.equal(first.status, 75, first.stderr);
  assert.equal(readState(first.checkpoint).phase, 'repair');
  assert.equal(
    JSON.parse(readFileSync(path.join(first.artifacts, 'repair-summary.json')))
      .handoff,
    true,
  );
  h.restore(first, 'two');
  const second = h.run('two');
  assert.equal(second.status, 0, second.stderr);
  assert.equal(readState(second.checkpoint).repairAttempts, 2);
  const summary = JSON.parse(
    readFileSync(path.join(second.artifacts, 'repair-summary.json')),
  );
  assert.equal(summary.repairAttempts, 1);
  assert.equal(summary.finalVerificationAttempt, 2);
  assert.deepEqual(
    h.events().filter((e) => e.includes(':')),
    ['full:', 'focused:B06', 'full:'],
  );
  assert.deepEqual(h.events().slice(0, 5), [
    'verify',
    'full:',
    'repair',
    'repair',
    'verify',
  ]);
});

test('an interrupted focused QA resumes only pending IDs and still ends with full QA', (t) => {
  const h = harness(t, [10, 75, 0, 0]);
  const first = h.run('one');
  assert.equal(first.status, 75, first.stderr);
  assert.equal(readState(first.checkpoint).phase, 'qa-focused');
  assert.deepEqual(readState(first.checkpoint).pendingCriteria, ['B06']);
  h.restore(first, 'two');
  const second = h.run('two');
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(
    h.events().filter((e) => e.includes(':')),
    ['full:', 'focused:B06', 'focused:B06', 'full:'],
  );
  assert.equal(h.events().filter((e) => e === 'repair').length, 1);
});

test('a full QA interruption does not repeat the already completed focused repair', (t) => {
  const h = harness(t, [10, 0, 75, 0]);
  const first = h.run('one');
  assert.equal(first.status, 75, first.stderr);
  assert.equal(readState(first.checkpoint).phase, 'qa-full');
  h.restore(first, 'two');
  const second = h.run('two');
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(
    h.events().filter((e) => e.includes(':')),
    ['full:', 'focused:B06', 'full:', 'full:'],
  );
});

test('environment/report block does not invoke an application repair', (t) => {
  const h = harness(t, [20]);
  const result = h.run('one');
  assert.equal(result.status, 20, result.stderr);
  assert.equal(h.events().includes('repair'), false);
});

test('insufficient budget checkpoints before starting full QA', (t) => {
  const h = harness(t, [0]);
  const first = h.run('one', {
    FACTORY_RUN_DEADLINE_EPOCH_SECONDS: String(
      Math.floor(Date.now() / 1000) + 200,
    ),
  });
  assert.equal(first.status, 75, first.stderr);
  assert.equal(readState(first.checkpoint).phase, 'qa-full');
  assert.deepEqual(h.events(), ['verify']);
  h.restore(first, 'two');
  assert.equal(h.run('two').status, 0);
});

test('checkpoint bindings reject a different input or different patch', (t) => {
  const root = directory(t);
  const source = path.join(root, 'source');
  const file = path.join(source, 'pipeline-state.json');
  const state = initialize(file, task);
  write(source, 'agent.patch', 'patch');
  state.patchHash = createHash('sha256').update('patch').digest('hex');
  state.phase = 'implementation';
  saveState(file, state);
  assert.equal(
    restoreState(source, path.join(root, 'dest'), task).phase,
    'implementation',
  );
  assert.throws(
    () =>
      restoreState(source, path.join(root, 'other'), {
        ...task,
        task: { ...task.task, requirements: 'changed' },
      }),
    /input/u,
  );
  write(source, 'agent.patch', 'different');
  assert.throws(
    () => restoreState(source, path.join(root, 'bad'), task),
    /hash/u,
  );
});

test('legacy checkpoints rebuild and QA; changed control planes reject restoration', (t) => {
  const root = directory(t);
  mkdirSync(path.join(root, 'legacy'));
  assert.equal(
    restoreState(path.join(root, 'legacy'), path.join(root, 'fresh'), task)
      .phase,
    'verify',
  );
  const old = process.env.FACTORY_CONTROL_SHA;
  t.after(() => {
    if (old === undefined) delete process.env.FACTORY_CONTROL_SHA;
    else process.env.FACTORY_CONTROL_SHA = old;
  });
  process.env.FACTORY_CONTROL_SHA = 'old';
  const source = path.join(root, 'old');
  const state = initialize(path.join(source, 'pipeline-state.json'), task);
  state.phase = 'qa-full';
  state.pendingCriteria = ['B06'];
  write(source, 'agent.patch', 'patch');
  state.patchHash = createHash('sha256').update('patch').digest('hex');
  saveState(path.join(source, 'pipeline-state.json'), state);
  process.env.FACTORY_CONTROL_SHA = 'new';
  assert.throws(
    () => restoreState(source, path.join(root, 'new'), task),
    /factory SHA differs/,
  );
  const saved = JSON.parse(
    readFileSync(path.join(source, 'pipeline-state.json'), 'utf8'),
  );
  assert.equal(saved.phase, 'qa-full');
  assert.deepEqual(saved.pendingCriteria, ['B06']);
});

test('phase start estimates never exceed a fresh five-hour runner budget', () => {
  assert.equal(
    canStart({ fullQaSeconds: 100000 }, 'qa-full', 20000, 2200),
    true,
  );
  assert.equal(
    canStart({ fullQaSeconds: 4000 }, 'qa-full', 10000, 9900),
    false,
  );
  assert.equal(canStart({}, 'repair', undefined), true);
});
