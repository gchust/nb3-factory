// Regenerates the fictional, redacted contract examples from the same fixtures
// the tests use, so examples cannot drift from the exporter. No model is called.
//   node .github/contracts/render-examples.mjs [--check]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBundle } from '../scripts/evaluation-bundle.mjs';
import { buildEvaluation, finalizeEvaluation } from '../scripts/evaluation-report.mjs';
import { buildArtifacts, png, put, reportFor, temporary, usageRecord, writeReview } from '../scripts/tests/evaluation-fixtures.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'examples');
const createdAt = '2026-09-25T08:00:00Z';
const exporter = { controlSha: '0'.repeat(39) + '1', runId: 1000900, attempt: 1 };
const cleanups = [];
const t = { after: fn => cleanups.push(fn) };
const reviewer = runId => ({ engine: 'fixture', model: 'no-model-invoked', version: null, runId: String(runId), attempt: 1, controlSha: '0'.repeat(39) + '2', replay: true });

function render(root, report, revision = 1) {
  const { draft } = buildEvaluation({ report, root, exporter });
  return finalizeEvaluation(draft, { revision, createdAt }).document;
}

export function examples() {
  const out = {};
  let root = temporary(t);
  buildArtifacts(root);
  out['report-completed.json'] = render(root, reportFor(root, usageRecord(), [], { number: 150, headSha: 'a'.repeat(40) }));

  root = temporary(t);
  buildArtifacts(root, { rounds: [{ round: 1, scope: 'full', statuses: ['failed', 'passed'] }, { round: 2, scope: 'focused', statuses: ['failed'] },
    { round: 3, scope: 'full', statuses: ['failed', 'passed'] }], repairs: 2, outcome: 'failed', retro: true });
  out['report-failed.json'] = render(root, reportFor(root, usageRecord({ status: 'failure' })));

  root = temporary(t);
  buildArtifacts(root, { rounds: [], chainVerifications: 1, outcome: 'blocked', review: 'not-reviewed' });
  // Verification round 1 started, then the environment blocked it before any browser QA.
  put(root, 'verify-1/.keep', '');
  put(root, 'verify-1.log', 'blocked: browser environment unavailable\n');
  out['report-blocked.json'] = render(root, reportFor(root, usageRecord({ status: 'failure' })));

  const first = temporary(t);
  buildArtifacts(first, { runId: 100, rounds: [], chainVerifications: 0, outcome: 'handoff', review: 'none' });
  const early = reportFor(first, usageRecord({ runId: 100, status: 'handoff', start: 1_790_000_000_000 }));
  root = temporary(t);
  buildArtifacts(root, { runId: 200, rounds: [{ round: 2, scope: 'full', statuses: ['passed', 'passed'] }], chainVerifications: 2, chainRepairs: 1, review: 'partial' });
  const late = reportFor(root, usageRecord({ runId: 200, start: 1_790_020_000_000, event: 'repository_dispatch', previousRunId: 100 }), [early.record]);
  out['report-partial-handoff.json'] = render(root, late);
  // Delivered after the continuation above, but exported late from the first execution's artifacts.
  const delayed = render(first, { ...early, records: [early.record, late.record] }, 2);
  out['report-late-older.json'] = delayed;

  root = temporary(t);
  buildArtifacts(root, { identity: 'legacy', review: 'v1' });
  const supplement = writeReview(root, 'partial', {}, 'build-review.supplement.json', reviewer(1000700));
  supplement.supplementalUsage = { input: 1200, output: 300, cacheRead: 0, cacheWrite: 0, reasoning: 0, totalTokens: 1500, records: 2, incomplete: 0, runId: 1000700, attempt: 1 };
  put(root, 'build-review.supplement.json', supplement);
  out['report-legacy-v1-with-v2.json'] = render(root, reportFor(root, usageRecord()), 3);

  const bytes = Buffer.from(`${JSON.stringify(out['report-completed.json'], null, 2)}\n`);
  out['bundle-manifest.json'] = createBundle({ evaluationBytes: bytes, files: [
    { path: 'evidence/verify-1/browser-acceptance/b01.png', role: 'evidence', mediaType: 'image/png', data: png, evidenceIds: ['qa/1/b01.png'] },
    { path: 'report.html', role: 'report-html', mediaType: 'text/html', data: Buffer.from('<!doctype html><title>fixture</title>') }] }).manifest;
  const completed = out['report-completed.json'];
  out['receipt.json'] = { receiptId: 'receiver-generated-id', sourceInstance: completed.source.instance, runKey: completed.run.key,
    revision: completed.revision, bundleSha256: 'a'.repeat(64), state: 'stored' };

  const invalid = {};
  const clone = value => structuredClone(value);
  let bad = clone(completed); bad.reviews[0].modules[0].scores.design.score = 101; invalid['report-score-out-of-range.json'] = bad;
  bad = clone(completed); bad.reviews[0].findings[0].id = 'F1'; bad.reviews[0].findings[0].localId = 'F01'; invalid['report-unscoped-finding.json'] = bad;
  bad = clone(completed); bad.featurePointId = 12; invalid['report-receiver-field.json'] = bad;
  bad = clone(completed); bad.outcome.execution = 'success'; invalid['report-merged-success-state.json'] = bad;
  bad = clone(completed); bad.reviews[0].ui.framework = true; invalid['report-ui-as-framework-score.json'] = bad;
  bad = clone(completed); bad.metrics.counts.businessBuilds = 2; invalid['report-double-counted-build.json'] = bad;
  invalid['receipt-accepted-not-stored.json'] = { ...out['receipt.json'], state: 'accepted' };
  invalid['receipt-missing-identity.json'] = (({ runKey, ...rest }) => rest)(out['receipt.json']);
  bad = clone(out['bundle-manifest.json']); bad.files[0].path = '../evaluation.json'; invalid['bundle-manifest-path-escape.json'] = bad;
  for (const fn of cleanups.splice(0)) fn();
  return { valid: out, invalid };
}

export const contractOf = name => name.startsWith('receipt') ? 'evaluation-receipt.v1' : name.startsWith('bundle-manifest') ? 'evaluation-bundle.v1'
  : name.startsWith('batch') ? 'evaluation-batch.v1' : 'evaluation-report.v1';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const { valid, invalid } = examples();
  const files = [...Object.entries(valid).map(([name, value]) => [name, value]), ...Object.entries(invalid).map(([name, value]) => [`invalid/${name}`, value])];
  let drift = 0;
  if (!check) { rmSync(OUT, { recursive: true, force: true }); mkdirSync(path.join(OUT, 'invalid'), { recursive: true }); }
  for (const [name, value] of files) {
    const text = `${JSON.stringify(value, null, 2)}\n`;
    const file = path.join(OUT, name);
    if (check) { let old = ''; try { old = readFileSync(file, 'utf8'); } catch {} if (old !== text) { drift++; console.error(`Example out of date: ${name}`); } }
    else writeFileSync(file, text);
  }
  if (drift) process.exitCode = 1; else console.log(`${check ? 'Verified' : 'Wrote'} ${files.length} contract examples.`);
}
