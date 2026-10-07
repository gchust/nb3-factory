import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { GitHubClient } from './factory-lib.mjs';
import { outcomeLabels } from './task-outcome.mjs';
import { text as markdownText } from './visual-report.mjs';
import { collectOccurrences, renderFindingsIndex } from '../reports/findings-index.mjs';
import { createClassificationInput, projectClassification, validateClassification } from '../reports/findings-classification.mjs';
import { LEDGER as DAILY_LEDGER, INDEX_PAGE as DAILY_INDEX, renderDailyIndex, validateLedger } from '../reports/findings-daily.mjs';

async function dailyIndexAssets(client, sha, reports) {
  // Preview updates never close a day or change its immutable digest ledger.
  try {
    const ledger = validateLedger(sha ? await getJson(client, DAILY_LEDGER, sha) : null);
    return [[DAILY_INDEX, await renderDailyIndex(ledger, collectOccurrences(reports))]];
  } catch {
    // A damaged daily ledger must not block the original report publication.
    return [];
  }
}

export const BRANCH = 'gh-pages';
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
export async function getJson(client,file,ref) {
  const value=await client.request('GET',`/contents/${file}`,{query:{ref},allow404:true});
  if(!value) return null;
  // Above 1 MiB the contents API answers encoding "none" with no content; the
  // blob API serves the same file (as evaluation-registry.mjs readBytes does).
  if(value.encoding==='none' && /^[a-f0-9]{40}$/.test(value.sha ?? '')) return readBlobJson(client,value.sha);
  if(value.encoding!=='base64') throw new Error('Invalid Pages manifest encoding');
  return JSON.parse(Buffer.from(value.content,'base64').toString('utf8'));
}
export async function readBlobJson(client,blobSha) {
  const blob=await client.request('GET',`/git/blobs/${blobSha}`);
  if(blob?.encoding!=='base64') throw new Error('Invalid Pages blob encoding');
  return JSON.parse(Buffer.from(blob.content,'base64').toString('utf8'));
}
// The SHA Git gives a file with exactly this content.
export const gitBlobSha = content =>
  createHash('sha1').update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest('hex');
function redirectPage(target,id='') {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="factory-report-id" content="${escape(id)}"><meta http-equiv="refresh" content="0;url=${escape(target)}"><title>交付报告</title><a href="${escape(target)}">打开交付报告</a></html>`;
}
function indexPage(items) {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Code Agent · 交付报告</title><style>body{font:15px/1.8 system-ui,sans-serif;background:#fafafa;color:#18181b;margin:0}main{max-width:1040px;margin:auto;padding:48px 24px}h1{font-size:32px}a{color:inherit;text-decoration:none}article{padding:24px;margin:16px 0;background:white;border:1px solid #e4e4e7;border-radius:12px}p,small{color:#71717a}h2{font-size:20px;margin:0}</style><main><small>CODE AGENT / DELIVERY REPORTS</small><h1>搭建交付报告</h1><p>固定模板 · 逐条验收 · 问题与改进 · 执行与用量 · <a href="findings/"><u>跨报告框架问题汇总 →</u></a></p>${items.sort((a,b)=>compareReports(b,a)).map(m=>`<article><a href="issues/${m.issue}/"><small>#${m.issue} · ${escape(outcomeLabels[m.status]||'未完成')}</small><h2>${escape(m.title)}</h2><p>Run ${m.runId} / attempt ${m.attempt} → 查看完整报告</p></a></article>`).join('')}</main></html>`;
}

const FINDINGS_INDEX = 'reports/findings/index.html';
// Written compact: only programs read it, and every report rewrites it.
const FINDINGS_INPUT = 'reports/findings/input.json';
const FINDINGS_CLASSIFICATION = 'reports/findings/classification.json';
const FINDINGS_BASELINE = 'reports/findings/baseline.json';

// A reset moves only the start line of the cross-report index: runs that
// started earlier stay archived with their own findings but leave the index.
async function readFindingsBaseline(client, sha) {
  const baseline = sha ? await getJson(client, FINDINGS_BASELINE, sha) : null;
  if (
    baseline &&
    (baseline.version !== 1 ||
      !Number.isSafeInteger(baseline.since) ||
      baseline.since <= 0)
  )
    throw new Error('Invalid findings baseline');
  return baseline;
}
function findingsScope(registry, baseline) {
  const all = Object.values(registry.issues);
  const manifests = baseline
    ? all.filter((m) => m.start >= baseline.since)
    : all;
  return {
    manifests,
    baseline: baseline && {
      since: baseline.since,
      excluded: all.length - manifests.length,
    },
  };
}

// Per-report findings, cached by report blob. collectOccurrences is a pure
// per-report map, so a report's own result, keyed by the report.json blob SHA
// and the extractor's source, stands in for the whole report: a snapshot reads
// one tree listing plus the reports that changed, instead of one request per
// report, and the cache stays small because it holds findings, not reviews.
export const FINDINGS_CACHE = 'reports/findings/report-cache.json';
const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));
let extractorVersion;
// Any change to the extractor or a module it imports starts a new cache.
export function findingsExtractorVersion() {
  if (extractorVersion) return extractorVersion;
  const hash = createHash('sha256');
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    hash.update(path.relative(SCRIPTS, file)).update('\0').update(text).update('\0');
    for (const [, specifier] of text.matchAll(/from\s+'(\.{1,2}\/[^']+\.mjs)'/g))
      visit(path.resolve(path.dirname(file), specifier));
  };
  visit(path.resolve(SCRIPTS, '../reports/findings-index.mjs'));
  return (extractorVersion = hash.digest('hex').slice(0, 16));
}
export function collectedEntry(blob, report) {
  const { occurrences, skipped } = collectOccurrences([report]);
  return { blob, collected: { occurrences, skipped } };
}
function validCache(value) {
  if (value?.version !== 1 || value.extractor !== findingsExtractorVersion() || !value.reports || typeof value.reports !== 'object')
    return {};
  const reports = {};
  for (const [file, entry] of Object.entries(value.reports))
    if (/^[a-f0-9]{40}$/.test(entry?.blob ?? '') && Array.isArray(entry.collected?.occurrences) && Array.isArray(entry.collected?.skipped))
      reports[file] = entry;
  return reports;
}
async function readCache(client, sha) {
  try { return validCache(await getJson(client, FINDINGS_CACHE, sha)); }
  catch { return {}; } // A damaged cache only costs a full read.
}
// report.json blob SHAs under reports/issues from three tree reads; null when
// the listing is unavailable or truncated, so callers read each report instead.
async function reportBlobs(client, sha) {
  try {
    const commit = await client.request('GET', `/git/commits/${sha}`);
    let tree = commit.tree.sha;
    for (const part of ['reports', 'issues']) {
      const listing = await client.request('GET', `/git/trees/${tree}`);
      const entry = listing?.tree?.find((item) => item.path === part && item.type === 'tree');
      if (!entry) return new Map();
      tree = entry.sha;
    }
    const all = await client.request('GET', `/git/trees/${tree}`, { query: { recursive: '1' } });
    if (!Array.isArray(all?.tree) || all.truncated) return null;
    return new Map(all.tree
      .filter((item) => item.type === 'blob' && item.path.endsWith('/report.json'))
      .map((item) => [`${ROOT}/issues/${item.path}`, item.sha]));
  } catch {
    return null;
  }
}
export function cacheFile(cache) {
  return [FINDINGS_CACHE, JSON.stringify({ version: 1, extractor: findingsExtractorVersion(), reports: cache })];
}

// The cross-report findings index is derived from the latest report of every
// Issue in the registry, so a rerun replaces rather than double counts.
// Returns the reports (or their cached per-report results) in registry order,
// and the cache entries a writer should store for them.
async function findingsReports(client,manifests,sha,current) {
  const cached = sha ? await readCache(client, sha) : {};
  const blobs = sha ? await reportBlobs(client, sha) : new Map();
  const cache = {};
  const read = async (m) => {
    const file = `${m.path.slice(0,-'index.html'.length)}report.json`;
    if (current && m.reportId===current.reportId) {
      // archiveReport writes exactly this text, so its blob SHA is known now.
      cache[file] = collectedEntry(gitBlobSha(JSON.stringify(current,null,2)), current);
      return current;
    }
    if (!sha) return null;
    if (!blobs) return getJson(client, file, sha);
    const blob = blobs.get(file);
    if (!blob) return null;
    if (cached[file]?.blob === blob) {
      cache[file] = cached[file];
      return { collected: cached[file].collected };
    }
    const report = await readBlobJson(client, blob);
    cache[file] = collectedEntry(blob, report);
    return report;
  };
  const reports=[];
  for(let i=0;i<manifests.length;i+=8)
    reports.push(...await Promise.all(manifests.slice(i,i+8).map(read)));
  // Without a tree listing nothing could be checked against the cache: keep
  // its in-scope entries, which every later read verifies by blob SHA again.
  for (const m of manifests) {
    const file = `${m.path.slice(0,-'index.html'.length)}report.json`;
    if (!cache[file] && cached[file]) cache[file] = cached[file];
  }
  return { reports: reports.filter(Boolean), cache };
}

export async function readFindingsSnapshot(client, sha) {
  sha ??= (await client.getRef(BRANCH, true))?.object?.sha;
  if (!sha) return null;
  const registry = await getJson(client, 'reports/manifest.json', sha);
  if (!registry?.issues) return null;
  const scope = findingsScope(
    registry,
    await readFindingsBaseline(client, sha),
  );
  const { reports, cache } = await findingsReports(client, scope.manifests, sha);
  const input = createClassificationInput(
    collectOccurrences(reports).occurrences,
  );
  let classification = null;
  try {
    classification = await getJson(client, FINDINGS_CLASSIFICATION, sha);
  } catch {
    /* A damaged cache must not prevent a fresh classification. */
  }
  return { sha, reports, cache, input, classification, baseline: scope.baseline };
}

async function findingsIndexAssets(client, registry, sha, current) {
  const scope = findingsScope(
    registry,
    await readFindingsBaseline(client, sha),
  );
  const { reports, cache } = await findingsReports(client, scope.manifests, sha, current);
  const input = createClassificationInput(
    collectOccurrences(reports).occurrences,
  );
  let classification = null;
  try {
    if (sha)
      classification = await getJson(client, FINDINGS_CLASSIFICATION, sha);
  } catch {
    /* Invalid classification leaves findings visible and pending. */
  }
  const state = projectClassification(input, classification);
  return {
    needsClassification: input.findings.length > 0 && !state.current,
    files: [
      [
        FINDINGS_INDEX,
        await renderFindingsIndex(reports, {
          classification,
          baseline: scope.baseline,
        }),
      ],
      [FINDINGS_INPUT, JSON.stringify(input)],
      cacheFile(cache),
      ...await dailyIndexAssets(client, sha, reports),
    ],
  };
}

// Commit findings files on top of the given site commit; a null content
// removes the path. A concurrent publication surfaces as a ref conflict.
export async function commitFindings(client, sha, files, message) {
  const commit = await client.request('GET', `/git/commits/${sha}`);
  const tree = [];
  for (const [file, content] of files) {
    const blob =
      content === null
        ? null
        : await client.request('POST', '/git/blobs', {
            body: { content, encoding: 'utf-8' },
            contentAddressed: true,
          });
    tree.push({
      path: file,
      mode: '100644',
      type: 'blob',
      sha: blob?.sha ?? null,
    });
  }
  const nextTree = await client.request('POST', '/git/trees', {
    body: { base_tree: commit.tree.sha, tree },
    contentAddressed: true,
  });
  if (nextTree.sha === commit.tree.sha) return sha;
  const next = await client.request('POST', '/git/commits', {
    body: { message, tree: nextTree.sha, parents: [sha] },
    contentAddressed: true,
  });
  await client.request('PATCH', `/git/refs/heads/${BRANCH}`, {
    body: { sha: next.sha, force: false },
  });
  return next.sha;
}

// A fresh publisher validates against the current reports, never the Agent's
// copy of its input. Stale decisions cannot overwrite a newer publication.
export async function archiveFindingsClassification(client, classification) {
  validateClassification(classification);
  for (let attempt = 0; attempt < 3; attempt++) {
    const snapshot = await readFindingsSnapshot(client);
    if (!snapshot || snapshot.input.inputHash !== classification.inputHash)
      return { updated: false, reason: 'stale-input' };
    validateClassification(classification, snapshot.input);
    const html = await renderFindingsIndex(snapshot.reports, {
      classification,
      baseline: snapshot.baseline,
    });
    const files = [
      [FINDINGS_INDEX, html],
      [FINDINGS_INPUT, JSON.stringify(snapshot.input)],
      [FINDINGS_CLASSIFICATION, JSON.stringify(classification, null, 2)],
      cacheFile(snapshot.cache),
      ...await dailyIndexAssets(client, snapshot.sha, snapshot.reports),
    ];
    try {
      const commitSha = await commitFindings(
        client,
        snapshot.sha,
        files,
        'report: classify framework findings with Agent',
      );
      return { updated: true, commitSha };
    } catch (error) {
      if (attempt === 2 || !/409|422/.test(error.message)) throw error;
    }
  }
}

// Start the cross-report index over with runs that begin from now on. Reports,
// their own findings sections and the site's Git history stay untouched.
export async function resetFindingsIndex(
  client,
  { now = Date.now(), runId = '' } = {},
) {
  const baseline = {
    version: 1,
    since: now,
    resetAt: new Date(now).toISOString(),
    runId: String(runId),
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const sha = (await client.getRef(BRANCH, true))?.object?.sha;
    const registry = sha
      ? await getJson(client, 'reports/manifest.json', sha)
      : null;
    if (!registry?.issues) throw new Error('No published report site to reset');
    const scope = findingsScope(registry, baseline);
    const { reports, cache } = await findingsReports(client, scope.manifests, sha);
    const input = createClassificationInput(
      collectOccurrences(reports).occurrences,
    );
    const files = [
      [
        FINDINGS_INDEX,
        await renderFindingsIndex(reports, { baseline: scope.baseline }),
      ],
      [FINDINGS_INPUT, JSON.stringify(input)],
      [FINDINGS_BASELINE, JSON.stringify(baseline, null, 2)],
      cacheFile(cache),
      ...await dailyIndexAssets(client, sha, reports),
    ];
    // Earlier groups describe findings that are no longer in scope.
    const classified = await client.request(
      'GET',
      `/contents/${FINDINGS_CLASSIFICATION}`,
      { query: { ref: sha }, allow404: true },
    );
    if (classified) files.push([FINDINGS_CLASSIFICATION, null]);
    try {
      const commitSha = await commitFindings(
        client,
        sha,
        files,
        'report: reset framework findings index',
      );
      return { commitSha, baseline, excluded: scope.baseline.excluded };
    } catch (error) {
      if (attempt === 2 || !/409|422/.test(error.message)) throw error;
    }
  }
}

// The rendered report inlines every screenshot so a downloaded copy works
// offline, which made screenshots about four fifths of the published site. The
// Pages copy instead carries each one as a file in media/ beside the report,
// named by the SHA-256 of its bytes: the base64 third is gone, a screenshot
// repeated in one report is stored once, and the report's CSP admits 'self'
// images. Reports archived before this keep their inline bytes.
const INLINE_IMAGE = /src="data:image\/(png|webp|jpeg);base64,([A-Za-z0-9+/]+={0,2})"/g;
export function externalizeImages(html) {
  const media = new Map();
  let page = html.replace(INLINE_IMAGE, (_, type, data) => {
    const bytes = Buffer.from(data, 'base64');
    const name = `${createHash('sha256').update(bytes).digest('hex')}.${type === 'jpeg' ? 'jpg' : type}`;
    media.set(name, data);
    return `src="media/${name}"`;
  });
  if (media.size) {
    const csp = /(<meta http-equiv="Content-Security-Policy" content="[^"]*?\bimg-src data:)(;)/;
    if (!csp.test(page)) throw new Error('Report CSP does not declare img-src data:');
    page = page.replace(csp, '$1 &#39;self&#39;$2')
      .replace('截图已经内嵌，可离线查看。', '截图与报告一同发布。');
  }
  return { html: page, media };
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
      // Its screenshot files move with it, so its relative media/ links still resolve.
      const media = await client.request('GET', `/contents/${dir}media`, {query:{ref:sha},allow404:true});
      for (const file of Array.isArray(media) ? media : []) {
        if (file?.type !== 'file' || !/^[a-f0-9]{40}$/.test(file.sha ?? '')) throw new Error('Cannot retain previous rubric snapshot');
        retained.push({path:`${dir}rubric-${reviewRubric(previous)}/media/${file.name}`,mode:'100644',type:'blob',sha:file.sha});
      }
    }
    const binary=[];
    if(!preserve) {
      const page=externalizeImages(html);
      files.push([next.path,page.html],[`${dir}report.json`,JSON.stringify(report,null,2)],
        [`${dir}manifest.json`,JSON.stringify(next)]);
      for(const [name,data] of page.media) binary.push([`${dir}media/${name}`,data]);
      // A replay replaces the report: screenshots only the old copy used go with it.
      const old = previous ? await client.request('GET', `/contents/${dir}media`, {query:{ref:sha},allow404:true}) : null;
      for (const file of Array.isArray(old) ? old : [])
        if (!page.media.has(file?.name)) retained.push({path:`${dir}media/${file.name}`,mode:'100644',type:'blob',sha:null});
    }
    if(isLatest) {
      registry.issues[String(next.issue)]=manifest;
      const alias=`./runs/${manifest.runId}/attempt-${manifest.attempt}/index.html`;
      files.push([`${ROOT}/issues/${next.issue}/index.html`,redirectPage(alias,manifest.reportId)]);
    }
    files.push([`${ROOT}/manifest.json`,JSON.stringify(registry)],
      [`${ROOT}/index.html`,indexPage(Object.values(registry.issues))]);
    // A broken index must never block the report itself; the previous one stays.
    let findingsIndex='updated', findingsNeedsClassification=false;
    try {
      const assets=await findingsIndexAssets(client,registry,sha,preserve ? null : report);
      files.push(...assets.files);
      findingsNeedsClassification=assets.needsClassification;
    }
    catch(error) { findingsIndex=`skipped: ${error.message}`; }
    if(!sha) files.push(['index.html',redirectPage(`./${ROOT}/`)],['.nojekyll','']);
    const tree=[...retained];
    for(const [file,content] of binary) {
      const blob=await client.request('POST','/git/blobs',{body:{content,encoding:'base64'},contentAddressed:true});
      tree.push({path:file,mode:'100644',type:'blob',sha:blob.sha});
    }
    for(const [file,content] of files) {
      const blob=await client.request('POST','/git/blobs',{body:{content,encoding:'utf-8'},contentAddressed:true});
      tree.push({path:file,mode:'100644',type:'blob',sha:blob.sha});
    }
    const newTree=await client.request('POST','/git/trees',{body:{...(commit?{base_tree:commit.tree.sha}:{}),tree},contentAddressed:true});
    if(commit?.tree.sha===newTree.sha) return {manifest,isLatest,preserved:Boolean(preserve),commitSha:sha,findingsIndex,findingsNeedsClassification};
    const created=await client.request('POST','/git/commits',{body:{message:`report: issue ${next.issue}, run ${next.runId}, attempt ${next.attempt}`,tree:newTree.sha,parents:sha?[sha]:[]},contentAddressed:true});
    try {
      if(sha) await client.request('PATCH',`/git/refs/heads/${BRANCH}`,{body:{sha:created.sha,force:false}});
      else await client.createRef(BRANCH,created.sha);
      return {manifest,isLatest,preserved:Boolean(preserve),commitSha:created.sha,findingsIndex,findingsNeedsClassification};
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
// The Pages CDN often serves the previous copy for minutes after a deploy:
// growing waits total three minutes before giving up.
export const VERIFY_DELAYS_MS=[5000,10000,15000,20000,30000,40000,60000];
export async function verifyPage(url,id,{fetcher=fetch,pause=sleep,delays=VERIFY_DELAYS_MS}={}) {
  for(let n=0;n<=delays.length;n++) {
    // A unique query string bypasses cached copies; the identity stamp is still required.
    const probe=new URL(url);probe.searchParams.set('factory-verify',`${Date.now().toString(36)}-${n}`);
    try {
      // No repository credentials are ever sent to the public site.
      const response=await fetcher(probe.href,{signal:AbortSignal.timeout(15000),cache:'no-store'});
      if(response.ok && (await response.text()).includes(`name="factory-report-id" content="${escape(id)}"`)) return;
    } catch { /* Retry an unavailable Pages response. */ }
    if(n<delays.length) await pause(delays[n]);
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
    if(publication.findingsIndex!=='updated') console.warn(`Findings index ${publication.findingsIndex}`);
    if(process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,`commit_sha=${publication.commitSha}\nfindings_pending=${publication.findingsNeedsClassification}\n`);
  } else if(mode==='notify') {
    const result=await notifyReport(client,JSON.parse(readFileSync(args.publication,'utf8')),args['base-url']);
    console.log(`Report verified: ${result.url}; current comment updated: ${result.updated}`);
    if(process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,`\n[查看已验证的 HTML 报告](${result.url})\n`);
  } else if(mode==='reset-findings') {
    const result=await resetFindingsIndex(client,{runId:process.env.GITHUB_RUN_ID||''});
    console.log(`Findings index restarts at ${result.baseline.resetAt}; ${result.excluded} earlier reports left out`);
    if(process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,`commit_sha=${result.commitSha}\n`);
  } else throw new Error('Usage: report-pages.mjs <archive|notify|reset-findings> --name value ...');
}
