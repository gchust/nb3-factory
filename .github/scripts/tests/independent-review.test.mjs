import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { archiveReview, bindReview, buildReviewPrompt, parseReviewRequest, reviewIds, validateReview } from '../independent-review.mjs';
const digest = s => createHash('sha256').update(s).digest('hex');
const source = { repository: 'owner/repo', issue: 2, runId: 123, attempt: 1, status: 'delivered' };
const m = { repository: source.repository, issue: { number: 2 }, run: { id: 123, attempt: 1 }, workBranch: 'agent/issue-2',
  controlSha: 'a'.repeat(40), applicationBase: { sha: 'b'.repeat(40) }, task: { targetBranch: 'develop', requirements: 'Small business task', reviewCriteria: 'R01. Check code\nR02. Check real evidence' } };
const p = { number: 3, head: { sha: 'c'.repeat(40), ref: m.workBranch, repo: { full_name: source.repository } }, base: { ref: 'develop' },
  body: '<!-- agent-issue: 2 -->\n<!-- agent-head-sha: '+ 'c'.repeat(40) +' -->\n- [GitHub Actions 运行记录](https://github.com/owner/repo/actions/runs/123)' };
const binding = () => bindReview(source, m, p, 'd'.repeat(40));
function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'review-schema-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'app/skills/example'), { recursive: true }); mkdirSync(path.join(root, 'evidence'));
  writeFileSync(path.join(root, 'app/example.ts'), 'export const answer = 1;\n');
  writeFileSync(path.join(root, 'app/skills/example/SKILL.md'), 'Use the public API.');
  writeFileSync(path.join(root, 'evidence/report.json'), '{"passed":true}');
  const report = { version: 1, headSha: binding().headSha, criteriaSha256: binding().criteriaSha256,
    checks: ['R01', 'R02'].map(checkId => ({ checkId, module: 'example',
      functionality: { status: 'passed', reason: 'Recorded runtime evidence' }, code: { status: 'passed', reason: 'Code inspected' },
      evidence: { status: 'passed', reason: 'References found' }, skillStatus: 'passed',
      sourceLocations: [{ path: 'example.ts', line: 1 }], skills: [{ path: 'skills/example/SKILL.md', sha256: digest('Use the public API.'), clause: 'Use public API' }],
      runtimeEvidence: ['report.json'], causeCategory: 'unknown', suggestedChange: 'No change supported by current evidence' })) };
  return { root, report, validate: r => validateReview(r, binding(), path.join(root, 'app'), path.join(root, 'evidence')) };
}

test('only owner commands on manual Issues can trigger independent review', () => {
  const event = { repository: { owner: { login: 'owner' } }, issue: { number: 211, labels: ['factory:manual'] }, comment: { user: { login: 'owner' }, body: '/factory-review 2 123 1' } };
  assert.equal(parseReviewRequest(event).issue, 2);
  assert.equal(parseReviewRequest({ ...event, comment: { ...event.comment, user: { login: 'other' } } }), null);
  assert.equal(parseReviewRequest({ ...event, issue: { ...event.issue, labels: [] } }), null);
  assert.equal(parseReviewRequest({ ...event, issue: { ...event.issue, pull_request: {} } }), null);
  assert.equal(parseReviewRequest({ ...event, comment: { ...event.comment, body: 'quoted /factory-review 2 123' } }), null);
});

test('review binds exact delivery and frozen rubric; moved PR and absent rubric fail', () => {
  assert.equal(binding().headSha, p.head.sha);
  assert.throws(() => bindReview(source, { ...m, run: { id: 123, attempt: 2 } }, p, 'd'.repeat(40)), /attempt/);
  assert.throws(() => bindReview(source, m, { ...p, body: p.body.replace(/<!-- agent-head-sha:.*-->/, '') }, 'd'.repeat(40)), /marker/);
  assert.throws(() => bindReview(source, m, { ...p, head: { ...p.head, sha: 'e'.repeat(40) } }, 'd'.repeat(40)), /no longer matches/);
  assert.throws(() => bindReview({ ...source, status: 'failure' }, m, p, 'd'.repeat(40)), /delivered/);
  assert.throws(() => bindReview(source, { ...m, task: { ...m.task, reviewCriteria: '' } }, p, 'd'.repeat(40)), /No frozen/);
  assert.deepEqual(reviewIds(m.task.reviewCriteria), ['R01','R02']);
  assert.throws(() => reviewIds('R01. one\nR01. two'), /Duplicate/);
  const prompt = buildReviewPrompt(binding(), '/app', '/evidence', '/out/report.json');
  assert.match(prompt, /READ-ONLY/); assert.match(prompt, /Do not modify/); assert.match(prompt, /R02/);
});

test('valid independent dimensions receive actual source and evidence hashes', t => {
  const f = fixture(t), report = f.validate(f.report);
  assert.equal(report.checks[0].sourceLocations[0].sha256.length, 64);
  assert.equal(report.checks[0].runtimeEvidence[0].sha256.length, 64);
  assert.match(report.boundary, /not proof/);
});

test('wrong commit, missing/duplicate IDs, nonexistent line and Skill hashes fail', t => {
  const f = fixture(t);
  for (const mutate of [r => { r.headSha = 'e'.repeat(40); }, r => { r.checks.pop(); }, r => { r.checks[1].checkId = 'R01'; },
    r => { r.checks[0].sourceLocations[0].line = 999; }, r => { r.checks[0].skills[0].sha256 = '0'.repeat(64); },
    r => { r.checks[0].code.status = 'green'; }]) {
    const r = structuredClone(f.report); mutate(r); assert.throws(() => f.validate(r));
  }
});

test('unknown and unexecuted remain explicit; no bare pass without evidence', t => {
  const f = fixture(t), r = structuredClone(f.report);
  for (const c of r.checks) {
    c.functionality.status = 'not_run'; c.code.status = 'unknown'; c.evidence.status = 'blocked'; c.skillStatus = 'not_applicable';
    c.sourceLocations = []; c.skills = []; c.runtimeEvidence = [];
  }
  assert.equal(f.validate(r).checks[0].functionality.status, 'not_run');
  r.checks[0].functionality.status = 'passed'; assert.throws(() => f.validate(r), /Runtime pass/);
});

test('references cannot escape source or evidence root through a link or traversal', t => {
  const f = fixture(t), r = structuredClone(f.report);
  symlinkSync('/etc/passwd', path.join(f.root, 'app/outside'));
  r.checks[0].sourceLocations = [{ path: 'outside', line: 1 }]; assert.throws(() => f.validate(r), /leaves/);
  r.checks[0].sourceLocations = [{ path: '../evidence/report.json', line: 1 }]; assert.throws(() => f.validate(r), /Unsafe/);
});

test('publisher independently validates with a fresh checkout and has no model credentials', () => {
  const w = readFileSync(path.resolve(import.meta.dirname, '../../workflows/independent-review.yml'), 'utf8');
  const publisher = w.split('\n  publish:')[1];
  assert.match(publisher, /needs.prepare.outputs.sha/); assert.match(publisher, /independent-review.mjs validate/);
  assert.doesNotMatch(publisher, /secrets\.|install-agent|run-agent|pnpm install/);
  assert.match(w, /if: always\(\)/); assert.match(w, /FACTORY_AGENT_ROLE: review/);
});

test('review archive preserves known diagnostics, rejects links and records missing outputs', t => {
  const f = fixture(t);
  const root = path.join(f.root, 'review'); mkdirSync(root);
  writeFileSync(path.join(root, 'agent-review.jsonl'), '{"password":"do-not-publish"}\n');
  symlinkSync('/etc/passwd', path.join(root, 'review-prompt.md'));
  writeFileSync(path.join(root, 'unrelated.txt'), 'never package');
  const archive = archiveReview(root, path.join(f.root, 'archive'), binding(), 456, 1, 'failure');
  assert.equal(archive.manifest.files.length, 1);
  assert.ok(archive.manifest.missing.includes('review-prompt.md'));
  assert.equal(archive.manifest.validation, 'failure');
  assert.ok(archive.asset.startsWith('independent-review-issue-2-run-456-attempt-1-'));
});
