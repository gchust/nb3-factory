import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { collectDelivery, makeDeliveryReport } from '../delivery-report.mjs';
import { collectMedia } from '../visual-report.mjs';
import { emptyUsage, aggregate } from '../task-usage.mjs';

function fixture(t, blocked = false) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pipeline-reports-'));
  t.after(() => rmSync(root, {recursive:true,force:true}));
  function put(file, value) {
    const dest = path.join(root, file);
    mkdirSync(path.dirname(dest), {recursive:true});
    writeFileSync(dest, Buffer.isBuffer(value) ? value : JSON.stringify(value));
  }
  const repository = 'owner/factory';
  const metadata = {repository, issue:{number:161}, task:{targetBranch:'issues-161',acceptanceCriteria:'B01. Open page\nB02. [optional] External provider'}};
  put('task-metadata.json', metadata);
  put('repair-summary.json', {verificationAttempts:1,repairAttempts:0,finalVerificationAttempt:7});
  const png = Buffer.alloc(1100); Buffer.from('89504e470d0a1a0a','hex').copy(png);
  put('verify-7/browser-acceptance/evidence/page.png', png);
  put('verify-7/browser-acceptance/report.json', {passed:!blocked,authenticated:true,summary:'Result',failures:[],checks:[
    {id:'B01',criterion:'Open page',status:blocked?'blocked':'passed',reason:blocked?'Browser probe failed':undefined,actions:['Opened'],evidence:['Observed'],screenshots:blocked?[]:['page.png']},
    {id:'B02',criterion:'External provider',status:'not_run',reason:'Not configured',actions:['Checked configuration'],evidence:['Provider absent'],screenshots:[]},
  ]});
  const record = {version:1,repository,issue:161,runId:100,attempt:1,status:blocked?'failure':'delivered',start:1000,end:4000,jobs:[],usage:emptyUsage()};
  return {root, put, report:{record,records:[record],cumulative:aggregate([record]),timings:[]}};
}

test('resumed delivery and media use the absolute final round, not this run count', t => {
  const f = fixture(t);
  const { facts } = collectDelivery(f.root, f.report);
  assert.equal(facts.checks[0].source, 'verify-7/browser-acceptance/report.json');
  assert.equal(facts.checks[0].status, 'passed');
  assert.ok(collectMedia(f.root, path.join(f.root,'media')));
});

test('blocked reasons remain explicit in HTML and cannot authorize media publication', async t => {
  const f = fixture(t, true);
  const {html, facts} = await makeDeliveryReport(f.report, f.root);
  assert.equal(facts.checks.length, 2);
  assert.equal(facts.checks[0].status, 'not-verified');
  assert.match(html, /环境受阻：Browser probe failed/);
  assert.throws(() => collectMedia(f.root, path.join(f.root,'media')), /has not passed/);
});

test('new workflow pins code and explicitly resumes incomplete implementation', () => {
  const workflow = readFileSync(path.resolve(import.meta.dirname, '../../workflows/code-agent-task.yml'), 'utf8');
  assert.match(workflow, /pipeline-state\.mjs restore handoff/);
  assert.match(workflow, /steps\.resume\.outputs\.phase == 'implementation'/);
  assert.match(workflow, /pipeline-state\.mjs seal/);
  assert.ok(workflow.includes('control_sha: ${{ steps.baseline.outputs.sha }}'));
  assert.ok(!workflow.split('  agent:')[1].includes('ref: ${{ needs.prepare.outputs.default_branch }}'));
  assert.ok(workflow.indexOf('- name: Prepare and validate browser environment') < workflow.indexOf('- name: Run Code Agent implementation'));
});
