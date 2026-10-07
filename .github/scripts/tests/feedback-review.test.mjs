import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyFeedbackReview,
  feedbackCheckKinds,
  feedbackReserve,
  isFeedbackCandidate,
  selectFeedbackCandidates,
  validateFeedbackReview,
} from '../feedback-review.mjs';

const sources = () => [
  {
    id: 'E1',
    kind: 'skill',
    path: 'app/.agents/skills/example/SKILL.md',
    lines: [1, 4],
    observation: 'Public contract',
  },
  {
    id: 'E2',
    kind: 'package',
    path: 'packages/@nocobase/example/dist/index.js',
    lines: [1, 4],
    observation: 'Implementation',
  },
  {
    id: 'E3',
    kind: 'code',
    path: 'app/server/example.ts',
    lines: [1, 4],
    observation: 'Application use',
  },
];
const finding = (id = 'F1') => ({
  id,
  kind: 'issue',
  owner: 'framework',
  confidence: 'confirmed',
  status: 'open',
  severity: 'minor',
  diagnosis: { category: 'runtime-defect' },
});
const supported = () => ({
  status: 'supported',
  reason: 'Specific contract and implementation mismatch, alternatives checked',
  checks: feedbackCheckKinds.map((kind) => ({
    kind,
    reason: `Observed ${kind} evidence`,
    evidence: [kind === 'contract' ? 'E1' : kind === 'behavior' ? 'E2' : 'E3'],
  })),
});
const assessment = () => ({
  inputHash: 'a'.repeat(64),
  findings: [finding(), finding('F2')],
  evidence: sources(),
});
const envelope = (value) => ({
  version: 1,
  inputHash: 'a'.repeat(64),
  findings: value,
  evidence: [],
});

test('candidate selection is bounded, prioritizes high risk, and preserves unknown processing status for visible review', () => {
  const findings = Array.from({ length: 15 }, (_, index) =>
    finding(`F${index + 1}`),
  );
  findings[14].severity = 'critical';
  findings[14].status = 'unknown';
  const selected = selectFeedbackCandidates({ findings });
  assert.equal(selected.length, 12);
  assert.equal(selected[0].id, 'F15');
  for (const status of ['resolved', 'not-applicable'])
    assert.equal(isFeedbackCandidate({ ...finding(), status }), false);
  for (const owner of ['application', 'factory', 'environment', 'unknown'])
    assert.equal(isFeedbackCandidate({ ...finding(), owner }), false);
  assert.equal(isFeedbackCandidate({ ...finding(), kind: 'strength' }), false);
  assert.equal(feedbackReserve(30), 0);
  assert.equal(feedbackReserve(120), 30);
  assert.equal(feedbackReserve(3600), 180);
});

test('support needs a contract, actual behavior and all evidenced alternative checks', () => {
  validateFeedbackReview(supported(), sources(), finding());
  for (const kind of feedbackCheckKinds) {
    const review = supported();
    review.checks = review.checks.filter((check) => check.kind !== kind);
    assert.throws(
      () => validateFeedbackReview(review, sources(), finding()),
      /every counter-evidence/,
    );
  }
  const noRefs = supported();
  noRefs.checks[2].evidence = [];
  assert.throws(
    () => validateFeedbackReview(noRefs, sources(), finding()),
    /cited checks/,
  );
  const fake = supported();
  fake.checks[0].evidence = ['E99'];
  assert.throws(
    () => validateFeedbackReview(fake, sources(), finding()),
    /Unknown feedback/,
  );
  const appOnly = supported();
  appOnly.checks[0].evidence = ['E3'];
  assert.throws(
    () => validateFeedbackReview(appOnly, sources(), finding()),
    /framework contract/,
  );
  const declarations = sources();
  declarations[1].path = 'packages/@nocobase/example/dist/index.d.ts';
  assert.throws(
    () => validateFeedbackReview(supported(), declarations, finding()),
    /original observed behavior/,
  );
  for (const path of [
    'artifacts/agent-history/agent-implement.jsonl/part-0001.txt',
    'artifacts/verify-1.log',
  ]) {
    const observed = sources();
    observed[1].path = path;
    validateFeedbackReview(supported(), observed, finding());
  }
  const inventory = sources();
  inventory[0].path = 'packages/@nocobase/example/package.json';
  assert.throws(
    () => validateFeedbackReview(supported(), inventory, finding()),
    /framework contract/,
  );
});

test('advice does not need a runtime failure, but contradiction needs an actual source', () => {
  const declarations = sources();
  declarations[1].path = 'packages/@nocobase/example/dist/index.d.ts';
  for (const category of [
    'guidance-gap',
    'capability-gap',
    'usability-improvement',
  ])
    validateFeedbackReview(supported(), declarations, {
      ...finding(),
      diagnosis: { category },
    });
  assert.throws(
    () =>
      validateFeedbackReview(
        {
          status: 'contradicted',
          reason: 'Another agent disagrees',
          checks: [],
        },
        sources(),
        finding(),
      ),
    /source evidence/,
  );
  validateFeedbackReview(
    {
      status: 'insufficient',
      reason: 'Missing original invocation; high-risk candidate preserved',
      checks: [],
    },
    sources(),
    finding(),
  );
});

test('per-candidate rejection does not suppress a valid sibling or mutate original confidence/lifecycle', () => {
  const original = assessment();
  original.findings[1].confidence = 'suspected';
  original.findings[1].status = 'unknown';
  const malformed = supported();
  malformed.checks[0].evidence = ['E999'];
  const result = applyFeedbackReview(
    original,
    envelope([
      { findingId: 'F1', ...malformed },
      { findingId: 'F2', ...supported() },
    ]),
    original.findings,
    (evidence) => evidence,
  );
  assert.equal(result.findings[0].feedbackReview.status, 'insufficient');
  assert.equal(result.findings[1].feedbackReview.status, 'supported');
  assert.equal(result.findings[1].confidence, 'suspected');
  assert.equal(result.findings[1].status, 'unknown');
  assert.equal(original.findings[0].feedbackReview, undefined);
});

test('missing, duplicate, stale and over-budget candidate outputs never promote a claim', () => {
  const original = assessment();
  let result = applyFeedbackReview(
    original,
    envelope([]),
    [original.findings[0]],
    (evidence) => evidence,
  );
  assert.match(result.findings[0].feedbackReview.reason, /未返回/);
  assert.match(result.findings[1].feedbackReview.reason, /预算/);
  result = applyFeedbackReview(
    original,
    envelope([
      { findingId: 'F1', ...supported() },
      { findingId: 'F1', ...supported() },
    ]),
    original.findings,
    (evidence) => evidence,
  );
  assert.match(result.findings[0].feedbackReview.reason, /Duplicate/);
  assert.throws(
    () =>
      applyFeedbackReview(
        original,
        { ...envelope([]), inputHash: 'b'.repeat(64) },
        original.findings,
        (evidence) => evidence,
      ),
    /identity/,
  );
});

test('candidate evidence cannot shadow source IDs, forge excerpts or survive source validation failure', () => {
  const original = assessment();
  const draft = envelope([{ findingId: 'F1', ...supported() }]);
  draft.evidence = [{ ...sources()[0], observation: 'Fake replacement' }];
  let result = applyFeedbackReview(
    original,
    draft,
    original.findings,
    (evidence) => evidence,
  );
  assert.match(result.findings[0].feedbackReview.reason, /shadows/);
  draft.evidence = [];
  result = applyFeedbackReview(original, draft, original.findings, () => {
    throw new Error('Evidence lines outside captured file');
  });
  assert.match(
    result.findings[0].feedbackReview.reason,
    /outside captured file/,
  );
  assert.deepEqual(result.evidence, original.evidence);
});
