import { readFileSync } from 'node:fs';

import {
  GitHubClient,
  TaskInputError,
  parseIssueTask,
  validateTargetBranch,
} from './factory-lib.mjs';

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
const headMatch = pull.head?.ref?.match(/^pi\/issue-(\d+)$/);
if (!headMatch) process.exit(0);
validateTargetBranch(pull.base.ref);

const marker = pull.body?.match(/<!--\s*pi-issue:\s*(\d+)\s*-->/i);
const issueNumber = Number(marker?.[1] ?? headMatch[1]);
const issue = await client.getIssue(issueNumber);
if (issue.user?.login !== owner) {
  throw new TaskInputError('Pi PR 对应的 Issue 不是仓库所有者创建的。');
}

await client.ensureStatusLabels();
if (pull.merged) {
  await client.setIssueStatus(
    issue,
    'pi:succeeded',
    `PR #${pull.number} 已合并到 \`${pull.base.ref}\`，任务完成。`,
  );
  await client.request('PATCH', `/issues/${issueNumber}`, {
    body: { state: 'closed', state_reason: 'completed' },
  });
} else {
  await client.setIssueStatus(
    issue,
    'pi:needs-input',
    `PR #${pull.number} 已关闭但未合并；Issue 保持打开，必要时可手动重新运行任务。`,
  );
}

const waiting = await client.request('GET', '/issues', {
  query: {
    state: 'open',
    labels: 'pi:waiting',
    sort: 'created',
    direction: 'asc',
    per_page: 100,
  },
});
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
    'pi:queued',
    `阻塞它的 PR #${pull.number} 已关闭，任务已重新进入全局队列。`,
  );
  await client.request('POST', '/dispatches', {
    body: {
      event_type: 'pi-task',
      client_payload: { issue_number: nextIssue.number },
    },
  });
}
