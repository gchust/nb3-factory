#!/usr/bin/env node
/** Fixed-template renderer. No network access, model calls, or publishing. Node.js 22+. */
import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { renderBuildReview } from './build-review.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_VERSION = 6;
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = value => Number.isFinite(value) ? value.toLocaleString('en-US') : '未提供';
const duration = value => Number.isFinite(value) ? `${Math.floor(value/3600)}:${String(Math.floor(value/60)%60).padStart(2,'0')}:${String(value%60).padStart(2,'0')}` : '未提供';
const statusLabels = { cancelled:'本轮已取消', timed_out:'本轮超时', unknown:'运行完成（未确认业务交付）', skipped:'本轮跳过', action_required:'需人工介入', 'pr-ready':'已提交 PR · 等待人工评审', handoff:'已保存交接 · 尚未完成', failed:'本轮未完成', running:'任务执行中' };
const checkLabels = { passed:'Agent 报告通过', failed:'Agent 报告未通过', 'not-verified':'未验证' };
const problemLabels = { resolved:'本任务已处理', open:'未解决', unknown:'处理结果未提供' };
const phaseLabels = { implementation:'实现阶段', verify:'自动验证', qa:'浏览器验收', repair:'修复阶段' };
const categoryLabels = { 'template-overlay':'模板兼容', 'skills-docs':'Skill 与文档', 'scaffold-defaults':'脚手架默认值', verification:'验收机制', tooling:'工具与构建', other:'其他' };
const ciLabels = { passed:'通过', failed:'未通过', 'not-run':'未运行', unknown:'未提供' };
const tag = (label, kind='') => `<span class="tag ${kind}">${escape(label)}</span>`;
const list = values => values.length ? `<ol class="compact-list">${values.map(v=>`<li>${escape(v)}</li>`).join('')}</ol>` : '<p class="muted">未提供</p>';
const sectionHead = (eyebrow, title, tail='') => `<div class="section-head"><div><div class="eyebrow">${escape(eyebrow)}</div><h2>${escape(title)}</h2></div>${tail}</div>`;
const metric = (label, value, note) => `<div class="card metric"><div class="metric-head">${escape(label)}</div><div class="metric-value">${escape(value)}</div><div class="metric-note">${escape(note)}</div></div>`;
const text = (v, where) => { if (typeof v !== 'string') throw new Error(`${where} 必须是字符串`); };
const arr = (v, where) => { if (!Array.isArray(v)) throw new Error(`${where} 必须是数组`); };
const texts = (v, where) => { arr(v,where); v.forEach((x,i)=>text(x,`${where}[${i}]`)); };
const member = (v, values, where) => { if (!Object.hasOwn(values,v)) throw new Error(`${where} 非法: ${v}`); };
const positive = (n, where) => { if (!Number.isSafeInteger(n)||n<1) throw new Error(`${where} 必须是正整数`); };
function url(value) { const u=new URL(value); if(u.protocol!=='https:'||u.username||u.password) throw new Error('只允许不含凭据的 HTTPS 链接'); return u.href; }
function validateFacts(f) {
  if(f.version!==1 || !f.meta || !f.delivery) throw new Error('不支持的 facts 版本或缺少 meta/delivery');
  for(const k of ['repository','runId','headSha','targetBranch','title','snapshotDate']) text(f.meta[k],`meta.${k}`);
  if(!/^[\w.-]+\/[\w.-]+$/.test(f.meta.repository) || !/^\d+$/.test(f.meta.runId)) throw new Error('repository/runId 非法');
  if(f.meta.headSha && !/^[a-f\d]{40}$/i.test(f.meta.headSha)) throw new Error('headSha 必须是完整 SHA');
  positive(f.meta.issue,'issue'); positive(f.meta.attempt,'attempt');
  member(f.delivery.status,statusLabels,'delivery.status'); member(f.delivery.ci,ciLabels,'delivery.ci');
  for(const key of ['checks','media','attention','links','runs']) arr(f[key],key);
  const ids=new Set(); const mediaIds=new Set();
  for(const m of f.media) { for(const key of ['id','title','category','path']) text(m[key],`media.${key}`); if(mediaIds.has(m.id)) throw new Error('截图 ID 重复'); mediaIds.add(m.id); }
  for(const c of f.checks) {
    for(const key of ['id','title','criterion','source']) text(c[key],`check.${key}`);
    if(!/^[\w-]+$/.test(c.id)||ids.has(c.id)) throw new Error('验收 ID 非法或重复'); ids.add(c.id);
    member(c.status,checkLabels,'check.status'); for(const key of ['actions','evidence','screenshots']) texts(c[key],`check.${key}`);
    if(c.status==='passed' && !c.evidenceUnavailable && (!c.actions.length||!c.evidence.length||!c.screenshots.length)) throw new Error('passed 验收必须包含操作、观察和截图');
    for(const id of c.screenshots) if(!mediaIds.has(id)) throw new Error(`证据 ${id} 未列入本次媒体清单`);
  }
  for(const a of f.attention) {
    text(a.title,'attention.title'); text(a.detail,'attention.detail');
    if(a.source!==undefined) text(a.source,'attention.source');
    if(a.checkId!==undefined && !ids.has(a.checkId)) throw new Error('attention.checkId 未对应验收项');
  }
  for(const c of f.checks) if(c.result!==undefined) text(c.result,'check.result');
  if(f.uncovered!==undefined) texts(f.uncovered,'uncovered');
  for(const l of f.links) {text(l.label,'link.label');url(l.url);}
  for(const r of f.runs) {text(r.id,'run.id'); positive(r.attempt,'run.attempt');member(r.status,statusLabels,'run.status'); text(r.detail,'run.detail');}
  if(f.changes) for(const k of ['total','added','modified','deleted']) if(!Number.isSafeInteger(f.changes[k])||f.changes[k]<0) throw new Error(`changes.${k} 非法`);
  if(f.usage) {
    for(const k of ['scope','source']) text(f.usage[k],`usage.${k}`);
    for(const k of ['total','cacheRead','uncachedInput','output','executionSeconds','endToEndSeconds']) if(f.usage[k]!==null && (!Number.isSafeInteger(f.usage[k])||f.usage[k]<0)) throw new Error(`usage.${k} 非法`);
    if(typeof f.usage.incomplete!=='boolean') throw new Error('usage.incomplete 必须提供');
    if(f.usage.phases!==undefined) {
      arr(f.usage.phases,'usage.phases');
      for(const phase of f.usage.phases) {
        text(phase.label,'usage.phase.label');
        for(const key of ['input','output','cacheRead','cacheWrite','total']) {
          if(phase[key]!==null && (!Number.isSafeInteger(phase[key]) || phase[key]<0)) throw new Error(`usage.phase.${key} 非法`);
        }
      }
    }
    if(f.usage.coverageNote!==undefined) text(f.usage.coverageNote,'usage.coverageNote');
    if(f.usage.note!==undefined) text(f.usage.note,'usage.note');
  }
}
function validateNotes(n) {
  if(n.version!==1) throw new Error('notes.version 不支持');
  if(Object.keys(n).some(k=>!['version','summary','highlights','flow'].includes(k))) throw new Error('notes 不允许状态、统计或自定义字段');
  text(n.summary,'notes.summary'); arr(n.highlights,'notes.highlights'); texts(n.flow,'notes.flow');
  if(n.summary.length>200 || n.highlights.length>4 || n.flow.length>8) throw new Error('notes 超出摘要长度或展示数量限制');
  for(const h of n.highlights) {text(h.title,'highlight.title');text(h.detail,'highlight.detail'); if(h.title.length>50||h.detail.length>250) throw new Error('highlight 过长');}
}
// Optional retrospective is validated independently; missing/invalid prose cannot erase QA records.
function validateRetro(retro) {
  if(!retro || retro.version!==1) throw new Error('retro.version 不支持');
  text(retro.summary,'retro.summary');
  for(const key of ['blockers','improvements']) arr(retro[key],`retro.${key}`);
  if(retro.source!==undefined) text(retro.source,'retro.source');
  for(const b of retro.blockers) {
    for(const key of ['phase','title','symptom','rootCause','resolution','cost']) text(b[key],`retro.blocker.${key}`);
    if(b.status!==undefined) member(b.status,problemLabels,'retro.blocker.status');
    if(b.source!==undefined) text(b.source,'retro.blocker.source');
  }
  for(const item of retro.improvements) {
    for(const key of ['category','title','detail','suggestedChange']) text(item[key],`retro.improvement.${key}`);
    if(typeof item.mechanizable!=='boolean') throw new Error('retro.improvement.mechanizable 必须是布尔值');
    if(item.source!==undefined) text(item.source,'retro.improvement.source');
  }
}
const field = (label,value) => `<div><dt>${escape(label)}</dt><dd>${escape(value || '未提供')}</dd></div>`;
const checkKind = status => status==='passed'?'good':status==='failed'?'bad':'warn';
const reviewNotes = (facts,id) => facts.attention.filter(a=>a.checkId===id);
const noticeCard = (notice) => `<div class="check-notice">${tag('证据待核对','warn')}<strong>${escape(notice.title)}</strong><p>${escape(notice.detail)}</p>${notice.source?`<p class="check-source">来源：${escape(notice.source)}</p>`:''}</div>`;

function renderAcceptance(f) {
  const count=status=>f.checks.filter(c=>c.status===status).length;
  const noted=f.checks.filter(c=>reviewNotes(f,c.id).length).length;
  let html=`<section class="section" id="acceptance">${sectionHead('Acceptance record','验收记录',tag(`${f.checks.length} 项要求`))}
    <div class="acceptance-toolbar"><div class="acceptance-counts">${tag(`报告通过 ${count('passed')}`,'good')}${tag(`报告未通过 ${count('failed')}`,count('failed')?'bad':'')}${tag(`未验证 ${count('not-verified')}`,count('not-verified')?'warn':'')}${noted?tag(`证据待核对 ${noted}`,'warn'):''}</div>
    <div class="acceptance-actions"><button class="btn small" data-checks="expand">展开全部记录</button><button class="btn small" data-checks="collapse">收起通过项</button></div></div>
    <p class="section-intro">每项直接显示结果；展开可看原始要求、操作记录、观察结果和截图。证据批注单独显示，不改写原始验收状态。</p>
    <div class="card acceptance-list">`;
  for(const [i,c] of f.checks.entries()) {
    const annotations=reviewNotes(f,c.id);
    const keepOpen=c.status!=='passed'||annotations.length>0;
    const result=c.result || c.evidence.at(-1) || (c.status==='not-verified'?'尚无实际操作与结果记录。':'未提供结果说明，请查看原始记录。');
    html+=`<details class="criterion" id="check-${escape(c.id)}" data-status="${escape(c.status)}" data-attention="${Boolean(annotations.length)}" ${keepOpen?'open':''}>
      <summary><span class="step-num">${String(i+1).padStart(2,'0')}</span><div class="criterion-title"><h3>${escape(c.title)}</h3><p class="criterion-result">${escape(result)}</p><span class="record-meta">${escape(c.id)} · ${c.actions.length} 条操作 · ${c.evidence.length} 条观察 · ${c.screenshots.length} 张证据</span></div>
      <div class="criterion-badges">${tag(checkLabels[c.status],checkKind(c.status))}${annotations.length?tag('证据待核对','warn'):''}</div><span class="chevron">⌄</span></summary>
      <div class="criterion-details">${annotations.map(noticeCard).join('')}<div class="criterion-original"><h3>原始验收要求</h3><p>${escape(c.criterion)}</p></div>
      <div class="evidence-split"><div class="evidence-col"><h3>实际操作</h3>${list(c.actions)}</div><div class="evidence-col"><h3>观察结果</h3>${list(c.evidence)}</div></div>
      <div class="photo-links">${c.screenshots.map(id=>`<button class="btn small" data-open="${escape(id)}">${escape(f.media.find(x=>x.id===id).title)}</button>`).join('')}</div><p class="check-source">来源：${escape(c.source)} · 原始状态：${escape(c.status)}</p></div></details>`;
  }
  if(!f.checks.length) html+='<p class="report-empty">本轮未提供验收记录，不代表已通过。</p>';
  html+='</div>';
  if(f.acceptanceRequirements) html+=`<details class="card raw-record"><summary>完整原始验收要求</summary><div class="subsection-body"><pre>${escape(f.acceptanceRequirements)}</pre></div></details>`;
  html+=`<details class="card raw-record"><summary>查看原始验收摘要与逐条数据</summary><div class="subsection-body"><p>${escape(f.delivery.qaSummary || '原始摘要未提供')}</p><pre>${escape(JSON.stringify(f.rawQaReport ?? f.checks,null,2))}</pre></div></details></section>`;
  return html;
}

function renderRetrospective(f, retro, warning, review) {
  const source = retro?.source || '实现者过程记录（原记录未注明运行或阶段来源）';
  let html = `<section class="section" id="problems">${sectionHead('Problems & improvements', '问题与改进')}`;
  html += '<p class="section-intro">汇总本轮已有材料，不新增分析。过程记录与独立评审分别标明来源；评审发现不等于本轮实际阻塞，也不因业务通过而标为已解决。</p>';
  // Preserve the old improvements deep link, without a second top-level section.
  html += `<h3 class="context-heading" id="improvements">独立评测的问题与建议</h3>${review.feedbackHtml}`;
  html += '<details class="card raw-record process-notes"><summary>实现者过程与运行背景 · 不自动归为框架问题</summary><div class="subsection-body"><p class="check-source">本任务已处理只描述应用侧处理结果，不代表 NocoBase3 上游已修复。</p>';
  if (warning) html += `<p class="check-source">${escape(warning)}；原文保留，已有验收与独立评测不受影响。</p>`;
  html += '<h3 class="context-heading">本轮过程记录</h3>';
  if (retro?.summary) html += `<p class="section-intro">${escape(retro.summary)}</p>`;
  if (retro?.blockers.length) {
    html += '<div class="retro-stack">';
    for (const [i, b] of retro.blockers.entries()) {
      // A process observation is not interchangeable with a framework finding.
      const status = b.status ?? 'unknown';
      html += `<article class="card retro-card" id="problem-${i+1}"><header><div><span class="eyebrow">问题 ${String(i+1).padStart(2,'0')} · ${escape(phaseLabels[b.phase]||b.phase)}</span><h3>${escape(b.title)}</h3></div>${tag(problemLabels[status],status==='open'?'warn':'')}</header>
        <p class="problem-symptom">${escape(b.symptom || '未提供问题现象')}</p><dl class="retro-fields">${field('原因（实现者自述）',b.rootCause)}${field('处理方式',b.resolution)}</dl>
        <div class="retro-foot"><span>影响 / 代价：${escape(b.cost || '未提供，不估算')}</span><span>来源：${escape(b.source || source)}</span></div></article>`;
    }
    html += '</div>';
  } else {
    html += `<p class="muted">${retro ? '实现者未记录具体阻塞，不等于本轮没有问题。' : '本轮未提供可选的实现者过程笔记；不据此推断无问题，也不影响已有独立评测。'}</p>`;
  }
  const handoffs = f.runs.filter(r => r.status === 'handoff');
  if (handoffs.length || f.attention.length) {
    html += '<h3 class="context-heading">运行与验收记录</h3><p class="check-source">以下来自已有记录，不冒充 Agent 的根因分析。</p><div class="context-grid">';
    html += handoffs.map(r=>`<article class="card note-card"><div class="eyebrow">运行记录 · 非根因分析</div><h3>运行 ${escape(r.id)} 发生交接</h3><p>${escape(r.detail)}</p><p class="check-source">来源：运行 ${escape(r.id)} / attempt ${r.attempt}</p></article>`).join('');
    html += f.attention.map(a=>`<article class="card note-card"><div class="eyebrow">${a.checkId?`验收 ${escape(a.checkId)} · `:''}阅读批注</div><h3>${escape(a.title)}</h3><p>${escape(a.detail)}</p>${a.source?`<p class="check-source">来源：${escape(a.source)}</p>`:''}${a.checkId?`<a class="text-link" href="#check-${escape(a.checkId)}" data-expand="check-${escape(a.checkId)}">查看对应验收记录 →</a>`:''}</article>`).join('');
    html += '</div>';
  }
  if (retro?.improvements.length) {
    html += '<h3 class="context-heading">实现者补充建议</h3><p class="check-source">来自可选过程笔记，不代表已独立确认；相同建议引用上方评审，其余保留原文。</p><div class="retro-stack">';
    // Only collapse identical proposals. Similar titles or different explanations
    // must not erase observations, ownership, status, or conflicting conclusions.
    const proposalKey = item => JSON.stringify([item.title, item.detail, item.suggestedChange].map(value => value.trim().replace(/\s+/gu, ' ')));
    const proposals = new Map(review.findings.map(finding => [proposalKey(finding), finding.id]));
    for (const [i, item] of retro.improvements.entries()) {
      const existing = item.title.trim() && item.detail.trim() && item.suggestedChange.trim() ? proposals.get(proposalKey(item)) : null;
      if (existing) {
        html += `<p class="check-source" id="improvement-${i+1}">来源：${escape(item.source || source)} · ${escape(categoryLabels[item.category]||item.category)} · ${item.mechanizable?'可自动化':'需人工判断'}。同一建议已收录：<a class="text-link" href="#review-finding-${escape(existing)}">查看独立评测 ${escape(existing)}</a>。这不改变实现者记录的确认程度。</p>`;
        continue;
      }
      html += `<article class="card improvement-card" id="improvement-${i+1}"><header><div><span class="eyebrow">建议 ${String(i+1).padStart(2,'0')} · ${escape(categoryLabels[item.category]||item.category)}</span><h3>${escape(item.title)}</h3></div>${tag(item.mechanizable?'可自动化':'需人工判断')}</header>
        <p>${escape(item.detail || '改进理由未提供')}</p><div class="suggested-change"><strong>建议改动</strong><p>${escape(item.suggestedChange || '具体改动未提供')}</p></div><p class="check-source">来源：${escape(item.source || source)}</p></article>`;
    }
    html += '</div>';
  }
  if (f.rawRetro || (f.retro !== null && f.retro !== undefined)) html += `<details class="card raw-record"><summary>查看原始复盘数据</summary><div class="subsection-body"><pre>${escape(JSON.stringify(f.rawRetro ?? f.retro,null,2))}</pre></div></details>`;
  return html + '</div></details></section>';
}

function renderUsageDetails(usage) {
  const rows=[['非缓存输入',fmt(usage?.uncachedInput)],['输出',fmt(usage?.output)],['缓存读取',fmt(usage?.cacheRead)],['端到端耗时',duration(usage?.endToEndSeconds)]];
  let html=`<div class="table-wrap"><table><thead><tr><th>指标</th><th>值</th></tr></thead><tbody>${rows.map(([k,v])=>`<tr><td>${k}</td><td class="mono">${v}</td></tr>`).join('')}</tbody></table></div>`;
  if(usage?.phases) html+=`<h3 class="usage-phase-title">按阶段分项</h3><div class="table-wrap"><table><thead><tr><th>阶段</th><th class="num">非缓存输入</th><th class="num">输出</th><th class="num">缓存读取</th><th class="num">缓存写入</th><th class="num">合计</th></tr></thead><tbody>${usage.phases.map(p=>`<tr><td>${escape(p.label)}</td>${['input','output','cacheRead','cacheWrite','total'].map(k=>`<td class="num">${fmt(p[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  if(usage?.coverageNote) html+=`<p class="check-source">${escape(usage.coverageNote)}</p>`;
  if(usage?.note) html+=`<p class="check-source">${escape(usage.note)}</p>`;
  return html;
}

async function imageSource(m, base) {
  if(m.path.includes('\\')) throw new Error('媒体路径必须使用 /');
  const path=await realpath(resolve(base,m.path));
  if(!path.startsWith(base+sep)) throw new Error(`媒体路径越界: ${m.path}`);
  const mime={'.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg'}[extname(path).toLowerCase()];
  if(!mime) throw new Error('仅支持 PNG / WebP / JPEG 图片');
  const data=await readFile(path);
  if(data.length>10*1024*1024) throw new Error('单张截图超过本样例 10 MiB 预算');
  return `data:${mime};base64,${data.toString('base64')}`;
}

export async function renderHtml(facts, inputNotes, evidenceRoot) {
  validateFacts(facts);
  const base=await realpath(evidenceRoot);
  let notes=null, notesWarning='';
  if(inputNotes) {
    try { notes=inputNotes;validateNotes(notes); }
    catch(error) { notes=null; notesWarning=`展示说明未采用，已回退到现有事实：${error.message}`; }
  }
  const f=facts,m=f.meta;
  let retro=null, retroWarning='';
  if(f.retro!==null && f.retro!==undefined) {
    try { validateRetro(f.retro); retro=f.retro; }
    catch(error) { retroWarning=`复盘格式无效：${error.message}`; }
  }
  const reviewRevision=f.buildReview ? ':review-'+createHash('sha256').update(JSON.stringify(f.buildReview)).digest('hex').slice(0,16) : '';
  const reportId=`${m.repository}:${m.issue}:${m.runId}:${m.attempt}:${m.headSha}:template-${TEMPLATE_VERSION}${reviewRevision}`;
  const links=f.links.map(l=>`<a class="btn" rel="noopener noreferrer" target="_blank" href="${escape(url(l.url))}">${escape(l.label)} ↗</a>`).join('');
  const attention=[...f.attention];
  if(f.delivery.status!=='pr-ready') attention.unshift({title:statusLabels[f.delivery.status],detail:'本轮不是完成交付。请查看本轮验收记录和问题记录。'});
  const openProblems=retro?.blockers.filter(b=>b.status==='open') ?? [];
  if(openProblems.length) attention.unshift({title:`${openProblems.length} 个已记录问题尚未解决`,detail:openProblems.map(b=>b.title).join('；')+'。具体处理情况见“问题与改进”。'});
  const unsuccessful=f.checks.filter(c=>c.status!=='passed');
  if(unsuccessful.length) attention.unshift({title:`${unsuccessful.length} 项验收需要处理`,detail:unsuccessful.map(c=>`${c.id} ${c.title}：${checkLabels[c.status]}`).join('；')});
  if(f.delivery.ci==='failed') attention.unshift({title:'自动检查未通过',detail:f.delivery.ciSource||'查看来源运行记录。'});
  let body=m.sampleNotice?`<div class="report-banner">${escape(m.sampleNotice)}</div>`:'';
  if(notesWarning) body+=`<div class="report-banner">${escape(notesWarning)}</div>`;
  const review=renderBuildReview(f.buildReview);
  body+=`<section class="section" id="overview"><div class="hero"><div><div class="eyebrow">NocoBase3 improvement report · ${m.issue} / ${escape(m.snapshotDate)}</div><h1>${escape(m.title)}</h1><p>本次搭建为 NocoBase3 的企业级 Vibe Coding 基础设施带来了哪些问题证据与改进方向？</p><div class="hero-actions"><a class="btn primary" href="#problems">查看问题与改进</a><a class="btn" href="#delivery">查看业务交付</a></div></div></div>${review.overviewHtml}</section>`;
  body+=renderRetrospective(f,retro,retroWarning,review);
  body+=review.html;
  body+=`<section class="section" id="delivery">${sectionHead('Business delivery context','业务交付与验收背景',tag(statusLabels[f.delivery.status],f.delivery.status==='failed'?'bad':''))}<p class="section-intro">${escape(notes?.summary || f.delivery.qaSummary || '本轮未提供业务说明，请查看状态与已采集证据。')}</p><div class="hero-actions">${links}<a class="btn" href="#acceptance">查看验收依据</a></div><div class="hero-meta"><span>应用交付提交 <code title="${escape(m.headSha)}">${escape(m.headSha ? m.headSha.slice(0,12) : '未取得交付 SHA')}</code></span><span>Run ${escape(m.runId)} / attempt ${m.attempt}</span><span>目标 <code>${escape(m.targetBranch)}</code></span></div>`;
  body+=`<div class="metrics">${metric('Agent 原始验收',f.checks.length?`${f.checks.filter(c=>c.status==='passed').length} / ${f.checks.length}`:'未提供','这是 Agent 的报告结论，不代替人工评审')}${metric('修改文件',fmt(f.changes?.total),f.changes?`${f.changes.added} 新增 · ${f.changes.modified} 修改 · ${f.changes.deleted} 删除`:'未采集，不按 0 处理')}${metric('截图证据',String(f.media.length),'来自本次选定报告的媒体清单')}${metric('已记录执行时间',duration(f.usage?.executionSeconds),f.usage?.scope||'未采集，不按 0 处理')}</div>`;
  body+=attention.map(a=>`<div class="alert"><div><h3>${escape(a.title)}</h3><p>${escape(a.detail)}</p>${a.source?`<div class="check-source">来源：${escape(a.source)}</div>`:''}</div></div>`).join('');
  body+='</section>';
  if(notes?.highlights.length || notes?.flow.length) {
    body+=`<section class="section">${sectionHead('What was delivered','业务场景与交付说明')}<div class="note-grid">${notes.highlights.map(h=>`<article class="card note-card"><h3>${escape(h.title)}</h3><p>${escape(h.detail)}</p></article>`).join('')}</div>`;
    if(notes.flow.length) body+=`<div class="business-flow" aria-label="业务顺序示意">${notes.flow.map((s,i)=>`<div class="business-step"><b>${String(i+1).padStart(2,'0')}</b>${escape(s)}</div>`).join('<span aria-hidden="true">→</span>')}</div><p class="check-source">业务顺序示意，操作证据见逐项验收。</p>`;
    body+='</section>';
  }
  body+=renderAcceptance(f);
  const categories=[...new Set(f.media.map(x=>x.category))];
  const featured=new Set(f.media.filter(x=>x.featured).map(x=>x.id));
  if(!featured.size) f.media.slice(0,6).forEach(x=>featured.add(x.id));
  body+=`<section class="section" id="evidence">${sectionHead('See the actual result','真实界面，按场景看')}<div class="toolbar"><button class="filter active" data-filter="featured">精选</button><button class="filter" data-filter="all">全部 ${f.media.length}</button>${categories.map(c=>`<button class="filter" data-filter="${escape(c)}">${escape(c)}</button>`).join('')}</div><div class="gallery">`;
  for(const shot of f.media) body+=`<figure class="card shot" data-category="${escape(shot.category)}" data-featured="${featured.has(shot.id)}" data-name="${escape(shot.id)}"><button class="shot-btn" data-open="${escape(shot.id)}" aria-label="放大 ${escape(shot.title)}"><img alt="${escape(shot.title)}" loading="lazy" src="${await imageSource(shot,base)}"><span class="shot-overlay">点击查看原图 ↗</span></button><figcaption><span>${escape(shot.title)}</span><span class="shot-category">${escape(shot.category)}</span></figcaption></figure>`;
  body+=`</div><div class="gallery-foot"><span id="gallery-status">${f.media.length?'截图已经内嵌，可离线查看。':'本轮未提供截图。'}</span><span>录像及未内嵌截图见本轮运行的 Artifact。</span></div>${f.uncovered?.length?`<details class="card raw-record"><summary>未单独截图的界面（${f.uncovered.length}）</summary><div class="subsection-body">${list(f.uncovered)}</div></details>`:''}</section>`;
  body+=`<section class="section" id="execution">${sectionHead('Execution & usage','发生了什么，花了多少')}<div class="split"><div class="card run-panel"><h3>运行记录</h3>${f.runs.map(r=>`<div class="run"><div class="run-content"><div class="run-top"><strong>${escape(r.id)} / attempt ${r.attempt}</strong></div><p>${tag(statusLabels[r.status],r.status==='failed'?'bad':'')}</p><p>${escape(r.detail)}</p></div></div>`).join('')}<div class="ci-fact"><strong>自动检查：${escape(ciLabels[f.delivery.ci])}</strong><p class="check-source">${escape(f.delivery.ciSource||'未提供')}</p></div></div><div class="card usage-card"><div class="eyebrow">已记录 Token · 含缓存</div><div class="usage-big">${fmt(f.usage?.total)}</div>${tag(f.usage?(f.usage.incomplete?'采集可能不完整':'按已采集范围统计'):'用量未提供',f.usage?.incomplete?'warn':'')}<p>${escape(f.usage?.scope||'没有用量数据，不推算为零。')}</p><details class="subsection"><summary>展开用量分项 ⌄</summary><div class="subsection-body">${renderUsageDetails(f.usage)}<p class="check-source">${escape(f.usage?.source||'没有统计来源')}。不等同供应商账单，不推算费用。</p></div></details></div></div></section>`;
  if(f.timings?.length) body+=`<details class="card raw-record"><summary>本轮阶段耗时</summary><div class="subsection-body"><p>嵌套阶段不可相加为总耗时；仅展示已完成的计时。</p><div class="table-wrap"><table><tr><th>阶段</th><th>次数</th><th>时长</th></tr>${f.timings.map(t=>`<tr><td>${escape(t.stage)}</td><td>${fmt(t.calls)}</td><td>${duration(Math.round(t.durationMs/1000))}</td></tr>`).join('')}</table></div></div></details>`;
  body+=`<footer class="report-footer">Factory report template v${TEMPLATE_VERSION} · ${escape(reportId)}<br>验收逐条保留；问题与改进汇总已有评测与可选过程记录，保留各自来源。此页面是归档展示，不是重新验收。</footer>`;
  const template=await readFile(resolve(HERE,'report.template.html'),'utf8');
  const script=template.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if(!script) throw new Error('模板缺少固定交互脚本');
  const hash=createHash('sha256').update(script).digest('base64');
  const csp=`default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'sha256-${hash}'; base-uri 'none'; form-action 'none'; connect-src 'none'; object-src 'none'`;
  const slots={CSP:escape(csp),REPORT_ID:escape(reportId),TITLE:escape(m.title),ISSUE:String(m.issue),REPOSITORY:escape(m.repository),BODY:body};
  const html=template.replace(/\{\{([A-Z_]+)\}\}/g,(_,key)=>{if(!Object.hasOwn(slots,key)) throw new Error(`未知模板插槽 ${key}`);return slots[key];});
  return {html,reportId,notesUsed:Boolean(notes),retroUsed:Boolean(retro),bytes:Buffer.byteLength(html)};
}

export async function renderReport(factsPath, notesPath, outputPath) {
  const facts=JSON.parse(await readFile(factsPath,'utf8'));
  let notes=null;
  if(notesPath) { try { notes=JSON.parse(await readFile(notesPath,'utf8')); } catch { notes={}; } }
  const {html,...result}=await renderHtml(facts,notes,dirname(resolve(factsPath)));
  await mkdir(dirname(resolve(outputPath)),{recursive:true});
  await writeFile(outputPath,html,'utf8');
  return {output:resolve(outputPath),...result};
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [facts,notes,out]=process.argv.slice(2);
  if(!facts||!out) {console.error('用法: node render-report.mjs facts.json delivery-notes.json|- report.html');process.exitCode=1;}
  else { try { console.log(JSON.stringify(await renderReport(facts,notes==='-'?null:notes,out),null,2)); } catch(error){console.error(`报告生成失败: ${error.message}`);process.exitCode=1;} }
}
