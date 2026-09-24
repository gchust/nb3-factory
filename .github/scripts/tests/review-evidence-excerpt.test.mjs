import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { digest } from '../build-review.mjs';
import { materializeEvidence } from '../run-build-review.mjs';

function fixture(t, text, lines) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'review-excerpt-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'artifacts'));
  const relative = 'artifacts/report.json';
  writeFileSync(path.join(root, relative), text);
  const catalog = [{ path: relative, kind: 'text', sha256: digest(text), lines: text.split('\n').length }];
  const review = { evidence: [{ id: 'E1', kind: 'qa', path: relative, lines,
    observation: 'Observed the actual check', excerpt: 'fabricated meaningful text' }] };
  return { root, catalog, review };
}

for (const text of ['{\n  "passed": true\n}\n', '[\n  1\n]\n', '\n\n', '},\n']) {
  test('rejects empty or delimiter-only captured excerpts: ' + JSON.stringify(text), t => {
    const f = fixture(t, text, [1, 1]);
    assert.throws(() => materializeEvidence(f.review, f.root, f.catalog), /Evidence E1.*substantive/);
  });
}

test('captures the exact meaningful JSON lines, never a model-provided quote', t => {
  const f = fixture(t, '{\n  "passed": true,\n  "checks": [{"id": "B01", "status": "passed"}]\n}\n', [2, 3]);
  const result = materializeEvidence(f.review, f.root, f.catalog);
  assert.equal(result.evidence[0].excerpt, '  "passed": true,\n  "checks": [{"id": "B01", "status": "passed"}]');
  assert.equal(result.evidence[0].sha256, f.catalog[0].sha256);
});

test('does not expand an inaccurate range to invent support for the reviewer', t => {
  const f = fixture(t, '{\n  "passed": false\n}\n', [3, 3]);
  assert.throws(() => materializeEvidence(f.review, f.root, f.catalog), /substantive/);
});

test('an empty value is citable with its explanatory field context', t => {
  const f = fixture(t, '{\n  "errors": []\n}\n', [2, 2]);
  assert.equal(materializeEvidence(f.review, f.root, f.catalog).evidence[0].excerpt, '  "errors": []');
});
