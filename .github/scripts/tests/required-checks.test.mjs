import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateRequiredChecks,
  requiredCheckCoverage,
  requiredChecksFor,
  validateRequiredChecks,
} from '../required-checks.mjs';
import { temporary, put } from './evaluation-fixtures.mjs';

const sha = 'a'.repeat(40),
  patch = 'b'.repeat(64);
const metadata = {
  repository: 'owner/repo',
  issue: { number: 1 },
  run: { id: 2, attempt: 1 },
  applicationBase: { sha },
  evaluation: { requiredChecks: ['api-key'] },
};
const plan = {
  version: 1,
  kind: 'api-key',
  applicationSha: sha,
  baseUrl: 'http://127.0.0.1:13000',
  read: { path: '/api/fixtures', itemsPath: ['data'], expectedIds: ['one'] },
  write: { path: '/api/fixtures', method: 'POST', body: {} },
  revoke: { path: '/api/revoke', method: 'POST', body: {} },
};
test('trusted presets declare their required checks; unknown evaluators cannot execute commands', () => {
  assert.deepEqual(requiredChecksFor(206), ['api-key']);
  assert.deepEqual(requiredChecksFor(207), ['business-ai']);
  assert.deepEqual(requiredChecksFor(208), ['notification-delivery']);
  assert.deepEqual(requiredChecksFor(176), []);
  assert.throws(() => validateRequiredChecks(['../../evil']), /Unknown/);
  assert.throws(
    () => validateRequiredChecks(['api-key', 'api-key']),
    /duplicate/,
  );
});
test('preflight blocks before requests when fixtures or isolated credentials are missing', async (t) => {
  const fixtureDirectory = temporary(t);
  let calls = 0;
  const options = {
    metadata,
    fixtureDirectory,
    mode: 'preflight',
    fetcher: async () => {
      calls++;
    },
  };
  assert.equal((await evaluateRequiredChecks(options)).status, 'blocked');
  const env = {
    FACTORY_TEST_API_KEY_PRESENT: 'true',
    FACTORY_TEST_ADMIN_KEY_PRESENT: 'true',
  };
  assert.equal(
    (await evaluateRequiredChecks({ ...options, env })).status,
    'blocked',
  );
  put(fixtureDirectory, 'api-key.json', {
    ...plan,
    applicationSha: 'c'.repeat(40),
  });
  assert.equal(
    (await evaluateRequiredChecks({ ...options, env })).status,
    'blocked',
  );
  put(fixtureDirectory, 'api-key.json', plan);
  assert.equal(
    (await evaluateRequiredChecks({ ...options, env })).status,
    'ready',
  );
  assert.equal(calls, 0);
});
test('configured AI and notification preflights never claim end-to-end coverage', async () => {
  const env = {
    FACTORY_BUSINESS_MODEL_PRESENT: 'true',
    FACTORY_BUSINESS_API_KEY_PRESENT: 'true',
    FACTORY_BUSINESS_MODEL_ENDPOINT_PRESENT: 'true',
    FACTORY_TEST_CHANNEL_PRESENT: 'true',
    FACTORY_TEST_RECEIVER_URL_PRESENT: 'true',
  };
  for (const id of ['business-ai', 'notification-delivery']) {
    const result = await evaluateRequiredChecks({
      metadata: { ...metadata, evaluation: { requiredChecks: [id] } },
      mode: 'preflight',
      env,
    });
    assert.equal(result.status, 'not-run');
  }
});
test('independent results must bind the exact run, attempt, base, patch and complete check set', async (t) => {
  const fixtureDirectory = temporary(t);
  put(fixtureDirectory, 'api-key.json', plan);
  const responses = [
    { status: 200, body: { data: [{ id: 'one' }] } },
    { status: 403 },
    { status: 204 },
    { status: 401 },
  ];
  const result = await evaluateRequiredChecks({
    metadata,
    mode: 'run',
    fixtureDirectory,
    patchSha256: patch,
    env: {
      FACTORY_TEST_API_KEY: 'isolated-test',
      FACTORY_TEST_ADMIN_KEY: 'isolated-admin',
    },
    fetcher: async () => {
      const response = responses.shift();
      return {
        status: response.status,
        text: async () => JSON.stringify(response.body ?? {}),
      };
    },
  });
  assert.equal(result.status, 'passed');
  assert.equal(requiredCheckCoverage(metadata, result, patch).status, 'passed');
  for (const changed of [
    { mode: 'preflight' },
    { runId: 3 },
    { attempt: 2 },
    { applicationSha: 'c'.repeat(40) },
    { patchSha256: 'd'.repeat(64) },
    { results: [] },
    { required: [] },
  ])
    assert.equal(
      requiredCheckCoverage(metadata, { ...result, ...changed }, patch).status,
      'not-run',
    );
  assert.equal(requiredCheckCoverage(metadata, null, patch).status, 'not-run');
  assert.doesNotMatch(JSON.stringify(result), /isolated-test|isolated-admin/);
});

test('malformed trusted fixtures produce an explicit blocked result without requests', async (t) => {
  const fixtureDirectory = temporary(t);
  put(fixtureDirectory, 'api-key.json', '{invalid');
  let requests = 0;
  const result = await evaluateRequiredChecks({
    metadata,
    fixtureDirectory,
    mode: 'preflight',
    env: {
      FACTORY_TEST_API_KEY_PRESENT: 'true',
      FACTORY_TEST_ADMIN_KEY_PRESENT: 'true',
    },
    fetcher: async () => {
      requests++;
    },
  });
  assert.equal(result.status, 'blocked');
  assert.match(result.results[0].reason, /测试计划无效/);
  assert.equal(requests, 0);
});

test('passing coverage requires every API assertion, and a rerun records its actual execution', async (t) => {
  const fixtureDirectory = temporary(t);
  put(fixtureDirectory, 'api-key.json', plan);
  const execution = { id: metadata.run.id, attempt: 2 };
  const result = await evaluateRequiredChecks({
    metadata,
    execution,
    fixtureDirectory,
    mode: 'run',
    patchSha256: patch,
  });
  assert.equal(result.attempt, 2);
  const passed = {
    ...result,
    status: 'passed',
    results: [
      {
        id: 'api-key',
        status: 'passed',
        checks: ['A01', 'A02', 'A03'].map((checkId) => ({
          checkId,
          status: 'passed',
        })),
      },
    ],
  };
  assert.equal(
    requiredCheckCoverage(metadata, passed, patch, execution).status,
    'passed',
  );
  for (const checks of [
    undefined,
    [],
    passed.results[0].checks.slice(0, 2),
    [
      ...passed.results[0].checks.slice(0, 2),
      { checkId: 'A03', status: 'failed' },
    ],
  ]) {
    assert.equal(
      requiredCheckCoverage(
        metadata,
        { ...passed, results: [{ id: 'api-key', status: 'passed', checks }] },
        patch,
        execution,
      ).status,
      'not-run',
    );
  }
  assert.equal(
    requiredCheckCoverage(metadata, passed, patch).status,
    'not-run',
  );
});
