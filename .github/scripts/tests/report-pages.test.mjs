import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { finalizeClassification } from '../../reports/findings-classification.mjs';
import { prepareClassification } from '../classify-findings.mjs';
import { ARCHIVE_ATTEMPTS, archiveBackoffMs, archiveFindingsClassification, externalizeImages, readFindingsSnapshot, archiveReport, compareReports, notifyReport, pagesUrl, reportManifest, resetFindingsIndex, VERIFY_DELAYS_MS, verifyPage } from '../report-pages.mjs';
import { renderHtml } from '../../reports/render-report.mjs';
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
    const prefix=`${route.slice('/contents/'.length)}/`;
    const listing=[...(tree||[])].filter(([k])=>k.startsWith(prefix)&&!k.slice(prefix.length).includes('/')).map(([k,sha])=>({name:k.slice(prefix.length),type:'file',sha}));
    if(!hash&&listing.length)return listing;
    return hash?{sha:hash,encoding:'base64',content:Buffer.from(blobs.get(hash)).toString('base64')}:null;
   }
   if(method==='POST'&&route==='/git/blobs'){const sha=digest(body.content);blobs.set(sha,body.content);return {sha};}
   if(method==='POST'&&route==='/git/trees'){
    const tree=new Map(trees.get(body.base_tree)); for(const e of body.tree){if(e.sha===null){assert.ok(tree.has(e.path));tree.delete(e.path);}else tree.set(e.path,e.sha);}
    const sha=digest([...tree].sort());trees.set(sha,tree);return {sha};
   }
   if(method==='POST'&&route==='/git/commits'){
    const sha=digest(body);commits.set(sha,{tree:{sha:body.tree},parents:body.parents});return {sha};
   }
   if(method==='PATCH'&&route==='/git/refs/heads/gh-pages'){
    assert.equal(body.force,false);
    if(client.conflictOnce){client.conflictOnce=false;throw new Error('422 concurrent ref update');}
    if(client.conflicts>0){client.conflicts--;throw new Error('422 concurrent ref update');}
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
 const next=input({runId:102,start:3000});await archiveReport(c,next,htmlOf(next),{pause:async()=>{}});
 assert.ok(c.files().has(reportManifest(r).path));assert.match(c.files().get('reports/issues/146/index.html'),/102/);
});
test('archive retries writers outside its lock with growing jittered pauses and uploads each blob once',async()=>{
 const c=fakeClient(),r=input();await archiveReport(c,r,htmlOf(r));
 c.conflicts=ARCHIVE_ATTEMPTS-1;
 const pauses=[];const posted=[];
 const request=c.request;c.request=async(method,route,options)=>{if(method==='POST'&&route.endsWith('/blobs'))posted.push(options.body.content);return request(method,route,options);};
 const next=input({runId:102,start:3000});
 await archiveReport(c,next,imageHtmlOf(next,['retry']),{pause:async ms=>{pauses.push(ms);}});
 assert.equal(pauses.length,ARCHIVE_ATTEMPTS-1);
 pauses.forEach((ms,i)=>assert.ok(ms>=1000*2**i&&ms<1000*2**i+1000,String(ms)));
 assert.equal(new Set(posted).size,posted.length,'no blob is uploaded twice');
 assert.equal(archiveBackoffMs(2,()=>0.5),4500);
 c.conflicts=ARCHIVE_ATTEMPTS;
 const last=input({runId:103,start:4000});
 await assert.rejects(archiveReport(c,last,htmlOf(last),{pause:async()=>{}}),/422/);
});
test('a newer report whose deploy failed does not leave the Issue without a report comment',async()=>{
 const c=fakeClient(),r=input(),a=await archiveReport(c,r,htmlOf(r));
 const n=input({runId:102,start:2000}),b=await archiveReport(c,n,htmlOf(n));
 const base='https://owner.github.io/factory/';
 // Only A is served: B's deploy failed, so B's notify never runs.
 const servedA=async(url,id)=>{if(id!==a.manifest.reportId)throw new Error('404');};
 const posted=await notifyReport(c,a,base,{verify:servedA});
 assert.equal(posted.updated,true);
 assert.match(c.comments.get(146).at(-1).body,/factory-report-source:1000:100:1/);
 // B deploys later: its notify replaces the comment, and a late A cannot take it back.
 await notifyReport(c,b,base,{verify:async()=>{}});
 assert.match(c.comments.get(146).at(-1).body,/factory-report-source:2000:102:1/);
 await notifyReport(c,a,base,{verify:servedA});
 assert.equal(c.comments.get(146).length,1);
 assert.match(c.comments.get(146)[0].body,/factory-report-source:2000:102:1/);
});
test('wrong HTML does not write a branch',async()=>{
 const c=fakeClient();await assert.rejects(archiveReport(c,input(),'<html>wrong</html>'),/mismatch/);assert.equal(c.ref(),null);
});
test('verification requires the specific HTML stamp, not a generic HTTP 200',async()=>{
 let calls=0;const pause=async()=>{};
 await verifyPage('https://example.org/report','correct',{delays:[1],pause,fetcher:async(url,options)=>{assert.equal(options.headers,undefined);calls++;return {ok:true,text:async()=>calls===1?'old':'<meta name="factory-report-id" content="correct">'};}});
 assert.equal(calls,2);
 await assert.rejects(verifyPage('https://example.org/report','correct',{delays:[],pause,fetcher:async()=>({ok:true,text:async()=>'<html>not found</html>'})}),/not accessible/);
});
test('verification waits about three minutes with growing intervals and bypasses cached copies',async()=>{
 const waits=[],urls=[];
 await assert.rejects(verifyPage('https://example.org/reports/runs/1/attempt-1/index.html','correct',{pause:async ms=>{waits.push(ms);},
   fetcher:async url=>{urls.push(url);return {ok:true,text:async()=>'<meta name="factory-report-id" content="stale">'};}}),/not accessible/);
 assert.deepEqual(waits,VERIFY_DELAYS_MS);
 assert.ok(waits.every((ms,i)=>i===0||ms>=waits[i-1]),'intervals never shrink');
 const total=waits.reduce((a,b)=>a+b,0);
 assert.ok(total>=170000&&total<=200000,`about three minutes, got ${total}`);
 assert.equal(urls.length,waits.length+1);
 assert.equal(new Set(urls).size,urls.length,'every probe has its own query string');
 for(const url of urls) {
   const u=new URL(url);
   assert.equal(u.origin+u.pathname,'https://example.org/reports/runs/1/attempt-1/index.html');
   assert.deepEqual([...u.searchParams.keys()],['factory-verify']);
 }
 // A late CDN copy is still accepted on a later attempt.
 let calls=0;
 await verifyPage('https://example.org/r','correct',{pause:async()=>{},fetcher:async()=>{calls++;
   if(calls<5) throw new TypeError('fetch failed');
   return {ok:true,text:async()=>'<meta name="factory-report-id" content="correct">'};}});
 assert.equal(calls,5);
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
 for(const s of ['queue: max','pages: write','id-token: write','contents: write','actions/upload-pages-artifact@','actions/deploy-pages@','report-pages.mjs notify','steps.archive.outputs.commit_sha','steps.deployment.outputs.page_url'])assert.ok(workflow.includes(s),s);
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

test('rubric upgrade preserves exact v1 bytes, permits v2 partial, and rejects a late v1 overwrite', async () => {
 const client=fakeClient(), old=input(), next=input();
 old.delivery.buildReview={state:'completed',basis:{rubricVersion:1}};
 next.delivery.buildReview={state:'partial',basis:{rubricVersion:2}};
 next.reportId += ':review-new-rubric';
 const oldHtml=htmlOf(old), newHtml=htmlOf(next).replace('报告','框架评测');
 await archiveReport(client,old,oldHtml);
 const updated=await archiveReport(client,next,newHtml);
 assert.equal(updated.preserved,false);
 const directory=reportManifest(next).path.replace('index.html','');
 assert.equal(client.files().get(directory+'rubric-1/index.html'),oldHtml);
 assert.deepEqual(JSON.parse(client.files().get(directory+'rubric-1/report.json')),old);
 assert.equal(client.files().get(directory+'index.html'),newHtml);
 assert.equal(updated.manifest.quality.reviewRubric,2);
 const late=await archiveReport(client,old,oldHtml);
 assert.equal(late.preserved,true);
 assert.equal(client.files().get(directory+'index.html'),newHtml);
 // Same-rubric partial must still not erase a complete assessment.
 const complete=globalThis.structuredClone(next); complete.delivery.buildReview.state='completed';
 complete.reportId += ':complete';
 await archiveReport(client,complete,htmlOf(complete));
 assert.equal((await archiveReport(client,next,newHtml)).preserved,true);
});
// A rendered report's inline screenshots, as render-report.mjs writes them.
const shotOf=text=>Buffer.from(text).toString('base64');
const sha256=text=>createHash('sha256').update(text).digest('hex');
const imageHtmlOf=(r,shots)=>`<html><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src data:; style-src &#39;unsafe-inline&#39;"><meta name="factory-report-id" content="${r.reportId}"><body>${shots.map(s=>`<img alt="" src="data:image/png;base64,${shotOf(s)}">`).join('')}<span>截图已经内嵌，可离线查看。</span></body></html>`;
test('Pages copies carry screenshots as content-addressed files beside the report', async () => {
 const client=fakeClient(), r=input();
 await archiveReport(client,r,imageHtmlOf(r,['login','list','login']));
 const directory=reportManifest(r).path.replace('index.html','');
 const files=client.files(), page=files.get(directory+'index.html');
 assert.doesNotMatch(page,/data:image/);
 assert.match(page,new RegExp(`src="media/${sha256('login')}\\.png".*src="media/${sha256('list')}\\.png".*src="media/${sha256('login')}\\.png"`));
 assert.match(page,/img-src data: &#39;self&#39;;/);
 assert.match(page,/截图与报告一同发布/);
 const media=[...files.keys()].filter(k=>k.startsWith(directory+'media/'));
 assert.equal(media.length,2,'a repeated screenshot is stored once');
 assert.equal(files.get(`${directory}media/${sha256('login')}.png`),shotOf('login'));
 // A replay that drops a screenshot also drops its file; one that keeps it keeps it.
 const richer=input({media:2});
 await archiveReport(client,richer,imageHtmlOf(richer,['list','detail']));
 const after=[...client.files().keys()].filter(k=>k.startsWith(directory+'media/')).sort();
 assert.deepEqual(after,[`${directory}media/${sha256('detail')}.png`,`${directory}media/${sha256('list')}.png`].sort());
 // A report without screenshots is published unchanged.
 const plain=input({issue:147});
 await archiveReport(client,plain,htmlOf(plain));
 assert.equal(client.files().get(reportManifest(plain).path),htmlOf(plain));
});
test('a rendered report keeps working with its screenshots as files', async (t) => {
 const root=mkdtempSync(path.join(os.tmpdir(),'report-media-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 writeFileSync(path.join(root,'a.png'),'png bytes A');writeFileSync(path.join(root,'b.png'),'png bytes B');
 const facts=JSON.parse(readFileSync(new URL('../../reports/example.facts.json',import.meta.url),'utf8'));
 facts.media=[{id:'a',title:'列表',category:'列表',path:'a.png',featured:true},{id:'b',title:'表单',category:'表单',path:'b.png',featured:false}];
 const {html}=await renderHtml(facts,null,root);
 assert.match(html,/img-src data:;/);
 const page=externalizeImages(html);
 assert.equal(page.media.size,2);
 assert.doesNotMatch(page.html,/data:image/);
 for(const text of ['png bytes A','png bytes B']) {
  const name=`${sha256(text)}.png`;
  assert.ok(page.html.includes(`src="media/${name}"`));
  assert.equal(Buffer.from(page.media.get(name),'base64').toString(),text);
 }
 const csp=/http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(page.html)[1];
 assert.match(csp,/img-src data: &#39;self&#39;;/);
 // The fixed script is untouched, so its CSP hash still matches.
 const script=/<script>([\s\S]*?)<\/script>/.exec(page.html)[1];
 assert.ok(csp.includes(`sha256-${createHash('sha256').update(script).digest('base64')}`));
 assert.equal(page.html.replace(/src="media\/[a-f0-9]{64}\.png"/g,'SRC').replace(/ &#39;self&#39;/,'').replace('截图与报告一同发布。','截图已经内嵌，可离线查看。'),
  html.replace(/src="data:image\/png;base64,[^"]+"/g,'SRC'));
});
test('a report whose CSP changed keeps its screenshots inline instead of failing', () => {
 const html=imageHtmlOf(input(),['x']).replace('img-src data:;','img-src data: blob:;');
 const page=externalizeImages(html);
 assert.equal(page.html,html);
 assert.equal(page.media.size,0);
});
test('a rubric snapshot keeps its screenshot files beside it', async () => {
 const client=fakeClient(), old=input(), next=input();
 old.delivery.buildReview={state:'completed',basis:{rubricVersion:1}};
 next.delivery.buildReview={state:'partial',basis:{rubricVersion:2}};
 next.reportId += ':review-new-rubric';
 await archiveReport(client,old,imageHtmlOf(old,['v1']));
 await archiveReport(client,next,imageHtmlOf(next,['v2']));
 const directory=reportManifest(next).path.replace('index.html','');
 const files=client.files();
 assert.match(files.get(directory+'rubric-1/index.html'),new RegExp(`src="media/${sha256('v1')}\\.png"`));
 assert.equal(files.get(`${directory}rubric-1/media/${sha256('v1')}.png`),shotOf('v1'));
 assert.equal(files.get(`${directory}media/${sha256('v2')}.png`),shotOf('v2'));
 assert.equal(files.has(`${directory}media/${sha256('v1')}.png`),false);
});
test('archive writes the cross-report findings index from the latest report of each Issue', async () => {
 const c=fakeClient();const first=reviewedInput(),second=reviewedInput({issue:147,runId:101,start:2000});
 for(const r of [first,second]) assert.equal((await archiveReport(c,r,htmlOf(r))).findingsIndex,'updated');
 const files=c.files();
 assert.match(files.get('reports/findings/index.html'),/框架问题汇总/);
 assert.match(files.get('reports/findings/index.html'),/来自 2 份已发布报告/);
 assert.match(files.get('reports/index.html'),/href="findings\/"/);
 assert.match(files.get('reports/findings/daily/index.html'),/尚未完成首次日归档/);
 assert.match(files.get('reports/findings/daily/index.html'),/待归档 2 条/);
 assert.equal(files.has('reports/findings/daily/index.json'),false);
});
test('a findings index failure never blocks report publication', async () => {
 const c=fakeClient();const first=input(),second=input({issue:147,runId:101,start:2000});
 await archiveReport(c,first,htmlOf(first));
 const request=c.request;
 c.request=async (method,route,options)=>{
  if(method==='GET'&&route.endsWith('/report.json')) throw new Error('500 upstream unavailable');
  return request(method,route,options);
 };
 const publication=await archiveReport(c,second,htmlOf(second));
 assert.match(publication.findingsIndex,/^skipped: 500 upstream unavailable/);
 assert.ok(c.files().has(reportManifest(second).path));
 assert.match(c.files().get('reports/index.html'),/任务 147/);
});

function reviewedInput(options = {}) {
  const r = input(options);
  const facts = JSON.parse(
    readFileSync(
      new URL('../../reports/example.facts.json', import.meta.url),
      'utf8',
    ),
  );
  facts.buildReview = JSON.parse(
    readFileSync(
      new URL('../../reports/example.framework-review.json', import.meta.url),
      'utf8',
    ),
  );
  facts.meta = {
    ...facts.meta,
    repository,
    issue: r.record.issue,
    runId: String(r.record.runId),
    attempt: r.record.attempt,
  };
  r.delivery = { ...r.delivery, ...facts };
  return r;
}
function decisionFor(input) {
  return finalizeClassification(
    {
      version: 1,
      inputHash: input.inputHash,
      groups: [
        {
          title: '共同根因',
          reason: '引用同一入口的相同错误指引',
          members: input.findings.map((item) => item.id),
        },
      ],
    },
    input,
  );
}

test('publication schedules classification, accepts complete decisions and reuses them without another call', async (t) => {
  const c = fakeClient(),
    first = reviewedInput(),
    second = reviewedInput({ issue: 147, runId: 101, start: 2000 });
  assert.equal(
    (await archiveReport(c, first, htmlOf(first))).findingsNeedsClassification,
    true,
  );
  assert.equal(
    (await archiveReport(c, second, htmlOf(second)))
      .findingsNeedsClassification,
    true,
  );
  const snapshot = await readFindingsSnapshot(c);
  const classification = decisionFor(snapshot.input);
  const beforeHtml = c.files().get(reportManifest(first).path);
  const published = await archiveFindingsClassification(c, classification);
  assert.equal(published.updated, true);
  assert.equal(c.files().get(reportManifest(first).path), beforeHtml);
  assert.match(c.files().get('reports/findings/index.html'), /2 个任务/);
  assert.match(c.files().get('reports/findings/index.html'), /Agent 归类依据/);
  assert.match(
    c.files().get('reports/findings/index.html'),
    /NocoBase App 版本/,
  );
  assert.deepEqual(
    JSON.parse(c.files().get('reports/findings/classification.json')),
    classification,
  );
  const sha = c.ref();
  await archiveFindingsClassification(c, classification);
  assert.equal(c.ref(), sha);
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'test-findings-prepare-'),
  );
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  assert.equal((await prepareClassification(c, directory)).ready, false);
  assert.equal(
    (await prepareClassification(c, directory, { force: true })).ready,
    true,
  );
  assert.equal(
    (await archiveReport(c, second, htmlOf(second)))
      .findingsNeedsClassification,
    false,
  );
  assert.match(c.files().get('reports/findings/index.html'), /2 个任务/);
  const third = reviewedInput({ issue: 148, runId: 102, start: 3000 });
  assert.equal(
    (await archiveReport(c, third, htmlOf(third))).findingsNeedsClassification,
    true,
  );
  assert.match(c.files().get('reports/findings/index.html'), /2 个任务/);
  assert.match(
    c.files().get('reports/findings/index.html'),
    /1 条待 Agent 归类/,
  );
});

test('stale classification cannot replace findings from a newer report', async () => {
  const c = fakeClient(),
    r = reviewedInput();
  await archiveReport(c, r, htmlOf(r));
  const old = decisionFor((await readFindingsSnapshot(c)).input);
  const next = reviewedInput({ runId: 102, start: 2000 });
  await archiveReport(c, next, htmlOf(next));
  const sha = c.ref();
  assert.deepEqual(await archiveFindingsClassification(c, old), {
    updated: false,
    reason: 'stale-input',
  });
  assert.equal(c.ref(), sha);
  assert.match(c.files().get('reports/findings/index.html'), /runs\/102\//);
});

test('publisher rejects invented or missing members without writing Pages', async () => {
  const c = fakeClient(),
    r = reviewedInput();
  await archiveReport(c, r, htmlOf(r));
  const classification = decisionFor((await readFindingsSnapshot(c)).input);
  classification.groups[0].members.push('invented');
  const sha = c.ref();
  await assert.rejects(
    archiveFindingsClassification(c, classification),
    /Unknown finding/,
  );
  assert.equal(c.ref(), sha);
});

test('classification ref conflicts retry against the latest complete site without overwriting reports', async () => {
  const c = fakeClient(),
    r = reviewedInput();
  await archiveReport(c, r, htmlOf(r));
  const classification = decisionFor((await readFindingsSnapshot(c)).input);
  c.conflictOnce = true;
  assert.equal(
    (await archiveFindingsClassification(c, classification)).updated,
    true,
  );
  assert.equal(c.files().get(reportManifest(r).path), htmlOf(r));
});

test('a findings reset counts only later runs and keeps every archived report', async (t) => {
  const c = fakeClient(),
    first = reviewedInput(),
    second = reviewedInput({ issue: 147, runId: 101, start: 2000 });
  await archiveReport(c, first, htmlOf(first));
  await archiveReport(c, second, htmlOf(second));
  await archiveFindingsClassification(
    c,
    decisionFor((await readFindingsSnapshot(c)).input),
  );
  assert.ok(c.files().has('reports/findings/classification.json'));
  const before = c.files();

  const reset = await resetFindingsIndex(c, { now: 2500, runId: 77 });
  assert.equal(reset.commitSha, c.ref());
  assert.equal(reset.excluded, 2);
  const files = c.files();
  assert.deepEqual(JSON.parse(files.get('reports/findings/baseline.json')), {
    version: 1,
    since: 2500,
    resetAt: '1970-01-01T00:00:02.500Z',
    runId: '77',
  });
  assert.equal(files.has('reports/findings/classification.json'), false);
  assert.match(files.get('reports/findings/daily/index.html'), /待归档 0 条/);
  assert.match(files.get('reports/findings/index.html'), /来自 0 份已发布报告/);
  assert.match(files.get('reports/findings/index.html'), /此前的 2 份报告/);
  assert.deepEqual(
    JSON.parse(files.get('reports/findings/input.json')).findings,
    [],
  );
  for (const [file, content] of before)
    if (!file.startsWith('reports/findings/'))
      assert.equal(files.get(file), content, file);

  const directory = mkdtempSync(path.join(os.tmpdir(), 'test-findings-reset-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  assert.deepEqual(await prepareClassification(c, directory), {
    ready: false,
    reason: 'no-findings',
  });
  // Republishing an earlier run (a replayed review) stays out of the index.
  assert.equal(
    (await archiveReport(c, second, htmlOf(second)))
      .findingsNeedsClassification,
    false,
  );
  const rerun = reviewedInput({ issue: 146, runId: 102, start: 3000 });
  assert.equal(
    (await archiveReport(c, rerun, htmlOf(rerun))).findingsNeedsClassification,
    true,
  );
  const index = c.files().get('reports/findings/index.html');
  assert.match(index, /来自 1 份已发布报告/);
  assert.match(index, /此前的 1 份报告/);
  assert.match(index, /runs\/102\//);
  assert.doesNotMatch(index, /runs\/101\//);
  const snapshot = await readFindingsSnapshot(c);
  assert.deepEqual(snapshot.baseline, { since: 2500, excluded: 1 });
  assert.ok(
    snapshot.input.findings.every((item) => item.id.startsWith('146:102:1')),
  );
  assert.equal(
    (await archiveFindingsClassification(c, decisionFor(snapshot.input)))
      .updated,
    true,
  );
  assert.match(c.files().get('reports/findings/index.html'), /此前的 1 份报告/);
});

test('a findings reset retries a concurrent publication and needs a published site', async () => {
  await assert.rejects(
    resetFindingsIndex(fakeClient()),
    /No published report site/,
  );
  const c = fakeClient(),
    r = reviewedInput();
  await archiveReport(c, r, htmlOf(r));
  c.conflictOnce = true;
  await resetFindingsIndex(c, { now: 5000 });
  assert.equal(
    JSON.parse(c.files().get('reports/findings/baseline.json')).since,
    5000,
  );
  assert.equal(c.files().get(reportManifest(r).path), htmlOf(r));
});

test('a damaged findings baseline skips only the index, never the report', async () => {
  const c = fakeClient(),
    first = reviewedInput(),
    second = reviewedInput({ issue: 147, runId: 101, start: 2000 });
  await archiveReport(c, first, htmlOf(first));
  await resetFindingsIndex(c, { now: 1500 });
  const request = c.request;
  c.request = async (method, route, options) => {
    const value = await request(method, route, options);
    return route.endsWith('/findings/baseline.json') && value
      ? {
          ...value,
          content: Buffer.from(
            JSON.stringify({ version: 1, since: 'soon' }),
          ).toString('base64'),
        }
      : value;
  };
  const before = c.files().get('reports/findings/index.html');
  const publication = await archiveReport(c, second, htmlOf(second));
  assert.match(
    publication.findingsIndex,
    /^skipped: Invalid findings baseline/,
  );
  assert.ok(c.files().has(reportManifest(second).path));
  assert.equal(c.files().get('reports/findings/index.html'), before);
  await assert.rejects(readFindingsSnapshot(c), /Invalid findings baseline/);
});

test('the findings reset runs only from the default branch with an explicit confirmation and no model access', () => {
  const workflow = readFileSync(
    new URL('../../workflows/reset-findings.yml', import.meta.url),
    'utf8',
  );
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(
    workflow,
    /if: github\.ref == format\('refs\/heads\/\{0\}', github\.event\.repository\.default_branch\) && inputs\.confirm == 'RESET'/,
  );
  assert.match(workflow, /permissions: \{\}/);
  assert.match(workflow, /group: factory-task-usage/);
  assert.match(workflow, /report-pages\.mjs reset-findings/);
  assert.match(workflow, /ref: \$\{\{ steps\.reset\.outputs\.commit_sha \}\}/);
  assert.match(workflow, /actions\/deploy-pages@[0-9a-f]{40} # v5\./);
  assert.doesNotMatch(workflow, /secrets\.|install-agent/);
});
