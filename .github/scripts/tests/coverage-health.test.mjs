import assert from 'node:assert/strict';
import test from 'node:test';
import { coverageHealth } from '../evaluation-report.mjs';
const complete = coverageHealth({
  qa: 'passed',
  requiredChecks: { status: 'passed', results: [] },
  review: 'completed',
});
test('delivery success does not hide failed or partial evaluation', () => {
  assert.equal(complete.status, 'complete');
  for (const review of ['failed', 'partial', 'not-reviewed'])
    assert.equal(
      coverageHealth({
        qa: 'passed',
        requiredChecks: complete.requiredChecks,
        review,
      }).status,
      'incomplete',
    );
  assert.equal(
    coverageHealth({
      qa: 'failed',
      requiredChecks: {
        status: 'failed',
        results: [{ id: 'api-key', status: 'failed' }],
      },
      review: 'completed',
    }).status,
    'complete',
  );
  assert.equal(
    coverageHealth({
      qa: 'not-run',
      requiredChecks: complete.requiredChecks,
      review: 'disabled',
    }).status,
    'incomplete',
  );
});

test('unknown historical requirements are not complete coverage', () => {
  assert.equal(
    coverageHealth({
      qa: 'passed',
      review: 'completed',
      requiredChecks: { status: 'not-run', results: [] },
    }).status,
    'incomplete',
  );
});
