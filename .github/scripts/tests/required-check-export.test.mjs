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
    results: [{ id: 'api-key', status: 'passed' }],
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
