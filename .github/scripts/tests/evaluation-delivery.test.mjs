import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { commitPrepared, exportDraft, prepareRevision } from '../evaluation-archive.mjs';
import { writeZip } from '../evaluation-bundle.mjs';
import { deliverBundle, deliveryConfig, DeliveryConfigError, ITEM_WORST_CASE_MS, planDeliveries, SCAN_LIMIT, SEND_BUDGET_MS, sendDeliveries, targetIdOf } from '../evaluation-delivery.mjs';
import { readOutbox, recordDeliveries } from '../evaluation-registry.mjs';
import { problemSubmission } from '../problem-submission.mjs';
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

test('TestManage delivery includes explicit factory problems and the unchanged complete report bundle', async t => {
  const { zip, subject, document } = await registered(t);
  const config = deliveryConfig({ EVALUATION_ENDPOINT: 'https://receiver.example/import', EVALUATION_TOKEN: 'test-only', EVALUATION_DELIVERY_FORMAT: 'testmanage3-problems-v1' });
  let called = false;
  const result = await deliverBundle({ zip, subject, config, pause: noPause, fetcher: async (_url, options) => {
    const form = await new Response(options.body, { headers: { 'content-type': options.headers['Content-Type'] } }).formData();
    assert.deepEqual(Buffer.from(await form.get('bundle').arrayBuffer()), zip);
    const submission = JSON.parse(form.get('problems'));
    assert.equal(submission.version, 1); assert.ok(Array.isArray(submission.problems));
    assert.equal(document.run.task.repository, subject.sourceInstance); called = true;
    return new Response(JSON.stringify({ receiptId: 'testmanage-receipt', sourceInstance: subject.sourceInstance, runKey: subject.key, revision: subject.revision, bundleSha256: options.headers['X-Evaluation-Bundle-SHA256'], state: 'stored' }), { status: 201 });
  } });
  assert.ok(called); assert.equal(result.state, 'stored');
});

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

test('a refusal keeps a short sanitized error code and message from at most a few KB of its body', async t => {
  const { zip, subject } = await registered(t);
  const huge = `${'x'.repeat(300)}${'y'.repeat(100_000)}`;
  const cases = [
    [{ error: { code: 'INVALID_FEATURE_POINT', message: 'feature\npoint\u0007 missing for receiver-token' } }, 'INVALID_FEATURE_POINT: feature point missing for [redacted]'],
    [{ code: 'E_SCHEMA', message: 'bad field' }, 'E_SCHEMA: bad field'],
    [{ errors: [{ message: 'first problem' }, { message: 'second' }] }, 'first problem'],
    [{ error: 'injected' }, 'injected'],
    ['plain reason\r\nsecond line', 'plain reason second line'],
    ['<html><body>502 proxy page</body></html>', null],
    [{ ok: false }, null],
  ];
  for (const [body, detail] of cases) {
    const receiver = await startReceiver(t, { faults: [{ status: 400, body }] });
    const result = await deliverBundle({ zip, subject, config: configFor(receiver), pause: noPause });
    assert.equal(result.state, 'rejected');
    assert.equal(result.reason, 'bad-request', 'the status category is unchanged');
    assert.equal(result.detail, detail, JSON.stringify(body));
    assert.equal(result.attempts[0].detail, detail);
  }
  const receiver = await startReceiver(t, { faults: [{ status: 422, body: { error: { code: 'E', message: huge } } }, { status: 422, body: huge }] });
  for (let n = 0; n < 2; n++) {
    const result = await deliverBundle({ zip, subject, config: configFor(receiver), pause: noPause });
    assert.equal(result.reason, 'unprocessable');
    if (n === 0) assert.equal(result.detail, null, 'a JSON body cut off at the read limit is not parsed');
    else {
      assert.equal(result.detail.length, 200);
      assert.match(result.detail, /^x+$/);
    }
  }
});

test('the scheduled scan resends a rejection once after an hour, records it, then leaves it for retry-rejected', async t => {
  const receiver = await startReceiver(t, { faults: [{ status: 400, body: { error: { code: 'BAD', message: 'briefly wrong' } } }, { status: 400 }] });
  // Planning requires https; the placeholder endpoint is routed to the loopback receiver.
  const env = { EVALUATION_ENDPOINT: 'https://r.example/i' };
  const sendEnv = { ...env, EVALUATION_TOKEN: receiver.token };
  const route = (url, options) => (url === env.EVALUATION_ENDPOINT ? fetch(receiver.url, options) : fetcherFor(client)(url, options));
  const { client } = await registered(t, { env: { FACTORY_EVALUATION_DELIVERY: 'true', ...env } });
  const at = hours => new Date(Date.parse('2026-10-01T00:00:00Z') + hours * 3600_000);
  const scan = hours => planDeliveries(client, { mode: 'scan', env, now: at(hours), fetcher: fetcherFor(client) });
  const send = async (plan, hours) => {
    const sent = await sendDeliveries(plan, { env: sendEnv, fetcher: route, pause: noPause });
    await recordDeliveries(client, sent.results, at(hours));
    return sent.results;
  };
  let plan = await scan(0);
  assert.equal(plan.items[0].autoRetry, undefined, 'a pending record is not an automatic retry');
  let [result] = await send(plan, 0);
  assert.equal(result.state, 'rejected');
  let [entry] = (await readOutbox(client)).outbox.entries;
  assert.equal(entry.detail, 'BAD: briefly wrong', 'the sanitized receiver error is recorded');
  assert.equal(entry.autoRetries ?? 0, 0);
  assert.equal((await scan(0.5)).items.length, 0, 'not resent within the minimum delay');
  plan = await scan(1);
  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].autoRetry, true);
  [result] = await send(plan, 1);
  assert.equal(result.state, 'rejected');
  [entry] = (await readOutbox(client)).outbox.entries;
  assert.equal(entry.autoRetries, 1);
  assert.equal(entry.lastAutoRetryAt, at(1).toISOString());
  assert.equal(entry.detail, 'injected');
  assert.equal((await scan(48)).items.length, 0, 'the automatic retry is bounded');
  // A manual retry is unbounded and not counted; once stored, nothing resends it.
  plan = await planDeliveries(client, { mode: 'retry-rejected', env, now: at(49), fetcher: fetcherFor(client) });
  assert.equal(plan.items[0].autoRetry, undefined);
  [result] = await send(plan, 49);
  assert.equal(result.state, 'stored');
  [entry] = (await readOutbox(client)).outbox.entries;
  assert.equal(entry.autoRetries, 1);
  assert.equal(entry.detail, null);
  assert.equal((await scan(100)).items.length, 0);
  assert.equal(receiver.requests.length, 3);
});

test('a scan automatically resends only transient rejections, never permanent ones or retry-limit', async t => {
  const env = { EVALUATION_ENDPOINT: 'https://r.example/i' };
  const { client } = await registered(t, { env: { FACTORY_EVALUATION_DELIVERY: 'true', ...env } });
  const [queued] = (await readOutbox(client)).outbox.entries;
  const { id, targetId, type, key, revision, bundleSha256 } = queued;
  const at = new Date('2026-10-03T00:00:00Z');
  const reject = (reason, status) => recordDeliveries(client, [{ id, targetId, type, key, revision, bundleSha256, state: 'rejected', reason, receipt: null,
    attempts: [{ at: '2026-10-01T00:00:00.000Z', httpStatus: status, outcome: reason === 'retry-limit' ? 'retryable' : 'rejected', error: reason, detail: null, durationMs: 1 }] }], new Date('2026-10-01T00:00:00Z'));
  const scanned = async () => (await planDeliveries(client, { mode: 'scan', env, now: at, fetcher: fetcherFor(client) })).items.length;
  // Records rejected before automatic retries existed carry no autoRetries field.
  for (const [reason, status] of [['unprocessable', 422], ['payload-too-large', 413], ['unauthorized', 401], ['forbidden', 403],
    ['endpoint-not-found', 404], ['redirect-refused', 307], ['invalid-receipt', 201], ['http-410', 410], ['retry-limit', 503]]) {
    await reject(reason, status);
    assert.equal((await readOutbox(client)).outbox.entries[0].autoRetries, undefined);
    assert.equal(await scanned(), 0, reason);
    assert.equal((await planDeliveries(client, { mode: 'retry-rejected', env, now: at, fetcher: fetcherFor(client) })).items.length, 1, reason);
  }
  for (const [reason, status] of [['bad-request', 400], ['accepted-not-stored', 202], ['http-520', 520]]) {
    await reject(reason, status);
    assert.equal(await scanned(), 1, reason);
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
  assert.equal(SCAN_LIMIT, 10);
  assert.ok(ITEM_WORST_CASE_MS < SEND_BUDGET_MS, 'one bounded delivery fits; remaining work is deferred before the deadline');
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

test('a receipt body cut off after 201 is a transport failure: the same key is resent and confirmed', async t => {
  for (const fault of ['partial-drop', 'partial-hang']) {
    const receiver = await startReceiver(t, { faults: [fault] });
    const { zip, subject } = await registered(t);
    const result = await deliverBundle({ zip, subject, config: configFor(receiver), pause: noPause, timeoutMs: 400 });
    assert.equal(result.state, 'stored', fault);
    assert.deepEqual(result.attempts.map(a => [a.httpStatus, a.outcome]), [[201, 'retryable'], [200, 'stored']], fault);
    assert.equal(result.attempts[0].error, fault === 'partial-drop' ? 'receipt-interrupted' : 'receipt-timeout');
    assert.equal(receiver.stored.size, 1);
    assert.equal(new Set(receiver.requests.map(r => r.headers['idempotency-key'])).size, 1);
  }
  // A complete but wrong receipt is still a protocol error, not retried.
  const wrong = await startReceiver(t, { faults: ['wrong-receipt'] });
  const { zip, subject } = await registered(t);
  assert.equal((await deliverBundle({ zip, subject, config: configFor(wrong), pause: noPause })).reason, 'invalid-receipt');
});


test('link mode submits JSON metadata and selected problems without ZIP, HTML or screenshot bytes', async t => {
  const { zip, subject, document } = await registered(t);
  const config = deliveryConfig({ EVALUATION_ENDPOINT: 'https://receiver.example/import', EVALUATION_TOKEN: 'test-only', EVALUATION_DELIVERY_FORMAT: 'testmanage3-links-v1' });
  const timeouts = [];
  t.mock.method(AbortSignal, 'timeout', ms => { timeouts.push(ms); return new AbortController().signal; });
  const result = await deliverBundle({ zip, subject, config, pause: noPause, fetcher: async (_url, options) => {
    assert.equal(options.headers['Content-Type'], 'application/json');
    const payload = JSON.parse(options.body.toString('utf8'));
    assert.deepEqual(Object.keys(payload).sort(), ['document', 'problems', 'reportUrl', 'version']);
    assert.deepEqual(payload.document, document);
    assert.equal(payload.reportUrl, 'https://owner.github.io/factory/' + document.links.find(link => link.rel === 'report-archive').path);
    assert.ok(Array.isArray(payload.problems));
    assert.equal(options.headers['X-Evaluation-Payload-SHA256'], createHash('sha256').update(options.body).digest('hex'));
    return new Response(JSON.stringify({ receiptId: 'link-receipt', sourceInstance: subject.sourceInstance, runKey: subject.key, revision: subject.revision, bundleSha256: options.headers['X-Evaluation-Bundle-SHA256'], state: 'stored' }), { status: 201 });
  } });
  assert.equal(result.state, 'stored');
  assert.deepEqual(timeouts, [180000]);
  assert.equal(deliveryConfig({ EVALUATION_ENDPOINT: 'https://r.example/import', EVALUATION_TOKEN: 't', EVALUATION_TIMEOUT_SECONDS: '240' }).timeoutMs, 240000);
  for (const timeout of ['0', 'NaN', '301', '29', '30.5']) assert.throws(() => deliveryConfig({ EVALUATION_ENDPOINT: 'https://r.example/import', EVALUATION_TOKEN: 't', EVALUATION_TIMEOUT_SECONDS: timeout }), /EVALUATION_TIMEOUT_SECONDS/);
});

test('link mode sends each item\'s feature point decisions with the same bytes on every attempt', async t => {
  const { zip, subject, document, registration } = await registered(t);
  const [problem] = problemSubmission(document).problems;
  const decision = { featurePointId: 47, method: 'rule', reason: 'pkg:@nocobase/db → 应用搭建/数据库' };
  const env = { EVALUATION_ENDPOINT: 'https://receiver.example/import', EVALUATION_TOKEN: 'test-only', EVALUATION_DELIVERY_FORMAT: 'testmanage3-links-v1' };
  const targetId = targetIdOf(env.EVALUATION_ENDPOINT);
  const item = { ...subject, targetId, id: 'classified', zip, source: 'available', previousAttempts: 0, bundleSha256: registration.bundleSha256 };
  const bodies = [];
  const fetcher = async (_url, options) => {
    bodies.push(options.body);
    if (bodies.length === 1) return new Response('busy', { status: 503 });
    return new Response(JSON.stringify({ receiptId: 'r', sourceInstance: subject.sourceInstance, runKey: subject.key, revision: subject.revision, bundleSha256: registration.bundleSha256, state: 'stored' }), { status: 201 });
  };
  const sent = await sendDeliveries({ targetId, items: [item] }, { env, fetcher, pause: noPause, classifications: new Map([['classified', { [problem.key]: decision }]]) });
  assert.equal(sent.results[0].state, 'stored');
  assert.equal(bodies.length, 2);
  assert.ok(bodies[0].equals(bodies[1]));
  assert.deepEqual(JSON.parse(bodies[1].toString('utf8')).problems[0].classification, decision);
  bodies.length = 0;
  await sendDeliveries({ targetId, items: [{ ...item, id: 'other' }] }, { env, fetcher, pause: noPause, classifications: new Map([['classified', { [problem.key]: decision }]]) });
  assert.equal('classification' in JSON.parse(bodies[1].toString('utf8')).problems[0], false);
});

test('custom timeout is included in the pre-delivery budget check', async t => {
  const { zip, subject, registration } = await registered(t);
  const env = { EVALUATION_ENDPOINT: 'https://r.example/import', EVALUATION_TOKEN: 't', EVALUATION_TIMEOUT_SECONDS: '300' };
  const targetId = targetIdOf(env.EVALUATION_ENDPOINT);
  const item = { ...subject, targetId, id: 'budget', zip, source: 'available', previousAttempts: 0, bundleSha256: registration.bundleSha256 };
  const sent = await sendDeliveries({ targetId, items: [item] }, { env, now: () => 0, deadline: ITEM_WORST_CASE_MS + 1, fetcher: () => { throw new Error('Must defer before network access'); } });
  assert.equal(sent.deferred, 1);
  assert.deepEqual(sent.results, []);
});
