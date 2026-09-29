import assert from 'node:assert/strict';
import test from 'node:test';
import { problemSubmission } from '../problem-submission.mjs';

function report() {
  const finding = { id: 'review/1/F1', title: 'Missing validation', kind: 'issue', owner: 'documentation', reviewerStatus: 'open', detail: 'Invalid input is accepted.', impact: 'Incorrect records.', suggestedChange: 'Validate the input.', subjectKeys: ['pkg:validation'] };
  return { type: 'evaluation-report', source: { instance: 'owner/repo' }, run: { key: 'owner/repo/issues/1/initial', task: { issue: 1 }, case: null }, reviews: [{ selected: true, findings: [finding] }], qa: { criteria: [] } };
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
test('reruns of the same task share fingerprints while separate tasks stay distinct', () => {
  const r = report(), first = problemSubmission(r).problems[0];
  assert.match(first.fingerprint, /^[a-f0-9]{64}$/);
  r.run.key = 'owner/repo/issues/1/build/99';
  const rebuilt = problemSubmission(r).problems[0];
  assert.notEqual(rebuilt.key, first.key);
  assert.equal(rebuilt.fingerprint, first.fingerprint);
  // Daily preset runs open a new Issue each time; the preset is the task.
  const preset = n => ({ ...report(), run: { key: `owner/repo/issues/${n}/initial`, task: { issue: n }, case: { source: 'preset', presetIssueNumber: 7 } } });
  const [a, b] = [preset(10), preset(11)].map(x => problemSubmission(x).problems[0]);
  assert.notEqual(a.key, b.key);
  assert.equal(a.fingerprint, b.fingerprint);
  assert.notEqual(a.fingerprint, first.fingerprint);
  const other = preset(12); other.run.case.presetIssueNumber = 8;
  assert.notEqual(problemSubmission(other).problems[0].fingerprint, a.fingerprint);
  const reworded = report(); reworded.reviews[0].findings[0].title = 'Validation is missing';
  assert.notEqual(problemSubmission(reworded).problems[0].fingerprint, first.fingerprint);
});
test('strengths, resolved findings, and unselected reviews are not new problems', () => {
  const r = report(), original = r.reviews[0].findings[0];
  r.reviews[0].findings = [{ ...original, kind: 'strength' }, { ...original, reviewerStatus: 'resolved' }];
  r.reviews.push({ selected: false, findings: [original] });
  assert.deepEqual(problemSubmission(r), { version: 1, problems: [] });
});
test('only NocoBase3-owned findings are submitted', () => {
  const r = report(), original = r.reviews[0].findings[0];
  r.reviews[0].findings = ['framework', 'plugin', 'template', 'documentation', 'application', 'factory', 'environment', 'unknown']
    .map((owner, i) => ({ ...original, id: `review/1/F${i + 1}`, owner, title: `Problem ${owner}` }));
  assert.deepEqual(problemSubmission(r).problems.map(problem => problem.title),
    ['Problem framework', 'Problem plugin', 'Problem template', 'Problem documentation']);
});
test('failed QA criteria no finding attributes to NocoBase3 are never submitted', () => {
  const r = report();
  r.qa.criteria = [{ id: 'B1', text: 'Check 1', finalFull: 'failed' }];
  r.reviews[0].findings[0].owner = 'application';
  assert.deepEqual(problemSubmission(r), { version: 1, problems: [] });
  r.reviews = [];
  assert.deepEqual(problemSubmission(r), { version: 1, problems: [] });
  assert.deepEqual(problemSubmission({ type: 'evaluation-batch' }), { version: 1, problems: [] });
});
