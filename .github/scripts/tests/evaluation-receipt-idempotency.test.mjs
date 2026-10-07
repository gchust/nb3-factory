import assert from 'node:assert/strict';
import test from 'node:test';
import {
  commitPrepared,
  exportDraft,
  prepareRevision,
} from '../evaluation-archive.mjs';
import { readOutbox, recordDeliveries } from '../evaluation-registry.mjs';
import {
  buildArtifacts,
  fakeGitHub,
  reportFor,
  temporary,
  usageRecord,
} from './evaluation-fixtures.mjs';

const enabled = {
  FACTORY_EVALUATION_DELIVERY: 'true',
  EVALUATION_ENDPOINT: 'https://receiver.example/api/evaluations/import',
};

async function registered(t) {
  const client = fakeGitHub();
  const root = temporary(t);
  const exported = temporary(t);
  const prepared = temporary(t);
  buildArtifacts(root);
  exportDraft({
    report: reportFor(root, usageRecord()),
    artifacts: root,
    task: null,
    html: null,
    output: exported,
    exporter: { controlSha: 'e'.repeat(40), runId: 900, attempt: 1 },
  });
  const registration = await prepareRevision(client, {
    input: exported,
    output: prepared,
  });
  await commitPrepared(client, {
    input: prepared,
    env: enabled,
    runId: 900,
    attempt: 1,
    artifactId: registration.upload ? 901 : null,
  });
  const [entry] = (await readOutbox(client)).outbox.entries;
  const base = {
    id: entry.id,
    targetId: entry.targetId,
    type: entry.type,
    key: entry.key,
    revision: entry.revision,
    bundleSha256: registration.bundleSha256,
  };
  return { client, base };
}

// A ref update whose response was lost is retried from a fresh read, which may
// already hold the result: it must not add its attempts or history again.
test('a delivery result applied twice is counted once', async (t) => {
  const { client, base } = await registered(t);
  const result = {
    ...base,
    state: 'pending',
    attempts: [
      { at: '2026-10-07T01:00:00Z', outcome: 'retryable', httpStatus: 503 },
    ],
    receipt: null,
    reason: 'http-503',
  };
  await recordDeliveries(client, [result]);
  const refAfterFirst = client.ref();
  await recordDeliveries(client, [result]);
  const [entry] = (await readOutbox(client)).outbox.entries;
  assert.equal(entry.attempts, 1);
  assert.equal(entry.history.length, 1);
  assert.equal(entry.appliedResults.length, 1);
  assert.equal(
    client.ref(),
    refAfterFirst,
    'a duplicate result commits nothing',
  );
  // A later genuine result has its own attempt time and is applied.
  await recordDeliveries(client, [
    {
      ...result,
      attempts: [
        { at: '2026-10-07T02:00:00Z', outcome: 'retryable', httpStatus: 502 },
      ],
    },
  ]);
  const [later] = (await readOutbox(client)).outbox.entries;
  assert.equal(later.attempts, 2);
  assert.equal(later.history.length, 2);
});
