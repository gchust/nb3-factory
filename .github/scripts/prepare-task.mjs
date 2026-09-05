import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  GitHubClient,
  TaskInputError,
  appendGithubOutput,
  issueNumberFromEvent,
  parseIssueTask,
} from './factory-lib.mjs';
import { resolveTaskBranch, taskIssueNumber } from './task-compat.mjs';

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

  await client.ensureStatusLabels();
  let issue = await client.getIssue(issueNumber);
  if (issue.pull_request) {
    throw new TaskInputError('任务编号必须指向 Issue，不能指向 Pull Request。');
  }
  if (issue.state !== 'open') {
    throw new TaskInputError('只有打开状态的 Issue 才能运行。');
  }
  if (issue.user?.login !== owner) {
    throw new TaskInputError(
      `为了避免消耗模型额度，只有仓库所有者 @${owner} 创建的 Issue 才会执行。`,
    );
  }

  const task = parseIssueTask(issue);
  const repositoryInfo = await client.getRepository();
  const defaultBranch = repositoryInfo.default_branch;

  let targetRef = await client.getRef(task.targetBranch, true);
  let targetCreated = false;
  if (!targetRef) {
    const defaultRef = await client.getRef(defaultBranch);
    targetRef = await client.createRef(
      task.targetBranch,
      defaultRef.object.sha,
    );
    targetCreated = true;
  }

  const openPullRequests = await client.listOpenPullRequests(task.targetBranch);
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
  const blockingPullRequest = openPullRequests.find(
    (pull) =>
      pull.head?.repo?.full_name === repository &&
      taskIssueNumber(pull.head?.ref) != null &&
      pull.head.ref !== workBranch,
  );

  const metadata = {
    schemaVersion: 1,
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

  const workRef = await client.getRef(workBranch, true);
  const baseRef = workRef ? workBranch : task.targetBranch;
  const baseSha = workRef?.object?.sha ?? targetRef.object.sha;

  appendGithubOutput(outputPath, 'base_ref', baseRef);
  appendGithubOutput(outputPath, 'base_sha', baseSha);
  appendGithubOutput(outputPath, 'status', 'ready');

  await client.setIssueStatus(
    issue,
    'agent:running',
    [
      `Code Agent 工厂已开始处理。`,
      '',
      `- 目标分支：\`${task.targetBranch}\`${targetCreated ? '（刚从默认分支创建）' : ''}`,
      `- 工作分支：\`${workBranch}\``,
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
