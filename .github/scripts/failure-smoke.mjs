// Explicit maintainer smoke only: generate an inert change, then fail before QA.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GitHubClient } from './factory-lib.mjs';

export const reason =
  '受控失败测试：生成独立测试标记，在业务验收前主动退出；本轮未调用搭建模型、未运行业务 QA，不代表应用或框架存在缺陷。';
export const markerPath = 'client/factory-failure-smoke.json';

export function validateSmokeRequest(
  event,
  issue,
  { eventName, attempt, existingBranch },
) {
  assert.equal(
    eventName,
    'workflow_dispatch',
    'Failure smoke requires an explicit manual dispatch',
  );
  assert.equal(String(attempt), '1', 'Use a new smoke Issue instead of Re-run');
  assert.ok(
    [true, 'true'].includes(event.inputs?.failure_smoke),
    'Failure smoke must be explicitly enabled',
  );
  assert.ok(
    !event.inputs?.recovery_run_id && !event.inputs?.external_run_id,
    'Smoke cannot recover or impersonate external work',
  );
  assert.equal(issue.number, Number(event.inputs.issue_number));
  assert.equal(issue.state, 'open');
  assert.ok(
    !issue.pull_request && !existingBranch,
    'Smoke requires a fresh Issue without an application branch',
  );
  const labels = issue.labels.map((label) =>
    typeof label === 'string' ? label : label.name,
  );
  assert.ok(
    labels.includes('factory:failure-smoke') &&
      labels.includes('factory:external'),
    'Smoke requires both dedicated labels',
  );
  assert.ok(
    issue.body.includes('<!-- factory-failure-smoke:v1 -->'),
    'Issue must disclose intentional failure',
  );
}

export function recordSmokeFailure(root) {
  const statePath = path.join(root, 'pipeline-state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  state.phase = 'verify';
  state.outcome = 'failed';
  state.stopReason = { code: 'controlled-failure-smoke', reason };
  const report = {
    version: 1,
    status: 'controlled-failure',
    code: state.stopReason.code,
    reason,
    verificationAttempts: state.verificationAttempts,
    repairAttempts: state.repairAttempts,
    failures: [],
    rootCause: { owner: 'factory', confidence: 'confirmed', reason },
    smokeSource: { type: 'generated-marker', path: markerPath },
    modelInvoked: false,
    businessQA: 'not_run',
  };
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  writeFileSync(
    path.join(root, 'task-diagnostic.json'),
    JSON.stringify(report, null, 2),
  );
  writeFileSync(
    path.join(root, 'task-diagnostic.md'),
    '# 受控失败测试\n\n' +
      reason +
      '\n\n本轮生成独立 JSON 标记，不加载历史补丁，不复用 QA、截图或成功结论。\n',
  );
}

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === 'validate') {
    const event = JSON.parse(
      readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'),
    );
    const client = new GitHubClient({
      token: process.env.GITHUB_TOKEN,
      repository: process.env.GITHUB_REPOSITORY,
    });
    const issue = await client.getIssue(Number(event.inputs.issue_number));
    const existingBranch = await client.getRef(
      'agent/issue-' + issue.number,
      true,
    );
    validateSmokeRequest(event, issue, {
      eventName: process.env.GITHUB_EVENT_NAME,
      attempt: process.env.GITHUB_RUN_ATTEMPT,
      existingBranch,
    });
  } else if (mode === 'inject') {
    const [workspace, root, branch] = args;
    execFileSync('git', ['switch', '--force-create', branch], {
      cwd: workspace,
      stdio: 'inherit',
    });
    // An unimported JSON marker gives failed publication a real code diff
    // without depending on template routes, locales, or historical Git objects.
    const target = path.join(workspace, markerPath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(
      target,
      JSON.stringify(
        { purpose: 'controlled-failure-smoke', businessQA: 'not_run' },
        null,
        2,
      ) + '\n',
      { flag: 'wx' },
    );
    execFileSync('git', ['add', '--', markerPath], { cwd: workspace });
    recordSmokeFailure(root);
    console.error(reason);
    process.exitCode = 1;
  } else throw new Error('Expected validate or inject');
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
