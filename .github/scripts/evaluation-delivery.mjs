// Optional delivery of registered evaluation bundles to one maintainer-configured
// receiver that implements the Evaluation Import v1 protocol. Delivery never
// triggers a build, review or model call, and its failures never change business
// results. Feature point decisions come from the workflow's separate classify job.
// Receipts keep only sanitized metadata (target hash, status, category).
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { idempotencyKey, readZip, verifyBundle } from './evaluation-bundle.mjs';
import { keyDigest } from './evaluation-identity.mjs';
import { commitTree, enqueue, outboxId, readIndex, readOutbox, readRegistryJson, readSubject, recordDeliveries, ROOT } from './evaluation-registry.mjs';
import { assertSchema, loadContract } from './json-schema.mjs';
import { deliveryConfig, DeliveryConfigError } from './evaluation-target.mjs';
import { problemSubmission } from './problem-submission.mjs';
import { classificationsByItem, duplicatesByItem, reportLinkSubmission } from './report-link-submission.mjs';

export { deliveryConfig, DeliveryConfigError, targetIdOf } from './evaluation-target.mjs';

const RETRY = { attempts: 3, timeoutMs: 180_000, maxRetryAfterSeconds: 60, maxTotalAttempts: 24, bundleRetentionDays: 90 };
// A rejected record is resent once by a later scan, at least an hour after the
// rejection, in case the receiver was briefly wrong; then it waits for retry-rejected.
// Only reasons a receiver has been seen to reverse are resent: 400, a 202 still being
// stored, and a 5xx outside the retryable set. Authentication, path, size, data
// (422), redirect and receipt refusals, and retry-limit, need a fix first.
export const AUTO_RETRY = { maxRetries: 1, minDelayMs: 60 * 60_000,
  transientReason: reason => reason === 'bad-request' || reason === 'accepted-not-stored' || /^http-5\d\d$/.test(reason ?? '') };
// The repository and its logs are public: of a refusal body only a short,
// printable error code or message is kept, never the body itself.
const ERROR_BODY_BYTES = 4096;
const ERROR_DETAIL_CHARS = 200;
export const SCAN_LIMIT = 10;
// The send job has 30 minutes; stop taking bundles well before, leaving time to save results.
export const SEND_BUDGET_MS = 20 * 60_000;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const positive = value => Number.isSafeInteger(value) && value > 0;

function retryAfterMs(value, now) {
  if (!value) return null;
  const seconds = /^\d+$/.test(value.trim()) ? Number(value) : (Date.parse(value) - now) / 1000;
  if (!Number.isFinite(seconds)) return null;
  return Math.max(1, Math.min(RETRY.maxRetryAfterSeconds, Math.ceil(seconds))) * 1000;
}

function classifyStatus(status) {
  if (status === 200 || status === 201) return { outcome: 'stored' };
  if (status === 409) return { outcome: 'conflict', error: 'idempotency-conflict' };
  if (status === 429 || status === 408 || [500, 502, 503, 504].includes(status)) return { outcome: 'retryable', error: `http-${status}` };
  if (status >= 300 && status < 400) return { outcome: 'rejected', error: 'redirect-refused' };
  if (status === 202) return { outcome: 'rejected', error: 'accepted-not-stored' };
  const category = { 400: 'bad-request', 401: 'unauthorized', 403: 'forbidden', 404: 'endpoint-not-found', 413: 'payload-too-large', 422: 'unprocessable' }[status];
  return { outcome: 'rejected', error: category ?? `http-${status}` };
}

// Reads at most ERROR_BODY_BYTES of a refusal and keeps its error code and message.
async function refusalDetail(response, token) {
  let text = '';
  try {
    const reader = response.body?.getReader();
    if (reader) {
      const chunks = [];
      let size = 0;
      while (size < ERROR_BODY_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.length;
      }
      await reader.cancel().catch(() => {});
      text = Buffer.concat(chunks).subarray(0, ERROR_BODY_BYTES).toString('utf8');
    }
  } catch { return null; }
  let parts;
  try {
    const value = JSON.parse(text);
    const error = value?.errors?.[0] ?? value?.error ?? value;
    parts = typeof error === 'string' ? [error] : [error?.code ?? value?.code, error?.message ?? value?.message];
  } catch {
    // A plain-text reason is kept; an HTML error page or a JSON body cut off at the limit is not.
    parts = /^\s*[<{[]/.test(text) ? [] : [text];
  }
  const detail = parts.filter(part => typeof part === 'string' || typeof part === 'number').map(String).join(': ')
    .split(token || '\0').join('[redacted]')
    .replace(/[\p{C}\p{Zl}\p{Zp}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  return detail ? detail.slice(0, ERROR_DETAIL_CHARS) : null;
}

function validateReceipt(value, expected) {
  assertSchema(loadContract('evaluation-receipt.v1'), value, 'receiver receipt');
  const key = expected.type === 'evaluation-batch' ? value.batchKey : value.runKey;
  if (value.sourceInstance !== expected.sourceInstance || key !== expected.key || value.revision !== expected.revision ||
      value.bundleSha256 !== expected.bundleSha256 || value.state !== 'stored') throw new Error('Receipt identity or digest differs from the sent bundle');
  return { receiptId: value.receiptId, state: value.state };
}

function multipart(zip, format) {
  const boundary = `nb3-evaluation-${sha256(zip).slice(0, 24)}`;
  if (zip.includes(Buffer.from(boundary))) throw new Error('Bundle collides with its multipart boundary');
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="bundle"; filename="evaluation-bundle.zip"\r\nContent-Type: application/zip\r\n\r\n`);
  let submission = Buffer.alloc(0);
  if (format === 'testmanage3-problems-v1') {
    const document = JSON.parse(readZip(zip).find(file => file.path === 'evaluation.json').data.toString('utf8'));
    const json = JSON.stringify(problemSubmission(document));
    if (Buffer.byteLength(json) > 1024 * 1024) throw new Error('Problem submission exceeds 1 MiB');
    if (json.includes(boundary)) throw new Error('Problem submission collides with its multipart boundary');
    submission = Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="problems"\r\nContent-Type: application/json\r\n\r\n${json}`);
  }
  return { boundary, body: Buffer.concat([head, zip, submission, Buffer.from(`\r\n--${boundary}--\r\n`)]) };
}

// Bounded retry of one bundle: the same bytes and idempotency key on every attempt.
export async function deliverBundle({ zip, subject, config, classification = {}, duplicates = {}, fetcher = fetch, pause = sleep, now = () => Date.now(), attempts = RETRY.attempts, timeoutMs = config.timeoutMs ?? RETRY.timeoutMs }) {
  const bundleSha256 = sha256(zip);
  const expected = { ...subject, bundleSha256 };
  const linked = config.format === 'testmanage3-links-v1';
  const { boundary, body } = linked
    ? { body: Buffer.from(JSON.stringify(reportLinkSubmission(JSON.parse(readZip(zip).find(file => file.path === 'evaluation.json').data.toString('utf8')), classification, duplicates))) }
    : multipart(zip, config.format);
  if (linked && body.length > 4 * 1024 * 1024) throw new Error('Report metadata exceeds 4 MiB');
  const headers = {
    'Content-Type': linked ? 'application/json' : `multipart/form-data; boundary=${boundary}`, Accept: 'application/json', 'User-Agent': 'nb3-factory-evaluation/1',
    'Idempotency-Key': idempotencyKey({ instance: subject.sourceInstance, type: subject.type, key: subject.key, revision: subject.revision }),
    'X-Evaluation-Schema-Version': '1', 'X-Evaluation-Type': subject.type, 'X-Evaluation-Bundle-SHA256': bundleSha256,
    ...(linked ? { 'X-Evaluation-Payload-SHA256': sha256(body) } : {}),
    ...(config.authMode === 'bearer' ? { Authorization: `Bearer ${config.token}` } : { 'x-api-key': config.token }),
  };
  const history = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const started = now();
    let status = null, response = null, error = null;
    try {
      response = await fetcher(config.endpoint, { method: 'POST', headers, body, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
      status = response.status;
    } catch (failure) { error = failure?.name === 'TimeoutError' || failure?.name === 'AbortError' ? 'timeout' : 'network'; }
    const record = { at: new Date(started).toISOString(), httpStatus: status, outcome: 'retryable', error, detail: null, durationMs: Math.max(0, now() - started) };
    history.push(record);
    if (status !== null) {
      const verdict = classifyStatus(status);
      Object.assign(record, verdict, { error: verdict.error ?? null });
      if (verdict.outcome === 'stored') {
        let text = null;
        // A body cut off by a disconnect or timeout is a transport failure: resend
        // with the same idempotency key to confirm. Only a complete body is judged.
        try { text = await response.text(); }
        catch (failure) { Object.assign(record, { outcome: 'retryable', error: failure?.name === 'TimeoutError' || failure?.name === 'AbortError' ? 'receipt-timeout' : 'receipt-interrupted' }); }
        if (text !== null) {
          try {
            const receipt = validateReceipt(JSON.parse(text), expected);
            return { state: 'stored', attempts: history, receipt: { ...receipt, httpStatus: status }, reason: null, bundleSha256 };
          } catch { Object.assign(record, { outcome: 'rejected', error: 'invalid-receipt' }); }
        }
      } else record.detail = await refusalDetail(response, config.token);
      if (record.outcome === 'conflict') return { state: 'conflict', attempts: history, receipt: null, reason: 'same idempotency key already holds different content', detail: record.detail, bundleSha256 };
      if (record.outcome === 'rejected') return { state: 'rejected', attempts: history, receipt: null, reason: record.error, detail: record.detail, bundleSha256 };
    }
    if (attempt < attempts) await pause(retryAfterMs(response?.headers?.get('retry-after'), now()) ?? 2000 * 4 ** (attempt - 1));
  }
  return { state: 'pending', attempts: history, receipt: null, reason: history.at(-1).error, detail: history.at(-1).detail, bundleSha256 };
}

class SourceUnavailable extends Error {}
// Transient GitHub/API/network conditions are retried later; they never mean "expired".
const transient = error => error instanceof SourceUnavailable || ['TypeError', 'TimeoutError', 'AbortError'].includes(error?.name) ||
  /\((?:408|429|5\d\d)\)/.test(error?.message ?? '');

async function artifactZip(client, id, fetcher = fetch) {
  const response = await fetcher(`${client.apiUrl}/repos/${client.repository}/actions/artifacts/${id}/zip`, {
    headers: { Authorization: `Bearer ${client.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    redirect: 'manual', signal: AbortSignal.timeout(60_000),
  });
  // Follow GitHub's signed storage redirect without forwarding the repository token.
  const location = response.status >= 300 && response.status < 400 ? response.headers.get('location') : null;
  const final = location ? await fetcher(location, { redirect: 'error', signal: AbortSignal.timeout(120_000) }) : response;
  if ([404, 410].includes(final.status)) return null;
  if (!final.ok) throw new SourceUnavailable(`Artifact download failed (${final.status})`);
  return Buffer.from(await final.arrayBuffer());
}

// Find the registered bundle in a retained artifact and verify it byte-for-byte.
// status: available | missing (gone/expired) | invalid (bytes differ) | unavailable (try again later)
async function fetchBundle(client, entry, { preferredArtifactId = null, fetcher } = {}) {
  const locations = [...entry.bundle.locations].reverse();
  const tried = [];
  let unavailable = false, invalid = false;
  const candidates = [];
  if (positive(preferredArtifactId)) candidates.push({ artifactId: preferredArtifactId });
  candidates.push(...locations);
  for (const location of candidates) {
    try {
      let artifact;
      if (positive(location.artifactId)) artifact = await client.request('GET', `/actions/artifacts/${location.artifactId}`, { allow404: true });
      else {
        const listed = await client.request('GET', `/actions/runs/${location.runId}/artifacts`, { query: { name: location.artifactName, per_page: 100 } });
        artifact = listed?.artifacts?.filter(item => !item.expired).at(-1);
      }
      if (!artifact || artifact.expired) { tried.push('expired-or-missing'); continue; }
      if (location.artifactName && artifact.name !== location.artifactName) { tried.push('name-mismatch'); continue; }
      if (location.runId && artifact.workflow_run?.id !== location.runId) { tried.push('run-mismatch'); continue; }
      const archive = await artifactZip(client, artifact.id, fetcher);
      if (!archive) { tried.push('expired-or-missing'); continue; }
      let inner;
      try {
        inner = readZip(archive, { allowDeflate: true, maxZip: 70 * 1024 * 1024 }).find(item => item.path === 'evaluation-bundle.zip');
        if (!inner) throw new Error('bundle missing from artifact');
        verifyBundle(inner.data, { sha256: entry.bundle.sha256 });
      } catch (error) { invalid = true; tried.push(`integrity: ${error.message.slice(0, 100)}`); continue; }
      return { zip: inner.data, artifactId: artifact.id, status: 'available' };
    } catch (error) {
      if (!transient(error)) throw error;
      unavailable = true;
      tried.push(`unavailable: ${error.message.slice(0, 100)}`);
    }
  }
  const detail = tried.join('; ') || '无保存位置';
  if (unavailable) return { zip: null, status: 'unavailable', reason: `原始结果包暂时无法读取（${detail}）；保持待投递，稍后重试。` };
  return { zip: null, status: invalid ? 'invalid' : 'missing',
    reason: `${invalid ? '保存的结果包与登记摘要不符' : '原始结果包已过期或不存在'}（${detail}）；不重新运行应用或模型补造历史。` };
}

export async function planDeliveries(client, { mode, type, key, revision, artifactId, env, now = new Date(), fetcher, limit = SCAN_LIMIT }) {
  const config = deliveryConfig(env, { requireToken: false });
  const items = [];
  const { outbox } = await readOutbox(client);
  const pick = async (itemType, itemKey, itemRevision, preferred, autoRetry = false) => {
    const index = await readSubject(client, itemType, itemKey, 'gh-pages');
    const entry = index?.revisions.find(item => item.revision === itemRevision);
    if (!entry) throw new Error(`No registered ${itemType} revision ${itemRevision} for ${itemKey}`);
    const id = outboxId({ targetId: config.targetId, type: itemType, key: itemKey, revision: itemRevision });
    const queued = outbox.entries.find(item => item.id === id);
    // Automatic runs never resend a stored revision; an explicit replay may.
    if (queued?.state === 'stored' && mode !== 'replay') return;
    const age = now.getTime() - Date.parse(entry.createdAt);
    const found = age > RETRY.bundleRetentionDays * 86400_000 && !preferred ? { zip: null, status: 'missing', reason: '超过结果包保留期限。' }
      : await fetchBundle(client, entry, { preferredArtifactId: preferred, fetcher });
    items.push({ id, targetId: config.targetId, type: itemType, key: itemKey, revision: itemRevision, sourceInstance: index.sourceInstance,
      bundleSha256: entry.bundle.sha256, zip: found.zip, source: found.status, reason: found.reason ?? null,
      previousAttempts: queued?.attempts ?? 0, ...(autoRetry ? { autoRetry: true } : {}) });
  };
  const ours = outbox.entries.filter(item => item.targetId === config.targetId);
  if (mode === 'replay') await pick(type, key, Number(revision), Number(artifactId) || null);
  else if (mode === 'scan') {
    // Pending records first; the automatic retry of a rejection is recorded, so it happens at most maxRetries times.
    const retryable = ours.filter(item => item.state === 'rejected' && (item.autoRetries ?? 0) < AUTO_RETRY.maxRetries &&
      AUTO_RETRY.transientReason(item.reason) && now.getTime() - Date.parse(item.updatedAt) >= AUTO_RETRY.minDelayMs);
    const selected = [...ours.filter(item => item.state === 'pending').map(entry => [entry, false]), ...retryable.map(entry => [entry, true])];
    for (const [entry, autoRetry] of selected.slice(0, limit)) await pick(entry.type, entry.key, entry.revision, null, autoRetry);
  } else if (mode === 'retry-rejected') {
    for (const entry of ours.filter(item => item.state === 'rejected').slice(0, limit)) await pick(entry.type, entry.key, entry.revision, null);
  } else throw new Error('Delivery mode must be replay, scan or retry-rejected');
  return { targetId: config.targetId, items };
}

// Worst case for one bundle: every attempt times out and waits the longest Retry-After.
export const ITEM_WORST_CASE_MS = RETRY.attempts * RETRY.timeoutMs + (RETRY.attempts - 1) * RETRY.maxRetryAfterSeconds * 1000;

// Stops taking new bundles before the deadline, so results are always saved; untaken
// items simply stay pending. onResult persists each result as soon as it exists.
export async function sendDeliveries(plan, { env, fetcher, pause, allowInsecureLoopback = false, deadline = Infinity, now = () => Date.now(), onResult = () => {}, classifications = new Map(), duplicates = new Map() }) {
  const results = [];
  const record = result => { results.push(result); onResult(result, results); };
  const at = () => new Date(now()).toISOString();
  let config;
  try { config = deliveryConfig(env, { allowInsecureLoopback }); }
  catch (error) {
    if (!(error instanceof DeliveryConfigError)) throw error;
    for (const item of plan.items) record({ ...strip(item), state: 'pending', reason: 'config-error',
      attempts: [{ at: at(), httpStatus: null, outcome: 'config-error', error: 'config', durationMs: 0 }], receipt: null });
    return { configError: error.message, results, deferred: 0 };
  }
  if (config.targetId !== plan.targetId) throw new Error('Delivery target changed between planning and sending');
  let deferred = 0;
  for (const item of plan.items) {
    if (item.source === 'unavailable') {
      record({ ...strip(item), state: 'pending', attempts: [{ at: at(), httpStatus: null, outcome: 'source-unavailable', error: 'source-unavailable', durationMs: 0 }],
        receipt: null, reason: item.reason });
      continue;
    }
    if (!item.zip) {
      record({ ...strip(item), state: item.source === 'invalid' ? 'source-invalid' : 'source-expired', attempts: [{ at: at(), httpStatus: null,
        outcome: 'source-expired', error: item.source === 'invalid' ? 'source-invalid' : 'source-expired', durationMs: 0 }], receipt: null, reason: item.reason });
      continue;
    }
    const worstCaseMs = RETRY.attempts * config.timeoutMs + (RETRY.attempts - 1) * RETRY.maxRetryAfterSeconds * 1000;
    if (now() + worstCaseMs > deadline) { deferred++; continue; }
    const outcome = await deliverBundle({ zip: item.zip, subject: { type: item.type, key: item.key, revision: item.revision, sourceInstance: item.sourceInstance },
      config, classification: classifications.get(item.id) ?? {}, duplicates: duplicates.get(item.id) ?? {}, fetcher, pause, now });
    if (outcome.bundleSha256 !== item.bundleSha256) throw new Error('Bundle changed after verification');
    const exhausted = outcome.state === 'pending' && item.previousAttempts + outcome.attempts.length >= RETRY.maxTotalAttempts;
    record({ ...strip(item), ...outcome, ...(exhausted ? { state: 'rejected', reason: 'retry-limit' } : {}) });
  }
  return { configError: null, results, deferred };
}
const strip = ({ zip, source, previousAttempts, sourceInstance, ...item }) => item;

// Late receiver deployment: queue every current revision, batches before samples.
async function enqueueBackfill(client, env, { limit = 500, now = new Date() } = {}) {
  const config = deliveryConfig(env, { requireToken: false });
  return commitTree(client, 'evaluation: enqueue delivery backfill', async ref => {
    const { index } = await readIndex(client);
    const outbox = (ref ? await readRegistryJson(client, `${ROOT}/outbox.json`, ref) : null) ?? { version: 1, entries: [] };
    const subjects = Object.values(index.subjects).filter(item => positive(item.current))
      .sort((a, b) => (a.type === b.type ? 0 : a.type === 'evaluation-batch' ? -1 : 1)).slice(0, limit);
    let added = 0;
    for (const subject of subjects) {
      const entry = (await readSubject(client, subject.type, subject.key, ref))?.revisions.find(item => item.revision === subject.current);
      if (entry && enqueue(outbox, { targetId: config.targetId, type: subject.type, key: subject.key, revision: entry.revision, bundleSha256: entry.bundle.sha256 }, now)) added++;
    }
    return { added, files: added ? [[`${ROOT}/outbox.json`, `${JSON.stringify(outbox, null, 2)}\n`]] : [] };
  });
}

function summary(results, configError) {
  const note = r => [r.reason, r.detail].filter(Boolean).join(': ').replace(/[|`\\]/g, ' ') || r.receipt?.receiptId || '';
  const rows = results.map(r => `| ${r.type} | \`${keyDigest(r.key).slice(0, 12)}\` r${r.revision} | ${r.state}${r.autoRetry ? '（自动重试）' : ''} | ${r.attempts.length} | ${note(r)} |`);
  return ['## 评测结果投递', '', configError ? `**投递配置不完整：${configError}**。业务结果与报告归档不受影响。` : '投递状态单独记录，不改变业务验收或 PR 状态。', '',
    '| 类型 | 主体 | 状态 | 本次尝试 | 说明 / 回执 |', '| --- | --- | --- | ---: | --- |', ...rows, ''].join('\n');
}

async function main() {
  const [mode, ...argv] = process.argv.slice(2);
  if (argv.length % 2) throw new Error('Expected --name value arguments');
  const args = Object.fromEntries(Array.from({ length: argv.length / 2 }, (_, i) => [argv[i * 2].replace(/^--/, ''), argv[i * 2 + 1]]));
  const output = (name, value) => process.env.GITHUB_OUTPUT && appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  const { GitHubClient } = await import('./factory-lib.mjs');
  const client = () => new GitHubClient({ token: process.env.GITHUB_TOKEN, repository: process.env.GITHUB_REPOSITORY, apiUrl: process.env.GITHUB_API_URL });
  if (mode === 'plan') {
    const plan = await planDeliveries(client(), { mode: args.mode, type: args.type, key: args.key, revision: args.revision,
      artifactId: args['artifact-id'], env: process.env });
    mkdirSync(path.join(args.output, 'bundles'), { recursive: true });
    const items = plan.items.map((item, index) => {
      if (item.zip) writeFileSync(path.join(args.output, 'bundles', `${index}.zip`), item.zip);
      const { zip, ...rest } = item;
      return { ...rest, bundle: zip ? `bundles/${index}.zip` : null };
    });
    writeFileSync(path.join(args.output, 'plan.json'), `${JSON.stringify({ version: 1, targetId: plan.targetId, items }, null, 2)}\n`);
    output('count', items.length);
    console.log(`Planned ${items.length} delivery item(s) for target ${plan.targetId}.`);
  } else if (mode === 'send') {
    const plan = JSON.parse(readFileSync(path.join(args.plan, 'plan.json'), 'utf8'));
    if (plan.version !== 1 || !Array.isArray(plan.items)) throw new Error('Invalid delivery plan');
    plan.items = plan.items.map(item => {
      if (!item.bundle) return { ...item, zip: null };
      if (!/^bundles\/\d+\.zip$/.test(item.bundle)) throw new Error('Invalid bundle path in plan');
      return { ...item, zip: readFileSync(path.join(args.plan, item.bundle)) };
    });
    mkdirSync(path.dirname(args.output), { recursive: true });
    const save = results => writeFileSync(args.output, `${JSON.stringify({ version: 1, targetId: plan.targetId, results }, null, 2)}\n`);
    save([]);
    // Classification is optional: without a valid file problems are sent unclassified, as before.
    // Duplicate judgements live in the same file; without valid ones problems are collected as new.
    let classifications = new Map(), duplicates = new Map();
    if (args.classification && existsSync(args.classification)) {
      let file = null;
      try { file = JSON.parse(readFileSync(args.classification, 'utf8')); }
      catch (error) { console.log(`::warning::Problem classification ignored: ${error.message}`); }
      if (file) try { classifications = classificationsByItem(file); }
      catch (error) { console.log(`::warning::Problem classification ignored: ${error.message}`); }
      if (file) try { duplicates = duplicatesByItem(file); }
      catch (error) { console.log(`::warning::Problem duplicate judgements ignored: ${error.message}`); }
    }
    const { configError, results, deferred } = await sendDeliveries(plan, { env: process.env, deadline: Date.now() + SEND_BUDGET_MS,
      onResult: (_result, all) => save(all), classifications, duplicates });
    if (deferred) console.log(`${deferred} bundle(s) left pending for the next scan to stay within the job budget.`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary(results, configError));
    for (const result of results) console.log(`${result.type} ${keyDigest(result.key).slice(0, 12)} r${result.revision}: ${result.state} (${result.reason ?? 'ok'}${result.detail ? `: ${result.detail}` : ''})${result.autoRetry ? ' [automatic retry]' : ''}`);
    if (configError) { console.error(`::error::Evaluation delivery is enabled but not configured: ${configError}`); process.exitCode = 1; }
    else if (results.some(r => r.state !== 'stored')) process.exitCode = 1;
  } else if (mode === 'record') {
    const data = JSON.parse(readFileSync(args.results, 'utf8'));
    if (data.version !== 1 || !Array.isArray(data.results)) throw new Error('Invalid delivery results');
    const recorded = await recordDeliveries(client(), data.results);
    console.log(`Recorded ${data.results.length} delivery result(s); registry commit ${recorded.commitSha}.`);
  } else if (mode === 'backfill') {
    const result = await enqueueBackfill(client(), process.env);
    console.log(`Queued ${result.added ?? 0} current revision(s) for delivery.`);
  } else throw new Error('Usage: evaluation-delivery.mjs <plan|send|record|backfill> ...');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
