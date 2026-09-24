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
