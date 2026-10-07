import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { MAX_PROBLEM_DESCRIPTION_CHARS, problemSubmission } from '../problem-submission.mjs';

function report() {
  const finding = { id: 'review/1/F1', title: 'Missing validation', kind: 'issue', owner: 'documentation', reviewerStatus: 'open', detail: 'Invalid input is accepted.', impact: 'Incorrect records.', suggestedChange: 'Validate the input.', subjectKeys: ['pkg:validation'] };
  Object.assign(finding, {
    confidence: 'suspected', evidence: ['review/1/E1'],
    diagnosis: { category: 'guidance-gap', trigger: 'Follow the documented input example.', expected: 'Document validation.', actual: 'Validation is omitted.', workaround: 'Add validation in business code.', acceptance: 'The example handles invalid input.' },
    feedbackReview: { status: 'supported', reason: 'The documented example omits validation.', checks: ['contract', 'behavior', 'application', 'environment', 'factory', 'existing-capability'].map(kind => ({ kind, reason: `Checked ${kind}.`, evidence: [kind === 'behavior' ? 'review/1/E2' : 'review/1/E1'] })) },
  });
  return { evidence: [{ id: 'review/1/E2', path: 'packages/@nocobase/validation/index.js', lines: [1, 2], observation: 'Captured validation implementation.' }, { id: 'review/1/E1', path: 'app/AGENTS.md', lines: [4, 8], sha256: 'a'.repeat(64), observation: 'The documented example omits input validation.' }], type: 'evaluation-report', source: { instance: 'owner/repo' }, run: { key: 'owner/repo/issues/1/initial', task: { issue: 1 }, case: null }, reviews: [{ selected: true, findings: [finding] }], qa: { criteria: [] } };
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

test('unverified, contradicted, unclassified and unknown-status candidates stay in the full report only', () => {
  for (const change of [
    f => { delete f.feedbackReview; },
    f => { f.feedbackReview.status = 'insufficient'; },
    f => { f.feedbackReview.status = 'contradicted'; },
    f => { delete f.diagnosis; },
    f => { f.reviewerStatus = 'unknown'; },
    f => { delete f.reviewerStatus; },
    f => { f.reviewerStatus = 'not-applicable'; },
  ]) {
    const r = report();
    change(r.reviews[0].findings[0]);
    const before = structuredClone(r);
    assert.deepEqual(problemSubmission(r), { version: 1, problems: [] });
    assert.deepEqual(r, before, 'withheld candidates are not removed or rewritten');
  }
});

test('supported advice preserves suspected confidence; a runtime defect still needs original confirmation', () => {
  for (const category of ['guidance-gap', 'capability-gap', 'usability-improvement', 'runtime-defect']) {
    const r = report(), finding = r.reviews[0].findings[0];
    finding.diagnosis.category = category;
    finding.kind = category === 'runtime-defect' ? 'issue' : 'improvement';
    if (category === 'runtime-defect') {
      assert.deepEqual(problemSubmission(r).problems, []);
      finding.confidence = 'confirmed';
    }
    const [problem] = problemSubmission(r).problems;
    assert.ok(problem, category);
    assert.match(problem.description, new RegExp(`诊断类别：${category}`));
    assert.match(problem.description, new RegExp(`confidence=${finding.confidence}; reviewerStatus=open`));
    assert.match(problem.description, /反馈核验：supported/);
    assert.match(problem.description, /review\/1\/E1.*app\/AGENTS\.md:4-8.*sha256:/);
    for (const value of Object.values(finding.diagnosis)) assert.ok(problem.description.includes(value));
    for (const check of finding.feedbackReview.checks) assert.ok(problem.description.includes(check.reason));
    assert.deepEqual(Object.keys(problem).sort(), ['description', 'findingIds', 'fingerprint', 'key', 'subjectKeys', 'taskKey', 'title']);
    assert.equal(Object.hasOwn(problem, 'status'), false, 'no receiver lifecycle write');
  }
});

test('semantic metadata does not change eligible legacy keys or fingerprints', () => {
  const r = report(), finding = r.reviews[0].findings[0];
  const hash = parts => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  const identity = [finding.kind, finding.owner, [...finding.subjectKeys].sort(), finding.title.toLowerCase()];
  const first = problemSubmission(r).problems[0];
  assert.equal(first.key, hash([r.source.instance, r.run.key, ...identity]));
  assert.equal(first.fingerprint, hash([r.source.instance, 'issue-1', ...identity]));
  finding.feedbackReview.reason = 'A newer semantic review supports the same suggestion.';
  finding.diagnosis.acceptance = 'An updated regression criterion.';
  finding.confidence = 'confirmed';
  const again = problemSubmission(r).problems[0];
  assert.equal(again.key, first.key);
  assert.equal(again.fingerprint, first.fingerprint);
  assert.notEqual(again.description, first.description);
});

test('same-identity findings retain each original confidence and scoped citation in one problem', () => {
  const r = report(), first = r.reviews[0].findings[0];
  r.reviews[0].findings.push({ ...structuredClone(first), id: 'review/1/F2', confidence: 'confirmed' });
  const [problem] = problemSubmission(r).problems;
  assert.deepEqual(problem.findingIds, ['review/1/F1', 'review/1/F2']);
  assert.match(problem.description, /confidence=suspected/);
  assert.match(problem.description, /confidence=confirmed/);
  assert.match(problem.description, /review\/1\/F1/);
  assert.match(problem.description, /review\/1\/F2/);
});

test('claiming supported in a DTO cannot bypass the source review structure and references', () => {
  for (const change of [
    f => { f.feedbackReview.checks = []; },
    f => { f.feedbackReview.checks.pop(); },
    f => { f.feedbackReview.checks[0].evidence = []; },
    f => { f.feedbackReview.checks[0].evidence = ['review/1/E999']; },
    f => { f.feedbackReview.checks[1].kind = 'contract'; },
    f => { f.feedbackReview.reason = ''; },
  ]) {
    const r = report();
    change(r.reviews[0].findings[0]);
    assert.deepEqual(problemSubmission(r).problems, []);
  }
  const application = report();
  application.evidence.find(e => e.id === 'review/1/E1').path = 'app/server/business.ts';
  assert.deepEqual(problemSubmission(application).problems, [], 'business code cannot establish a framework contract');
});

// The raw review allows 100 evidence records, 20 refs per check and 2000-character
// narrative fields. Scoped IDs/paths can also approach their DTO length bounds.
function largestReport() {
  const r = report(), finding = r.reviews[0].findings[0];
  const scope = `review/${'r'.repeat(235)}`;
  const longText = '😀'.repeat(1000);
  r.evidence = Array.from({ length: 100 }, (_, index) => {
    const prefix = 'packages/@nocobase/validation/';
    const stemLength = 500 - prefix.length - '.js'.length;
    return { id: `${scope}/E${index + 1}`, path: prefix + '😀'.repeat(Math.floor(stemLength / 2)) + 'x'.repeat(stemLength % 2) + '.js',
      lines: [1, 99], sha256: 'a'.repeat(64), observation: longText };
  });
  finding.id = `${scope}/F1`;
  finding.evidence = r.evidence.slice(0, 60).map(item => item.id);
  for (const key of ['detail', 'impact', 'suggestedChange']) finding[key] = key + '😀'.repeat(Math.floor((2000 - key.length) / 2));
  for (const key of ['trigger', 'expected', 'actual', 'workaround', 'acceptance']) finding.diagnosis[key] = longText;
  finding.feedbackReview.reason = longText;
  finding.feedbackReview.checks.forEach((check, index) => {
    check.reason = longText;
    check.evidence = Array.from({ length: 20 }, (_, i) => r.evidence[(index * 20 + i) % r.evidence.length].id);
  });
  return r;
}

test('a maximum-size finding stays below the receiver description bound with compact traceable citations', () => {
  const r = largestReport(), before = structuredClone(r);
  const [problem] = problemSubmission(r).problems;
  assert.equal(MAX_PROBLEM_DESCRIPTION_CHARS, 100000);
  assert.ok(problem.description.length <= 100000);
  assert.ok(problem.description.length >= 99999, 'exercise the actual final truncation boundary');
  assert.equal(problem.description.isWellFormed(), true, 'no split UTF-16 surrogate pair');
  assert.match(problem.description, /confidence=suspected; reviewerStatus=open/);
  assert.match(problem.description, /诊断类别：guidance-gap/);
  assert.match(problem.description, /反馈核验：supported/);
  for (const check of r.reviews[0].findings[0].feedbackReview.checks)
    assert.ok(problem.description.includes(`核验 ${check.kind}：`));
  assert.ok(problem.description.includes(r.evidence[0].id));
  assert.match(problem.description, /sha256:[a-f0-9]{64}/);
  assert.match(problem.description, /checks:contract/);
  assert.match(problem.description, /已节选；原文和完整证据见完整报告/);
  assert.deepEqual(r, before, 'the complete original report and long observations are untouched');
});

test('the description limit applies after same-key merging and preserves every finding summary', () => {
  const r = largestReport(), first = r.reviews[0].findings[0];
  const before = problemSubmission(r).problems[0];
  r.reviews[0].findings = Array.from({ length: 60 }, (_, index) => ({ ...structuredClone(first),
    id: first.id.replace(/F1$/, `F${index + 1}`), confidence: index % 2 ? 'confirmed' : 'suspected' }));
  const [problem] = problemSubmission(r).problems;
  assert.equal(problem.key, before.key);
  assert.equal(problem.fingerprint, before.fingerprint);
  assert.equal(problem.findingIds.length, 60);
  assert.ok(problem.description.length <= 100000);
  assert.ok(problem.description.length > 99000, 'exercise an overflowing merged description');
  assert.equal(problem.description.isWellFormed(), true, 'field and final clipping preserve supplementary Unicode');
  for (const finding of r.reviews[0].findings) assert.ok(problem.description.includes(finding.id));
  assert.equal(problem.description.match(/诊断类别：guidance-gap/g).length, 60);
  assert.equal(problem.description.match(/反馈核验：supported/g).length, 60);
  assert.equal(problem.description.match(/confidence=confirmed; reviewerStatus=open/g).length, 30);
  assert.equal(problem.description.match(/confidence=suspected; reviewerStatus=open/g).length, 30);
  for (const check of first.feedbackReview.checks)
    assert.equal(problem.description.split(`核验 ${check.kind}：`).length - 1, 60);
  assert.match(problem.description, /已节选；原文和完整证据见完整报告/);
});
