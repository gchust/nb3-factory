import { TaskInputError, validateTargetBranch } from './factory-lib.mjs';
import { listAll } from './comment-queue.mjs';
import { taskIssueNumber } from './task-compat.mjs';

// An omitted target means the repository default for a NEW task. Do not
// silently migrate an older task's PR or already-created application branch.
export async function resolveTargetBranch(client, number, requested, pulls, defaultBranch) {
  if (requested) return validateTargetBranch(requested);
  const own = pulls.filter((pull) =>
    pull.head?.repo?.full_name === client.repository &&
    taskIssueNumber(pull.head?.ref) === number,
  );
  const open = own.filter((pull) => pull.state === 'open');
  const bases = new Set((open.length ? open : own).map((pull) => pull.base?.ref));
  if (bases.size > 1) throw new TaskInputError('同一 Issue 有多个不同目标的 PR，不能猜测续跑分支。');
  if (bases.size) return validateTargetBranch([...bases][0]);
  const legacy = `issues-${number}`;
  if (await client.getRef(legacy, true)) return legacy;
  return validateTargetBranch(defaultBranch);
}

const marker = '<!-- factory-task-base-v1:';
const shaPattern = /^[a-f0-9]{40}$/;

// The per-Issue workflow concurrency serializes this append-only receipt.
// A bot receipt outlives Actions artifacts and pins even an unpublished task
// when develop advances or is regenerated. No second branch is needed.
export async function pinInitialBase(client, number, targetBranch, candidateSha) {
  const comments = await listAll(client, `/issues/${number}/comments`);
  let saved;
  for (const comment of comments) {
    if (comment.user?.login !== 'github-actions[bot]' || comment.user?.type !== 'Bot') continue;
    if (!(comment.body ?? '').startsWith(marker)) continue;
    let value;
    try {
      const suffix = comment.body.split(/\r?\n/, 1)[0].slice(marker.length);
      if (!suffix.endsWith(' -->')) throw new Error('Incomplete receipt');
      value = JSON.parse(suffix.slice(0, -4));
    } catch {
      throw new TaskInputError('本任务的代码起点记录损坏，不能改用最新默认分支。');
    }
    if (!value || value.repository !== client.repository || value.issueNumber !== number ||
        value.targetBranch !== targetBranch || !shaPattern.test(value.sha) ||
        (saved && saved !== value.sha)) {
      throw new TaskInputError('本任务的代码起点记录不一致，不能更换基线继续搭建。');
    }
    saved = value.sha;
  }
  if (saved) return saved;
  if (!shaPattern.test(candidateSha)) throw new TaskInputError('默认分支未返回有效的提交 SHA。');
  const receipt = JSON.stringify({ repository: client.repository, issueNumber: number, targetBranch, sha: candidateSha });
  await client.addComment(number,
    `${marker}${receipt} -->\n\n本任务首次代码起点：\`${targetBranch} @ ${candidateSha}\`。新 Issue 独立搭建；本任务重试不会跟随默认分支移动。`,
  );
  return candidateSha;
}
