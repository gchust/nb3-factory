// Regenerates the fictional, redacted contract examples from the same fixtures
// the tests use, so examples cannot drift from the exporter. No model is called.
//   node .github/contracts/render-examples.mjs [--check]
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { advanceBatch, batchDocument, startBatch, validatePlans } from '../scripts/evaluation-batch.mjs';
import { createBundle } from '../scripts/evaluation-bundle.mjs';
import { commitRevision } from '../scripts/evaluation-registry.mjs';
import { buildEvaluation, finalizeEvaluation } from '../scripts/evaluation-report.mjs';
import { buildArtifacts, control, fakeRepository, png, put, reportFor, temporary, usageRecord, writeReview } from '../scripts/tests/evaluation-fixtures.mjs';

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

// A batch in progress: one sample passed with its report, one inside a handoff chain, one not started.
async function batchExample() {
  const client = fakeRepository();
  const plans = validatePlans({ schemaVersion: 1, plans: [{ key: 'nb3-daily-smoke', enabled: true, schedule: 'daily', baselineRef: 'develop',
    cases: [{ key: 'F00', presetIssueNumber: 176, samples: 3 }], execution: { maxConcurrentSamples: 1, maxRepairAttempts: 2, maxActiveSecondsPerSample: 3600, maxContinuations: 2 },
    reviewMode: 'inherit' }] }, { defaultBranch: 'develop' });
  let now = Date.parse('2026-09-25T01:23:00Z');
  const env = { GITHUB_SHA: control, CODE_AGENT_ENGINE: 'pi', CODE_AGENT_MODEL: 'fixture-model', CODE_AGENT_THINKING: 'high', FACTORY_REVIEW_THINKING: 'medium' };
  const started = await startBatch(client, { plans, planKey: 'nb3-daily-smoke', trigger: 'schedule', now, runId: 1000100, controlSha: control, env });
  let batch = await advanceBatch(client, started.batch, { now, env });
  const [first] = client.samples();
  client.run(first.number, { id: 1000201 });
  await commitRevision(client, { document: { type: 'evaluation-report', revision: 1, createdAt: '2026-09-25T02:40:00Z', source: { instance: client.repository },
    run: { key: batch.manifest.samples[0].runKey }, outcome: { execution: 'completed', acceptance: 'passed', delivery: 'published' },
    precedence: { producer: { runId: 1000201, attempt: 1, startedAt: '2026-09-25T01:30:00Z' }, reviewState: 'completed', reviewRubric: 2, qaCoverage: 'complete' } },
  evaluationBytes: Buffer.from('{}'), manifestBytes: Buffer.from('{}'), fingerprint: 'a'.repeat(64), bundle: { sha256: 'b'.repeat(64), size: 1 }, location: null,
  now: new Date('2026-09-25T02:40:00Z') });
  batch = await advanceBatch(client, batch, { now: (now += 5_400_000), env });
  client.run(client.samples()[1].number, { id: 1000202, delivered: false, handoff: true });
  batch = await advanceBatch(client, batch, { now: (now += 3_600_000), env });
  return finalizeEvaluation(batchDocument(batch, { exporter }), { revision: batch.state.sequence, createdAt }).document;
}

export async function examples() {
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

  out['batch-in-progress.json'] = await batchExample();

  for (const fn of cleanups.splice(0)) fn();
  return { valid: out, invalid: invalidExamples(out) };
}

// Invalid examples are small edits of valid ones (examples/invalid-cases.json), so
// they stay readable and follow the valid examples when those are regenerated.
const pointer = value => value.split('/').slice(1).map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'));
function edit(document, target, apply) {
  const parts = pointer(target);
  const last = parts.pop();
  const parent = parts.reduce((node, part) => {
    if (node?.[part] === undefined) throw new Error(`No ${target} in the base example`);
    return node[part];
  }, document);
  apply(parent, Array.isArray(parent) ? Number(last) : last);
}
export function invalidExamples(valid) {
  const { cases } = JSON.parse(readFileSync(path.join(OUT, 'invalid-cases.json'), 'utf8'));
  return Object.fromEntries(cases.map(item => {
    const value = structuredClone(valid[item.base]);
    if (!value) throw new Error(`${item.name}: unknown base ${item.base}`);
    for (const target of item.remove ?? []) edit(value, target, (parent, key) => {
      if (!(key in parent)) throw new Error(`No ${target} in the base example`);
      if (Array.isArray(parent)) parent.splice(key, 1); else delete parent[key];
    });
    for (const [target, replacement] of Object.entries(item.set ?? {})) edit(value, target, (parent, key) => { parent[key] = replacement; });
    return [item.name, { contract: contractOf(item.base), value }];
  }));
}

export const contractOf = name => name.startsWith('receipt') ? 'evaluation-receipt.v1' : name.startsWith('bundle-manifest') ? 'evaluation-bundle.v1'
  : name.startsWith('batch') ? 'evaluation-batch.v1' : 'evaluation-report.v1';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const { valid } = await examples();
  let drift = 0;
  for (const [name, value] of Object.entries(valid)) {
    const text = `${JSON.stringify(value, null, 2)}\n`;
    const file = path.join(OUT, name);
    if (check) { let old = ''; try { old = readFileSync(file, 'utf8'); } catch {} if (old !== text) { drift++; console.error(`Example out of date: ${name}`); } }
    else writeFileSync(file, text);
  }
  // Generated examples that are no longer produced are stale.
  for (const name of readdirSync(OUT).filter(file => file.endsWith('.json') && file !== 'invalid-cases.json' && !valid[file])) {
    if (check) { drift++; console.error(`Stale example: ${name}`); } else rmSync(path.join(OUT, name));
  }
  if (drift) process.exitCode = 1; else console.log(`${check ? 'Verified' : 'Wrote'} ${Object.keys(valid).length} contract examples.`);
}
