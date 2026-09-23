import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { archiveReport, compareReports, notifyReport, pagesUrl, reportManifest, verifyPage } from '../report-pages.mjs';
const repository='owner/factory';
const digest=value=>createHash('sha1').update(JSON.stringify(value)).digest('hex');
function input({issue=146,runId=100,attempt=1,start=1000,qa=true,media=1}={}) {
 const reportId=`${repository}:${issue}:${runId}:${attempt}:${'a'.repeat(40)}:template-2`;
 return {record:{repository,issue,runId,attempt,start,status:'delivered',usage:{records:2}},
   reportId,pr:{number:150},delivery:{meta:{title:`任务 ${issue}`,headSha:'a'.repeat(40)},delivery:{qaSummary:'实际结果'},rawQaReport:qa?{passed:true}:null,retro:null,checks:qa?[{}]:[],media:Array(media).fill({})}};
}
const htmlOf=r=>`<html><meta name="factory-report-id" content="${r.reportId}"><body>报告</body></html>`;
function fakeClient() {
 const blobs=new Map(),trees=new Map(),commits=new Map(); let ref=null;
 const comments=new Map(); const writes=[]; let prSha='a'.repeat(40);
 const client={repository,conflictOnce:false,async getRef(){return ref?{object:{sha:ref}}:null;},
  async createRef(branch,sha){ref=sha;}, async addComment(number,body){return client.request('POST',`/issues/${number}/comments`,{body:{body}});},
  async request(method,route,{body,query}={}) {
   if(method==='GET'&&route.startsWith('/git/commits/'))return commits.get(route.split('/').at(-1));
   if(method==='GET'&&route.startsWith('/contents/')) {
    const commit=commits.get(query?.ref==='gh-pages'?ref:query?.ref);const tree=commit&&trees.get(commit.tree.sha); const hash=tree?.get(route.slice('/contents/'.length));
    return hash?{encoding:'base64',content:Buffer.from(blobs.get(hash)).toString('base64')}:null;
   }
   if(method==='POST'&&route==='/git/blobs'){const sha=digest(body.content);blobs.set(sha,body.content);return {sha};}
   if(method==='POST'&&route==='/git/trees'){
    const tree=new Map(trees.get(body.base_tree)); for(const e of body.tree)tree.set(e.path,e.sha);
    const sha=digest([...tree].sort());trees.set(sha,tree);return {sha};
   }
   if(method==='POST'&&route==='/git/commits'){
    const sha=digest(body);commits.set(sha,{tree:{sha:body.tree},parents:body.parents});return {sha};
   }
   if(method==='PATCH'&&route==='/git/refs/heads/gh-pages'){
    assert.equal(body.force,false);
    if(client.conflictOnce){client.conflictOnce=false;throw new Error('422 concurrent ref update');}
    ref=body.sha;return {};
   }
   const cm=/^\/issues\/(\d+)\/comments$/.exec(route);
   if(cm){const number=Number(cm[1]);if(method==='GET')return comments.get(number)||[];
    const item={id:1000+writes.length,user:{login:'github-actions[bot]'},body:body.body};comments.set(number,[...(comments.get(number)||[]),item]);writes.push({number,body:body.body});return item;}
   if(method==='PATCH'&&route.startsWith('/issues/comments/')){const id=Number(route.split('/').at(-1)); for(const rows of comments.values()){const c=rows.find(x=>x.id===id);if(c)c.body=body.body;}writes.push({id,body:body.body});return {};}
   if(method==='GET'&&route==='/pulls/150')return {head:{sha:prSha,repo:{full_name:repository}},body:`<!-- agent-issue: 146 --> https://github.com/${repository}/actions/runs/100`};
   throw new Error(`Unexpected ${method} ${route}`);
  },
  files(){return new Map([...(trees.get(commits.get(ref)?.tree.sha)||[])].map(([k,v])=>[k,blobs.get(v)]));},
  writes,comments,setPrSha(sha){prSha=sha;},ref(){return ref;},
 };
 return client;
}
test('Pages URLs respect the project base path and custom domains',()=>{
 assert.equal(pagesUrl('https://owner.github.io/factory/','reports/issues/146/'),'https://owner.github.io/factory/reports/issues/146/');
 assert.equal(pagesUrl('https://reports.example.org','reports/issues/146/'),'https://reports.example.org/reports/issues/146/');
 assert.throws(()=>pagesUrl('http://bad.invalid/','reports/'));assert.throws(()=>pagesUrl('https://user:password@example.org/','reports/'));
});
test('manifest requires a matching rendered run identity, not only a plausible URL',()=>{
 assert.throws(()=>reportManifest({...input(),reportId:'other'}));assert.throws(()=>reportManifest({...input(),record:{...input().record,issue:'146'}}));
 assert.equal(reportManifest(input()).path,'reports/issues/146/runs/100/attempt-1/index.html');
});
test('runs and rerun attempts are ordered explicitly',()=>{
 assert.ok(compareReports({start:1,runId:1,attempt:2},{start:1,runId:1,attempt:1})>0);
 assert.ok(compareReports({start:2,runId:2,attempt:1},{start:1,runId:1,attempt:3})>0);
});
test('first report creates a standalone branch, alias, registry and snapshot',async()=>{
 const c=fakeClient(),r=input(); const p=await archiveReport(c,r,htmlOf(r)); const files=c.files();
 assert.ok(files.has('index.html'));assert.ok(files.has('.nojekyll'));assert.ok(files.has(p.manifest.path));
 assert.match(files.get('reports/issues/146/index.html'),/runs\/100\/attempt-1\/index.html/);
 assert.equal(p.isLatest,true);assert.equal(p.commitSha,c.ref());
});
test('archive preserves other Issues and late old runs cannot replace newer aliases',async()=>{
 const c=fakeClient();const first=input(),second=input({issue:147,runId:101,start:2000}),newer=input({runId:102,start:3000});
 for(const r of [first,second,newer])await archiveReport(c,r,htmlOf(r));
 const replay=await archiveReport(c,first,htmlOf(first));const files=c.files();
 assert.equal(replay.isLatest,false);assert.ok(files.has(reportManifest(second).path));assert.ok(files.has(reportManifest(first).path));
 assert.match(files.get('reports/issues/146/index.html'),/runs\/102/);
 assert.match(files.get('reports/index.html'),/任务 147/);
});
test('same report replay is idempotent without duplicating history',async()=>{
 const c=fakeClient(),r=input();await archiveReport(c,r,htmlOf(r));const sha=c.ref();await archiveReport(c,r,htmlOf(r));assert.equal(c.ref(),sha);
});
test('replay after artifacts expire retains richer HTML and evidence instead of erasing it',async()=>{
 const c=fakeClient(),r=input();await archiveReport(c,r,htmlOf(r));
 const poor=input({qa:false,media:0});const replay=await archiveReport(c,poor,htmlOf(poor).replace('报告','无证据'));
 assert.equal(replay.preserved,true);assert.equal(c.files().get(reportManifest(r).path),htmlOf(r));
});
test('optimistic archive updates retry a concurrent ref write without force-pushing',async()=>{
 const c=fakeClient(),r=input();await archiveReport(c,r,htmlOf(r));c.conflictOnce=true;
 const next=input({runId:102,start:3000});await archiveReport(c,next,htmlOf(next));
 assert.ok(c.files().has(reportManifest(r).path));assert.match(c.files().get('reports/issues/146/index.html'),/102/);
});
test('wrong HTML does not write a branch',async()=>{
 const c=fakeClient();await assert.rejects(archiveReport(c,input(),'<html>wrong</html>'),/mismatch/);assert.equal(c.ref(),null);
});
test('verification requires the specific HTML stamp, not a generic HTTP 200',async()=>{
 let calls=0;const pause=async()=>{};
 await verifyPage('https://example.org/report','correct',{attempts:2,pause,fetcher:async(url,options)=>{assert.equal(options.headers,undefined);calls++;return {ok:true,text:async()=>calls===1?'old':'<meta name="factory-report-id" content="correct">'};}});
 assert.equal(calls,2);
 await assert.rejects(verifyPage('https://example.org/report','correct',{attempts:1,pause,fetcher:async()=>({ok:true,text:async()=>'<html>not found</html>'})}),/not accessible/);
});
test('comments are updated only after verified deployment; Issue and current PR get one entry each',async()=>{
 const c=fakeClient(),r=input();const p=await archiveReport(c,r,htmlOf(r));let verified=0;
 const options={verify:async()=>{verified++;assert.equal(c.writes.length,0);}};
 await notifyReport(c,p,'https://owner.github.io/factory/',options);assert.equal(verified,1);assert.equal(c.writes.length,2);
 assert.match(c.writes[0].body,/https:\/\/owner.github.io\/factory\/reports\/issues\/146\//);
 await notifyReport(c,p,'https://owner.github.io/factory/',{verify:async()=>{}});assert.equal(c.writes.length,2);
});
test('failed verification never creates a successful publication comment',async()=>{
 const c=fakeClient(),r=input(),p=await archiveReport(c,r,htmlOf(r));
 await assert.rejects(notifyReport(c,p,'https://owner.github.io/factory/',{verify:async()=>{throw new Error('404');}}),/404/);
 assert.equal(c.writes.length,0);
});
test('a newer PR head cannot receive stale evidence',async()=>{
 const c=fakeClient(),r=input(),p=await archiveReport(c,r,htmlOf(r));c.setPrSha('b'.repeat(40));
 await notifyReport(c,p,'https://owner.github.io/factory/',{verify:async()=>{}});assert.equal(c.writes.length,1);assert.equal(c.writes[0].number,146);
});
test('late notification from an old source cannot replace the current Issue report',async()=>{
 const c=fakeClient(),r=input(),old=await archiveReport(c,r,htmlOf(r));const n=input({runId:102,start:2000});await archiveReport(c,n,htmlOf(n));
 const result=await notifyReport(c,old,'https://owner.github.io/factory/',{verify:async()=>{}});assert.equal(result.updated,false);assert.equal(c.writes.length,0);
});
test('human comments and hidden usage receipts are not edited by report publication',async()=>{
 const c=fakeClient(),r=input(),p=await archiveReport(c,r,htmlOf(r));
 const human={id:1,user:{login:'gchust'},body:'<!-- factory-delivery-report:146 --> human'};
 const usage={id:2,user:{login:'github-actions[bot]'},body:'<!-- factory-task-usage:100:1 --> original numeric receipt'};
 c.comments.set(146,[human,usage]);await notifyReport(c,p,'https://owner.github.io/factory/',{verify:async()=>{}});
 assert.ok(human.body.endsWith('human'));assert.ok(usage.body.endsWith('receipt'));assert.equal(c.comments.get(146).length,3);
});
test('automatic deployment uses complete site, explicit Pages action and verified link output',()=>{
 const workflow=readFileSync(new URL('../../workflows/report-task-usage.yml',import.meta.url),'utf8');
 for(const s of ['queue: max','pages: write','id-token: write','contents: write','actions/upload-pages-artifact@v4','actions/deploy-pages@v4','report-pages.mjs notify','steps.archive.outputs.commit_sha','steps.deployment.outputs.page_url'])assert.ok(workflow.includes(s),s);
 assert.doesNotMatch(workflow,/secrets\.|npm install|run-agent/);
 assert.ok(workflow.indexOf('Archive report')<workflow.indexOf('Configure existing Pages'));
});

test('handoff restores retrospective prose without copying old QA or usage into the next run',()=>{
 const workflow=readFileSync(new URL('../../workflows/code-agent-task.yml',import.meta.url),'utf8');
 const restore=workflow.split('- name: Restore handoff checkpoint')[1].split('- name: Download normalized task')[0];
 assert.match(restore,/cp handoff\/retro.json/);assert.doesNotMatch(restore,/cp .*report.json|cp .*jsonl/);
});

test('replay cannot erase an existing independent build review', async () => {
 const c=fakeClient(), richer=input(); richer.delivery.buildReview={state:'completed'};
 await archiveReport(c,richer,htmlOf(richer));
 const poor=input(); const replay=await archiveReport(c,poor,htmlOf(poor).replace('报告','未评估'));
 assert.equal(replay.preserved,true); assert.equal(c.files().get(reportManifest(richer).path),htmlOf(richer));
});
