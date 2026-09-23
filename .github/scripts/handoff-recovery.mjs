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
  if (!positive(run.run_attempt) || (task.run
      ? task.run.id !== runId || task.run.attempt !== run.run_attempt
      : run.run_attempt !== 1)) {
    throw new Error('Recovery artifacts do not belong to the source run attempt.');
  }
  const sha = controlSha(task.controlSha);
  if (state.controlSha !== sha || state.inputHash !== inputHash(task) ||
      !['failed', 'blocked'].includes(state.outcome) || state.phase === 'done' ||
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
  const recovery = { sourceRunId: runId, sourceAttempt: run.run_attempt, baseSha,
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
    const workSha = await getRef(source.workBranch);
    const baseRef = workSha ? source.workBranch : source.task.targetBranch;
    const baseSha = workSha || await getRef(baseRef);
    validateRecoveryBase(data.recovery, source, source, baseRef, baseSha);
    for (const [name, value] of [['task-event.json', data.event], ['handoff.json', data.handoff], ['recovery.json', data.recovery]]) {
      // Replacing a file from an artifact must not follow a symlink.
      try { read(path.join(root, name)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      writeFileSync(path.join(root, name), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    }
    appendFileSync(args.output, `event_path=${path.join(root, 'task-event.json')}\n`);
  } else if (command === 'check-base') {
    const recovery = json(path.join(root, 'recovery.json'));
    const current = json(args.metadata);
    validateRecoveryBase(recovery, json(path.join(root, 'task-metadata.json')), current, args['base-ref'], args['base-sha']);
    current.recovery = recovery;
    writeFileSync(args.metadata, `${JSON.stringify(current, null, 2)}\n`);
  } else if (command === 'context') {
    const recovery = json(path.join(root, 'recovery.json'));
    if (!positive(recovery.sourceRunId)) throw new Error('Invalid recovery context.');
    // Never copy the full transcript, QA criteria, or previous QA evidence into
    // the implementation prompt. The restored worktree is its source of truth.
    appendFileSync(args.prompt, `\n\n## Restored partial implementation\n\nThis workspace contains the unverified code changes from failed run ${recovery.sourceRunId}. Inspect the existing files and git diff, then continue the original task rather than recreating it. The failure is not a successful delivery. Native agent sessions, databases and browser state were not restored. Do not assume any previous tests passed; the factory will execute its verification gates again.\n`);
  } else throw new Error('Usage: handoff-recovery.mjs <normalize|check-base|context> [options]');
}
