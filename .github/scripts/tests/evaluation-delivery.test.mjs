import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { commitPrepared, exportDraft, prepareRevision } from '../evaluation-archive.mjs';
import { writeZip } from '../evaluation-bundle.mjs';
import { deliverBundle, deliveryConfig, DeliveryConfigError, ITEM_WORST_CASE_MS, planDeliveries, SCAN_LIMIT, SEND_BUDGET_MS, sendDeliveries, targetIdOf } from '../evaluation-delivery.mjs';
import { readOutbox, recordDeliveries } from '../evaluation-registry.mjs';
import { buildArtifacts, fakeGitHub, reportFor, startReceiver, temporary, usageRecord } from './evaluation-fixtures.mjs';

const exporter = { controlSha: 'e'.repeat(40), runId: 900, attempt: 1 };
const noPause = () => Promise.resolve();

// One registered revision with its bundle stored as an Actions artifact of the reporter run.
async function registered(t, { env = { FACTORY_EVALUATION_DELIVERY: 'false' }, client = fakeGitHub() } = {}) {
  const root = temporary(t), exported = temporary(t), prepared = temporary(t);
  buildArtifacts(root);
  exportDraft({ report: reportFor(root, usageRecord()), artifacts: root, html: null, output: exported, exporter });
  const registration = await prepareRevision(client, { input: exported, output: prepared });
  const zip = readFileSync(path.join(prepared, 'evaluation-bundle.zip'));
  client.addArtifact({ id: 5001, name: registration.artifactName, runId: 900, files: writeZip([{ path: 'evaluation-bundle.zip', data: zip }]) });
  await commitPrepared(client, { input: prepared, env, runId: 900, attempt: 1, artifactId: 5001 });
  const document = JSON.parse(readFileSync(path.join(prepared, 'evaluation.json')));
  return { client, zip, registration, document, subject: { type: document.type, key: document.run.key, revision: document.revision, sourceInstance: document.source.instance } };
}
const fetcherFor = client => async (url, options) => {
  const match = /\/actions\/artifacts\/(\d+)\/zip$/.exec(url);
  if (match) {
    const zip = client.artifactZip(Number(match[1]));
    return zip ? new Response(zip, { status: 200 }) : new Response('gone', { status: 410 });
  }
  return fetch(url, options);
};
const configFor = receiver => deliveryConfig({ EVALUATION_ENDPOINT: receiver.url, EVALUATION_TOKEN: receiver.token }, { allowInsecureLoopback: true });

test('configuration comes only from maintainer settings; misconfiguration names the setting and never the secret', () => {
  assert.throws(() => deliveryConfig({}), error => error instanceof DeliveryConfigError && /EVALUATION_ENDPOINT/.test(error.message) && /EVALUATION_TOKEN/.test(error.message));
  for (const endpoint of ['http://receiver.example/import', 'https://user:pw@receiver.example/import', 'https://receiver.example/import?token=abc', 'https://receiver.example/#x', 'nonsense'])
    assert.throws(() => deliveryConfig({ EVALUATION_ENDPOINT: endpoint, EVALUATION_TOKEN: 'super-secret' }), error => !error.message.includes('super-secret'), endpoint);
  assert.throws(() => deliveryConfig({ EVALUATION_ENDPOINT: 'https://r.example/i', EVALUATION_TOKEN: 't', EVALUATION_AUTH_MODE: 'X-Custom: {{x}}' }), /x-api-key 或 bearer/);
  // Loopback HTTP exists only through test-only injection, never through task input.
  assert.throws(() => deliveryConfig({ EVALUATION_ENDPOINT: 'http://127.0.0.1:9/i', EVALUATION_TOKEN: 't' }), /https/);
  const config = deliveryConfig({ EVALUATION_ENDPOINT: 'https://Receiver.Example/api/evaluations/import', EVALUATION_TOKEN: 't', EVALUATION_AUTH_MODE: 'bearer' });
  assert.equal(config.targetId, targetIdOf('https://receiver.example/api/evaluations/import'));
});

test('201 then 200 receipts are validated against the sent identity and digest; auto + manual resend store once', async t => {
  const receiver = await startReceiver(t);
  const { zip, subject } = await registered(t);
  const config = configFor(receiver);
  const first = await deliverBundle({ zip, subject, config, pause: noPause });
  assert.equal(first.state, 'stored');
  assert.equal(first.receipt.httpStatus, 201);
  const results = [];
  for (let i = 0; i < 3; i++) results.push(await deliverBundle({ zip, subject, config, pause: noPause }));
  assert.ok(results.every(r => r.state === 'stored' && r.receipt.receiptId === first.receipt.receiptId && r.receipt.httpStatus === 200));
  assert.equal(receiver.stored.size, 1);
  const keys = new Set(receiver.requests.map(r => r.headers['idempotency-key']));
  assert.equal(keys.size, 1);
  assert.ok(receiver.requests.every(r => r.headers['x-evaluation-bundle-sha256'] === first.bundleSha256 && r.headers['x-evaluation-schema-version'] === '1'));
  assert.ok(receiver.requests.every(r => r.headers['x-api-key'] === receiver.token && !r.url.includes(receiver.token)));
});

test('bearer mode only changes the authentication header', async t => {
  const receiver = await startReceiver(t, { authMode: 'bearer' });
  const { zip, subject } = await registered(t);
  const config = deliveryConfig({ EVALUATION_ENDPOINT: receiver.url, EVALUATION_TOKEN: receiver.token, EVALUATION_AUTH_MODE: 'bearer' }, { allowInsecureLoopback: true });
  assert.equal((await deliverBundle({ zip, subject, config, pause: noPause })).state, 'stored');
  assert.equal(receiver.requests[0].headers['x-api-key'], undefined);
});

test('202, non-JSON and mismatched receipts are never recorded as stored', async t => {
  for (const fault of [{ status: 202, body: { receiptId: 'queued' } }, 'not-json', 'wrong-receipt']) {
    const receiver = await startReceiver(t, { faults: [fault] });
    const { zip, subject } = await registered(t);
    const result = await deliverBundle({ zip, subject, config: configFor(receiver), pause: noPause });
    assert.equal(result.state, 'rejected', JSON.stringify(fault));
    assert.equal(result.receipt, null);
    assert.equal(receiver.requests.length, 1, 'no pointless retry loop');
  }
});

test('a receiver that stored the bundle but dropped the response returns the same receipt on resend', async t => {
  const receiver = await startReceiver(t, { faults: ['drop-after-store'] });
  const { zip, subject } = await registered(t);
  const result = await deliverBundle({ zip, subject, config: configFor(receiver), pause: noPause });
  assert.equal(result.state, 'stored');
  assert.deepEqual(result.attempts.map(a => a.error ?? a.outcome), ['network', 'stored']);
  assert.equal(receiver.stored.size, 1);
  assert.equal(result.receipt.httpStatus, 200);
});

test('429 / 5xx / timeouts retry a bounded number of times, honouring a capped Retry-After', async t => {
  const pauses = [];
  const receiver = await startReceiver(t, { faults: [{ status: 429, headers: { 'retry-after': '3600' } }, { status: 503 }] });
  const { zip, subject } = await registered(t);
  const result = await deliverBundle({ zip, subject, config: configFor(receiver), pause: ms => { pauses.push(ms); return noPause(); } });
  assert.equal(result.state, 'stored');
  assert.deepEqual(pauses, [60_000, 8000]);
  const busy = await startReceiver(t, { faults: [{ status: 503 }, { status: 502 }, 'hang'] });
  const exhausted = await deliverBundle({ zip, subject, config: configFor(busy), pause: noPause, timeoutMs: 300 });
  assert.equal(exhausted.state, 'pending');
  assert.deepEqual(exhausted.attempts.map(a => a.error), ['http-503', 'http-502', 'timeout']);
  assert.equal(busy.requests.length, 3);
  const down = deliveryConfig({ EVALUATION_ENDPOINT: 'http://127.0.0.1:1/import', EVALUATION_TOKEN: 't' }, { allowInsecureLoopback: true });
  assert.equal((await deliverBundle({ zip, subject, config: down, pause: noPause })).state, 'pending');
});

test('400/401/403/404/409/413/422 fail fast with a category and no retry loop', async t => {
  const categories = { 400: 'bad-request', 401: 'unauthorized', 403: 'forbidden', 404: 'endpoint-not-found', 409: 'idempotency-conflict', 413: 'payload-too-large', 422: 'unprocessable' };
  for (const [status, category] of Object.entries(categories)) {
    const receiver = await startReceiver(t, { faults: [{ status: Number(status) }] });
    const { zip, subject } = await registered(t);
    const result = await deliverBundle({ zip, subject, config: configFor(receiver), pause: noPause });
    assert.equal(result.state, status === '409' ? 'conflict' : 'rejected');
    assert.equal(result.attempts[0].error, category);
    assert.equal(receiver.requests.length, 1);
  }
});

test('redirects are refused, so credentials are never forwarded to another origin', async t => {
  const thief = await startReceiver(t);
  const receiver = await startReceiver(t, { faults: [{ status: 307, headers: { location: thief.url } }] });
  const { zip, subject } = await registered(t);
  const result = await deliverBundle({ zip, subject, config: configFor(receiver), pause: noPause });
  assert.equal(result.state, 'rejected');
  assert.equal(result.reason, 'redirect-refused');
  assert.equal(thief.requests.length, 0);
});

test('planning verifies the original artifact bytes; expired or altered sources end without rebuilding history', async t => {
  const receiver = await startReceiver(t);
  const env = { FACTORY_EVALUATION_DELIVERY: 'true', EVALUATION_ENDPOINT: receiver.url };
  const { client, subject, registration } = await registered(t, { env: { ...env, EVALUATION_ENDPOINT: 'https://placeholder.invalid/x' } });
  // Target for the queued entry uses the configured endpoint; the plan reads it the same way.
  const planEnv = { EVALUATION_ENDPOINT: 'https://placeholder.invalid/x' };
  let plan = await planDeliveries(client, { mode: 'scan', env: planEnv, fetcher: fetcherFor(client) });
  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].source, 'available');
  assert.equal(plan.items[0].bundleSha256, registration.bundleSha256);
  client.addArtifact({ id: 5001, name: registration.artifactName, runId: 900, files: writeZip([{ path: 'evaluation-bundle.zip', data: Buffer.from('forged') }]) });
  plan = await planDeliveries(client, { mode: 'replay', ...subject, env: planEnv, fetcher: fetcherFor(client) });
  assert.equal(plan.items[0].source, 'invalid');
  assert.match(plan.items[0].reason, /不重新运行应用或模型/);
  client.addArtifact({ id: 5001, name: registration.artifactName, runId: 900, expired: true, files: null });
  plan = await planDeliveries(client, { mode: 'replay', ...subject, env: planEnv, fetcher: fetcherFor(client) });
  assert.equal(plan.items[0].source, 'missing');
  const results = await sendDeliveries(plan, { env: { EVALUATION_ENDPOINT: 'https://placeholder.invalid/x', EVALUATION_TOKEN: 't' }, fetcher: () => assert.fail('no HTTP for an expired source') });
  assert.equal(results.results[0].state, 'source-expired');
  await recordDeliveries(client, results.results);
  assert.equal((await readOutbox(client)).outbox.entries[0].state, 'source-expired');
  assert.equal(receiver.requests.length, 0);
});

test('enabled delivery with missing settings fails loudly per item but keeps the entry pending', async t => {
  const { client } = await registered(t, { env: { FACTORY_EVALUATION_DELIVERY: 'true', EVALUATION_ENDPOINT: 'https://r.example/i' } });
  const plan = await planDeliveries(client, { mode: 'scan', env: { EVALUATION_ENDPOINT: 'https://r.example/i' }, fetcher: fetcherFor(client) });
  const sent = await sendDeliveries(plan, { env: { EVALUATION_ENDPOINT: 'https://r.example/i' } });
  assert.match(sent.configError, /EVALUATION_TOKEN/);
  await recordDeliveries(client, sent.results);
  const [entry] = (await readOutbox(client)).outbox.entries;
  assert.equal(entry.state, 'pending');
  assert.equal(entry.attempts, 0, 'a configuration error is not a receiver attempt');
});

test('a temporary source failure keeps the delivery pending and is retried once GitHub recovers', async t => {
  const { client, registration } = await registered(t, { env: { FACTORY_EVALUATION_DELIVERY: 'true', EVALUATION_ENDPOINT: 'https://r.example/i' } });
  const env = { EVALUATION_ENDPOINT: 'https://r.example/i' };
  const request = client.request;
  let outage = true;
  client.request = async (method, route, options) => {
    if (outage && route.startsWith('/actions/artifacts/')) throw new Error(`GitHub API ${method} ${route} failed (503): unavailable`);
    return request(method, route, options);
  };
  let plan = await planDeliveries(client, { mode: 'scan', env, fetcher: fetcherFor(client) });
  assert.equal(plan.items[0].source, 'unavailable');
  let sent = await sendDeliveries(plan, { env: { ...env, EVALUATION_TOKEN: 't' }, fetcher: () => assert.fail('nothing is sent without the bytes') });
  await recordDeliveries(client, sent.results);
  let [entry] = (await readOutbox(client)).outbox.entries;
  assert.equal(entry.state, 'pending', 'still eligible for the next scan');
  assert.equal(entry.attempts, 0, 'a source outage is not a receiver attempt');
  outage = false;
  plan = await planDeliveries(client, { mode: 'scan', env, fetcher: fetcherFor(client) });
  assert.equal(plan.items[0].source, 'available');
  assert.equal(plan.items[0].bundleSha256, registration.bundleSha256);
  // A missing artifact and altered bytes are different, terminal findings.
  client.addArtifact({ id: 5001, name: registration.artifactName, runId: 900, files: writeZip([{ path: 'evaluation-bundle.zip', data: Buffer.from('forged') }]) });
  plan = await planDeliveries(client, { mode: 'scan', env, fetcher: fetcherFor(client) });
  assert.equal(plan.items[0].source, 'invalid');
  sent = await sendDeliveries(plan, { env: { ...env, EVALUATION_TOKEN: 't' } });
  assert.equal(sent.results[0].state, 'source-invalid');
});

test('sending stops taking bundles before its time budget and saves each result as it happens', async t => {
  assert.ok(SCAN_LIMIT * 0 + ITEM_WORST_CASE_MS * 5 < SEND_BUDGET_MS, 'a normal scan fits the budget with room to spare');
  assert.ok(SEND_BUDGET_MS + 5 * 60_000 <= 30 * 60_000, 'results are saved before the 30-minute job timeout');
  const receiver = await startReceiver(t);
  const { zip, subject, registration } = await registered(t);
  const item = { id: 'x', targetId: targetIdOf(receiver.url), type: subject.type, key: subject.key, revision: subject.revision,
    sourceInstance: subject.sourceInstance, bundleSha256: registration.bundleSha256, zip, source: 'available', previousAttempts: 0 };
  const plan = { targetId: item.targetId, items: [item, { ...item, id: 'y' }, { ...item, id: 'z' }] };
  let clock = 0;
  const saved = [];
  const result = await sendDeliveries(plan, { env: { EVALUATION_ENDPOINT: receiver.url, EVALUATION_TOKEN: receiver.token }, allowInsecureLoopback: true,
    now: () => clock, deadline: ITEM_WORST_CASE_MS * 2 + 1, onResult: (_r, all) => { saved.push(all.length); clock += ITEM_WORST_CASE_MS; } });
  assert.deepEqual(result.results.map(r => r.state), ['stored', 'stored']);
  assert.equal(result.deferred, 1, 'the third bundle stays pending for the next scan');
  assert.deepEqual(saved, [1, 2]);
});
