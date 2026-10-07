// Explicit failed-run recovery. Only this protocol follows the entry workflow;
// implementation, repair and QA still execute the source task's pinned control.
import { createHash } from 'node:crypto';
import { appendFileSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { controlSha } from './handoff-control.mjs';
import { inputHash, readState } from './pipeline-state.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const positive = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0;
function read(file, max = 1_048_576) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.size > max) throw new Error('Invalid recovery checkpoint file.');
  return readFileSync(file);
}
const json = (file) => JSON.parse(read(file).toString('utf8'));

export function validateRecovery({ event, run, task, checkpointTask, state, patch, legacyBaseSha }) {
  const issue = Number(event.inputs?.issue_number);
  const runId = Number(event.inputs?.recovery_run_id);
  const repository = event.repository?.full_name;
  if (!positive(issue) || !positive(runId) || run?.id !== runId ||
      run.path !== '.github/workflows/code-agent-task.yml' ||
      run.head_repository?.full_name !== repository ||
      !['issues', 'repository_dispatch', 'workflow_dispatch'].includes(run.event) ||
      run.status !== 'completed' || run.conclusion !== 'failure') {
    throw new Error('Recovery requires a completed failed Code Agent task run in this repository.');
  }
  if (task?.schemaVersion !== 1 || task.repository !== repository || task.issue?.number !== issue ||
      task.task?.commentKind === 'reply' || !isDeepStrictEqual(task, checkpointTask)) {
    throw new Error('Recovery checkpoint and source task do not identify the same Issue and input.');
  }
  // The checkpoint belongs to the attempt that recorded it. A later attempt is
  // only a GitHub Re-run, which the agent job rejects before any work
  // (requireFreshRunAttempt), so it leaves that checkpoint intact; accept it
  // when the state's execution identity proves it is the earlier attempt's.
  const sourceAttempt = task.run ? task.run.attempt : 1;
  if (!positive(run.run_attempt) || !positive(sourceAttempt) || (task.run && task.run.id !== runId) ||
      (run.run_attempt !== sourceAttempt &&
        (run.run_attempt < sourceAttempt || state?.executionId !== `${runId}:${sourceAttempt}`))) {
    throw new Error('Recovery artifacts do not belong to the source run attempt.');
  }
  const sha = controlSha(task.controlSha);
  if (state.controlSha !== sha || state.inputHash !== inputHash(task) ||
      !['failed', 'blocked'].includes(state.outcome) || state.stopReason || state.phase === 'done' ||
      state.patchHash !== hash(patch)) {
    throw new Error('Recovery checkpoint has a different factory SHA, input, patch or non-recoverable phase.');
  }
  // Older artifacts did not record the application base. Never guess it from a
  // workflow head_sha: it identifies factory code, not necessarily the app.
  const baseSha = task.applicationBase?.sha || legacyBaseSha?.trim();
  if (!baseSha) throw new Error('Legacy checkpoint: provide recovery_base_sha, the original application base commit.');
  controlSha(baseSha);
  if (legacyBaseSha?.trim() && legacyBaseSha.trim() !== baseSha) throw new Error('Recovery base SHA conflicts with the recorded application base.');
  if (task.applicationBase && ![task.workBranch, task.task.targetBranch].includes(task.applicationBase.ref)) {
    throw new Error('Invalid recorded application base ref.');
  }
  const recovery = { sourceRunId: runId, sourceAttempt, baseSha,
    baseRef: task.applicationBase?.ref, controlSha: sha, inputHash: state.inputHash, patchHash: state.patchHash };
  return {
    recovery,
    event: { ...event, action: 'code-agent-continue', client_payload: {
      issue_number: issue, previous_run_id: runId, continuation: 1, control_sha: sha,
      ...(task.buildCommentId ? { build_comment_id: task.buildCommentId } : {}),
    } },
    handoff: { schemaVersion: 1, issueNumber: issue, previousRunId: runId,
      continuation: 1, controlSha: sha, phase: state.phase, reason: 'failed-run-recovery' },
  };
}

// The per-Issue base receipt prepare-task.mjs pins for a shared target branch
// (pinInitialBase in task-base.mjs; same marker and rules). A recovery
// compares a shared target against it, never against the branch's live head,
// which keeps moving after the failed run.
export const TASK_BASE_MARKER = '<!-- factory-task-base-v1:';
export function pinnedTaskBase(comments, { repository, issue, targetBranch }) {
  let saved = null;
  for (const comment of comments) {
    if (comment.user?.login !== 'github-actions[bot]' || comment.user?.type !== 'Bot') continue;
    if (!(comment.body ?? '').startsWith(TASK_BASE_MARKER)) continue;
    let value;
    try {
      const suffix = comment.body.split(/\r?\n/, 1)[0].slice(TASK_BASE_MARKER.length);
      if (!suffix.endsWith(' -->')) throw new Error('incomplete');
      value = JSON.parse(suffix.slice(0, -4));
    } catch {
      throw new Error('The task base receipt is damaged; recovery will not guess the base.');
    }
    if (!value || value.repository !== repository || value.issueNumber !== issue ||
        value.targetBranch !== targetBranch || !/^[a-f0-9]{40}$/u.test(value.sha) || (saved && saved !== value.sha)) {
      throw new Error('The task base receipts disagree; recovery will not guess the base.');
    }
    saved = value.sha;
  }
  return saved;
}

// The commit a failed run's publication pushed to the work branch
// (publication.json in factory-published-N), when it belongs to that run.
export function publishedWorkCommit(published, { sourceRunId, workBranch }) {
  if (!published || published.version !== 1 || published.sourceRunId !== sourceRunId ||
      published.workBranch !== workBranch || !/^[a-f0-9]{40}$/u.test(published.commit ?? '')) return null;
  return published.commit;
}

// The base a recovery compares with the recorded one. publish-failed pushes the
// failed patch to the work branch before the failure notice offers recovery;
// a work branch still at exactly that commit is unmoved, and the recovery keeps
// the recorded base and replaces that commit (expectedWorkSha is its push
// lease). Any other work-branch head is newer work. Without a work branch, a
// shared target is read from its pinned receipt.
export function liveRecoveryBase({ recovery, source, workSha, targetSha, pinnedSha }) {
  if (workSha) {
    if (recovery.publishedCommit && workSha === recovery.publishedCommit) {
      return { ref: recovery.baseRef ?? source.workBranch, sha: recovery.baseSha, expectedWorkSha: workSha };
    }
    return { ref: source.workBranch, sha: workSha, expectedWorkSha: null };
  }
  return { ref: source.task.targetBranch, sha: pinnedSha ?? targetSha, expectedWorkSha: null };
}

export function validateRecoveryBase(recovery, source, current, baseRef, baseSha) {
  if (current.repository !== source.repository || current.issue?.number !== source.issue.number ||
      current.workBranch !== source.workBranch || current.buildCommentId !== source.buildCommentId ||
      inputHash(current) !== recovery.inputHash ||
      (current.task.discussionContext || '') !== (source.task.discussionContext || '')) {
    throw new Error('Task input changed since the failed run; start a new build instead of recovering stale work.');
  }
  if (baseSha !== recovery.baseSha || (recovery.baseRef && baseRef !== recovery.baseRef)) {
    throw new Error('Application branch moved since the failed run; recovery will not overwrite newer work.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, ...rest] = process.argv.slice(2);
  const args = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!rest[i]?.startsWith('--') || rest[i + 1] === undefined) throw new Error('Invalid recovery arguments.');
    args[rest[i].slice(2)] = rest[i + 1];
  }
  const root = path.resolve(args.checkpoint);
  if (command === 'normalize') {
    const event = json(args.event);
    const id = event.inputs?.recovery_run_id;
    if (!positive(id) || process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch') throw new Error('Recovery must be requested explicitly with workflow_dispatch.');
    const repository = process.env.GITHUB_REPOSITORY;
    if (repository !== event.repository?.full_name) throw new Error('Recovery repository mismatch.');
    const response = await fetch(`${process.env.GITHUB_API_URL || 'https://api.github.com'}/repos/${repository}/actions/runs/${id}`, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.GITHUB_TOKEN}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Cannot validate source run: HTTP ${response.status}`);
    read(path.join(root, 'pipeline-state.json'));
    const state = readState(path.join(root, 'pipeline-state.json'));
    const data = validateRecovery({ event, run: await response.json(), task: json(args.task),
      checkpointTask: json(path.join(root, 'task-metadata.json')), state,
      patch: read(path.join(root, 'agent.patch'), 100 * 1024 * 1024), legacyBaseSha: event.inputs?.recovery_base_sha });
    // Reject an incorrect legacy SHA or a moved branch before prepare can
    // claim a build comment or mark the Issue as running. Check again after
    // prepare to catch a branch/input change during task normalization.
    const source = json(args.task);
    const getRef = async (ref) => {
      const response = await fetch(`${process.env.GITHUB_API_URL || 'https://api.github.com'}/repos/${repository}/git/ref/heads/${encodeURIComponent(ref)}`, {
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.GITHUB_TOKEN}` },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Cannot validate recovery branch: HTTP ${response.status}`);
      return (await response.json()).object?.sha;
    };
    const issueComments = async () => {
      const all = [];
      for (let page = 1; ; page += 1) {
        const response = await fetch(`${process.env.GITHUB_API_URL || 'https://api.github.com'}/repos/${repository}/issues/${source.issue.number}/comments?per_page=100&page=${page}`, {
          headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.GITHUB_TOKEN}` },
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) throw new Error(`Cannot read the task base receipt: HTTP ${response.status}`);
        const batch = await response.json();
        all.push(...batch);
        if (batch.length < 100) return all;
      }
    };
    // The publication record is absent when the failed run pushed nothing.
    let published = null;
    if (args.published) {
      try { published = JSON.parse(read(args.published).toString('utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    data.recovery.publishedCommit = publishedWorkCommit(published, { sourceRunId: data.recovery.sourceRunId, workBranch: source.workBranch });
    const workSha = await getRef(source.workBranch);
    const base = liveRecoveryBase({
      recovery: data.recovery, source, workSha,
      targetSha: workSha ? null : await getRef(source.task.targetBranch),
      pinnedSha: workSha ? null : pinnedTaskBase(await issueComments(), {
        repository, issue: source.issue.number, targetBranch: source.task.targetBranch,
      }),
    });
    validateRecoveryBase(data.recovery, source, source, base.ref, base.sha);
    for (const [name, value] of [['task-event.json', data.event], ['handoff.json', data.handoff], ['recovery.json', data.recovery]]) {
      // Replacing a file from an artifact must not follow a symlink.
      try { read(path.join(root, name)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      writeFileSync(path.join(root, name), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    }
    appendFileSync(args.output, `event_path=${path.join(root, 'task-event.json')}\n`);
  } else if (command === 'check-base') {
    const recovery = json(path.join(root, 'recovery.json'));
    const current = json(args.metadata);
    const source = json(path.join(root, 'task-metadata.json'));
    // prepare-task.mjs resolved the live base: the work branch's head when it
    // exists, otherwise the target (pinned for a shared one). A work branch at
    // the failed run's published commit maps back to the recorded base.
    const onWork = args['base-ref'] === source.workBranch;
    const base = liveRecoveryBase({
      recovery, source,
      workSha: onWork ? args['base-sha'] : null,
      targetSha: onWork ? null : args['base-sha'],
      pinnedSha: null,
    });
    validateRecoveryBase(recovery, source, current, base.ref, base.sha);
    current.recovery = recovery;
    writeFileSync(args.metadata, `${JSON.stringify(current, null, 2)}\n`);
    if (args.output) {
      appendFileSync(args.output, `ref=${base.ref}\nsha=${base.sha}\nexpected_work_sha=${base.expectedWorkSha ?? ''}\n`);
    }
  } else if (command === 'context') {
    const recovery = json(path.join(root, 'recovery.json'));
    if (!positive(recovery.sourceRunId)) throw new Error('Invalid recovery context.');
    // Never copy the full transcript, QA criteria, or previous QA evidence into
    // the implementation prompt. The restored worktree is its source of truth.
    appendFileSync(args.prompt, `\n\n## Restored partial implementation\n\nThis workspace contains the unverified code changes from failed run ${recovery.sourceRunId}. Inspect the existing files and git diff, then continue the original task rather than recreating it. The failure is not a successful delivery. Native agent sessions, databases and browser state were not restored. Do not assume any previous tests passed; the factory will execute its verification gates again.\n`);
  } else if (command === 'continuation-context') {
    // A Handoff continuation resuming in the implementation phase gets the
    // same orientation as a recovery: the restored worktree, not a blank start.
    const previous = Number(args['previous-run']);
    if (!positive(previous)) throw new Error('Invalid continuation context.');
    appendFileSync(args.prompt, `\n\n## Restored partial implementation\n\nThis workspace contains the unverified code changes from run ${previous}, which reached its runner time budget and handed off to this run. Inspect the existing files and git diff, then continue the original task rather than recreating it. Native agent sessions, databases and browser state were not restored. Do not assume any previous tests passed; the factory will execute its verification gates again.\n`);
  } else throw new Error('Usage: handoff-recovery.mjs <normalize|check-base|context|continuation-context> [options]');
}
