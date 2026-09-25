import assert from 'node:assert/strict';
import test from 'node:test';
import { problemSubmission } from '../problem-submission.mjs';

function report() {
  const finding = { id: 'review/1/F1', title: 'Missing validation', kind: 'issue', owner: 'application', reviewerStatus: 'open', detail: 'Invalid input is accepted.', impact: 'Incorrect records.', suggestedChange: 'Validate the input.', subjectKeys: ['pkg:validation'] };
  return { type: 'evaluation-report', source: { instance: 'owner/repo' }, run: { key: 'owner/repo/issues/1/initial' }, reviews: [{ selected: true, findings: [finding] }], qa: { criteria: [] } };
}
test('factory submits open findings with descriptions and stable reassessment identities', () => {
  const r = report(), first = problemSubmission(r);
  assert.equal(first.problems.length, 1);
  assert.match(first.problems[0].description, /Validate the input/);
  assert.deepEqual(first.problems[0].findingIds, ['review/1/F1']);
  r.reviews[0].findings[0].id = 'review/2/F1';
  assert.equal(problemSubmission(r).problems[0].key, first.problems[0].key);
  r.run.key = 'owner/repo/issues/2/initial';
  assert.notEqual(problemSubmission(r).problems[0].key, first.problems[0].key);
});
test('strengths, resolved findings, and unselected reviews are not new problems', () => {
  const r = report(), original = r.reviews[0].findings[0];
  r.reviews[0].findings = [{ ...original, kind: 'strength' }, { ...original, reviewerStatus: 'resolved' }];
  r.reviews.push({ selected: false, findings: [original] });
  assert.deepEqual(problemSubmission(r), { version: 1, problems: [] });
});
test('QA-only tasks submit final failures but never unknown, blocked, or repaired checks', () => {
  const r = report(); r.reviews = [];
  r.qa.criteria = ['failed', 'unknown', 'blocked', 'passed', 'not-run'].map((status, i) => ({ id: String(i), text: 'Check ' + i, finalFull: status }));
  const result = problemSubmission(r);
  assert.equal(result.problems.length, 1); assert.equal(result.problems[0].qaCriterionId, '0');
  assert.deepEqual(problemSubmission({ type: 'evaluation-batch' }), { version: 1, problems: [] });
});
