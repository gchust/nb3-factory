import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { collectDelivery, makeDeliveryReport } from '../delivery-report.mjs';
import { renderHtml } from '../../reports/render-report.mjs';
import { emptyUsage, aggregate } from '../task-usage.mjs';
const repository='owner/factory';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=','base64');
function fixture(t) {
 const root=mkdtempSync(path.join(os.tmpdir(),'delivery-report-'));
 t.after(()=>rmSync(root,{recursive:true,force:true})); return root;
}
function put(root,file,value) {
 const dest=path.join(root,file); mkdirSync(path.dirname(dest),{recursive:true});
 writeFileSync(dest,Buffer.isBuffer(value)?value:JSON.stringify(value)); return dest;
}
function receipt(status='delivered') {
 const record={version:1,repository,issue:146,runId:100,attempt:1,status,start:1000,end:4000,jobs:[{id:1,name:'agent',seconds:3}],agentJobId:1,usage:emptyUsage()};
 return {record,records:[record],cumulative:aggregate([record]),timings:[]};
}
function artifacts(t,{status='passed',round=2}={}) {
 const root=fixture(t), prefix=`verify-${round}/browser-acceptance`;
 const meta={repository,issue:{number:146,title:'客户资料管理'},task:{targetBranch:'issues-146',acceptanceCriteria:'1. 创建客户\n2. 编辑客户'},workBranch:'agent/issue-146'};
 put(root,'task-metadata.json',meta); put(root,'repair-summary.json',{verificationAttempts:round,repairAttempts:round-1});
 put(root,`${prefix}/report.json`,{passed:status==='passed',authenticated:true,summary:'实际结果',checks:[{criterion:'创建客户',status,actions:['填写真实表单','提交'],evidence:['新记录显示'],screenshots:['create.png']}],failures:status==='failed'?['提交失败']:[]});
 put(root,`${prefix}/evidence/create.png`,png);
 put(root,`${prefix}/showcase.json`,{pages:[{title:'客户列表',screenshot:'create.png'}],uncovered:['培训列表'],videos:[]});
 return {root,prefix,meta};
}
test('fixed v2 template keeps every action, observation, screenshot, requirement and explicit missing row',async t=>{
 const {root}=artifacts(t); const result=await makeDeliveryReport(receipt(),root);
 assert.equal(result.facts.checks.length,2); assert.equal(result.facts.checks[1].status,'not-verified');
 for(const phrase of ['验收记录','填写真实表单','新记录显示','完整原始验收要求','问题与改进','独立评测发现','培训列表','factory-template-version','name="factory-report-id"']) assert.ok(result.html.includes(phrase),phrase);
 assert.ok(result.html.includes('data:image/png;base64,'));
 assert.doesNotMatch(result.html,/开发者资料与下一步|https:\/\/[^"\s]+\.js/);
 assert.equal(result.facts.media.length,1);
});
test('legacy retrospective without cost or status is displayed without inventing a resolution status',async t=>{
 const {root}=artifacts(t);
 put(root,'retro.json',{version:1,summary:'过程总结',blockers:[{phase:'repair',title:'真实卡点',symptom:'原值未回填',rootCause:'表单初始化缺失',resolution:'补充初始化'}],improvements:[{category:'skills-docs',title:'改进 Skill',detail:'避免重复定位',suggestedChange:'补充表单回填示例',mechanizable:true}]});
 const {html}=await makeDeliveryReport(receipt(),root);
 for(const phrase of ['真实卡点','原值未回填','表单初始化缺失','补充初始化','处理结果未提供','补充表单回填示例','可自动化']) assert.ok(html.includes(phrase),phrase);
 assert.doesNotMatch(html,/class="tag good">已解决/);
});
test('missing retro is not zero problems and malformed retro cannot erase QA',async t=>{
 const {root}=artifacts(t); let result=await makeDeliveryReport(receipt(),root);
 assert.match(result.html,/未提供可选的实现者过程笔记/); assert.match(result.html,/未进行独立评测/);
 assert.doesNotMatch(result.html,/问题复盘未提供|改进建议未提供/);
 put(root,'retro.json',{unrecognized:'保留原始内容'});
 result=await makeDeliveryReport(receipt(),root);
 assert.match(result.html,/创建客户/); assert.equal(result.facts.rawRetro.unrecognized,'保留原始内容');
});
test('missing screenshots leave original QA status and references but flag incomplete evidence',async t=>{
 const {root,prefix}=artifacts(t); rmSync(path.join(root,prefix,'evidence/create.png'));
 const {html,facts}=await makeDeliveryReport(receipt(),root);
 assert.equal(facts.checks[0].status,'passed'); assert.equal(facts.media.length,0);
 assert.match(html,/证据待核对/); assert.match(html,/create.png/); assert.match(html,/新记录显示/);
});
test('invalid note status overrides are rejected; optional prose never alters facts',async t=>{
 const {root,prefix}=artifacts(t);
 put(root,`${prefix}/delivery-notes.json`,{version:1,summary:'伪造摘要',status:'passed',highlights:[],flow:[]});
 const {html,facts}=await makeDeliveryReport(receipt('failure'),root);
 assert.match(html,/展示说明未采用/); assert.match(html,/本轮未完成/); assert.equal(facts.delivery.status,'failed');
 assert.doesNotMatch(html,/伪造摘要/);
});
test('valid compact notes render highlights and business flow using the fixed shell',async t=>{
 const {root,prefix}=artifacts(t);
 put(root,`${prefix}/delivery-notes.json`,{version:1,summary:'业务摘要',highlights:[{title:'业务能力',detail:'真实操作'}],flow:['建档','查询']});
 const {html}=await makeDeliveryReport(receipt(),root);
 for(const s of ['业务摘要','业务能力','业务顺序示意','查询']) assert.ok(html.includes(s));
});
test('handoff cannot borrow a previous successful QA round when the current full QA is missing',async t=>{
 const {root}=artifacts(t,{round:1}); put(root,'repair-summary.json',{verificationAttempts:2,handoff:true});
 put(root,'verify-2/browser-focused/report.json',{passed:true,authenticated:true,summary:'仅失败路径',checks:[],failures:[]});
 const {html,facts}=await makeDeliveryReport(receipt('handoff'),root);
 assert.match(html,/已保存交接/); assert.match(html,/失败路径复测/);
 assert.equal(facts.checks.filter(c=>c.status==='passed').length,0);
});
test('a crash selects the latest verification directory, never a past green result',async t=>{
 const {root}=artifacts(t,{round:1}); rmSync(path.join(root,'repair-summary.json')); mkdirSync(path.join(root,'verify-3'));
 const {facts}=await makeDeliveryReport(receipt('failure'),root);
 assert.equal(facts.rawQaReport,null); assert.equal(facts.checks.filter(c=>c.status==='passed').length,0);
});
test('missing artifact directory still produces a truthful cancelled report',async t=>{
 const root=fixture(t); const {html,facts}=await makeDeliveryReport(receipt('cancelled'),path.join(root,'missing'),{title:'任务'});
 assert.match(html,/本轮已取消/); assert.match(html,/本轮未提供验收记录/); assert.equal(facts.meta.headSha,'');
});
test('wrong Issue metadata fails before reading unrelated evidence',t=>{
 const {root}=artifacts(t); put(root,'task-metadata.json',{repository,issue:{number:999}});
 assert.throws(()=>collectDelivery(root,receipt()),/does not match/);
});
test('path traversal and symlink screenshots are rejected while the rest remains readable',async t=>{
 const {root,prefix}=artifacts(t); put(root,'other.png',png);
 symlinkSync(path.join(root,'other.png'),path.join(root,prefix,'evidence/link.png'));
 put(root,`${prefix}/showcase.json`,{pages:[{screenshot:'../../other.png'},{screenshot:'link.png'},{screenshot:'create.png'}]});
 const {facts,html}=await makeDeliveryReport(receipt(),root);
 assert.deepEqual(facts.media.map(m=>m.id),['create.png']); assert.match(html,/已跳过无效截图/);
});
test('HTML and placeholder-looking business text cannot become template instructions',async t=>{
 const {root,meta}=artifacts(t); meta.issue.title='{{BODY}} <script>throw 42</script>'; put(root,'task-metadata.json',meta);
 const {html}=await makeDeliveryReport(receipt(),root);
 assert.match(html,/\{\{BODY\}\} &lt;script&gt;throw 42/);
 assert.doesNotMatch(html,/<script>throw 42/); assert.match(html,/script-src &#39;sha256-/);
});
test('PR links and head SHA are attached only to the exact delivery',async t=>{
 const {root}=artifacts(t); const sha='a'.repeat(40);
 const pr={number:150,head:{sha,ref:'agent/issue-146',repo:{full_name:repository}},base:{ref:'issues-146'},body:`<!-- agent-issue: 146 -->\n<!-- agent-head-sha: ${sha} -->\n- [GitHub Actions 运行记录](https://github.com/${repository}/actions/runs/100)`};
 let result=await makeDeliveryReport(receipt(),root,{},async()=>[pr]); assert.equal(result.pr.number,150);assert.equal(result.facts.meta.headSha,sha);
 result=await makeDeliveryReport(receipt(),root,{},async()=>[{...pr,head:{...pr.head,sha:'b'.repeat(40)}}]);assert.equal(result.pr,null);
});
test('original failures remain visible even when row status says passed',async t=>{
 const {root,prefix}=artifacts(t); const qa=JSON.parse(readFileSync(path.join(root,prefix,'report.json')));qa.passed=false;qa.failures=['浏览器控制台实际报错'];put(root,`${prefix}/report.json`,qa);
 const {html}=await makeDeliveryReport(receipt('failure'),root);assert.match(html,/浏览器控制台实际报错/); assert.match(html,/本轮浏览器报告未通过/);
});
test('usage is reused from the existing aggregator with missing measurements left unknown',async t=>{
 const {root}=artifacts(t);const value=receipt();value.cumulative.missingTimes=1;
 const {facts,html}=await makeDeliveryReport(value,root);
 assert.equal(facts.usage.total,null);assert.equal(facts.usage.executionSeconds,null);assert.match(html,/费用：未知/);
});
test('the review fixture is rendered by the same template, not maintained as separate HTML',async t=>{
 const root=fixture(t); const facts=JSON.parse(readFileSync(new URL('../../reports/example.facts.json',import.meta.url)));
 const {html}=await renderHtml(facts,null,root);
 assert.match(html,/完全虚构/);assert.match(html,/重复客户/);assert.doesNotMatch(html,/开发者资料与下一步/);
});

test('provider failure is visible in HTML without an Agent retrospective or raw credentials', async t => {
 const root=fixture(t);
 put(root,'task-metadata.json',{repository,issue:{number:146},task:{acceptanceCriteria:'B01. 登录'}});
 put(root,'agent-implement.jsonl.result.json',{version:1,status:'failed',phase:'implementation',endedAt:12345,retryAttempts:6,error:'503: auth_unavailable secret-not-for-html'});
 const {html,facts}=await makeDeliveryReport(receipt('failure'),root);
 assert.match(html,/模型服务暂不可用/); assert.match(html,/重试次数：6/);
 assert.doesNotMatch(html,/secret-not-for-html/);
 assert.equal(facts.delivery.status,'failed'); assert.equal(facts.checks[0].status,'not-verified');
});
test('first screen names the recorded template, creator and installed package versions',async t=>{
 const {root}=artifacts(t);
 put(root,'baseline.json',{version:1,kind:'installed-packages',source:null,template:'@nocobase/app-template-default',templateVersion:'1.0.0-beta.47',creatorVersion:'0.1.0-beta.22',
  lockSha256:'a'.repeat(64),packages:[{name:'@nocobase/app-cli',version:'1.0.0-beta.47',manifestSha256:'b'.repeat(64)},{name:'@nocobase/db',version:null,reason:'not_installed'},{name:'left-pad',version:'1.0.0'}]});
 const {facts,html}=await makeDeliveryReport(receipt(),root);
 assert.deepEqual(facts.baseline.packages.map(p=>p.name),['@nocobase/app-cli','@nocobase/db']);
 const hero=html.slice(html.indexOf('id="overview"'),html.indexOf('</section>',html.indexOf('id="overview"')));
 for(const phrase of ['<code>@nocobase/app-template-default@1.0.0-beta.47</code>','<code>@nocobase/create-app@0.1.0-beta.22</code>','2 个 NocoBase 包版本']) assert.ok(hero.includes(phrase),phrase);
 assert.doesNotMatch(hero,/源码 /);
 for(const phrase of ['id="baseline"','@nocobase/app-cli</td><td class="mono">1.0.0-beta.47','未记录（not_installed）','a'.repeat(64)]) assert.ok(html.includes(phrase),phrase);
});
test('source snapshot baseline shows the nocobase3 commit and missing values stay unrecorded',async t=>{
 const {root}=artifacts(t), sha='c'.repeat(40);
 put(root,'baseline.json',{version:1,kind:'source-snapshot',source:{repository:'nocobase/nocobase3',sha},templateVersion:'1.0.0-beta.47',creatorVersion:null,packages:[]});
 const {html}=await makeDeliveryReport(receipt(),root);
 assert.ok(html.includes(`nocobase/nocobase3@${'c'.repeat(12)}`));
 assert.ok(html.includes('应用模板 <code>1.0.0-beta.47</code>'),'old baselines without a template name keep only the version');
 assert.ok(html.includes('生成器 未记录')); assert.ok(html.includes('NocoBase 包版本未记录'));
});
test('a run without a recorded baseline says so instead of inferring versions',async t=>{
 const {root}=artifacts(t); const {facts,html}=await makeDeliveryReport(receipt(),root);
 assert.equal(facts.baseline,null); assert.match(html,/版本基线：本轮未记录/); assert.doesNotMatch(html,/id="baseline"/);
});
