import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  copyFileSync,
  existsSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseIssueTask, validateTargetBranch } from '../factory-lib.mjs';
import { retestMetadata } from '../qa-retest.mjs';
import { taskOutcome } from '../task-outcome.mjs';
import {
  emptyUsage,
  collectUsage,
  validateRecord,
  aggregate,
  renderUsage,
} from '../task-usage.mjs';
import { renderRetro } from '../publish-retro.mjs';
import { renderTaskReport, readStageTimings } from '../task-report.mjs';
const scripts = path.resolve(import.meta.dirname, '..');
function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'factory-efficiency-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function write(root, file, value, mode) {
  const p = path.join(root, file);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, value, { mode });
  return p;
}
const body =
  '### 任务类型\n创建新系统\n### 业务需求\n业务目标\n### 验收要求\n1. 创建\n2. 编辑\n';

test('missing branches are resolved by prepare; supplied branches remain reusable', () => {
  for (const prefix of [
    '',
    '### 目标分支\n\n',
    '### 目标分支\n_No response_\n',
  ]) {
    const issue = { number: 146, body: prefix + body };
    assert.equal(parseIssueTask(issue).targetBranch, null);
    assert.deepEqual(parseIssueTask(issue), parseIssueTask(issue));
  }
  for (const branch of [
    'main',
    'develop',
    'crm',
    'feature/CRM-v2',
    'apps/old-crm',
    'issues-146',
  ]) {
    assert.equal(validateTargetBranch(branch), branch);
    assert.equal(
      parseIssueTask({ number: 146, body: `### 目标分支\n${branch}\n${body}` })
        .targetBranch,
      branch,
    );
  }
  assert.equal(parseIssueTask({ body }).targetBranch, null);
});

test('focused QA metadata retains business context but cannot replace full acceptance metadata', () => {
  const metadata = {
    issue: { number: 146 },
    task: {
      requirements: 'Business',
      acceptanceCriteria: '1. Create\n2. Edit',
    },
  };
  const focus = retestMetadata(metadata, {
    checks: [
      { criterion: 'Create', status: 'passed' },
      { criterion: 'Edit', status: 'failed' },
    ],
  });
  assert.equal(focus.task.acceptanceCriteria, metadata.task.acceptanceCriteria);
  assert.deepEqual(focus.task.qaCriteriaIds, ['C02']);
  assert.equal(focus.task.qaScope, 'focused');
  assert.equal(focus.task.requirements, 'Business');
  assert.equal(metadata.task.acceptanceCriteria, '1. Create\n2. Edit');
  assert.throws(() => retestMetadata(metadata, { checks: [] }));
  assert.equal(
    retestMetadata(metadata, {
      checks: [
        { criterion: 'Create', status: 'failed' },
        { criterion: 'Edit', status: 'failed' },
      ],
    }),
    null,
  );
});

test('focused failures repair again; focused success must run full QA on fresh state before delivery', (t) => {
  const root = fixture(t);
  const control = path.join(root, 'control');
  const dest = path.join(control, '.github/scripts');
  mkdirSync(dest, { recursive: true });
  const workspace = path.join(root, 'workspace');
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
    "import {writeFileSync} from 'node:fs';writeFileSync(process.argv[process.argv.indexOf('--output')+1],'config');",
  );
  write(dest, 'verify.sh', '#!/bin/bash\necho verify >> "$TRACE"\n', 0o755);
  write(
    dest,
    'build-repair-prompt.mjs',
    "import {writeFileSync} from 'node:fs';writeFileSync(process.argv[process.argv.indexOf('--output')+1],'repair');",
  );
  write(
    dest,
    'run-agent.mjs',
    "import {appendFileSync} from 'node:fs';appendFileSync(process.env.TRACE,'repair\\n');",
  );
  write(
    root,
    'bin/pnpm',
    '#!/bin/bash\nprintf "%s:%s\\n" "$1" "$APP_CONFIG_FILE" >> "$TRACE"\n',
    0o755,
  );
  write(
    dest,
    'browser-acceptance.sh',
    `#!/usr/bin/env node
const fs = require('node:fs'); const path = require('node:path');
const [control, workspace, metadata, config, artifact] = process.argv.slice(2);
const m = JSON.parse(fs.readFileSync(metadata));
const file=path.join(workspace,'qa-count'); const n=fs.existsSync(file)?Number(fs.readFileSync(file))+1:1; fs.writeFileSync(file,String(n));
fs.appendFileSync(process.env.TRACE,(m.task.qaScope||'full')+':'+config+'\\n');
fs.mkdirSync(artifact,{recursive:true});
// First full QA fails, first focused retry fails, second focus passes.
// The following FULL run alone is allowed to finish the task.
const failed=n<3;
fs.writeFileSync(path.join(artifact,'report.json'),JSON.stringify({checks:[{criterion:'Edit',status:failed?'failed':'passed',actions:['edit'],evidence:['result']}]}));
process.exit(failed?10:0);
`,
    0o755,
  );
  const metadata = write(
    root,
    'task.json',
    JSON.stringify({ task: { acceptanceCriteria: '1. Create\n2. Edit' } }),
  );
  const prompt = write(root, 'prompt.md', 'Business');
  const artifacts = path.join(root, 'artifacts');
  const trace = path.join(root, 'trace');
  const result = spawnSync(
    'bash',
    [
      path.join(scripts, 'verify-and-repair.sh'),
      control,
      workspace,
      prompt,
      metadata,
      artifacts,
      path.join(root, 'state'),
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        TRACE: trace,
        PATH: `${root}/bin:${process.env.PATH}`,
      },
      timeout: 10000,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const events = readFileSync(trace, 'utf8').trim().split('\n');
  assert.deepEqual(
    events
      .filter((e) => /^(full|focused):/.test(e))
      .map((e) => e.split(':')[0]),
    ['full', 'focused', 'focused', 'full'],
  );
  assert.match(
    events.filter((e) => e.startsWith('full:')).at(-1),
    /-full.yml$/,
  );
  assert.equal(events.filter((e) => e === 'verify').length, 3);
  assert.equal(events.filter((e) => e === 'repair').length, 2);
  assert.ok(
    existsSync(path.join(artifacts, 'verify-3/browser-acceptance/report.json')),
  );
});

test('formatting touches changed application files without sending a formatting task to an Agent', (t) => {
  const root = fixture(t);
  const workspace = path.join(root, 'app');
  mkdirSync(workspace);
  const git = (...args) =>
    execFileSync('git', args, { cwd: workspace, stdio: 'pipe' });
  git('init');
  write(workspace, 'client/page.ts', 'old');
  write(workspace, 'client/deleted.ts', 'old');
  git('add', '.');
  git(
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.invalid',
    'commit',
    '-m',
    'base',
  );
  write(workspace, 'client/page.ts', 'new');
  write(workspace, 'client/new page.ts', 'new');
  write(workspace, '.github/control.mjs', 'control');
  rmSync(path.join(workspace, 'client/deleted.ts'));
  const output = path.join(root, 'args.json');
  write(
    root,
    'bin/pnpm',
    '#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.env.ARGS,JSON.stringify(process.argv.slice(2)));',
    0o755,
  );
  execFileSync(
    process.execPath,
    [path.join(scripts, 'format-changes.mjs'), workspace],
    {
      env: {
        ...process.env,
        PATH: `${root}/bin:${process.env.PATH}`,
        ARGS: output,
      },
    },
  );
  const args = JSON.parse(readFileSync(output));
  assert.deepEqual(args.slice(0, 5), [
    'exec',
    'prettier',
    '--write',
    '--ignore-unknown',
    '--',
  ]);
  assert.ok(args.includes('./client/page.ts'));
  assert.ok(args.includes('./client/new page.ts'));
  assert.ok(
    !args.some((a) => a.includes('deleted') || a.includes('control.mjs')),
  );
});

test('build and repair receive the actual retro path, compact business input and no QA-only criteria', (t) => {
  const root = fixture(t);
  const metadata = write(
    root,
    'metadata.json',
    JSON.stringify({
      issue: { number: 146, title: 'Demo' },
      task: {
        requirements: 'BUSINESS_SENTINEL',
        acceptanceCriteria: 'HIDDEN_QA_SENTINEL',
        targetBranch: 'issues-146',
      },
    }),
  );
  const output = path.join(root, 'implement.md');
  const retro = path.join(root, 'retro.json');
  execFileSync(process.execPath, [
    path.join(scripts, 'build-prompt.mjs'),
    '--metadata',
    metadata,
    '--template',
    path.resolve(scripts, '../prompts/implement.md'),
    '--retro-path',
    retro,
    '--output',
    output,
  ]);
  assert.ok(readFileSync(output, 'utf8').includes(retro));
  assert.ok(!readFileSync(output, 'utf8').includes('HIDDEN_QA_SENTINEL'));
  const repaired = path.join(root, 'repair.md');
  const log = write(root, 'failure.log', 'ERROR_SENTINEL');
  execFileSync(process.execPath, [
    path.join(scripts, 'build-repair-prompt.mjs'),
    '--task',
    output,
    '--template',
    path.resolve(scripts, '../prompts/repair.md'),
    '--retro-path',
    retro,
    '--log',
    log,
    '--output',
    repaired,
  ]);
  const text = readFileSync(repaired, 'utf8');
  assert.ok(text.includes(retro));
  assert.match(text, /BUSINESS_SENTINEL/);
  assert.match(text, /ERROR_SENTINEL/);
  assert.doesNotMatch(text, /历史定位线索|HIDDEN_QA_SENTINEL/);
});

test('stats separate full QA, focused retest and report repair without double-counting tokens', async (t) => {
  const root = fixture(t);
  const event =
    JSON.stringify({
      type: 'message_end',
      message: {
        role: 'assistant',
        usage: {
          input: 2,
          output: 3,
          cacheRead: 5,
          cacheWrite: 0,
          totalTokens: 10,
        },
      },
    }) +
    '\n' +
    JSON.stringify({ type: 'agent_end' }) +
    '\n';
  for (const file of [
    'verify-1/browser-acceptance/agent-browser-acceptance.jsonl',
    'verify-2/browser-focused/agent-browser-acceptance.jsonl',
    'verify-2/browser-focused/agent-browser-report-repair-1.jsonl',
  ])
    write(root, file, event);
  const usage = await collectUsage(root);
  assert.equal(usage.phases.qa.totalTokens, 10);
  assert.equal(usage.phases.qaFocused.totalTokens, 10);
  assert.equal(usage.phases.qaReport.totalTokens, 10);
  assert.equal(usage.records, 3);
});

function record() {
  return {
    version: 1,
    repository: 'owner/repo',
    issue: 146,
    runId: 123,
    attempt: 1,
    status: 'handoff',
    start: 1000,
    end: 5000,
    jobs: [{ id: 1, name: 'agent', seconds: 4 }],
    agentJobId: 1,
    usage: emptyUsage(),
  };
}
test('legacy receipts retain combined QA totals; missing measurements remain visible in offline HTML', () => {
  const value = record();
  delete value.usage.phases.qaFocused;
  delete value.usage.phases.qaReport;
  value.usage.incomplete = 1;
  validateRecord(value, 'owner/repo', 146);
  assert.equal(value.usage.legacyQa, true);
  const cumulative = aggregate([value]);
  const html = renderTaskReport({ record: value, cumulative });
  assert.match(html, /等待下一轮续跑/);
  assert.match(html, /未取得可用 usage/);
  assert.match(html, /费用：未知/);
  assert.doesNotMatch(html, /<script|<link[^>]+href=/);
  const markdown = renderUsage(value, [value]);
  assert.match(markdown, /<details>/);
  assert.match(markdown, /<\/details>/);
});

test('workflow success is not delivery, and missing retro never means first-pass success', () => {
  assert.equal(taskOutcome({ conclusion: 'success' }, []), 'success');
  assert.equal(
    taskOutcome({ conclusion: 'success' }, [
      {
        name: 'agent',
        steps: [{ name: 'Dispatch continuation run', conclusion: 'success' }],
      },
    ]),
    'handoff',
  );
  assert.equal(
    taskOutcome({ conclusion: 'failure' }, [
      { name: 'publish', conclusion: 'success' },
    ]),
    'delivered',
  );
  const text = renderRetro({
    issue: 146,
    runId: 123,
    attempt: 1,
    runUrl: 'url',
    targetBranch: 'issues-146',
    conclusion: 'success',
    retro: { summary: '', blockers: [], improvements: [] },
    structured: false,
    repair: { verificationAttempts: 4, repairAttempts: 3 },
  });
  assert.match(text, /未确认业务交付/);
  assert.match(text, /3 次修复/);
  assert.doesNotMatch(text, /一次通过/);
});

test('timing report keeps nested spans separate rather than claiming summed wall time', (t) => {
  const root = fixture(t);
  const file = write(
    root,
    'timings.jsonl',
    [
      { stage: 'build', durationMs: 1000 },
      { stage: 'build:install', durationMs: 500 },
      { stage: 'build', durationMs: 2000 },
    ]
      .map(JSON.stringify)
      .join('\n'),
  );
  assert.deepEqual(readStageTimings(file), [
    { stage: 'build', calls: 2, durationMs: 3000 },
    { stage: 'build:install', calls: 1, durationMs: 500 },
  ]);
});

test('long prior Agent replies are bounded context, never promoted to business requirements', async () => {
  const { resolveBuildTask, receiptBody } =
    await import('../comment-queue.mjs');
  const bot = { login: 'github-actions[bot]', type: 'Bot' };
  const human = { login: 'user', type: 'User' };
  const comments = [];
  for (let id = 1; id <= 5; id++) {
    comments.push({ id, user: human, body: `/build\nUSER_CONSTRAINT_${id}` });
    comments.push({
      id: 100 + id,
      user: bot,
      body: receiptBody({ id, status: 'done', conclusion: 'success' }),
    });
    comments.push({
      id: 200 + id,
      user: bot,
      body: `AGENT_NOTE_${id} ${'x'.repeat(4000)}<!-- factory-comment-reply:${id} -->`,
    });
  }
  comments.push({ id: 99, user: human, body: '/build\nCURRENT_REQUEST' });
  comments.push({
    id: 199,
    user: bot,
    body: receiptBody({ id: 99, status: 'dispatched' }),
  });
  const task = await resolveBuildTask(
    { repository: 'owner/repo', request: async () => comments },
    { number: 146, body },
    99,
  );
  for (let id = 1; id <= 5; id++)
    assert.ok(task.requirements.includes(`USER_CONSTRAINT_${id}`));
  assert.match(task.requirements, /CURRENT_REQUEST/);
  assert.doesNotMatch(task.requirements, /AGENT_NOTE/);
  assert.ok(task.discussionContext.length <= 6000);
  assert.doesNotMatch(task.discussionContext, /AGENT_NOTE_[12]/);
  assert.match(task.discussionContext, /AGENT_NOTE_5/);
});
