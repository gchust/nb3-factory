import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseAcceptance, parseAcceptanceCriteria, acceptanceCriteria, renderAcceptance, validateCoverage } from '../acceptance-criteria.mjs';
import { retestMetadata } from '../qa-retest.mjs';

const scripts = path.resolve(import.meta.dirname, '..');
const numbered = Array.from({ length: 16 }, (_, i) => `B${String(i + 1).padStart(2, '0')}. Requirement ${i + 1}`).join('\n');
const metadata = { task: { requirements: 'Business', acceptanceCriteria: numbered } };

test('B01-B16 preserves all IDs and only B06 is selected for a failed retest', () => {
  const criteria = parseAcceptanceCriteria(numbered);
  assert.equal(criteria.length, 16);
  assert.equal(criteria[5].id, 'B06');
  const focus = retestMetadata(metadata, { checks: [{ criterion: 'B06. Requirement 6', status: 'failed' }] });
  assert.deepEqual(focus.task.qaCriteriaIds, ['B06']);
  assert.equal(focus.task.acceptanceCriteria, numbered);
  assert.equal(acceptanceCriteria(focus.task).length, 1);
  assert.match(renderAcceptance(focus.task), /^B06\. Requirement 6$/u);
  assert.equal(metadata.task.qaScope, undefined);
});

test('numeric, bullet, prefixed and multi-line criteria share stable parsing', () => {
  for (const marker of ['1. ', '1) ', '- ', '* ']) {
    assert.deepEqual(parseAcceptanceCriteria(marker + 'One')[0], { id: 'C01', text: 'One', optional: false });
  }
  const parsed = parseAcceptance('Instructions\n\nB01. First\n  - child\n  continued\n\nB02. Second');
  assert.equal(parsed.preamble, 'Instructions');
  assert.equal(parsed.criteria.length, 2);
  assert.match(parsed.criteria[0].text, /child\n  continued$/u);
  assert.equal(parseAcceptanceCriteria('WF-01. Trigger workflow')[0].id, 'WF-01');
  assert.equal(parseAcceptanceCriteria('first line\nsecond line')[0].text, 'first line\nsecond line');
  assert.throws(() => parseAcceptanceCriteria(''), /empty/u);
  assert.throws(() => parseAcceptanceCriteria('B01. One\nB01. Two'), /duplicate/u);
});

test('code fences are data, not separate acceptance items', () => {
  const result = parseAcceptanceCriteria('B01. Test\n```text\n1. example\n```\nB02. Save');
  assert.equal(result.length, 2);
  assert.match(result[0].text, /1\. example/u);
});

test('coverage cannot be satisfied by duplicate, unrelated, or unknown results', () => {
  const criteria = parseAcceptanceCriteria(numbered);
  assert.throws(() => validateCoverage([{ id: 'B01' }], criteria), /Missing acceptance results/u);
  assert.throws(() => validateCoverage([{ id: 'B01' }, { id: 'B01' }], criteria), /Duplicate/u);
  assert.throws(() => validateCoverage([{ id: 'B99' }], criteria), /Unknown/u);
  assert.throws(() => validateCoverage([{ criterion: 'unrelated' }], criteria), /Missing or ambiguous/u);
  const checks = criteria.map((c) => ({ id: c.id, criterion: 'shortened wording' }));
  validateCoverage(checks, criteria);
  assert.equal(checks[5].criterion, 'Requirement 6');
});

function fixture(t, criteria = 'B01. Open page\nB02. Save data') {
  const root = mkdtempSync(path.join(os.tmpdir(), 'factory-criteria-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'evidence'));
  writeFileSync(path.join(root, 'metadata.json'), JSON.stringify({ task: { acceptanceCriteria: criteria } }));
  writeFileSync(path.join(root, 'commands.log'), 'open\nsnapshot\nfill\nscreenshot\n');
  writeFileSync(path.join(root, 'evidence/check.png'), Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(1100)]));
  const checks = parseAcceptanceCriteria(criteria).map((c) => ({ id: c.id, criterion: c.text, status: 'passed', actions: ['Opened and operated'], evidence: ['Observed result'], screenshots: ['check.png'] }));
  function run(patch = {}) {
    writeFileSync(path.join(root, 'report.json'), JSON.stringify({ passed: true, authenticated: true, summary: 'Result', checks, failures: [], ...patch }));
    return spawnSync(process.execPath, [path.join(scripts, 'validate-browser-report.mjs'), '--metadata', path.join(root, 'metadata.json'), '--report', path.join(root, 'report.json'), '--commands', path.join(root, 'commands.log'), '--evidence', path.join(root, 'evidence')], { encoding: 'utf8' });
  }
  return { root, checks, run };
}

test('the actual validator requires all sixteen IDs, not just one matching count', (t) => {
  const f = fixture(t, numbered);
  assert.equal(f.run().status, 0);
  assert.equal(f.run({ checks: f.checks.slice(0, 1) }).status, 2);
  assert.equal(f.run({ checks: [...f.checks.slice(0, 15), f.checks[0]] }).status, 2);
});

test('blocked and not_run cannot become green or enter the application repair path', (t) => {
  const f = fixture(t);
  f.checks[1] = { ...f.checks[1], status: 'blocked', reason: 'Browser Worker probe failed', screenshots: [] };
  assert.equal(f.run().status, 20);
  assert.equal(JSON.parse(readFileSync(path.join(f.root, 'report.json'))).passed, false);
  f.checks[1].status = 'not_run';
  assert.equal(f.run().status, 2);
  f.checks[1].status = 'failed';
  f.checks[1].screenshots = ['check.png'];
  assert.equal(f.run({ passed: false }).status, 10);
});

test('only explicitly optional independent checks may be unexecuted', (t) => {
  const f = fixture(t, 'B01. Open page\nB02. [optional] External test provider');
  f.checks[1] = { ...f.checks[1], status: 'not_run', reason: 'No test provider configured', screenshots: [] };
  assert.equal(f.run().status, 0);
});

test('top-level failure without an observed failed check goes back to QA', (t) => {
  const f = fixture(t);
  assert.equal(f.run({ passed: false, failures: ['Unclear summary'] }).status, 2);
});

test('an entirely blocked browser needs no invented screenshot and cannot claim success', (t) => {
  const f = fixture(t);
  writeFileSync(path.join(f.root, 'commands.log'), '');
  for (const c of f.checks) Object.assign(c, {status: 'blocked', reason: 'Browser unavailable', screenshots: []});
  assert.equal(f.run().status, 20);
  assert.equal(JSON.parse(readFileSync(path.join(f.root, 'report.json'))).passed, false);
});
