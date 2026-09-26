import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildEvaluation } from '../evaluation-report.mjs';
import {
  buildArtifacts,
  reportFor,
  usageRecord,
  temporary,
  put,
  digest,
} from './evaluation-fixtures.mjs';

test('an Agent-side result cannot satisfy required independent checks; only matching final artifact can', (t) => {
  const root = temporary(t),
    taskRoot = temporary(t),
    finalRoot = temporary(t);
  const metadata = buildArtifacts(root);
  metadata.evaluation.requiredChecks = ['api-key'];
  put(root, 'task-metadata.json', metadata);
  put(taskRoot, 'task-metadata.json', metadata);
  const report = reportFor(root, usageRecord());
  const result = {
    version: 1,
    mode: 'run',
    status: 'passed',
    repository: metadata.repository,
    issue: metadata.issue.number,
    runId: metadata.run.id,
    attempt: metadata.run.attempt,
    applicationSha: metadata.applicationBase.sha,
    patchSha256: digest(readFileSync(root + '/agent.patch')),
    required: ['api-key'],
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
  put(root, 'required-checks.json', result);
  const build = (finalRoot) =>
    buildEvaluation({ root, taskRoot, finalRoot, report }).draft;
  assert.equal(build(null).outcome.acceptance, 'not-run');
  assert.equal(build(null).outcome.delivery, 'published');
  assert.equal(build(null).health.status, 'incomplete');
  put(finalRoot, 'required-checks.json', result);
  assert.equal(build(finalRoot).outcome.acceptance, 'passed');
  put(finalRoot, 'required-checks.json', { ...result, attempt: 2 });
  assert.equal(build(finalRoot).outcome.acceptance, 'not-run');
  // The same prepare and Agent artifacts are reused by downstream-only attempt 2.
  const rerunReport = { ...report, record: { ...report.record, attempt: 2 } };
  const rerun = () =>
    buildEvaluation({ root, taskRoot, finalRoot, report: rerunReport }).draft;
  assert.equal(rerun().outcome.acceptance, 'passed');
  put(finalRoot, 'required-checks.json', result);
  assert.equal(rerun().outcome.acceptance, 'not-run');
});

test('runtime settings are exported through execution facts including drift within one run', (t) => {
  const root = temporary(t);
  buildArtifacts(root);
  const invocation = (fingerprint) => ({
    version: 1,
    phase: 'implementation',
    invoked: true,
    promptSha256: 'e'.repeat(64),
    configuration: {
      fingerprint,
      values: {
        CONFIG_SCHEMA_VERSION: '2',
        CODE_AGENT_ENGINE: 'pi',
        CODE_AGENT_PROVIDER_ID: 'test-gateway',
      },
    },
  });
  put(
    root,
    'agent-implement.jsonl.invocation.json',
    invocation('a'.repeat(64)),
  );
  put(root, 'verify-2/agent-repair.jsonl.invocation.json', {
    ...invocation('b'.repeat(64)),
    phase: 'repair',
  });
  const draft = buildEvaluation({
    root,
    report: reportFor(root, usageRecord()),
  }).draft;
  assert.deepEqual(draft.baseline.agent.configuration, {
    complete: true,
    fingerprints: ['a'.repeat(64), 'b'.repeat(64)],
  });
  put(root, 'agent-implement.jsonl.invocation.json', {
    version: 1,
    phase: 'implementation',
    invoked: true,
  });
  assert.equal(
    buildEvaluation({ root, report: reportFor(root, usageRecord()) }).draft
      .baseline.agent.configuration.complete,
    false,
  );
});

test('only a trusted declared check set can prove complete evaluation coverage', (t) => {
  const root = temporary(t),
    taskRoot = temporary(t);
  const metadata = buildArtifacts(root);
  const report = reportFor(root, usageRecord());
  const build = () => buildEvaluation({ root, taskRoot, report }).draft;
  assert.equal(build().health.status, 'incomplete');
  assert.equal(build().health.requiredChecks.status, 'not-run');
  metadata.evaluation.requiredChecks = [];
  put(taskRoot, 'task-metadata.json', metadata);
  assert.equal(build().health.status, 'complete');
});

test('reviewer drift and missing invocation records cannot claim configuration completeness', (t) => {
  const root = temporary(t);
  buildArtifacts(root);
  const configuration = (fingerprint) => ({
    fingerprint,
    values: { CONFIG_SCHEMA_VERSION: '2', CODE_AGENT_ENGINE: 'codex' },
  });
  put(root, 'agent-implement.jsonl.invocation.json', {
    invoked: true,
    phase: 'implementation',
    configuration: configuration('a'.repeat(64)),
  });
  put(root, 'agent-review.jsonl.invocation.json', {
    invoked: true,
    phase: 'review',
    configuration: configuration('b'.repeat(64)),
  });
  const evidence = () =>
    buildEvaluation({ root, report: reportFor(root, usageRecord()) }).draft
      .baseline.agent.configuration;
  assert.deepEqual(evidence().fingerprints, ['a'.repeat(64), 'b'.repeat(64)]);
  assert.equal(evidence().complete, true);
  put(root, 'verify-1/agent-repair.jsonl', '{}');
  assert.equal(evidence().complete, false);
});
