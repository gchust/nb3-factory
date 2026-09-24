// Optional delivery of registered evaluation bundles to one maintainer-configured
// receiver that implements the Evaluation Import v1 protocol. Delivery never
// triggers a build, review or model call, and its failures never change business
// results. Receipts keep only sanitized metadata (target hash, status, category).
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { idempotencyKey, readZip, verifyBundle } from './evaluation-bundle.mjs';
import { keyDigest } from './evaluation-identity.mjs';
import { commitTree, enqueue, outboxId, readIndex, readOutbox, readRegistryJson, readSubject, recordDeliveries, revisionDir, ROOT, subjectDir } from './evaluation-registry.mjs';
import { assertSchema, loadContract } from './json-schema.mjs';
import { deliveryConfig, DeliveryConfigError } from './evaluation-target.mjs';

export { AUTH_MODES, deliveryConfig, DeliveryConfigError, targetIdOf } from './evaluation-target.mjs';

export const RETRY = { attempts: 3, timeoutMs: 30_000, maxRetryAfterSeconds: 60, maxTotalAttempts: 24, bundleRetentionDays: 90 };
const sha256 = value => createHash('sha256').update(value).digest('hex');
const positive = value => Number.isSafeInteger(value) && value > 0;

function retryAfterMs(value, now) {
  if (!value) return null;
  const seconds = /^\d+$/.test(value.trim()) ? Number(value) : (Date.parse(value) - now) / 1000;
  if (!Number.isFinite(seconds)) return null;
  return Math.max(1, Math.min(RETRY.maxRetryAfterSeconds, Math.ceil(seconds))) * 1000;
}

export function classifyStatus(status) {
  if (status === 200 || status === 201) return { outcome: 'stored' };
  if (status === 409) return { outcome: 'conflict', error: 'idempotency-conflict' };
  if (status === 429 || status === 408 || [500, 502, 503, 504].includes(status)) return { outcome: 'retryable', error: `http-${status}` };
  if (status >= 300 && status < 400) return { outcome: 'rejected', error: 'redirect-refused' };
  if (status === 202) return { outcome: 'rejected', error: 'accepted-not-stored' };
  const category = { 400: 'bad-request', 401: 'unauthorized', 403: 'forbidden', 404: 'endpoint-not-found', 413: 'payload-too-large', 422: 'unprocessable' }[status];
  return { outcome: 'rejected', error: category ?? `http-${status}` };
}

export function validateReceipt(value, expected) {
  assertSchema(loadContract('evaluation-receipt.v1'), value, 'receiver receipt');
  const key = expected.type === 'evaluation-batch' ? value.batchKey : value.runKey;
  if (value.sourceInstance !== expected.sourceInstance || key !== expected.key || value.revision !== expected.revision ||
      value.bundleSha256 !== expected.bundleSha256 || value.state !== 'stored') throw new Error('Receipt identity or digest differs from the sent bundle');
  return { receiptId: value.receiptId, state: value.state };
}

function multipart(zip) {
  const boundary = `nb3-evaluation-${sha256(zip).slice(0, 24)}`;
  if (zip.includes(Buffer.from(boundary))) throw new Error('Bundle collides with its multipart boundary');
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="bundle"; filename="evaluation-bundle.zip"\r\nContent-Type: application/zip\r\n\r\n`);
  return { boundary, body: Buffer.concat([head, zip, Buffer.from(`\r\n--${boundary}--\r\n`)]) };
}

// Bounded retry of one bundle: the same bytes and idempotency key on every attempt.
export async function deliverBundle({ zip, subject, config, fetcher = fetch, pause = sleep, now = () => Date.now(), attempts = RETRY.attempts, timeoutMs = RETRY.timeoutMs }) {
  const bundleSha256 = sha256(zip);
  const expected = { ...subject, bundleSha256 };
  const { boundary, body } = multipart(zip);
  const headers = {
    'Content-Type': `multipart/form-data; boundary=${boundary}`, Accept: 'application/json', 'User-Agent': 'nb3-factory-evaluation/1',
    'Idempotency-Key': idempotencyKey({ instance: subject.sourceInstance, type: subject.type, key: subject.key, revision: subject.revision }),
    'X-Evaluation-Schema-Version': '1', 'X-Evaluation-Type': subject.type, 'X-Evaluation-Bundle-SHA256': bundleSha256,
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
    const record = { at: new Date(started).toISOString(), httpStatus: status, outcome: 'retryable', error, durationMs: Math.max(0, now() - started) };
    history.push(record);
    if (status !== null) {
      const verdict = classifyStatus(status);
      Object.assign(record, verdict, { error: verdict.error ?? null });
      if (verdict.outcome === 'stored') {
        try {
          const text = await response.text();
          const receipt = validateReceipt(JSON.parse(text), expected);
          return { state: 'stored', attempts: history, receipt: { ...receipt, httpStatus: status }, reason: null, bundleSha256 };
        } catch { Object.assign(record, { outcome: 'rejected', error: 'invalid-receipt' }); }
      } else { try { await response.body?.cancel(); } catch { /* Only the status is kept. */ } }
      if (record.outcome === 'conflict') return { state: 'conflict', attempts: history, receipt: null, reason: 'same idempotency key already holds different content', bundleSha256 };
      if (record.outcome === 'rejected') return { state: 'rejected', attempts: history, receipt: null, reason: record.error, bundleSha256 };
    }
    if (attempt < attempts) await pause(retryAfterMs(response?.headers?.get('retry-after'), now()) ?? 2000 * 4 ** (attempt - 1));
  }
  return { state: 'pending', attempts: history, receipt: null, reason: history.at(-1).error, bundleSha256 };
}

async function artifactZip(client, id, fetcher = fetch) {
  const response = await fetcher(`${client.apiUrl}/repos/${client.repository}/actions/artifacts/${id}/zip`, {
    headers: { Authorization: `Bearer ${client.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    redirect: 'manual', signal: AbortSignal.timeout(60_000),
  });
  // Follow GitHub's signed storage redirect without forwarding the repository token.
  const location = response.status >= 300 && response.status < 400 ? response.headers.get('location') : null;
  const final = location ? await fetcher(location, { redirect: 'error', signal: AbortSignal.timeout(120_000) }) : response;
  if (!final.ok) throw new Error(`Artifact download failed (${final.status})`);
  return Buffer.from(await final.arrayBuffer());
}

// Find the registered bundle in a retained artifact and verify it byte-for-byte.
export async function fetchBundle(client, entry, { preferredArtifactId = null, fetcher } = {}) {
  const locations = [...entry.bundle.locations].reverse();
  const tried = [];
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
      const wrapper = readZip(await artifactZip(client, artifact.id, fetcher), { allowDeflate: true, maxZip: 70 * 1024 * 1024 });
      const inner = wrapper.find(item => item.path === 'evaluation-bundle.zip');
      if (!inner) { tried.push('bundle-missing'); continue; }
      verifyBundle(inner.data, { sha256: entry.bundle.sha256 });
      return { zip: inner.data, artifactId: artifact.id };
    } catch (error) { tried.push(error.message.slice(0, 120)); }
  }
  return { zip: null, reason: `未取得与登记摘要一致的原始结果包（${tried.join('; ') || '无保存位置'}）；不重新运行应用或模型补造历史。` };
}

export async function planDeliveries(client, { mode, type, key, revision, artifactId, env, now = new Date(), fetcher, limit = 20 }) {
  const config = deliveryConfig(env, { requireToken: false });
  const items = [];
  const { outbox } = await readOutbox(client);
  const pick = async (itemType, itemKey, itemRevision, preferred) => {
    const index = await readSubject(client, itemType, itemKey, 'gh-pages');
    const entry = index?.revisions.find(item => item.revision === itemRevision);
    if (!entry) throw new Error(`No registered ${itemType} revision ${itemRevision} for ${itemKey}`);
    const id = outboxId({ targetId: config.targetId, type: itemType, key: itemKey, revision: itemRevision });
    const queued = outbox.entries.find(item => item.id === id);
    if (queued?.state === 'stored' && mode === 'scan') return;
    const age = now.getTime() - Date.parse(entry.createdAt);
    const found = age > RETRY.bundleRetentionDays * 86400_000 && !preferred ? { zip: null, reason: '超过结果包保留期限。' }
      : await fetchBundle(client, entry, { preferredArtifactId: preferred, fetcher });
    items.push({ id, targetId: config.targetId, type: itemType, key: itemKey, revision: itemRevision, sourceInstance: index.sourceInstance,
      bundleSha256: entry.bundle.sha256, zip: found.zip, source: found.zip ? 'available' : 'source-expired', reason: found.reason ?? null,
      previousAttempts: queued?.attempts ?? 0 });
  };
  if (mode === 'auto' || mode === 'replay') await pick(type, key, Number(revision), Number(artifactId) || null);
  else if (mode === 'scan' || mode === 'retry-rejected') {
    const wanted = mode === 'scan' ? ['pending'] : ['rejected'];
    for (const entry of outbox.entries.filter(item => item.targetId === config.targetId && wanted.includes(item.state)).slice(0, limit))
      await pick(entry.type, entry.key, entry.revision, null);
  } else throw new Error('Delivery mode must be auto, replay, scan or retry-rejected');
  return { targetId: config.targetId, items };
}

export async function sendDeliveries(plan, { env, fetcher, pause, allowInsecureLoopback = false }) {
  let config;
  try { config = deliveryConfig(env, { allowInsecureLoopback }); }
  catch (error) {
    if (!(error instanceof DeliveryConfigError)) throw error;
    return { configError: error.message, results: plan.items.map(item => ({ ...strip(item), state: 'pending', reason: 'config-error',
      attempts: [{ at: new Date().toISOString(), httpStatus: null, outcome: 'config-error', error: 'config', durationMs: 0 }], receipt: null })) };
  }
  if (config.targetId !== plan.targetId) throw new Error('Delivery target changed between planning and sending');
  const results = [];
  for (const item of plan.items) {
    if (!item.zip) {
      results.push({ ...strip(item), state: 'source-expired', attempts: [{ at: new Date().toISOString(), httpStatus: null, outcome: 'source-expired',
        error: 'source-expired', durationMs: 0 }], receipt: null, reason: item.reason });
      continue;
    }
    const outcome = await deliverBundle({ zip: item.zip, subject: { type: item.type, key: item.key, revision: item.revision, sourceInstance: item.sourceInstance },
      config, fetcher, pause });
    if (outcome.bundleSha256 !== item.bundleSha256) throw new Error('Bundle changed after verification');
    const exhausted = outcome.state === 'pending' && item.previousAttempts + outcome.attempts.length >= RETRY.maxTotalAttempts;
    results.push({ ...strip(item), ...outcome, ...(exhausted ? { state: 'rejected', reason: 'retry-limit' } : {}) });
  }
  return { configError: null, results };
}
const strip = ({ zip, source, previousAttempts, sourceInstance, ...item }) => item;

// Late receiver deployment: queue every current revision, batches before samples.
export async function enqueueBackfill(client, env, { limit = 500, now = new Date() } = {}) {
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
  const rows = results.map(r => `| ${r.type} | \`${keyDigest(r.key).slice(0, 12)}\` r${r.revision} | ${r.state} | ${r.attempts.length} | ${r.reason ?? r.receipt?.receiptId ?? ''} |`);
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
    const { configError, results } = await sendDeliveries(plan, { env: process.env });
    writeFileSync(args.output, `${JSON.stringify({ version: 1, targetId: plan.targetId, results }, null, 2)}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary(results, configError));
    for (const result of results) console.log(`${result.type} ${keyDigest(result.key).slice(0, 12)} r${result.revision}: ${result.state} (${result.reason ?? 'ok'})`);
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
export { revisionDir, subjectDir };
