import assert from 'node:assert/strict';
import test from 'node:test';
import {
  coverageHealth,
  healthSnapshot,
  renderHealth,
} from '../evaluation-health.mjs';
const complete = coverageHealth({
  qa: 'passed',
  requiredChecks: { status: 'passed', results: [] },
  review: 'completed',
});
test('delivery success does not hide failed or partial evaluation', () => {
  for (const review of ['failed', 'partial', 'not-reviewed']) {
    const health = coverageHealth({
      qa: 'passed',
      requiredChecks: complete.requiredChecks,
      review,
    });
    assert.equal(health.status, 'incomplete');
    assert.equal(
      healthSnapshot(
        { outcome: { delivery: 'published' }, health },
        { registered: true },
      ).status,
      'incomplete',
    );
  }
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
test('registration and asynchronous receipts remain distinct and missing is never green', () => {
  const document = { outcome: { delivery: 'published' }, health: complete };
  assert.equal(healthSnapshot(document).status, 'incomplete');
  assert.equal(
    healthSnapshot(document, { registered: true }).status,
    'complete',
  );
  assert.equal(
    healthSnapshot(document, { registered: true, delivery: 'pending' }).status,
    'pending-delivery',
  );
  assert.equal(
    healthSnapshot(document, { registered: true, delivery: 'stored' }).status,
    'complete',
  );
  for (const delivery of [
    'missing',
    'missing-receipt',
    'configuration-error',
    'rejected',
    'source-expired',
  ])
    assert.equal(
      healthSnapshot(document, { registered: true, delivery }).status,
      'incomplete',
    );
  assert.match(renderHealth(healthSnapshot(document)), /应用交付（独立）/);
});
