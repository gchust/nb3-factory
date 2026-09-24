import { isSourceBaselineRef, isSharedTaskBase } from './source-baseline-ref.mjs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  GitHubClient,
  TaskInputError,
  appendGithubOutput,
  issueNumberFromEvent,
} from './factory-lib.mjs';
import {
  claimComment,
  receiptsFor,
  resolveBuildTask,
  listAll,
} from './comment-queue.mjs';
import { isManualIssue, isPresetIssue, preparePresetIssue } from './issue-presets.mjs';
import { resolveTaskBranch, taskIssueNumber } from './task-compat.mjs';
import { resolveTargetBranch, pinInitialBase } from './task-base.mjs';
import { taskEvaluationIdentity } from './evaluation-identity.mjs';
import { claimSample, resolveSample } from './evaluation-sample.mjs';

const args = parseArgs(process.argv.slice(2));
const event = JSON.parse(readFileSync(args.event, 'utf8'));
const outputPath = args.output ?? process.env.GITHUB_OUTPUT;
const repository = process.env.GITHUB_REPOSITORY;
const owner = event.repository?.owner?.login ?? repository?.split('/')[0];
const client = new GitHubClient({
  token: process.env.GITHUB_TOKEN,
  repository,
  apiUrl: process.env.GITHUB_API_URL,
});

let issueNumber;

try {
  issueNumber = issueNumberFromEvent(event);
  appendGithubOutput(outputPath, 'issue_number', issueNumber);

  let issue = await client.getIssue(issueNumber);
  if (issue.pull_request) {
    throw new TaskInputError('任务编号必须指向 Issue，不能指向 Pull Request。');
  }
  if (isManualIssue(issue)) {
    appendGithubOutput(outputPath, 'status', 'manual');
    process.exit(0);
  }
  if (isPresetIssue(issue)) {
    appendGithubOutput(outputPath, 'status', 'preset');
    process.exit(0);
  }
  // Batch samples prove their frozen batch from bot receipts; ordinary Issues get null.
  const sample = await resolveSample(client, issueNumber, { issue });
  await client.ensureStatusLabels();
  const buildCommentId = event.client_payload?.build_comment_id;
  const continuation = event.action === 'code-agent-continue';
  const batchSample = sample && !buildCommentId ? sample : null;
  if (sample?.cancelled) {
    await client.setIssueStatus(issue, 'agent:failed',
      `评测批次 \`${sample.receipt.batchKey}\` 已取消：不再开始或自动续跑该样本；已发生的执行、补丁与用量保留。`);
    appendGithubOutput(outputPath, 'status', 'cancelled');
    process.exit(0);
  }
  if (batchSample && !continuation && process.env.FACTORY_CONTROL_SHA !== batchSample.receipt.controlSha) {
    throw new TaskInputError('评测样本必须使用批次冻结的控制代码；拒绝以当前默认分支执行。');
  }
  if (buildCommentId) {
    const { receipts } = await receiptsFor(client, issueNumber);
    if (
      receipts.some(
        (item) => item.id === Number(buildCommentId) && item.status === 'done',
      )
    ) {
      appendGithubOutput(outputPath, 'status', 'duplicate');
      process.exit(0);
    }
  }
  const prepared = await preparePresetIssue(client, issue);
  issue = prepared.issue;
  const task = buildCommentId
    ? await resolveBuildTask(client, issue, buildCommentId, prepared.task)
    : prepared.task;
  if (buildCommentId) {
    appendGithubOutput(outputPath, 'build_comment_id', buildCommentId);
    appendGithubOutput(outputPath, 'comment_kind', task.commentKind);
  }
  if (issue.state !== 'open' && task.commentKind !== 'reply') {
    throw new TaskInputError('只有打开状态的 Issue 才能运行搭建任务。');
  }
  const repositoryInfo = await client.getRepository();
  const defaultBranch = repositoryInfo.default_branch;

  // Find this Issue's PR independently of its base (legacy tasks included).
  const openPullRequests = await listAll(client, '/pulls', { state: 'open' });
  task.targetBranch = await resolveTargetBranch(
    client, issueNumber, task.targetBranch, openPullRequests, defaultBranch,
  );
  let targetRef = await client.getRef(task.targetBranch, true);
  let targetCreated = false;
  if (!targetRef && isSourceBaselineRef(task.targetBranch)) {
    throw new TaskInputError('指定的源码基线不存在，不能从默认分支伪造替代。');
  }
  if (!targetRef) {
    const defaultRef = await client.getRef(defaultBranch);
    targetRef = await client.createRef(
      task.targetBranch,
      defaultRef.object.sha,
    );
    targetCreated = true;
  }

  const workBranch = await resolveTaskBranch(
    client,
    issueNumber,
    openPullRequests,
    repository,
  );
  const ownPullRequest = openPullRequests.find(
    (pull) =>
      pull.head?.repo?.full_name === repository &&
      pull.head?.ref === workBranch,
  );
  if (ownPullRequest && ownPullRequest.base.ref !== task.targetBranch) {
    throw new TaskInputError('现有 PR 的合并目标与任务不一致；请先对齐配置，不自动改写旧 PR。');
  }
  const blockingPullRequest = !isSharedTaskBase(task.targetBranch, defaultBranch) && openPullRequests.find(
    (pull) =>
      pull.base?.ref === task.targetBranch &&
      pull.head?.repo?.full_name === repository &&
      taskIssueNumber(pull.head?.ref) != null &&
      pull.head.ref !== workBranch,
  );

  const metadata = {
    schemaVersion: 1,
    ...(prepared.preset ? { preset: prepared.preset } : {}),
    ...(buildCommentId ? { buildCommentId } : {}),
    repository,
    owner,
    defaultBranch,
    issue: {
      number: issue.number,
      title: issue.title,
      url: issue.html_url,
      author: issue.user.login,
    },
    task,
    // Stable logical-run identity for exported evaluations; not business input.
    evaluation: {
      ...taskEvaluationIdentity({
        repository,
        issueNumber: issue.number,
        buildCommentId: buildCommentId ? Number(buildCommentId) : null,
        sample: batchSample ? batchSample.receipt : null,
      }),
      ...(batchSample ? {
        budget: batchSample.receipt.budget,
        coordinatorIssue: batchSample.receipt.coordinatorIssue,
        manifestHash: batchSample.manifestHash,
      } : {}),
    },
    workBranch,
    targetCreated,
    existingPullRequest: ownPullRequest
      ? { number: ownPullRequest.number, url: ownPullRequest.html_url }
      : null,
  };
  mkdirSync(path.dirname(args.metadata), { recursive: true });
  writeFileSync(args.metadata, `${JSON.stringify(metadata, null, 2)}\n`);

  appendGithubOutput(outputPath, 'target_branch', task.targetBranch);
  appendGithubOutput(outputPath, 'work_branch', workBranch);
  appendGithubOutput(outputPath, 'default_branch', defaultBranch);

  if (blockingPullRequest) {
    issue = await client.setIssueStatus(
      issue,
      'agent:waiting',
      [
        `目标分支 \`${task.targetBranch}\` 当前已有未合并的 Code Agent PR：${blockingPullRequest.html_url}。`,
        '',
        '这个任务会在该 PR 关闭后自动重新进入全局队列。',
      ].join('\n'),
    );
    appendGithubOutput(outputPath, 'status', 'waiting');
    process.exit(0);
  }

  if (
    buildCommentId &&
    !(await claimComment(
      client,
      issueNumber,
      buildCommentId,
      process.env.GITHUB_RUN_ID,
      event.action === 'code-agent-continue'
        ? event.client_payload.previous_run_id
        : undefined,
    ))
  ) {
    appendGithubOutput(outputPath, 'status', 'duplicate');
    process.exit(0);
  }

  // One build per batch sample: a duplicate or reordered dispatch exits without work.
  if (batchSample && !continuation &&
      !(await claimSample(client, batchSample, Number(process.env.GITHUB_RUN_ID), process.env.GITHUB_SERVER_URL))) {
    appendGithubOutput(outputPath, 'status', 'duplicate');
    process.exit(0);
  }

  const workRef = await client.getRef(workBranch, true);
  const baseRef = workRef ? workBranch : task.targetBranch;
  const baseSha = workRef?.object?.sha ?? (isSharedTaskBase(task.targetBranch, defaultBranch)
    ? await pinInitialBase(client, issueNumber, task.targetBranch, targetRef.object.sha)
    : targetRef.object.sha);
  if (batchSample && !workRef && baseSha !== batchSample.receipt.baseSha) {
    throw new TaskInputError('评测样本的代码起点与批次冻结基线不一致，拒绝改用其他基线。');
  }

  appendGithubOutput(outputPath, 'base_ref', baseRef);
  appendGithubOutput(outputPath, 'base_sha', baseSha);
  appendGithubOutput(outputPath, 'status', 'ready');

  if (task.commentKind !== 'reply')
    await client.setIssueStatus(
      issue,
      'agent:running',
      [
        `Code Agent 工厂已开始处理。`,
        '',
        `- PR 合并目标：\`${task.targetBranch}\`${targetCreated ? '（刚从默认分支创建）' : ''}`,
        `- 工作分支：\`${workBranch}\``,
        `- 本轮代码起点：\`${baseRef} @ ${baseSha}\``,
        `- [查看本次运行](${process.env.GITHUB_SERVER_URL}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID})`,
      ].join('\n'),
    );
} catch (error) {
  if (!(error instanceof TaskInputError) || !issueNumber) throw error;

  const issue = await client.getIssue(issueNumber);
  await client.ensureStatusLabels();
  await client.setIssueStatus(
    issue,
    'agent:needs-input',
    `任务未进入队列：${error.message}`,
  );
  appendGithubOutput(outputPath, 'status', 'rejected');
  console.error(error.message);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, '');
    const value = argv[index + 1];
    if (!key || value == null)
      throw new Error(`Invalid argument near ${argv[index]}`);
    parsed[key] = value;
  }
  if (!parsed.event || !parsed.metadata) {
    throw new Error(
      'Usage: prepare-task.mjs --event <path> --metadata <path> [--output <path>]',
    );
  }
  return parsed;
}
