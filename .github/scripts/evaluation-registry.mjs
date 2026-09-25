// Revision registry for evaluation documents, kept under evaluations/ on the
// existing gh-pages archive branch with the same optimistic (non-forced) ref
// updates as report-pages.mjs. It stores sanitized metadata and each revision's
// original evaluation.json / manifest.json bytes; bundles live in Artifacts.
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { keyDigest } from './evaluation-identity.mjs';
import { comparePrecedence, documentKeyOf } from './evaluation-report.mjs';

export const BRANCH = 'gh-pages';
export const ROOT = 'evaluations';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const positive = value => Number.isSafeInteger(value) && value > 0;
export const subjectDir = key => `${ROOT}/subjects/${keyDigest(key)}`;
export const revisionDir = (key, revision) => `${subjectDir(key)}/r${revision}`;
const conflict = error => /\b(409|422)\b/.test(error?.message ?? '');

export async function readBytes(client, file, ref) {
  const value = await client.request('GET', `/contents/${file}`, { query: { ref }, allow404: true });
  if (!value) return null;
  if (value.type && value.type !== 'file') throw new Error(`Registry path is not a file: ${file}`);
  // The contents API omits content above 1 MiB; the blob API returns it intact.
  if (value.encoding === 'base64' && value.content) return Buffer.from(value.content, 'base64');
  const blob = await client.request('GET', `/git/blobs/${value.sha}`);
  if (blob?.encoding !== 'base64') throw new Error(`Cannot read registry blob ${file}`);
  return Buffer.from(blob.content, 'base64');
}
async function readJson(client, file, ref) {
  const bytes = await readBytes(client, file, ref);
  return bytes ? JSON.parse(bytes.toString('utf8')) : null;
}

function validSubject(index, type, key) {
  return index?.version === 1 && index.type === type && index.key === key && Array.isArray(index.revisions) &&
    index.revisions.every((item, i) => item.revision === i + 1 && /^[a-f0-9]{64}$/.test(item.fingerprint) &&
      /^[a-f0-9]{64}$/.test(item.bundle?.sha256 ?? '') && Array.isArray(item.bundle.locations));
}
export async function readSubject(client, type, key, ref) {
  const index = await readJson(client, `${subjectDir(key)}/index.json`, ref);
  if (index && !validSubject(index, type, key)) throw new Error('Invalid evaluation subject registry; refusing to overwrite');
  return index;
}

export function currentRevision(type, revisions) {
  if (!revisions.length) return null;
  const better = (a, b) => {
    const order = type === 'evaluation-report' ? comparePrecedence({ precedence: a.precedence }, { precedence: b.precedence })
      : (a.precedence?.sequence ?? 0) - (b.precedence?.sequence ?? 0);
    return order > 0 || (order === 0 && a.revision > b.revision);
  };
  return revisions.reduce((best, item) => (better(item, best) ? item : best)).revision;
}

async function ensureBase(client) {
  const ref = await client.getRef(BRANCH, true);
  const sha = ref?.object?.sha ?? null;
  const commit = sha ? await client.request('GET', `/git/commits/${sha}`) : null;
  return { sha, commit };
}
async function blob(client, data) {
  const created = await client.request('POST', '/git/blobs', { body: { content: Buffer.from(data).toString('base64'), encoding: 'base64' } });
  return created.sha;
}

// One optimistic commit; retried from a fresh read when another archive moved the branch.
export async function commitTree(client, message, build, { attempts = 5, pause = sleep } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const { sha, commit } = await ensureBase(client);
    const result = await build(sha);
    if (!result?.files?.length) return { commitSha: sha, ...result, changed: false };
    const tree = [];
    for (const [file, data] of result.files) tree.push({ path: file, mode: '100644', type: 'blob', sha: await blob(client, data) });
    if (!sha) {
      // First archive write: keep the site root the same as report-pages.mjs creates it.
      tree.push({ path: '.nojekyll', mode: '100644', type: 'blob', sha: await blob(client, '') });
      tree.push({ path: 'index.html', mode: '100644', type: 'blob', sha: await blob(client,
        '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=./reports/"><title>交付报告</title><a href="./reports/">打开交付报告</a></html>') });
    }
    const newTree = await client.request('POST', '/git/trees', { body: { ...(commit ? { base_tree: commit.tree.sha } : {}), tree } });
    if (commit?.tree.sha === newTree.sha) return { commitSha: sha, ...result, changed: false };
    const created = await client.request('POST', '/git/commits', { body: { message, tree: newTree.sha, parents: sha ? [sha] : [] } });
    try {
      if (sha) await client.request('PATCH', `/git/refs/heads/${BRANCH}`, { body: { sha: created.sha, force: false } });
      else await client.createRef(BRANCH, created.sha);
      return { commitSha: created.sha, ...result, changed: true };
    } catch (error) {
      if (attempt === attempts - 1 || !conflict(error)) throw error;
      await pause(250 * (attempt + 1));
    }
  }
  throw new Error('Could not update the evaluation registry');
}

// Read-only planning: reuse the revision of identical logical content, otherwise
// propose the next number. commitRevision re-checks it under CAS.
export async function planRevision(client, { type, key, fingerprint }) {
  const { sha } = await ensureBase(client);
  const index = sha ? await readSubject(client, type, key, sha) : null;
  const existing = index?.revisions.find(item => item.fingerprint === fingerprint);
  if (existing) {
    const dir = revisionDir(key, existing.revision);
    const evaluationBytes = await readBytes(client, `${dir}/evaluation.json`, sha);
    const manifestBytes = await readBytes(client, `${dir}/manifest.json`, sha);
    if (!evaluationBytes || sha256(evaluationBytes) !== existing.evaluationSha256 || !manifestBytes)
      throw new Error('Registered revision bytes are missing or altered; refusing to regenerate history');
    return { reused: true, revision: existing.revision, createdAt: existing.createdAt, entry: existing, evaluationBytes, manifestBytes };
  }
  return { reused: false, revision: (index?.revisions.length ?? 0) + 1 };
}

const summaryOf = document => document.type === 'evaluation-report'
  ? { execution: document.outcome.execution, acceptance: document.outcome.acceptance, delivery: document.outcome.delivery,
    reviewState: document.precedence.reviewState, reviewRubric: document.precedence.reviewRubric }
  : { state: document.state, samples: document.summary.planned };

export async function commitRevision(client, { document, evaluationBytes, manifestBytes, fingerprint, bundle, location, outbox = null, now = new Date() }) {
  const { type } = document;
  const key = documentKeyOf(document);
  const dir = revisionDir(key, document.revision);
  return commitTree(client, `evaluation: ${type} ${keyDigest(key)} r${document.revision}`, async ref => {
    const index = (ref ? await readSubject(client, type, key, ref) : null) ??
      { version: 1, type, key, sourceInstance: document.source.instance, current: null, revisions: [] };
    const existing = index.revisions.find(item => item.fingerprint === fingerprint);
    if (existing && existing.revision !== document.revision) throw new Error('Identical content was registered under another revision; rerun to reuse it');
    const taken = index.revisions.find(item => item.revision === document.revision);
    if (taken && taken.fingerprint !== fingerprint) throw new Error(`Revision ${document.revision} already holds different content; rerun to allocate a new revision`);
    if (!taken && document.revision !== index.revisions.length + 1) throw new Error('Revision numbers must be allocated contiguously');
    const files = [];
    let entry = taken, changed = false;
    if (!entry) {
      changed = true;
      entry = { revision: document.revision, fingerprint, createdAt: document.createdAt, evaluationSha256: sha256(evaluationBytes),
        manifestSha256: sha256(manifestBytes), bundle: { sha256: bundle.sha256, size: bundle.size, locations: [] },
        precedence: document.type === 'evaluation-report' ? document.precedence : { sequence: document.batch.sequence }, summary: summaryOf(document) };
      index.revisions.push(entry);
      files.push([`${dir}/evaluation.json`, evaluationBytes], [`${dir}/manifest.json`, manifestBytes]);
    } else if (entry.bundle.sha256 !== bundle.sha256) {
      // Never attach a different bundle to a registered revision.
      location = null;
    }
    if (location && !entry.bundle.locations.some(item => item.runId === location.runId && item.attempt === location.attempt && item.artifactName === location.artifactName)) {
      entry.bundle.locations.push(location);
      changed = true;
    }
    index.current = currentRevision(type, index.revisions);
    const global = (ref ? await readJson(client, `${ROOT}/index.json`, ref) : null) ?? { version: 1, subjects: {} };
    if (global.version !== 1 || typeof global.subjects !== 'object') throw new Error('Invalid evaluation index; refusing to overwrite');
    global.subjects[keyDigest(key)] = { type, key, latest: index.revisions.length, current: index.current, updatedAt: now.toISOString() };
    let pendingOutbox = null;
    if (outbox) {
      pendingOutbox = (ref ? await readJson(client, `${ROOT}/outbox.json`, ref) : null) ?? { version: 1, entries: [] };
      if (enqueue(pendingOutbox, { ...outbox, type, key, revision: document.revision, bundleSha256: entry.bundle.sha256 }, now)) {
        files.push([`${ROOT}/outbox.json`, `${JSON.stringify(pendingOutbox, null, 2)}\n`]);
        changed = true;
      }
    }
    if (!changed) return { files: [], entry, current: index.current };
    files.push([`${subjectDir(key)}/index.json`, `${JSON.stringify(index, null, 2)}\n`], [`${ROOT}/index.json`, `${JSON.stringify(global, null, 2)}\n`]);
    return { files, entry, current: index.current };
  });
}

export const outboxId = ({ targetId, key, revision, type }) => `${targetId}:${type === 'evaluation-batch' ? 'b' : 'r'}:${keyDigest(key)}:${revision}`;
const terminal = new Set(['stored', 'conflict', 'rejected', 'source-expired', 'source-invalid']);
export function enqueue(outbox, { targetId, type, key, revision, bundleSha256 }, now = new Date()) {
  if (outbox.version !== 1 || !Array.isArray(outbox.entries)) throw new Error('Invalid delivery outbox; refusing to overwrite');
  if (!/^[a-f0-9]{16}$/.test(targetId ?? '') || !positive(revision)) throw new Error('Invalid delivery target or revision');
  const id = outboxId({ targetId, key, revision, type });
  if (outbox.entries.some(entry => entry.id === id)) return false;
  outbox.entries.push({ id, targetId, type, key, revision, bundleSha256, state: 'pending', attempts: 0, history: [], receipt: null,
    reason: null, createdAt: now.toISOString(), updatedAt: now.toISOString() });
  const cutoff = now.getTime() - 180 * 86400_000;
  outbox.entries = outbox.entries.filter(entry => !terminal.has(entry.state) || Date.parse(entry.updatedAt) >= cutoff).slice(-5000);
  return true;
}

// Delivery results are applied under CAS; "sending" is never recorded as success.
export async function recordDeliveries(client, results, now = new Date()) {
  return commitTree(client, `evaluation: delivery receipts (${results.length})`, async ref => {
    const outbox = (ref ? await readJson(client, `${ROOT}/outbox.json`, ref) : null) ?? { version: 1, entries: [] };
    if (outbox.version !== 1 || !Array.isArray(outbox.entries)) throw new Error('Invalid delivery outbox; refusing to overwrite');
    let changed = false;
    for (const result of results) {
      if (result.id !== outboxId(result)) throw new Error('Delivery result identity does not match its target and revision');
      let entry = outbox.entries.find(item => item.id === result.id);
      if (!entry) {
        enqueue(outbox, result, now);
        entry = outbox.entries.find(item => item.id === result.id);
      }
      if (entry.bundleSha256 !== result.bundleSha256) throw new Error('Delivery result bundle differs from the registered revision');
      if (entry.state === 'stored' && result.state !== 'stored') continue; // A stored receipt is final.
      entry.state = result.state;
      // Configuration errors and expired sources are not receiver attempts.
      entry.attempts += result.attempts.filter(item => !['config-error', 'source-expired', 'source-unavailable'].includes(item.outcome)).length;
      entry.history = [...entry.history, ...result.attempts].slice(-10);
      entry.receipt = result.receipt ?? entry.receipt;
      entry.reason = result.reason ?? null;
      entry.updatedAt = now.toISOString();
      changed = true;
    }
    return changed ? { files: [[`${ROOT}/outbox.json`, `${JSON.stringify(outbox, null, 2)}\n`]] } : { files: [] };
  });
}

export async function readOutbox(client) {
  const { sha } = await ensureBase(client);
  const outbox = sha ? await readJson(client, `${ROOT}/outbox.json`, sha) : null;
  if (outbox && (outbox.version !== 1 || !Array.isArray(outbox.entries))) throw new Error('Invalid delivery outbox');
  return { ref: sha, outbox: outbox ?? { version: 1, entries: [] } };
}
export async function readIndex(client) {
  const { sha } = await ensureBase(client);
  const index = sha ? await readJson(client, `${ROOT}/index.json`, sha) : null;
  return { ref: sha, index: index ?? { version: 1, subjects: {} } };
}
export { readJson as readRegistryJson };
