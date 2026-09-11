// Read-only compatibility for tasks created before the Code Agent rename.
// New tasks, labels, titles, PR markers and dispatches use neutral names only.
export function taskIssueNumber(branch) {
  const match = branch?.match(/^(?:agent|pi)\/issue-(\d+)$/);
  const number = Number(match?.[1]);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function taskBranchCandidates(number) {
  return [`agent/issue-${number}`, `pi/issue-${number}`];
}

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
  if (ownPulls[0]) return ownPulls[0].head.ref;
  for (const branch of taskBranchCandidates(number)) {
    if (await client.getRef(branch, true)) return branch;
  }
  return taskBranchCandidates(number)[0];
}

export function isTaskStatus(name) {
  return /^(?:agent|pi):/.test(name ?? '');
}

export const waitingLabels = ['agent:waiting', 'pi:waiting'];

export function taskMarkerNumber(body) {
  const match = body?.match(/<!--\s*(?:agent|pi)-issue:\s*(\d+)\s*-->/i);
  return match ? Number(match[1]) : null;
}

export function stripTaskTitle(title) {
  return title.replace(/^\[(?:Code Agent|Pi)(?:\s+#\d+)?\]\s*/i, '').trim();
}
