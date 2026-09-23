import { digest, loadBuildReview } from './build-review.mjs';
import { parseAcceptanceCriteria } from './acceptance-criteria.mjs';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { renderHtml } from '../reports/render-report.mjs';
import { readJson, safeFile, matchesTaskPR } from './visual-report.mjs';
import { phases } from './task-usage.mjs';
import { outcomeLabels } from './task-outcome.mjs';
import { collectAgentFailure } from './agent-failure.mjs';

const phaseNames = {
  implementation: '初始实现', repair: '应用修复', qa: '完整业务 QA',
  qaFocused: '失败路径复测', qaReport: 'QA 补报告', review: '独立搭建评审', compaction: '上下文压缩',
};
const strings = value => Array.isArray(value) ? value.filter(v => typeof v === 'string') : [];
const text = value => typeof value === 'string' ? value : '';
const positive = value => Number.isSafeInteger(value) && value > 0;
export const reportStatus = status => ({delivered:'pr-ready', failure:'failed', success:'unknown', handoff:'handoff', cancelled:'cancelled', timed_out:'timed_out', skipped:'skipped', action_required:'action_required'})[status] || 'unknown';

function optionalJson(root, file, warnings) {
  try { return readJson(root, file); }
  catch (error) {
    if (error.code !== 'ENOENT') warnings.push(`${file} 无法读取，相关内容标为未提供。`);
    return null;
  }
}

export function collectDelivery(root, report, issue = {}) {
  const { record, cumulative, records = [record], timings = [] } = report;
  const warnings = [];
  const buildReview = loadBuildReview(root, record);
  const metadata = optionalJson(root, 'task-metadata.json', warnings);
  if (metadata && (metadata.repository !== record.repository || metadata.issue?.number !== record.issue))
    throw new Error('Delivery report metadata does not match its source run');
  const repair = optionalJson(root, 'repair-summary.json', warnings);
  const lastRound = repair?.finalVerificationAttempt ?? repair?.verificationAttempts;
  let round = positive(lastRound) ? lastRound : null;
  if (!round && existsSync(root)) {
    // Never walk into previous runs or mistake focused QA for final full QA.
    const rounds = readdirSync(root, { withFileTypes:true })
      .filter(e => e.isDirectory() && /^verify-[1-9]\d*$/.test(e.name))
      .map(e => Number(e.name.slice(7))).filter(positive);
    round = rounds.length ? Math.max(...rounds) : null;
  }
  let prefix = round ? `verify-${round}/browser-acceptance` : null;
  let qa = prefix ? optionalJson(root, `${prefix}/report.json`, warnings) : null;
  if (!qa && round && record.status !== 'delivered') {
    const focused = optionalJson(root, `verify-${round}/browser-focused/report.json`, warnings);
    if (focused) {
      prefix = `verify-${round}/browser-focused`; qa = focused;
      warnings.push('本轮只有失败路径复测记录，不代表全量验收通过。');
    }
  }
  const showcase = prefix ? optionalJson(root, `${prefix}/showcase.json`, warnings) : null;
  const notes = prefix ? optionalJson(root, `${prefix}/delivery-notes.json`, warnings) : null;
  const rawRetro = optionalJson(root, 'retro.json', warnings);
  const changes = optionalJson(root, 'change-summary.json', warnings);
  const qaChecks = Array.isArray(qa?.checks) ? qa.checks : [];
  const attention = [];
  if (record.status === 'failure') {
    try {
      const failure = collectAgentFailure(root);
      if (failure) attention.push({ title: failure.title, detail: failure.detail, source: failure.source });
    } catch { warnings.push('Agent 失败诊断无法读取，具体原因请查看本轮运行日志。'); }
  }
  const media = [];
  const seen = new Set();
  let bytes = 0;
  const candidates = [
    ...(Array.isArray(showcase?.pages) ? showcase.pages.map(p => ({title:p?.title, name:p?.screenshot, category:'业务界面'})) : []),
    ...qaChecks.flatMap((c,i) => strings(c?.screenshots).map(name => ({title:name, name, category:`验收 ${i+1}`}))),
  ];
  for (const item of candidates) {
    const name = item.name;
    if (seen.has(name)) continue;
    seen.add(name);
    if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]*\.png$/.test(name)) {
      warnings.push('已跳过无效截图文件名。'); continue;
    }
    const relative = `${prefix}/evidence/${name}`;
    try {
      const {file, size} = safeFile(root, relative, 10*1024*1024);
      if (bytes + size > 15*1024*1024) throw new Error('Inline media budget reached');
      const image = readFileSync(file);
      if (!image.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))
        throw new Error('Not a PNG');
      bytes += size;
      media.push({id:name, title:text(item.title)||name, path:relative, category:item.category, featured:media.length<6});
    } catch {
      warnings.push(`截图 ${name} 未内嵌（文件缺失、无效或超出大小预算），原始引用保留在验收记录中。`);
    }
  }
  for (const evidence of buildReview.evaluation?.evidence ?? []) {
    if (evidence.kind !== 'screenshot') continue;
    const relative = evidence.path.slice('artifacts/'.length);
    delete evidence.mediaId;
    try {
      const { file, size } = safeFile(root, relative, 10*1024*1024);
      const data = readFileSync(file);
      if (digest(data) !== evidence.sha256 || !data.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))
        throw new Error('Review screenshot does not match captured evidence');
      const existing = media.find(item => item.path === relative);
      if (existing) { evidence.mediaId = existing.id; continue; }
      if (bytes + size > 15*1024*1024) throw new Error('Review screenshot over budget');
      bytes += size;
      evidence.mediaId = `review-${evidence.id}`;
      media.push({id:evidence.mediaId,title:evidence.observation,path:relative,category:'评审截图 · 含首轮',featured:false});
    } catch { warnings.push(`评审证据 ${evidence.id} 截图未内嵌，请核对本轮 Artifact。`); }
  }
  const included = new Set(media.map(m => m.id));
  const checks = qaChecks.map((raw,i) => {
    const c = raw && typeof raw === 'object' ? raw : {};
    const id = `A${i+1}`;
    const screenshots = strings(c.screenshots).filter(n => included.has(n));
    const actions = strings(c.actions), evidence = strings(c.evidence);
    const status = ['passed','failed'].includes(c.status) ? c.status : 'not-verified';
    const evidenceUnavailable = !actions.length || !evidence.length || !screenshots.length;
    if (evidenceUnavailable || screenshots.length !== strings(c.screenshots).length)
      attention.push({checkId:id,title:'验收证据不完整或未内嵌', detail:'保留 Agent 原始结论；缺少的截图或操作记录不视为已验证，原始引用见下方数据。',source:`${prefix}/report.json`});
    return {id,title:text(c.criterion)||`验收项 ${i+1}`,criterion:text(c.criterion),status,actions,evidence,screenshots,
      evidenceUnavailable,source:`${prefix}/report.json`,result:(c.status === 'blocked' ? '环境受阻：' : '') + (text(c.reason)||evidence.at(-1)||'未提供结果说明。')};
  });
  const normalize = value => text(value).replace(/^(?:\d+[.)]|[-*])\s+/u, '').trim();
  let expected = [];
  try { expected = parseAcceptanceCriteria(metadata?.task?.acceptanceCriteria).map(c => c.text); }
  catch { warnings.push('原始验收要求不可解析，不能推断覆盖完整。'); }
  if (checks.length < expected.length) {
    const recorded = new Set(checks.map(c=>normalize(c.criterion)));
    // Add missing requirements only when the existing rows can be matched by
    // their original text; never guess a positional correspondence.
    if (checks.every(c=>expected.includes(normalize(c.criterion)))) {
      for (const criterion of expected.filter(v=>!recorded.has(v)))
        checks.push({id:`A${checks.length+1}`,title:criterion,criterion,status:'not-verified',
          actions:[],evidence:[],screenshots:[],source:'task-metadata.json',result:'本轮没有此项实际验收记录。'});
    } else warnings.push(`原始要求 ${expected.length} 项，本轮仅记录 ${checks.length} 项，无法自动逐项对应；请核对完整原始验收要求。`);
  }
  if (qa?.passed === false || qa?.authenticated === false)
    warnings.push(`本轮浏览器报告未通过${qa?.authenticated === false ? '，没有确认登录成功' : ''}。`);
  strings(qa?.failures).forEach(detail => attention.push({title:'验收失败记录',detail,source:`${prefix}/report.json`}));
  if (record.status === 'delivered' && (!qa || qa.passed !== true || !qaChecks.length))
    warnings.push('流水线已发布 PR，但本次可读取的完整 QA 证据不全；不能据此宣称验收全部通过。');
  const retro = rawRetro && typeof rawRetro === 'object' && rawRetro.version === 1 && Array.isArray(rawRetro.blockers) && Array.isArray(rawRetro.improvements)
    ? {version:1, summary:text(rawRetro.summary), source:'Agent · retro.json',
      blockers:rawRetro.blockers.map(b => ({phase:text(b?.phase),title:text(b?.title),symptom:text(b?.symptom),rootCause:text(b?.rootCause),resolution:text(b?.resolution),cost:text(b?.cost),source:text(b?.source),status:['resolved','open'].includes(b?.status)?b.status:'unknown'})),
      improvements:rawRetro.improvements.map(x => ({category:text(x?.category),title:text(x?.title),detail:text(x?.detail),suggestedChange:text(x?.suggestedChange),source:text(x?.source),mechanizable:x?.mechanizable === true}))}
    : null;
  if (rawRetro && !retro) warnings.push('retro.json 格式无效；原始内容已保留，没有据此推断“无问题”。');
  warnings.forEach(detail => attention.push({title:'报告资料说明',detail}));
  const usage = cumulative.usage;
  const total = key => phases.reduce((n,p) => n+(usage.phases[p]?.[key]||0),0);
  const measured = usage.records > 0;
  const counts = changes?.counts;
  const runUrl = `https://github.com/${record.repository}/actions/runs/${record.runId}/attempts/${record.attempt}`;
  const facts = {
    version:1,
    meta:{repository:record.repository, issue:record.issue, runId:String(record.runId), attempt:record.attempt,
      headSha:'', targetBranch:text(metadata?.task?.targetBranch)||'未取得目标分支',
      title:text(metadata?.issue?.title)||text(issue.title)||`Issue #${record.issue}`,
      snapshotDate:new Date(record.end).toISOString()},
    delivery:{status:reportStatus(record.status), ci:record.status==='delivered'?'passed':'unknown',
      ciSource:record.status==='delivered'?'流水线已完成最终验证及 PR 发布；不代表人工合并。':'本轮独立最终验证结果未确认。',
      qaSummary:text(qa?.summary)},
    links:[{label:'查看需求',url:`https://github.com/${record.repository}/issues/${record.issue}`},{label:'本轮运行与原始产物',url:runUrl}],
    attention,checks,media,uncovered:strings(showcase?.uncovered),
    rawQaReport:qa, rawRetro,
    acceptanceRequirements:text(metadata?.task?.acceptanceCriteria),
    changes:counts && ['files','added','modified','deleted'].every(k=>Number.isSafeInteger(counts[k])&&counts[k]>=0)
      ? {total:counts.files,added:counts.added,modified:counts.modified,deleted:counts.deleted}:null,
    usage:{scope:`此 Issue 累计：已采集 ${cumulative.runs} 个 Run / ${cumulative.attempts} 次尝试`,source:'现有 task-usage 模块（按 Agent / job ID 去重）',
      total:measured?cumulative.total:null,cacheRead:measured?total('cacheRead'):null,uncachedInput:measured?total('input'):null,output:measured?total('output'):null,
      executionSeconds:cumulative.missingTimes?null:cumulative.seconds,endToEndSeconds:cumulative.elapsed,
      incomplete:Boolean(usage.incomplete||usage.missing),
      phases:phases.map(p=>({label:phaseNames[p],...Object.fromEntries(['input','output','cacheRead','cacheWrite'].map(k=>[k,measured?(usage.phases[p]?.[k]||0):null])),total:measured?(usage.phases[p]?.totalTokens||0):null})),
      coverageNote:`用量记录 ${usage.records}；未报告用量 ${usage.missing}；分项不完整 ${usage.incomplete}；缺失作业时间 ${cumulative.missingTimes}。`,
      note:'不把流式增量、上下文长度和思考 Token 重复相加。旧记录未拆分 QA 时保留原有口径；费用：未知。'},
    runs:records.map(r=>({id:String(r.runId),attempt:r.attempt,status:reportStatus(r.status),detail:outcomeLabels[r.status]||'未完成'})),
    retro,timings,buildReview,
  };
  return {facts,notes,metadata};
}

export async function makeDeliveryReport(report, root, issue, listPulls) {
  const collected = collectDelivery(root, report, issue);
  const {facts,notes,metadata} = collected;
  let pr = null;
  if (report.record.status === 'delivered' && metadata?.workBranch && listPulls) {
    try {
      const pulls = await listPulls(metadata.workBranch);
      const source = {repository:report.record.repository,runUrl:`https://github.com/${report.record.repository}/actions/runs/${report.record.runId}`};
      const found = pulls.find(p=>matchesTaskPR(p,metadata,source));
      if (found && /<!-- agent-head-sha: [a-f0-9]{40} -->/.test(found.body)) {
        pr = {number:found.number,headSha:found.head.sha};
        facts.meta.headSha = pr.headSha;
        facts.links.unshift({label:`查看 PR #${pr.number}`,url:`https://github.com/${report.record.repository}/pull/${pr.number}`});
      }
    } catch {
      facts.attention.push({title:'PR 链接暂未取得',detail:'报告仍保留；请从本轮运行或 Issue 查看交付。'});
    }
  }
  // Missing artifact directories are legitimate for failed/pre-Agent runs.
  const result = await renderHtml(facts,notes,existsSync(root)?root:process.cwd());
  return {facts,pr,html:result.html,reportId:result.reportId};
}
