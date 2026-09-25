// Stable logical-run identity for exported evaluations. A run key names one
// independent build sample (or one incremental /build task), never a workflow
// Run: handoffs, recoveries and re-run attempts stay executions of the same key.
import { createHash } from 'node:crypto';

const IDENTITY_VERSION = 1;
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
export const segmentPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const keyPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,299}$/;
const positive = value => Number.isSafeInteger(value) && value > 0;

export function isRunKey(value) {
  return typeof value === 'string' && keyPattern.test(value) &&
    !value.split('/').some(part => !part || part === '.' || part === '..');
}

export function sampleKey(batchKey, caseKey, sampleIndex) {
  if (!segmentPattern.test(batchKey ?? '') || !segmentPattern.test(caseKey ?? '') || !positive(sampleIndex))
    throw new Error('Invalid evaluation sample identity');
  return `${batchKey}/${caseKey}/${sampleIndex}`;
}

// The receiver never needs the factory's workflow Run IDs to identify a sample.
export function taskEvaluationIdentity({ repository, issueNumber, buildCommentId = null, sample = null }) {
  if (!repositoryPattern.test(repository ?? '') || !positive(issueNumber)) throw new Error('Invalid task identity');
  if (buildCommentId !== null && !positive(Number(buildCommentId))) throw new Error('Invalid build comment identity');
  if (buildCommentId !== null) {
    // An incremental request reuses the application; it is never a from-scratch sample.
    return { version: IDENTITY_VERSION, runKey: `${repository}/issues/${issueNumber}/build/${Number(buildCommentId)}`,
      kind: 'incremental', buildCommentId: Number(buildCommentId) };
  }
  if (sample) {
    const key = sampleKey(sample.batchKey, sample.caseKey, sample.sampleIndex);
    return { version: IDENTITY_VERSION, runKey: `${repository}/batches/${key}`, kind: 'batch-sample',
      batchKey: sample.batchKey, caseKey: sample.caseKey, sampleIndex: sample.sampleIndex, sampleKey: key };
  }
  return { version: IDENTITY_VERSION, runKey: `${repository}/issues/${issueNumber}/initial`, kind: 'initial' };
}

// Validates the recorded identity against the metadata it was written into.
// Older tasks have no recorded identity; derive only what their own verified
// metadata proves (repository, Issue, build comment) and say so.
export function resolveTaskIdentity(metadata) {
  const repository = metadata?.repository;
  const issueNumber = metadata?.issue?.number;
  const buildCommentId = metadata?.buildCommentId == null ? null : Number(metadata.buildCommentId);
  const recorded = metadata?.evaluation;
  if (recorded !== undefined) {
    const sample = recorded?.kind === 'batch-sample'
      ? { batchKey: recorded.batchKey, caseKey: recorded.caseKey, sampleIndex: recorded.sampleIndex } : null;
    let expected;
    try { expected = taskEvaluationIdentity({ repository, issueNumber, buildCommentId, sample }); }
    catch { throw new Error('Recorded evaluation identity does not match its task'); }
    if (recorded?.version !== IDENTITY_VERSION || recorded.runKey !== expected.runKey || recorded.kind !== expected.kind)
      throw new Error('Recorded evaluation identity does not match its task');
    return { ...recorded, derivation: 'recorded' };
  }
  return { ...taskEvaluationIdentity({ repository, issueNumber, buildCommentId }), derivation: 'legacy-derived' };
}

export const keyDigest = key => createHash('sha256').update(String(key)).digest('hex').slice(0, 32);
