import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { GitHubClient } from './factory-lib.mjs';
import { outcomeLabels } from './task-outcome.mjs';
import { text as markdownText } from './visual-report.mjs';

const BRANCH = 'gh-pages';
const ROOT = 'reports';
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const orderOf = item => [item.start,item.runId,item.attempt];
export function compareReports(a,b) {
  const aa=orderOf(a), bb=orderOf(b);
  for(let i=0;i<aa.length;i++) if(aa[i]!==bb[i]) return aa[i]-bb[i];
  return 0;
}
export function reportManifest(report) {
  const r=report.record, f=report.delivery;
  if(!/^[\w.-]+\/[\w.-]+$/.test(r?.repository ?? '') ||
    !['issue','runId','attempt'].every(k=>Number.isSafeInteger(r[k])&&r[k]>0) || !Number.isSafeInteger(r.start))
    throw new Error('Invalid report identity');
  if(typeof report.reportId!=='string' || !report.reportId.startsWith(`${r.repository}:${r.issue}:${r.runId}:${r.attempt}:`))
    throw new Error('Missing rendered report identity');
  return {version:1,repository:r.repository,issue:r.issue,runId:r.runId,attempt:r.attempt,start:r.start,
    status:r.status,headSha:f?.meta?.headSha || null,prNumber:report.pr?.number || null,
    title:f?.meta?.title || `Issue #${r.issue}`,reportId:report.reportId,
    summary:f?.delivery?.qaSummary || '',
    path:`${ROOT}/issues/${r.issue}/runs/${r.runId}/attempt-${r.attempt}/index.html`,
    quality:{reviewRubric:['completed','partial'].includes(f?.buildReview?.state) ? (f.buildReview.basis?.rubricVersion ?? 1) : 0,qa:Boolean(f?.rawQaReport),retro:Boolean(f?.retro),review:['completed','partial'].includes(f?.buildReview?.state),reviewComplete:f?.buildReview?.state==='completed',checks:f?.checks?.length||0,media:f?.media?.length||0,usage:r.usage?.records||0}};
}
function validManifest(m) {
  return m?.version===1 && typeof m.repository==='string' && typeof m.path==='string' &&
    Number.isSafeInteger(m.issue) && Number.isSafeInteger(m.runId) && Number.isSafeInteger(m.attempt) && Number.isSafeInteger(m.start);
}
const reviewRubric = m => m?.quality?.reviewRubric ?? (m?.quality?.review ? 1 : 0);
function degraded(next,old) {
  if (!old?.quality) return false;
  // Completeness is comparable only within the same rubric. An older rubric
  // must never overwrite a newer one during a delayed publication replay.
  if (reviewRubric(next) < reviewRubric(old)) return true;
  return ['qa','retro','review','reviewComplete','checks','media','usage'].some(k => {
    if (k === 'reviewComplete' && reviewRubric(next) > reviewRubric(old)) return false;
    return Number(next.quality[k]??0)<Number((k==='reviewComplete' ? old.quality.reviewComplete ?? old.quality.review : old.quality[k])??0);
  });
}
async function getJson(client,file,ref) {
  const value=await client.request('GET',`/contents/${file}`,{query:{ref},allow404:true});
  if(!value) return null;
  if(value.encoding!=='base64') throw new Error('Invalid Pages manifest encoding');
  return JSON.parse(Buffer.from(value.content,'base64').toString('utf8'));
}
function redirectPage(target,id='') {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="factory-report-id" content="${escape(id)}"><meta http-equiv="refresh" content="0;url=${escape(target)}"><title>交付报告</title><a href="${escape(target)}">打开交付报告</a></html>`;
}
function indexPage(items) {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Code Agent · 交付报告</title><style>body{font:15px/1.8 system-ui,sans-serif;background:#fafafa;color:#18181b;margin:0}main{max-width:1040px;margin:auto;padding:48px 24px}h1{font-size:32px}a{color:inherit;text-decoration:none}article{padding:24px;margin:16px 0;background:white;border:1px solid #e4e4e7;border-radius:12px}p,small{color:#71717a}h2{font-size:20px;margin:0}</style><main><small>CODE AGENT / DELIVERY REPORTS</small><h1>搭建交付报告</h1><p>固定模板 · 逐条验收 · 问题与改进 · 执行与用量</p>${items.sort((a,b)=>compareReports(b,a)).map(m=>`<article><a href="issues/${m.issue}/"><small>#${m.issue} · ${escape(outcomeLabels[m.status]||'未完成')}</small><h2>${escape(m.title)}</h2><p>Run ${m.runId} / attempt ${m.attempt} → 查看完整报告</p></a></article>`).join('')}</main></html>`;
}

// Keep the whole site in one dedicated branch. Optimistic ref updates preserve
// other Issues and allow replays; only the latest source can move an Issue alias.
export async function archiveReport(client,report,html) {
  const next=reportManifest(report);
  if(client.repository!==next.repository || !html.includes(`content="${escape(next.reportId)}"`))
    throw new Error('Report content/source mismatch');
  for(let attempt=0;attempt<3;attempt++) {
    const ref=await client.getRef(BRANCH,true);
    const sha=ref?.object?.sha;
    const commit=sha ? await client.request('GET',`/git/commits/${sha}`) : null;
    const registry=sha ? (await getJson(client,`${ROOT}/manifest.json`,sha) || {version:1,issues:{}}) : {version:1,issues:{}};
    if(registry.version!==1 || !registry.issues || Object.values(registry.issues).some(m=>!validManifest(m)||m.repository!==next.repository))
      throw new Error('Invalid existing report registry; refusing to overwrite');
    const dir=next.path.slice(0,-'index.html'.length);
    const previous=sha ? await getJson(client,`${dir}manifest.json`,sha) : null;
    if(previous && (!validManifest(previous)||previous.repository!==next.repository||previous.path!==next.path))
      throw new Error('Existing report identity mismatch');
    const preserve=previous && degraded(next,previous);
    const manifest=preserve ? previous : next;
    const latest=registry.issues[String(next.issue)];
    const isLatest=!latest || compareReports(manifest,latest)>=0;
    const files=[];
    const retained=[];
    if (!preserve && previous && reviewRubric(previous) > 0 && reviewRubric(next) > reviewRubric(previous)) {
      // Keep exact historical bytes under their rubric, including inline images;
      // never relabel old scores or silently discard a complete v1 for a v2 partial.
      for (const name of ['index.html', 'report.json', 'manifest.json']) {
        const file = await client.request('GET', `/contents/${dir}${name}`, {query:{ref:sha}});
        if (!/^[a-f0-9]{40}$/.test(file?.sha ?? '')) throw new Error('Cannot retain previous rubric snapshot');
        retained.push({path:`${dir}rubric-${reviewRubric(previous)}/${name}`,mode:'100644',type:'blob',sha:file.sha});
      }
    }
    if(!preserve) {
      files.push([next.path,html],[`${dir}report.json`,JSON.stringify(report,null,2)],
        [`${dir}manifest.json`,JSON.stringify(next)]);
    }
    if(isLatest) {
      registry.issues[String(next.issue)]=manifest;
      const alias=`./runs/${manifest.runId}/attempt-${manifest.attempt}/index.html`;
      files.push([`${ROOT}/issues/${next.issue}/index.html`,redirectPage(alias,manifest.reportId)]);
    }
    files.push([`${ROOT}/manifest.json`,JSON.stringify(registry)],
      [`${ROOT}/index.html`,indexPage(Object.values(registry.issues))]);
    if(!sha) files.push(['index.html',redirectPage(`./${ROOT}/`)],['.nojekyll','']);
    const tree=[...retained];
    for(const [file,content] of files) {
      const blob=await client.request('POST','/git/blobs',{body:{content,encoding:'utf-8'}});
      tree.push({path:file,mode:'100644',type:'blob',sha:blob.sha});
    }
    const newTree=await client.request('POST','/git/trees',{body:{...(commit?{base_tree:commit.tree.sha}:{}),tree}});
    if(commit?.tree.sha===newTree.sha) return {manifest,isLatest,preserved:Boolean(preserve),commitSha:sha};
    const created=await client.request('POST','/git/commits',{body:{message:`report: issue ${next.issue}, run ${next.runId}, attempt ${next.attempt}`,tree:newTree.sha,parents:sha?[sha]:[]}});
    try {
      if(sha) await client.request('PATCH',`/git/refs/heads/${BRANCH}`,{body:{sha:created.sha,force:false}});
      else await client.createRef(BRANCH,created.sha);
      return {manifest,isLatest,preserved:Boolean(preserve),commitSha:created.sha};
    } catch(error) {
      if(attempt===2 || !/409|422/.test(error.message)) throw error;
    }
  }
  throw new Error('Could not archive report');
}

export function pagesUrl(base,relative) {
  const u=new URL(base);
  if(u.protocol!=='https:' || u.username || u.password || u.search || u.hash || /^(?:\/|\.\.)/.test(relative))
    throw new Error('Invalid Pages URL');
  return new URL(relative,`${u.href.replace(/\/$/,'')}/`).href;
}
export async function verifyPage(url,id,{fetcher=fetch,pause=sleep,attempts=6}={}) {
  for(let n=0;n<attempts;n++) {
    try {
      // No repository credentials are ever sent to the public site.
      const response=await fetcher(url,{signal:AbortSignal.timeout(15000),cache:'no-store'});
      if(response.ok && (await response.text()).includes(`name="factory-report-id" content="${escape(id)}"`)) return;
    } catch {}
    if(n+1<attempts) await pause(5000);
  }
  throw new Error('Pages report is not accessible with the expected source identity yet');
}
const marker=issue=>`<!-- factory-delivery-report:${issue} -->`;
function receipt(body) {
  const match=/<!-- factory-report-source:(\d+):(\d+):(\d+) -->/.exec(body||'');
  return match ? {start:Number(match[1]),runId:Number(match[2]),attempt:Number(match[3])}:null;
}
export async function notifyReport(client,publication,base,{verify=verifyPage}={}) {
  const m=publication.manifest;
  if(!validManifest(m)||m.repository!==client.repository) throw new Error('Invalid publication');
  const url=pagesUrl(base,m.path);
  await verify(url,m.reportId);
  const registry=await getJson(client,`${ROOT}/manifest.json`,BRANCH);
  if(registry?.issues?.[String(m.issue)]?.reportId!==m.reportId) return {url,updated:false};
  const link=pagesUrl(base,`${ROOT}/issues/${m.issue}/`);
  const body=[marker(m.issue),`<!-- factory-report-source:${m.start}:${m.runId}:${m.attempt} -->`,'## 搭建交付报告','',
    `**${outcomeLabels[m.status]||'未完成'}**`,markdownText(m.summary),
    '',`[打开完整 HTML 报告](${link}) · [本轮固定快照](${url})`,
    `Run ${m.runId} / attempt ${m.attempt}${m.headSha ? ` · 提交 \`${m.headSha.slice(0,12)}\`` : ''}`,
    '逐条验收、截图证据、遇到的问题、改进建议和用量统计均在报告中。'].filter(Boolean).join('\n');
  async function upsert(number) {
    const comments=[];
    for(let page=1;;page++) {
      const batch=await client.request('GET',`/issues/${number}/comments`,{query:{per_page:100,page}});
      comments.push(...batch); if(batch.length<100) break;
    }
    const existing=comments.find(c=>c.user?.login==='github-actions[bot]'&&c.body?.includes(marker(m.issue)));
    const old=receipt(existing?.body);
    if(old&&compareReports(m,old)<0) return;
    if(existing?.body===body) return;
    if(existing) await client.request('PATCH',`/issues/comments/${existing.id}`,{body:{body}});
    else await client.addComment(number,body);
  }
  await upsert(m.issue);
  if(m.prNumber && m.headSha) {
    const pr=await client.request('GET',`/pulls/${m.prNumber}`);
    if(pr.head?.sha===m.headSha && pr.head?.repo?.full_name===m.repository &&
      pr.body?.includes(`<!-- agent-issue: ${m.issue} -->`) &&
      pr.body.includes(`https://github.com/${m.repository}/actions/runs/${m.runId}`)) await upsert(m.prNumber);
  }
  return {url,updated:true};
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [mode,...argv]=process.argv.slice(2);
  if(argv.length%2) throw new Error('Expected --name value arguments');
  const args=Object.fromEntries(Array.from({length:argv.length/2},(_,i)=>[argv[i*2].replace(/^--/,''),argv[i*2+1]]));
  const client=new GitHubClient({token:process.env.GITHUB_TOKEN,repository:process.env.GITHUB_REPOSITORY,apiUrl:process.env.GITHUB_API_URL});
  if(mode==='archive') {
    const report=JSON.parse(readFileSync(args.report,'utf8'));
    const publication=await archiveReport(client,report,readFileSync(args.html,'utf8'));
    writeFileSync(args.output,JSON.stringify(publication));
    if(process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,`commit_sha=${publication.commitSha}\n`);
  } else if(mode==='notify') {
    const result=await notifyReport(client,JSON.parse(readFileSync(args.publication,'utf8')),args['base-url']);
    console.log(`Report verified: ${result.url}; current comment updated: ${result.updated}`);
    if(process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,`\n[查看已验证的 HTML 报告](${result.url})\n`);
  } else throw new Error('Usage: report-pages.mjs <archive|notify> --name value ...');
}
