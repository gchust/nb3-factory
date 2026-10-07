// Read-only compatibility for tasks created before the Code Agent rename.
// New tasks, labels, titles, PR markers and dispatches use neutral names only.
// Work branches have one form; the former pi/issue-N branches are gone.
import { readFileSync } from 'node:fs';

export function taskIssueNumber(branch) {
  const match = branch?.match(/^agent\/issue-(\d+)$/);
  const number = Number(match?.[1]);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function taskBranch(number) {
  return `agent/issue-${number}`;
}

// The client is unused since the branch name became fixed; callers still pass
// it, so the signature stays.
export async function resolveTaskBranch(
  client,
  number,
  openPullRequests,
  repository,
) {
  const ownPulls = openPullRequests.filter(
    (pull) =>
      pull.head?.repo?.full_name === repository &&
      taskIssueNumber(pull.head?.ref) === number,
  );
  if (ownPulls.length > 1) {
    throw new Error(
      `Issue #${number} has multiple open task PRs; resolve them before retrying.`,
    );
  }
  return ownPulls[0]?.head.ref ?? taskBranch(number);
}

export function isTaskStatus(name) {
  return /^(?:agent|pi):/.test(name ?? '');
}

// The base a continuation keeps when its ref is unchanged: the commit its source
// run recorded in factory-task-N (see continuationBase in handoff-control.mjs).
// Null when nothing usable was recorded, so callers fall back to the live head.
export function recordedContinuationBase(previousTaskFile, ref) {
  if (!previousTaskFile) return null;
  let recorded;
  try {
    recorded = JSON.parse(readFileSync(previousTaskFile, 'utf8'))?.applicationBase;
  } catch {
    return null;
  }
  return recorded?.ref === ref && /^[a-f0-9]{40}$/u.test(recorded.sha ?? '') ? recorded.sha : null;
}

export function taskMarkerNumber(body) {
  const match = body?.match(/<!--\s*(?:agent|pi)-issue:\s*(\d+)\s*-->/i);
  return match ? Number(match[1]) : null;
}

export function stripTaskTitle(title) {
  // Strip only known factory metadata; keep brackets that belong to the business title.
  return title.trim()
    .replace(/^(?:\[(?:(?:Code Agent|Pi)(?:\s+#\d+)?|预置|[FSME]\d{2}|低频综合回归|需 HTTP 验收|需测试模型|需测试渠道)\]\s*)+/i, '')
    .replace(/（重搭 #\d+）$/, '').trim();
}
