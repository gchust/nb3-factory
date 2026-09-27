// Explicit maintainer smoke only: reuse code, never another run's QA verdict.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GitHubClient } from './factory-lib.mjs';

export const reason =
  '受控失败测试：复用 #400 的计数器补丁，在业务验收前主动退出；本轮未调用搭建模型、未运行业务 QA，不代表应用或框架存在缺陷。';
export const fixtureSource = {
  issue: 400,
  runId: 36315838213,
  commit: '208f8bc8a50d57a32d1ff2c327283b8cd507789d',
};

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
    fixtureSource,
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
      '\n\n来源：Issue #400 / Run 36315838213 / ' +
      fixtureSource.commit +
      '。只复用代码补丁，不复用 QA、截图或成功结论。\n',
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
    const fixture = new URL(
      './tests/fixtures/failed-delivery/agent.patch.base64',
      import.meta.url,
    );
    const manifest = JSON.parse(
      readFileSync(
        new URL(
          './tests/fixtures/failed-delivery/source.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    assert.equal(
      createHash('sha256')
        .update(Buffer.from(readFileSync(fixture, 'utf8'), 'base64'))
        .digest('hex'),
      manifest.patchSha256,
    );
    const patchPath = path.join(root, 'smoke-source.patch');
    writeFileSync(
      patchPath,
      Buffer.from(readFileSync(fixture, 'utf8'), 'base64'),
    );
    execFileSync(
      process.execPath,
      [
        fileURLToPath(new URL('./apply-patch.mjs', import.meta.url)),
        '--workspace',
        workspace,
        '--patch',
        patchPath,
        '--branch',
        branch,
      ],
      { stdio: 'inherit' },
    );
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
