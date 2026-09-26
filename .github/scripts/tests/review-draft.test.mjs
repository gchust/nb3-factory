import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { digest } from '../build-review.mjs';
import { finalizeAssessment } from '../check-review-draft.mjs';

const tool = path.resolve(import.meta.dirname, '../check-review-draft.mjs');
function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'review-draft-'));
  t.after(() => rmSync(root, {recursive:true,force:true}));
  const put = (relative, value) => {
    const file=path.join(root,relative); mkdirSync(path.dirname(file), {recursive:true});
    writeFileSync(file,typeof value==='string'?value:JSON.stringify(value));
  };
  const file='packages/@nocobase/example/dist/index.js', data='export const value = 1;\n';
  put(file,data);
  const catalog=[{path:file,kind:'text',sha256:digest(data),lines:2}];
  const basis={rubricVersion:2,inputHash:'a'.repeat(64),packages:[{name:'@nocobase/example',version:'fixture'}]};
  const process={rounds:[{reports:[{checks:[{id:'B01'}]}]}]};
  const score={score:80,reason:'Fixture source contract',evidence:['E1']};
  const review={version:2,inputHash:basis.inputHash,summary:'Fixture, not a real assessment',
    progress:{complete:true,pendingModules:[]},limitations:[],findings:[],
    modules:[{name:'Fixture capability',scope:'One public export',limitations:'Fixture only',criteria:['B01'],
      targets:[{kind:'library',name:'@nocobase/example',entrypoints:['value'],evidence:['E1']}],
      requirements:[{need:'Read a value',responsibility:'Public constant export',support:'direct',
        recommendedUsage:'Import value',actualUsage:'Imported',gapOwner:'none',evidence:['E1']}],
      scores:Object.fromEntries(['requirementFit','usability','agentFriendliness','design','reliability'].map(k=>[k,{...score}]))}],
    evidence:[{id:'E1',kind:'package',path:file,lines:[1,1],observation:'Actual fixture export'}],
    ui:{status:'not-reviewed',score:null,reason:'No images',evidence:[]}};
  put('review-files.json',catalog);put('review-input.json',{basis,process});put('assessment.json',review);
  return {root,put,review,basis,captured:{files:catalog,process,packages:basis.packages,omitted:[]},file,data};
}
const check = root => spawnSync(process.execPath,[tool],{cwd:root,encoding:'utf8'});

test('draft CLI and trusted finalizer accept the same substantive frozen evidence without modifying files', t => {
  const f=fixture(t), before=readFileSync(path.join(f.root,'assessment.json'));
  const result=check(f.root);assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).valid,true);
  assert.equal(finalizeAssessment(f.root,f.captured,f.basis,true).partial,false);
  assert.deepEqual(readFileSync(path.join(f.root,'assessment.json')),before);
  assert.equal(readFileSync(path.join(f.root,f.file),'utf8'),f.data);
  f.review.progress={complete:false,pendingModules:['Another actual capability']};f.put('assessment.json',f.review);
  assert.equal(JSON.parse(check(f.root).stdout).partial,true);
});

for (const failure of ['target-kind','cross-target','unknown-id','invalid-lines','unknown-criterion','changed-source']) {
  test(`draft check and final publication reject ${failure}, no repair or score substitution`,t=>{
    const f=fixture(t);
    if(failure==='target-kind')f.review.modules[0].targets[0].kind='skill';
    if(failure==='cross-target')f.review.modules[0].targets[0].name='@nocobase/other';
    if(failure==='unknown-id')f.review.modules[0].scores.usability.evidence=['E999'];
    if(failure==='invalid-lines')f.review.evidence[0].lines=[3,3];
    if(failure==='unknown-criterion')f.review.modules[0].criteria=['B99'];
    if(failure==='changed-source')f.put(f.file,'modified source');
    f.put('assessment.json',f.review);
    const before=readFileSync(path.join(f.root,'assessment.json'));
    const result=check(f.root);assert.equal(result.status,1,result.stdout);
    const message=JSON.parse(result.stderr).error;assert.ok(message.length>0);
    assert.throws(()=>finalizeAssessment(f.root,f.captured,f.basis,true),error=>error.message===message);
    assert.deepEqual(readFileSync(path.join(f.root,'assessment.json')),before);
  });
}

test('prompt distinguishes target enums from evidence kinds and uses the supplied same-call check',()=>{
  const prompt=readFileSync(path.resolve(import.meta.dirname,'../../prompts/build-review.md'),'utf8');
  assert.match(prompt,/module\.targets\[\]\.kind.*library.*plugin.*guidance/);
  assert.match(prompt,/node \.review-tools\/check-review-draft\.mjs/);
  assert.match(prompt,/本次已有调用和预算内/);
});

function withHistory(t) {
  const f = fixture(t);
  const log = 'agent-implement.jsonl',
    file = 'artifacts/agent-history/' + log + '/part-0001.txt';
  const data =
    '{"type":"tool_execution_start","args":{"command":"read actual Skill"}}\n{"type":"tool_execution_end","isError":true}\n';
  f.put(file, data);
  f.captured.files.push({
    path: file,
    kind: 'text',
    sha256: digest(data),
    lines: 3,
    source: { path: log },
  });
  f.review.evidence.push(
    {
      id: 'E2',
      kind: 'log',
      path: file,
      lines: [1, 1],
      observation: 'Actual read command',
    },
    {
      id: 'E3',
      kind: 'log',
      path: file,
      lines: [2, 2],
      observation: 'Actual failed return',
    },
  );
  f.captured.history = {
    index: {
      version: 2,
      coverage: 'available',
      invocations: [
        {
          log,
          invoked: true,
          missing: [],
          errors: [{ path: file, lines: [2, 2], sourceLine: 42 }],
        },
      ],
    },
  };
  f.review.historyReview = [
    {
      log,
      status: 'reviewed',
      reason: 'Read tool calls and diagnosed failure',
      evidence: ['E2'],
      errors: [
        {
          sourceLine: 42,
          disposition: 'expected',
          reason: 'Negative-path fixture',
          evidence: ['E3'],
        },
      ],
    },
  ];
  f.put('assessment.json', f.review);
  return f;
}

test('complete process coverage needs raw references and every explicit failure disposition', (t) => {
  const f = withHistory(t);
  let result = finalizeAssessment(f.root, f.captured, f.basis, true);
  assert.equal(result.partial, false);
  assert.equal(result.evaluation.historyCoverage.assessedErrorSignals, 1);
  f.review.historyReview[0].errors = [];
  f.put('assessment.json', f.review);
  result = finalizeAssessment(f.root, f.captured, f.basis, true);
  assert.equal(result.partial, true);
  assert.equal(result.evaluation.historyCoverage.assessedErrorSignals, 0);
  assert.match(result.evaluation.limitations.join(' '), /过程证据未完成/);
});

test('metadata inventories and declarations cannot substitute for original invocation events', (t) => {
  const f = withHistory(t);
  f.captured.files.find((file) => file.source).source.path =
    'agent-implement.jsonl.invocation.json';
  assert.equal(
    finalizeAssessment(f.root, f.captured, f.basis, true).partial,
    true,
  );
  delete f.review.historyReview;
  f.put('assessment.json', f.review);
  assert.equal(
    finalizeAssessment(f.root, f.captured, f.basis, true).partial,
    true,
  );
});

test('unknown or duplicate failure signals are rejected instead of inventing coverage', (t) => {
  const f = withHistory(t);
  f.review.historyReview[0].errors[0].sourceLine = 999;
  f.put('assessment.json', f.review);
  assert.throws(
    () => finalizeAssessment(f.root, f.captured, f.basis, true),
    /Unknown or duplicate/,
  );
});

test('report visibly separates complete input from partial process references', async () => {
  const { renderHistoryCoverage } =
    await import('../../reports/build-review.mjs');
  const html = renderHistoryCoverage({
    basis: {
      history: {
        version: 2,
        coverage: 'available',
        sourceBytes: 57 * 1024 * 1024,
        capturedBytes: 57 * 1024 * 1024,
        limitations: [],
      },
    },
    evaluation: {
      historyCoverage: {
        referencedInvocations: 0,
        invocations: 2,
        assessedErrorSignals: 0,
        errorSignals: 3,
      },
    },
  });
  assert.match(html, /完整纳入已捕获记录/);
  assert.match(html, /57.00 MiB/);
  assert.match(html, /0\/2 次调用/);
  assert.match(html, /0\/3/);
  assert.equal(renderHistoryCoverage({ basis: {} }), '');
});
