import { readFileSync } from 'node:fs';

import {
  GitHubClient,
  TaskInputError,
  parseIssueTask,
  validateTargetBranch,
} from './factory-lib.mjs';
import {
  taskIssueNumber,
  taskMarkerNumber,
  waitingLabels,
} from './task-compat.mjs';

// Older application branches may still emit the former pull_request workflow.
// The default-branch pull_request_target workflow is now the sole publisher.
if (process.env.GITHUB_EVENT_NAME === 'pull_request') process.exit(0);

const eventPath = process.argv[2] ?? process.env.GITHUB_EVENT_PATH;
const event = JSON.parse(readFileSync(eventPath, 'utf8'));
const pull = event.pull_request;
const repository = process.env.GITHUB_REPOSITORY;
const owner = event.repository.owner.login;
const client = new GitHubClient({
  token: process.env.GITHUB_TOKEN,
  repository,
  apiUrl: process.env.GITHUB_API_URL,
});

if (pull.head?.repo?.full_name !== repository) process.exit(0);
const issueNumber = taskIssueNumber(pull.head?.ref);
if (!issueNumber) process.exit(0);
validateTargetBranch(pull.base.ref);

const marker = taskMarkerNumber(pull.body);
if (marker != null && marker !== issueNumber) {
  throw new TaskInputError('PR 的来源 Issue 标记与工作分支不一致。');
}
const issue = await client.getIssue(issueNumber);
if (issue.user?.login !== owner) {
  throw new TaskInputError('Code Agent PR 对应的 Issue 不是仓库所有者创建的。');
}

await client.ensureStatusLabels();
if (pull.merged) {
  await client.setIssueStatus(
    issue,
    'agent:succeeded',
    `PR #${pull.number} 已合并到 \`${pull.base.ref}\`，任务完成。`,
  );
  await client.request('PATCH', `/issues/${issueNumber}`, {
    body: { state: 'closed', state_reason: 'completed' },
  });
} else {
  await client.setIssueStatus(
    issue,
    'agent:needs-input',
    `PR #${pull.number} 已关闭但未合并；Issue 保持打开，必要时可手动重新运行任务。`,
  );
}

const candidates = [];
for (const label of waitingLabels) {
  for (let page = 1; ; page += 1) {
    const issues = await client.request('GET', '/issues', {
      query: {
        state: 'open',
        labels: label,
        sort: 'created',
        direction: 'asc',
        per_page: 100,
        page,
      },
    });
    candidates.push(...issues);
    if (issues.length < 100) break;
  }
}
const waiting = [
  ...new Map(
    candidates.map((candidate) => [candidate.number, candidate]),
  ).values(),
].sort((a, b) => a.number - b.number);
let nextIssue;
for (const candidate of waiting) {
  if (candidate.pull_request || candidate.user?.login !== owner) continue;
  try {
    const task = parseIssueTask(candidate);
    if (task.targetBranch === pull.base.ref) {
      nextIssue = candidate;
      break;
    }
  } catch {
    // A malformed waiting issue will be handled when manually dispatched.
  }
}

if (nextIssue) {
  await client.setIssueStatus(
    nextIssue,
    'agent:queued',
    `阻塞它的 PR #${pull.number} 已关闭，任务已重新进入全局队列。`,
  );
  await client.request('POST', '/dispatches', {
    body: {
      event_type: 'code-agent-task',
      client_payload: { issue_number: nextIssue.number },
    },
  });
}
