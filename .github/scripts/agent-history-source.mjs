// Artifact identity must be bound to the requested job attempt, not just a
// reusable artifact name. download-artifact receives these exact IDs.
export function selectHistorySource(run, jobs, artifacts, repository) {
  if (run.status !== 'completed' || run.path !== '.github/workflows/code-agent-task.yml' ||
      run.head_repository?.full_name !== repository ||
      !['issues', 'repository_dispatch', 'workflow_dispatch'].includes(run.event) ||
      !Number.isSafeInteger(run.id) || run.id < 1 || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1) {
    throw new Error('Not a completed same-repository task attempt');
  }
  const issueIds = [...new Set(artifacts.map(a =>
    /^factory-(?:task|agent|final|handoff)-([1-9]\d*)$/.exec(a.name)?.[1]).filter(Boolean))];
  const fromTitle = /^Factory issue #([1-9]\d*)\b/.exec(run.display_title || '')?.[1];
  if (issueIds.length > 1 || (fromTitle && issueIds.length && fromTitle !== issueIds[0])) {
    throw new Error('Ambiguous task Issue');
  }
  const issue = Number(issueIds[0] || fromTitle);
  if (!Number.isSafeInteger(issue) || issue < 1) return null;
  const active = name => jobs.find(j => j.name === name && j.started_at && j.conclusion !== 'skipped');
  // A rejected/preset Issue did not invoke an Agent; do not create noisy history.
  if (!active('agent') && !active('reply') && !issueIds.length) return null;
  const selections = [];
  for (const [role, jobName, matches] of [
    ['task', 'prepare', name => name === `factory-task-${issue}`],
    ['agent', 'agent', name => name === `factory-agent-${issue}`],
    ['final', 'verify-final', name => name === `factory-final-${issue}`],
    ['reply', 'reply', name => /^factory-comment-reply-[1-9]\d*$/.test(name)],
  ]) {
    const job = active(jobName);
    if (!job) continue;
    const candidates = artifacts.filter(a => matches(a.name) &&
      Date.parse(a.created_at) >= Date.parse(job.started_at) &&
      Date.parse(a.created_at) <= Date.parse(job.completed_at));
    if (candidates.length > 1) throw new Error(`Ambiguous ${role} artifact for attempt ${run.run_attempt}`);
    const artifact = candidates[0];
    if (artifact && (!Number.isSafeInteger(artifact.id) || artifact.id < 1)) throw new Error('Invalid artifact ID');
    selections.push({ role, jobId: job.id, id: artifact?.id ?? null,
      name: artifact?.name ?? null,
      invocationExpected: job.steps?.some(step => ['Run Code Agent implementation', 'Answer source comment from current code'].includes(step.name) && step.started_at && step.conclusion !== 'skipped') ?? false,
      state: !artifact ? 'missing' : artifact.expired ? 'expired' : 'available' });
  }
  return { version: 1, repository, issue, runId: run.id, attempt: run.run_attempt,
    status: active('publish')?.conclusion === 'success' ? 'delivered' : run.conclusion,
    artifacts: selections };
}
