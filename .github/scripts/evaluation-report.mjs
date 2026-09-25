// Evaluation Report v1: a normalized, versioned public DTO converted from the
// factory's existing trusted facts. It never calls a model: missing material is
// reported as unknown/partial, and review scores/findings are copied, not redone.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parseAcceptanceCriteria, reportVerdict } from './acceptance-criteria.mjs';
import { collectReviewProcess, dimensionsFor, loadBuildReview, moduleRoundResult, readReviewJson,
  resolveReviewIdentity, validateBuildReview } from './build-review.mjs';
import { isRunKey, resolveTaskIdentity } from './evaluation-identity.mjs';
import { scrubSecrets } from './history-redaction.mjs';
import { assertSchema, loadContract } from './json-schema.mjs';
import { phases } from './task-usage.mjs';

export const EXPORTER_VERSION = 1;
export const PRODUCER = 'nb3-factory';
const RUBRIC_ID = 'nb3-framework';
export const LIMITS = { jsonBytes: 4 * 1024 * 1024, fileBytes: 10 * 1024 * 1024, evidenceBytes: 48 * 1024 * 1024, files: 2048 };
const sha = /^[a-f0-9]{40}$/;
const sha256Pattern = /^[a-f0-9]{64}$/;
const digest = value => createHash('sha256').update(value).digest('hex');
const positive = value => Number.isSafeInteger(value) && value > 0;
const count = value => Number.isSafeInteger(value) && value >= 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 4000) => typeof value === 'string' && value.trim() ? value.slice(0, max) : null;
const shaOrNull = value => sha.test(value ?? '') ? value : null;
const hashOrNull = value => sha256Pattern.test(value ?? '') ? value : null;
const iso = ms => Number.isFinite(ms) ? new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z') : null;
const qaStatus = value => ({ passed: 'passed', failed: 'failed', blocked: 'blocked', not_run: 'not-run' })[value] ?? 'unknown';
const pngHeader = Buffer.from('89504e470d0a1a0a', 'hex');

// Canonical JSON (sorted keys) keeps fingerprints independent of object order.
export function canonicalJson(value) {
  return JSON.stringify(value, (_key, item) => object(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}

function readOptional(root, file, warnings) {
  if (!root) return null;
  try { return readReviewJson(root, file); }
  catch (error) {
    if (error.code !== 'ENOENT') warnings.push({ code: 'artifact-unreadable', detail: `${file} 无法读取，相关事实标为未知。` });
    return null;
  }
}
function fileHash(root, file) {
  try {
    const target = path.join(root, file);
    const stat = lstatSync(target);
    return stat.isFile() && !stat.isSymbolicLink() ? digest(readFileSync(target)) : null;
  } catch { return null; }
}

// Small, trusted facts added to each usage receipt, so a later export can link
// executions of one logical run without reading expired artifacts.
export function executionFacts(metadata, root, source, identity = metadata ? resolveTaskIdentity(metadata) : null) {
  if (!identity) return null;
  let state = null;
  try { state = readReviewJson(root, 'pipeline-state.json'); } catch { /* A pre-Agent failure has none. */ }
  const previous = Number(source?.previousRunId);
  return {
    version: 1, runKey: identity.runKey, kind: identity.kind, derivation: identity.derivation,
    controlSha: shaOrNull(metadata?.controlSha), baseSha: shaOrNull(metadata?.applicationBase?.sha),
    inputHash: hashOrNull(state?.inputHash), patchSha256: hashOrNull(state?.patchHash),
    pipelineOutcome: ['running', 'passed', 'failed', 'blocked', 'handoff', 'budget-exhausted'].includes(state?.outcome) ? state.outcome : null,
    event: ['issues', 'repository_dispatch', 'workflow_dispatch'].includes(source?.event) ? source.event : null,
    previousRunId: positive(previous) ? previous : null,
  };
}
function validFacts(value) {
  return object(value) && value.version === 1 && isRunKey(value.runKey) &&
    ['initial', 'incremental', 'batch-sample'].includes(value.kind) ? value : null;
}

const conclusion = status => ({ delivered: 'delivered', handoff: 'handoff', failure: 'failed', cancelled: 'cancelled',
  timed_out: 'timed-out', success: 'completed' })[status] ?? 'unknown';

// Executions come from bot usage receipts (one per Run attempt). Receipts that
// predate identity recording cannot be proven to belong to this run: count, never merge.
function chainOf(report, runKey, facts, limitations) {
  const producer = report.record;
  const members = [], rejected = [];
  let unresolved = 0;
  for (const record of report.records ?? [producer]) {
    const own = record.runId === producer.runId && record.attempt === producer.attempt;
    const item = own ? facts : validFacts(record.evaluation);
    if (!item) { unresolved++; continue; }
    if (item.runKey !== runKey) continue;
    if (!own && ((facts?.controlSha && item.controlSha && item.controlSha !== facts.controlSha) ||
        (facts?.inputHash && item.inputHash && item.inputHash !== facts.inputHash) ||
        (facts?.baseSha && item.baseSha && item.baseSha !== facts.baseSha))) { rejected.push(record); continue; }
    members.push({ record, facts: item });
  }
  if (unresolved) limitations.push({ code: 'legacy-executions-unresolved',
    detail: `本 Issue 另有 ${unresolved} 条执行回执早于运行身份记录，无法证明属于同一逻辑任务，未合并。` });
  if (rejected.length) limitations.push({ code: 'chain-mismatch',
    detail: `${rejected.length} 条同键执行的控制代码、输入或应用基线不一致，未合并。` });
  const order = (a, b) => a.record.start - b.record.start || a.record.runId - b.record.runId || a.record.attempt - b.record.attempt;
  members.sort(order);
  const index = members.findIndex(m => m.record.runId === producer.runId && m.record.attempt === producer.attempt);
  const included = members.slice(0, index + 1);
  const seenRuns = new Set();
  const executions = included.map(({ record, facts: item }, position) => {
    const kind = seenRuns.has(record.runId) ? 'rerun-attempt'
      : position === 0 ? 'implementation'
        : item.previousRunId && item.event === 'repository_dispatch' ? 'continuation'
          : item.previousRunId && item.event === 'workflow_dispatch' ? 'recovery' : 'restart';
    seenRuns.add(record.runId);
    const seconds = record.jobs?.every(job => count(job.seconds)) ? record.jobs.reduce((n, job) => n + job.seconds, 0) : null;
    return { key: `run/${record.runId}/attempt/${record.attempt}`, kind, order: position + 1, workflow: 'code-agent-task',
      runId: record.runId, attempt: record.attempt, event: item.event ?? null, previousRunId: item.previousRunId ?? null,
      conclusion: item.pipelineOutcome === 'budget-exhausted' ? 'budget-exhausted' : conclusion(record.status),
      startedAt: iso(record.start), endedAt: iso(record.end), jobSeconds: seconds,
      controlSha: item.controlSha ?? null, patchSha256: item.patchSha256 ?? null, source: 'usage-receipt' };
  });
  return { executions, records: included.map(m => m.record), later: members.length - included.length };
}

function outcomeOf(record, pipeline, qa, pr) {
  const status = record.status;
  let execution = { delivered: 'completed', handoff: 'running', cancelled: 'cancelled', timed_out: 'timed-out',
    success: 'completed', failure: 'completed' }[status] ?? 'unknown';
  if (status === 'failure' && pipeline?.outcome === 'blocked') execution = 'blocked';
  if (pipeline?.outcome === 'budget-exhausted') execution = 'budget-exhausted';
  let acceptance = qa.finalFull.status;
  if (acceptance === 'not-run' && execution === 'running') acceptance = 'unknown';
  const delivery = status === 'delivered' ? 'published' : ['handoff', 'failure', 'cancelled', 'timed_out', 'success'].includes(status) ? 'not-published' : 'unknown';
  const detail = {
    completed: '执行链已终结；业务验收与代码交付分别见 acceptance / delivery。', running: '已保存 Handoff，执行链仍在继续；不是终态。',
    cancelled: '执行被取消。', 'timed-out': '执行超时。', blocked: '执行因环境或前置条件受阻，不视为业务缺陷。',
    'budget-exhausted': '达到受信任评测计划的预算，已保存补丁与事实，不再自动修复或续跑。', unknown: '执行状态未确认。',
  }[execution];
  return { execution, acceptance, delivery, pullRequest: pr && positive(pr.number) ? { number: pr.number, headSha: shaOrNull(pr.headSha) } : null, detail };
}

// The same verdict QA's validator reached; an incomplete or invalid report is unknown.
function reportStatus(report, criteria) {
  if (!report) return 'unknown';
  const verdict = reportVerdict(report, criteria);
  return verdict === 'incomplete' ? 'unknown' : verdict;
}

function qaOf(root, process, pipeline, repair, metadata, producerKey, limitations) {
  const rounds = process.rounds.flatMap(round => round.reports.map(report => ({
    round: round.round, executionKey: producerKey, scope: report.scope, passed: report.passed, source: report.source,
    checks: report.checks.map(check => ({ id: check.id, criterion: text(check.criterion, 2000), status: qaStatus(check.status) })),
  })));
  const chainVerifications = count(pipeline?.verificationAttempts) ? pipeline.verificationAttempts : null;
  const present = new Set(process.rounds.map(r => r.round));
  const fullRounds = process.rounds.filter(r => r.reports.some(x => x.scope === 'full'));
  const read = round => {
    const report = round.reports.find(x => x.scope === 'full');
    try { return readReviewJson(root, report.source); } catch { return null; }
  };
  // A full round covers every criterion; unparseable criteria leave only all-passed reports passing.
  let parsed = null;
  try { parsed = parseAcceptanceCriteria(metadata?.task?.acceptanceCriteria); } catch { /* Reported below. */ }
  const describe = (round, basis) => ({ status: reportStatus(read(round), parsed), round: round.round, executionKey: producerKey, basis });
  const none = basis => ({ status: 'not-run', round: null, executionKey: null, basis });
  const unknown = basis => ({ status: 'unknown', round: null, executionKey: null, basis });
  let firstFull, finalFull;
  if (chainVerifications === 0 && !present.size) {
    firstFull = none('执行链尚未进入验证。'); finalFull = firstFull;
  } else if (present.has(1)) {
    firstFull = fullRounds.length ? describe(fullRounds[0], '本产物包含第 1 轮起的全部验证，取第一次实际全量 QA。') : none('本产物包含第 1 轮起的全部验证，但没有全量 QA 记录。');
    finalFull = fullRounds.length ? describe(fullRounds.at(-1), '最后一次实际全量 QA。') : firstFull;
  } else {
    firstFull = unknown('第一轮验证位于更早的执行，本产物未包含，不能推断首轮结果。');
    finalFull = fullRounds.length ? describe(fullRounds.at(-1), '本产物中最后一次实际全量 QA。') : unknown('本产物没有全量 QA，更早执行的结果未取得。');
    limitations.push({ code: 'first-round-unavailable', detail: '只取得本执行的验证记录；首轮 QA 标为未知，不冒充整个任务首轮通过。' });
  }
  if (rounds.length && rounds.every(r => r.scope === 'focused'))
    limitations.push({ code: 'qa-focused-only', detail: '本产物只有失败路径复测，不代表全量业务验收。' });
  let criteria = [];
  if (parsed) {
    criteria = parsed.map(c => {
      const status = round => {
        if (round.round == null) return round.status === 'not-run' ? 'not-run' : 'unknown';
        const check = rounds.find(r => r.round === round.round && r.scope === 'full')?.checks.find(x => x.id === c.id);
        return check ? check.status : 'unknown';
      };
      return { id: c.id, text: c.text.slice(0, 2000), optional: c.optional, firstFull: status(firstFull), finalFull: status(finalFull) };
    });
  } else limitations.push({ code: 'criteria-unparsed', detail: '原始验收要求不可解析，逐项覆盖未知。' });
  const chainRepairs = count(pipeline?.repairAttempts) ? pipeline.repairAttempts : null;
  // “首次实现无修复即通过”还要求第 1 轮就执行并通过全量 QA，且整条链没有工厂修复。
  const firstPassWithoutRepair = firstFull.status === 'unknown' || chainRepairs === null ? 'unknown'
    : firstFull.status === 'passed' && firstFull.round === 1 && chainRepairs === 0 ? 'yes' : 'no';
  const coverage = !rounds.length ? 'none' : present.has(1) ? 'complete' : 'partial';
  return {
    coverage, rounds, firstFull, finalFull, criteria, firstPassWithoutRepair,
    counts: {
      execution: { verificationAttempts: count(repair?.verificationAttempts) ? repair.verificationAttempts : null,
        repairAttempts: count(repair?.repairAttempts) ? repair.repairAttempts : null, source: 'repair-summary.json（仅本执行）' },
      chain: { verificationAttempts: chainVerifications, repairAttempts: chainRepairs, source: 'pipeline-state.json（跨 Handoff 累计检查点，不再相加）' },
    },
    note: '工厂修复次数不等于 Agent 开发中的全部自测和修正；未记录 Agent 内部试错，不宣称开发全程无错误。',
  };
}

// Stable external subject identifiers come from verified targets, never from a
// model-written module title. Unrecognized targets stay unmapped.
export function subjectKeyOf(target) {
  const name = target?.name ?? '';
  if (/\s/.test(name)) return null;
  if (target?.kind !== 'guidance') return /^@nocobase\/[a-z0-9][a-z0-9._-]*$/.test(name) ? `pkg:${name}` : null;
  let match = /^packages\/(@nocobase\/[a-z0-9][a-z0-9._-]*)\/((?:docs|skills)\/[^\0]+)$/.exec(name);
  if (match) return `guide:${match[1]}/${match[2].replace(/\/SKILL\.md$/, '')}`;
  match = /^app\/\.agents\/skills\/([A-Za-z0-9][A-Za-z0-9._-]*)(?:\/|$)/.exec(name);
  if (match) return `skill:${match[1]}`;
  return name === 'app/AGENTS.md' ? 'guide:app/AGENTS.md' : null;
}

function reviewKeyOf(review, record) {
  const actor = review.reviewer && positive(Number(review.reviewer.runId))
    ? `${Number(review.reviewer.runId)}.${positive(Number(review.reviewer.attempt)) ? Number(review.reviewer.attempt) : 1}`
    : positive(Number(review.basis?.runId)) ? `${Number(review.basis.runId)}.${Number(review.basis.attempt) || 1}` : `${record.runId}.${record.attempt}`;
  const scope = hashOrNull(review.basis?.inputHash) ?? digest(`${review.state}:${review.reason ?? ''}`);
  const rubric = [1, 2].includes(review.basis?.rubricVersion) ? `v${review.basis.rubricVersion}` : 'v0';
  return `review/${actor}/${rubric}-${scope.slice(0, 12)}`;
}

function convertReview(review, role, selected, process, collectEvidence, record) {
  const key = reviewKeyOf(review, record);
  const scoped = id => `${key}/${id}`;
  const version = review.basis?.rubricVersion;
  let rubric = null;
  try {
    rubric = { id: RUBRIC_ID, version, scale: { min: 0, max: 100 }, businessUiIncluded: false,
      dimensions: Object.entries(dimensionsFor(version)).map(([dimension, label]) => ({ key: dimension, label })) };
  } catch { /* Not-reviewed/failed records may carry no rubric. */ }
  const evaluation = ['completed', 'partial'].includes(review.state) ? review.evaluation : null;
  const reviewer = object(review.reviewer) ? {
    engine: text(review.reviewer.engine, 80), model: text(review.reviewer.model, 200), version: text(review.reviewer.version, 80),
    runId: positive(Number(review.reviewer.runId)) ? Number(review.reviewer.runId) : null,
    attempt: positive(Number(review.reviewer.attempt)) ? Number(review.reviewer.attempt) : null,
    controlSha: shaOrNull(review.reviewer.controlSha), replay: review.reviewer.replay === true,
  } : null;
  const result = {
    key, role, selected, state: review.state, reason: text(review.reason, 2000) ?? '未提供原因。', rubric, reviewer,
    producer: { runId: positive(Number(review.basis?.runId)) ? Number(review.basis.runId) : null,
      attempt: positive(Number(review.basis?.attempt)) ? Number(review.basis.attempt) : null },
    basis: { inputHash: hashOrNull(review.basis?.inputHash), patchSha256: hashOrNull(review.basis?.patchHash),
      baseSha: shaOrNull(review.basis?.baseSha), lockfileSha256: hashOrNull(review.basis?.lockfileHash),
      reviewCriteriaHash: hashOrNull(review.basis?.reviewCriteriaHash), artifactHash: hashOrNull(review.basis?.artifactHash) },
    buildReviewMode: ['full', 'off'].includes(review.execution?.buildReviewMode) ? review.execution.buildReviewMode : null,
    summary: null, progress: null, modules: [], findings: [], ui: null, limitations: [],
    usageSource: object(review.supplementalUsage) && positive(review.supplementalUsage.runId)
      ? `review-run:${review.supplementalUsage.runId}:${review.supplementalUsage.attempt}` : null,
  };
  if (!evaluation) return result;
  const evidenceIds = new Map(evaluation.evidence.map(item => [item.id, scoped(item.id)]));
  const refs = values => (values ?? []).map(id => evidenceIds.get(id)).filter(Boolean);
  for (const item of evaluation.evidence) collectEvidence(item, key, scoped(item.id));
  result.summary = text(evaluation.summary);
  result.progress = object(evaluation.progress)
    ? { complete: evaluation.progress.complete === true, pendingModules: evaluation.progress.pendingModules.slice(0, 30) } : null;
  const moduleSubjects = new Map();
  result.modules = evaluation.modules.map((module, index) => {
    const targets = (module.targets ?? []).map(target => ({ kind: target.kind, name: target.name, subjectKey: subjectKeyOf(target),
      entrypoints: target.entrypoints.slice(0, 12), evidence: refs(target.evidence) }));
    const subjectKeys = [...new Set(targets.map(t => t.subjectKey).filter(Boolean))];
    const moduleKey = `${key}/M${index + 1}`;
    moduleSubjects.set(moduleKey, { subjectKeys, evidence: new Set(targets.flatMap(t => t.evidence)) });
    return {
      key: moduleKey, name: module.name, subjectKeys,
      mapping: targets.length && targets.every(t => t.subjectKey) ? 'resolved' : 'pending',
      targets, scope: module.scope, limitations: module.limitations, criteria: module.criteria,
      qa: { firstFull: qaStatus(moduleRoundResult(module, process, 1)),
        finalFull: qaStatus(moduleRoundResult(module, process, process.finalRound)) },
      requirements: (module.requirements ?? []).map(item => ({ need: item.need, responsibility: item.responsibility,
        support: item.support, recommendedUsage: item.recommendedUsage, actualUsage: item.actualUsage,
        gapOwner: item.gapOwner, evidence: refs(item.evidence) })),
      scores: Object.fromEntries(Object.entries(module.scores).map(([dimension, value]) =>
        [dimension, { score: value.score, reason: value.reason, evidence: refs(value.evidence) }])),
    };
  });
  result.findings = evaluation.findings.map(finding => {
    const evidence = refs(finding.evidence);
    // Link to a subject only through shared, validated evidence ids; otherwise leave unmapped.
    const modules = [...moduleSubjects].filter(([, value]) => evidence.some(id => value.evidence.has(id)));
    return {
      id: scoped(finding.id), localId: finding.id, kind: finding.kind, owner: finding.owner, severity: finding.severity,
      confidence: finding.confidence, confirmedBy: finding.confidence === 'confirmed' ? 'reviewer' : null,
      reviewerStatus: finding.status, title: finding.title, detail: finding.detail, impact: finding.impact,
      suggestedChange: finding.suggestedChange, claimed: text(finding.claimed), observed: text(finding.observed), evidence,
      moduleKeys: modules.map(([moduleKey]) => moduleKey),
      subjectKeys: [...new Set(modules.flatMap(([, value]) => value.subjectKeys))],
    };
  });
  result.ui = { status: evaluation.ui.status, score: evaluation.ui.score, reason: evaluation.ui.reason,
    evidence: refs(evaluation.ui.evidence), framework: false };
  result.limitations = evaluation.limitations.slice(0, 30);
  return result;
}

function reviewsOf(root, identity, process, collectEvidence, limitations) {
  const selected = loadBuildReview(root, identity);
  const list = [];
  const push = (review, role, isSelected) => {
    const item = convertReview(review, role, isSelected, process, collectEvidence, identity);
    if (!list.some(existing => existing.key === item.key)) list.push(item);
  };
  const supplementFile = readOptional(root, 'build-review.supplement.json', []);
  const adoptedSupplement = supplementFile && selected.reviewer?.replay === true &&
    String(selected.reviewer.runId) === String(supplementFile.reviewer?.runId);
  push(selected, adoptedSupplement ? 'supplement' : 'original', true);
  if (selected.legacyReview) push(selected.legacyReview, 'legacy', false);
  const alternates = [['original', 'build-review.json'], ['supplement', 'build-review.supplement.json']];
  for (const [role, file] of alternates) {
    if ((role === 'original' && !adoptedSupplement) || (role === 'supplement' && adoptedSupplement)) continue;
    const raw = readOptional(root, file, []);
    if (!raw) continue;
    // A superseded review stays in history exactly as recorded; an invalid one exposes no scores.
    try { validateBuildReview(raw, resolveReviewIdentity(root, raw, identity)); push(raw, role, false); }
    catch (error) {
      push({ version: 1, state: 'failed', reason: `评审记录未通过校验：${error.message}`, basis: raw.basis ?? {},
        reviewer: raw.reviewer, evaluation: null }, role, false);
    }
  }
  const main = list[0];
  if (main.state === 'not-reviewed') limitations.push({ code: 'review-not-run', detail: '本执行没有独立框架评审；未评估不代表通过，也不按零分处理。' });
  if (main.state === 'failed') limitations.push({ code: 'review-failed', detail: '独立框架评审未完成或未通过证据校验，不导出评分；业务结果不变。' });
  if (main.state === 'partial') limitations.push({ code: 'review-partial', detail: '独立框架评审只完成部分模块，未覆盖项不推断通过。' });
  return list;
}

function notesOf(root, executionKey) {
  let raw;
  try { raw = readReviewJson(root, 'retro.json'); }
  catch (error) {
    return { state: error.code === 'ENOENT' ? 'absent' : 'invalid', source: null, author: 'implementer', independent: false,
      summary: null, blockers: [], improvements: [], note: '过程笔记可选；缺失不代表没有问题、没有评审或没有改进。' };
  }
  if (!object(raw) || raw.version !== 1 || !Array.isArray(raw.blockers) || !Array.isArray(raw.improvements))
    return { state: 'invalid', source: 'retro.json', author: 'implementer', independent: false, summary: null,
      blockers: [], improvements: [], note: '过程笔记格式无效，未据此推断“无问题”。' };
  const scope = `notes/${executionKey}`;
  return {
    state: 'present', source: 'retro.json', author: 'implementer', independent: false, summary: text(raw.summary),
    blockers: raw.blockers.slice(0, 60).map((b, i) => ({ id: `${scope}/B${i + 1}`, phase: text(b?.phase, 200), title: text(b?.title, 500) ?? '未命名',
      symptom: text(b?.symptom), rootCause: text(b?.rootCause), resolution: text(b?.resolution), cost: text(b?.cost, 500),
      status: ['resolved', 'open'].includes(b?.status) ? b.status : 'unknown' })),
    improvements: raw.improvements.slice(0, 60).map((x, i) => ({ id: `${scope}/I${i + 1}`, category: text(x?.category, 200),
      title: text(x?.title, 500) ?? '未命名', detail: text(x?.detail), suggestedChange: text(x?.suggestedChange), mechanizable: x?.mechanizable === true })),
    note: '实现者自述，未经独立核验；不是框架评审结论。',
  };
}

function usageSource(key, executionKey, usage, scope) {
  const measured = usage.records > 0;
  const real = !measured && !usage.missing && !usage.incomplete;
  const value = n => measured || real ? n : null;
  return {
    key, executionKey, scope,
    phases: Object.fromEntries(phases.map(phase => {
      const t = usage.phases?.[phase] ?? {};
      return [phase, { input: value(t.input ?? 0), output: value(t.output ?? 0), cacheRead: value(t.cacheRead ?? 0),
        cacheWrite: value(t.cacheWrite ?? 0), total: value(t.totalTokens ?? 0) }];
    })),
    records: usage.records, missing: usage.missing, incomplete: usage.incomplete, complete: !usage.missing && !usage.incomplete,
  };
}

const compareTuples = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
const omittedDetail = count => `${count} 张截图未随包附带；以路径和哈希引用，证据不可公开不等于问题不存在。`;

// One record per usage source, whatever order the records arrive in: a complete record
// beats an incomplete one, then the one with more call records; the same measurement is
// one record. Two complete but different measurements cannot be reconciled: the record
// registered first is kept and the conflict reported, never guessed or added up.
function pickSource(known, candidate) {
  const measured = ({ source }) => canonicalJson({ ...source, scope: null });
  if (measured(known) === measured(candidate)) return { kept: known };
  if (known.source.complete !== candidate.source.complete) return { kept: known.source.complete ? known : candidate };
  if (!known.source.complete) return { kept: (candidate.source.records ?? 0) > (known.source.records ?? 0) ? candidate : known };
  return { kept: known.registered || !candidate.registered ? known : candidate, conflict: true };
}

// Totals over unique sources only; any unmeasured part makes a total null, never zero.
function usageTotals(sources) {
  const sum = field => {
    const parts = sources.flatMap(source => phases.map(phase => source.phases[phase][field]));
    return sources.length && parts.every(v => v !== null) ? parts.reduce((n, v) => n + v, 0) : null;
  };
  return { input: sum('input'), output: sum('output'), cacheRead: sum('cacheRead'), cacheWrite: sum('cacheWrite'), total: sum('total'),
    complete: sources.length > 0 && sources.every(source => source.complete) };
}

// A reassessment exports only its own review run, so the current view of a logical
// run also carries the review runs of every registered revision, each once by its
// unique key. Agent-job usage always comes from the usage ledger, never from an
// earlier revision. While any registered revision cannot be read intact, the review
// history is known to have a gap: the totals stay incomplete, however often the
// same material is exported again, until that revision is readable again.
// `documents` are registered revisions; `pending` (a draft not registered yet) is merged
// after them, and `registered` says whether the target's own records already are.
export function carryReviewHistory(draft, { documents = [], unavailable = [], pending = [], registered = false } = {}) {
  const usage = draft.metrics.usage;
  const limit = (code, detail) => { if (!draft.limitations.some(item => item.code === code)) draft.limitations.push({ code, detail }); };
  const merged = new Map(usage.sources.map(source => [source.key, { source, registered }]));
  const executionKeys = new Set(draft.executions.map(execution => execution.key));
  const executions = [];
  let carried = false, conflicts = 0;
  for (const [prior, isRegistered] of [...documents.map(item => [item, true]), ...pending.map(item => [item, false])]) {
    for (const source of (prior.metrics?.usage?.sources ?? []).filter(item => item.key.startsWith('review-run:'))) {
      const candidate = { source, registered: isRegistered };
      const known = merged.get(source.key);
      const { kept, conflict } = known ? pickSource(known, candidate) : { kept: candidate };
      if (conflict) conflicts++;
      if (kept !== known) { merged.set(source.key, kept); carried ||= kept.source !== known?.source; }
    }
    for (const execution of prior.executions ?? [])
      if (execution.kind === 'review' && !executionKeys.has(execution.key)) { executionKeys.add(execution.key); executions.push(execution); }
  }
  usage.sources = [...merged.values()].map(item => item.source);
  // A conflict cannot be resolved later, so a registered one stays reported.
  if (documents.some(item => item.limitations?.some(limitation => limitation.code === 'usage-source-conflict'))) conflicts++;
  if (carried || executions.length) {
    // Review runs follow the build chain in the order they produced their results.
    const reviewRuns = [...draft.executions.filter(execution => execution.kind === 'review'), ...executions]
      .sort((a, b) => compareTuples([Date.parse(a.endedAt ?? '') || 0, a.runId, a.attempt], [Date.parse(b.endedAt ?? '') || 0, b.runId, b.attempt]));
    draft.executions = [...draft.executions.filter(execution => execution.kind !== 'review'), ...reviewRuns]
      .map((execution, index) => ({ ...execution, order: index + 1 }));
    Object.assign(draft.metrics.counts, { executions: draft.executions.length, reviewExecutions: draft.metrics.counts.reviewExecutions + executions.length });
    // Independent of which revision it was read from, so an identical re-export reuses its revision.
    limit('reviews-carried', `包含更早补跑评审的执行与用量（${executions.length} 次，按唯一键去重）；其评审内容见各自的登记修订。`);
  }
  // Totals and their two flags always describe the history as read now (a refreshed
  // earlier view may carry flags from when it was registered).
  usage.totals = { ...usageTotals(usage.sources), ...(unavailable.length || conflicts ? { complete: false } : {}) };
  const flag = (code, on, detail) => {
    const at = draft.limitations.findIndex(item => item.code === code);
    if (on && at < 0) draft.limitations.push({ code, detail });
    if (!on && at >= 0) draft.limitations.splice(at, 1);
  };
  flag('usage-history-unavailable', unavailable.length > 0,
    `${unavailable.length} 个登记修订的字节缺失或被改动，其中的补跑评审执行与用量无法核实；累计用量不完整，直到这些修订恢复。`);
  flag('usage-source-conflict', conflicts > 0, '同一用量来源存在两份完整但不一致的记录，无法判断哪份正确；保留先登记的一份，累计用量不完整。');
  flag('usage-incomplete', !usage.totals.complete, '部分用量未取得或不完整；缺失值为 null，不按零处理。');
  return draft;
}

// A refreshed view is bundled only with screenshots whose original bytes are available
// (present(path, sha256)); every other one keeps its path and digest but is marked as not
// attached, never re-created.
export function detachMissingAttachments(document, present) {
  for (const item of document.evidence) {
    if (!item.attachment || present(item.attachment, item.sha256)) continue;
    Object.assign(item, { attachment: null, availability: 'reference-only', note: '刷新当前视图时未取得该截图的原始字节；保留原路径与摘要，附件不可用。' });
  }
  const omitted = document.evidence.filter(item => item.kind === 'screenshot' && !item.attachment).length;
  document.limitations = document.limitations.filter(item => item.code !== 'evidence-omitted');
  if (omitted) document.limitations.push({ code: 'evidence-omitted', detail: omittedDetail(omitted) });
  return document;
}

// An older review registered after a newer one stays history, so the current view
// (registered before it) would not count what it brings: a review run, or a better
// record of one. Then the next revision is the current view again, its selected review
// unchanged, with the review history as known now and the late review kept beside it
// unselected. Returns null when the draft may be registered as it is (it becomes
// current, or the current view already counts everything it brings).
export function refreshCurrentView(draft, { documents = [], unavailable = [] }, currentRevision) {
  const current = documents.find(document => document.revision === currentRevision);
  if (!current || comparePrecedence(draft, current) >= 0) return null;
  const { revision, createdAt, ...view } = structuredClone(current);
  carryReviewHistory(view, { documents, unavailable, pending: [draft], registered: true });
  const counted = document => canonicalJson([document.metrics.usage, document.executions]);
  if (counted(view) === counted(current)) return null;
  view.source = structuredClone(draft.source);
  const late = draft.reviews.find(review => review.selected);
  if (late && !view.reviews.some(review => review.key === late.key)) {
    view.reviews.push({ ...structuredClone(late), selected: false });
    const ids = new Set(view.evidence.map(item => item.id));
    view.evidence.push(...draft.evidence.filter(item => item.origin?.key === late.key && !ids.has(item.id)).map(item => structuredClone(item)));
  }
  return view;
}

function metricsOf(chain, reviews, supplement) {
  const sources = new Map();
  for (const record of chain.records) {
    if (record.agentJobId == null || !object(record.usage)) continue;
    const key = `agent-job:${record.agentJobId}`;
    const previous = sources.get(key);
    // A downstream-only rerun reuses its Agent job; count that job once, with the most complete receipt.
    if (!previous || record.usage.records >= previous.records)
      sources.set(key, usageSource(key, `run/${record.runId}/attempt/${record.attempt}`, record.usage, '一次 Agent 作业内的实现、修复、QA 与同轮评审调用'));
  }
  if (supplement) {
    const key = `review-run:${supplement.runId}:${supplement.attempt}`;
    const usage = { phases: { review: { ...supplement } }, records: supplement.records, missing: 0, incomplete: supplement.incomplete };
    sources.set(key, usageSource(key, `review-run/${supplement.runId}/attempt/${supplement.attempt}`, usage, '只补跑评审的独立调用；不是业务搭建'));
  }
  const values = [...sources.values()];
  const jobs = new Map();
  for (const record of chain.records) for (const job of record.jobs ?? []) jobs.set(job.id, { ...job, executionKey: `run/${record.runId}/attempt/${record.attempt}` });
  const jobList = [...jobs.values()];
  const missingTimes = jobList.filter(job => !count(job.seconds)).length;
  const starts = chain.records.map(r => r.start).filter(Number.isFinite), ends = chain.records.map(r => r.end).filter(Number.isFinite);
  return {
    usage: {
      sources: values,
      totals: usageTotals(values),
      definition: '沿用 task-usage 口径：按唯一来源键（Agent 作业 / 后补评审 Run）去重，不相加已含这些调用的汇总，不把思考 Token 再加到输出；缺失为 null，不等同供应商账单。',
    },
    time: {
      executionSeconds: jobList.length && !missingTimes ? jobList.reduce((n, job) => n + job.seconds, 0) : null,
      missingJobTimes: missingTimes,
      endToEndSeconds: starts.length && ends.length ? Math.max(0, Math.round((Math.max(...ends) - Math.min(...starts)) / 1000)) : null,
      jobs: jobList.map(job => ({ id: job.id, name: job.name, executionKey: job.executionKey, seconds: count(job.seconds) ? job.seconds : null })),
      definition: 'executionSeconds 为 prepare / agent / verify-final / publish 唯一作业时长之和，不含排队；endToEndSeconds 含排队及续跑间隔。',
    },
    counts: { businessBuilds: 1, executions: chain.executions.length, reviewExecutions: reviews.filter(r => r.reviewer).length },
  };
}

function baselineOf(metadata, root, reviews, facts, warnings, reviewPackages) {
  const baseline = readOptional(root, 'baseline.json', warnings);
  const pipeline = readOptional(root, 'pipeline-state.json', warnings);
  const primary = reviews.find(review => review.selected);
  const skills = Array.isArray(baseline?.files) ? baseline.files.filter(f => /^(?:AGENTS\.md|\.agents\/skills\/)/.test(f?.path ?? '')) : [];
  const invocations = [];
  const visit = (relative, depth) => {
    let entries = [];
    try { entries = readdirSync(path.join(root, relative), { withFileTypes: true }); } catch { return; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory() && depth < 2 && /^(?:verify-[1-9]\d*|browser-(?:acceptance|focused))$/.test(entry.name)) visit(name, depth + 1);
      else if (entry.isFile() && entry.name.endsWith('.jsonl.invocation.json')) {
        try {
          const record = readReviewJson(root, name);
          if (hashOrNull(record.promptSha256)) invocations.push({ phase: text(record.phase, 40) ?? 'unknown', path: name,
            promptSha256: record.promptSha256, engine: text(record.engine, 40), model: text(record.model, 200), version: text(record.actualVersion, 80) });
        } catch { /* Missing prompt fingerprints stay unknown. */ }
      }
    }
  };
  if (root) visit('', 0);
  const implementation = invocations.find(item => item.phase === 'implementation') ?? invocations[0];
  let preflight = null;
  try { preflight = readReviewJson(root, 'browser-environment/preflight.json'); } catch { /* Optional. */ }
  const packages = Array.isArray(baseline?.packages) ? baseline.packages : Array.isArray(reviewPackages) ? reviewPackages : [];
  const source = baseline?.source && sha.test(baseline.source.sha ?? '') ? { repository: text(baseline.source.repository, 200), sha: baseline.source.sha } : null;
  const result = {
    track: source ? 'source-snapshot' : 'published-template',
    application: { baseRef: text(metadata?.applicationBase?.ref, 200), baseSha: shaOrNull(metadata?.applicationBase?.sha),
      candidate: { patchSha256: hashOrNull(pipeline?.patchHash) ?? fileHash(root, 'agent.patch'), headSha: null } },
    factory: { controlSha: shaOrNull(metadata?.controlSha), entrySha: shaOrNull(metadata?.entrySha) },
    template: { creatorVersion: text(baseline?.creatorVersion, 80), templateVersion: text(baseline?.templateVersion, 80) },
    dependencies: { lockfileSha256: hashOrNull(baseline?.lockSha256) ?? primary?.basis.lockfileSha256 ?? null,
      baselineFingerprint: hashOrNull(baseline?.fingerprint),
      packages: packages.filter(p => /^@nocobase\/[a-z0-9][a-z0-9._-]*$/.test(p?.name ?? '')).slice(0, 300)
        .map(p => ({ name: p.name, version: text(p.version, 80) })) },
    skills: { fingerprint: skills.length ? digest(canonicalJson(skills.map(f => [f.path, f.sha256]))) : null, files: skills.length },
    sourceSnapshot: source,
    inputs: { taskInputHash: hashOrNull(metadata?.preset?.inputHash), pipelineInputHash: hashOrNull(pipeline?.inputHash) ?? facts?.inputHash ?? null,
      reviewHash: hashOrNull(metadata?.preset?.reviewHash), reviewCriteriaHash: metadata?.task ? digest(metadata.task.reviewCriteria ?? '') : null,
      prompts: invocations.map(item => ({ phase: item.phase, path: item.path, sha256: item.promptSha256 })) },
    rubric: primary?.rubric ? { id: primary.rubric.id, version: primary.rubric.version } : null,
    agent: { engine: implementation?.engine ?? null, model: implementation?.model ?? null, version: implementation?.version ?? null,
      buildReviewMode: ['full', 'off'].includes(metadata?.task?.buildReviewMode) ? metadata.task.buildReviewMode : primary?.buildReviewMode ?? null },
    environment: { browserFixturesSha256: fileHash(root, 'browser-environment/fixtures/manifest.json'),
      browserPreflight: typeof preflight?.basic === 'boolean' ? (preflight.basic ? 'passed' : 'failed') : null },
  };
  const unknown = [['应用基线', result.application.baseSha], ['工厂控制代码', result.factory.controlSha],
    ['模板版本', result.template.templateVersion], ['锁文件', result.dependencies.lockfileSha256], ['提示词指纹', invocations.length || null]]
    .filter(([, value]) => value === null).map(([label]) => label);
  if (unknown.length) warnings.push({ code: 'baseline-unknown', detail: `未取得：${unknown.join('、')}；保持 null，不回填猜测值。` });
  if (!result.factory.entrySha) warnings.push({ code: 'entry-version-unrecorded', detail: '入口工作流版本未单独记录；controlSha 只代表实际执行的控制代码。' });
  return result;
}

export function buildEvaluation({ report, root, taskRoot = null, exporter = {} }) {
  if (typeof root !== 'string') throw new Error('An artifact directory is required (use an empty one when nothing was captured)');
  const record = report?.record;
  if (!object(record) || !/^[\w.-]+\/[\w.-]+$/.test(record.repository ?? '') || !positive(record.issue) ||
      !positive(record.runId) || !positive(record.attempt)) throw new Error('Invalid report record');
  const limitations = [];
  // The prepare-job artifact is outside the Agent's reach; the Agent artifact copy is a fallback.
  const trusted = readOptional(taskRoot, 'task-metadata.json', limitations);
  const local = readOptional(root, 'task-metadata.json', limitations);
  const metadata = trusted ?? local;
  if (trusted && local && canonicalJson(trusted.evaluation ?? null) !== canonicalJson(local.evaluation ?? null))
    limitations.push({ code: 'metadata-mismatch', detail: 'Agent 产物中的任务身份与 prepare 记录不一致；以 prepare 记录为准。' });
  if (metadata && (metadata.repository !== record.repository || metadata.issue?.number !== record.issue ||
      (metadata.run && (Number(metadata.run.id) !== record.runId || Number(metadata.run.attempt) > record.attempt))))
    throw new Error('Task metadata does not match the reported run');
  let identity;
  if (metadata) identity = resolveTaskIdentity(metadata);
  if (identity && !trusted && identity.kind === 'batch-sample') {
    // A batch-sample key must come from prepare, which verified the coordinator's assignment.
    identity = null;
    limitations.push({ code: 'identity-unverified', detail: '只取得 Agent 产物中的元数据，无法核实批次样本身份；不归入任何样本。' });
  }
  if (!identity) {
    identity = { runKey: `${record.repository}/issues/${record.issue}/unresolved/${record.runId}`, kind: 'initial', derivation: 'unresolved' };
    limitations.push({ code: 'metadata-missing', detail: '未取得任务元数据；运行身份无法确认，按单次执行导出，不与其他执行合并。' });
  }
  const facts = executionFacts(metadata, root, record, identity);
  const chain = chainOf(report, identity.runKey, facts, limitations);
  if (chain.later) limitations.push({ code: 'later-executions', detail: `同一逻辑运行另有 ${chain.later} 次更晚的执行；本报告只描述到产出执行为止。` });
  const producerKey = `run/${record.runId}/attempt/${record.attempt}`;
  const pipeline = readOptional(root, 'pipeline-state.json', limitations);
  const repair = readOptional(root, 'repair-summary.json', limitations);
  const process = collectReviewProcess(root);
  const qa = qaOf(root, process, pipeline, repair, metadata, producerKey, limitations);
  const evidence = new Map();
  const attachments = new Map();
  let attachedBytes = 0;
  const attach = (relative, id) => {
    if (!/^verify-[1-9]\d*\/browser-(?:acceptance|focused)\/evidence\/[A-Za-z0-9][A-Za-z0-9-]*\.png$/.test(relative)) return null;
    const target = `evidence/${relative.replace('/evidence/', '/')}`;
    const existing = attachments.get(target);
    if (existing) { existing.evidenceIds.push(id); return target; }
    try {
      const file = path.join(root, relative);
      const stat = lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > LIMITS.fileBytes || attachedBytes + stat.size > LIMITS.evidenceBytes ||
          attachments.size + 3 >= LIMITS.files) return null;
      const data = readFileSync(file);
      if (!data.subarray(0, 8).equals(pngHeader)) return null;
      attachedBytes += data.length;
      attachments.set(target, { path: target, file, sha256: digest(data), size: data.length, role: 'evidence', mediaType: 'image/png', evidenceIds: [id] });
      return target;
    } catch { return null; }
  };
  const collectEvidence = (item, reviewKey, id) => {
    const screenshot = item.kind === 'screenshot';
    const relative = item.path.startsWith('artifacts/') ? item.path.slice('artifacts/'.length) : null;
    const attachment = screenshot && relative ? attach(relative, id) : null;
    const excerpt = typeof item.excerpt === 'string' ? scrubSecrets(item.excerpt) : null;
    evidence.set(id, { id, origin: { kind: 'review', key: reviewKey, localId: item.id }, kind: item.kind, path: item.path,
      lines: Array.isArray(item.lines) ? item.lines : null, sha256: hashOrNull(item.sha256), observation: item.observation,
      excerpt, excerptRedacted: excerpt !== null && excerpt !== item.excerpt, attachment,
      availability: attachment ? 'attached' : excerpt ? 'excerpt' : 'reference-only',
      note: screenshot && !attachment ? '截图未随包附带（缺失、非 PNG 或超出证据预算）；请按 path 与 sha256 在内部 Artifact 核对。' : null });
  };
  const reviews = reviewsOf(root, record, process, collectEvidence, limitations);
  for (const round of qa.rounds) {
    if (round.scope !== 'full' || ![qa.firstFull.round, qa.finalFull.round].includes(round.round)) continue;
    let raw;
    try { raw = readReviewJson(root, round.source); } catch { continue; }
    (Array.isArray(raw.checks) ? raw.checks : []).forEach((check, index) => {
      const refs = [];
      for (const name of (Array.isArray(check?.screenshots) ? check.screenshots : []).slice(0, 24)) {
        if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]*\.png$/.test(name)) continue;
        const relative = `${path.posix.dirname(round.source)}/evidence/${name}`;
        const id = `qa/${round.round}/${name}`;
        if (!evidence.has(id)) {
          const attachment = attach(relative, id);
          evidence.set(id, { id, origin: { kind: 'qa', key: `qa/${round.round}`, localId: name }, kind: 'screenshot',
            path: `artifacts/${relative}`, lines: null, sha256: attachment ? attachments.get(attachment).sha256 : null,
            observation: `验收项 ${check?.id ?? index + 1} 的截图`, excerpt: null, excerptRedacted: false, attachment,
            availability: attachment ? 'attached' : 'reference-only', note: attachment ? null : '截图未随包附带；原始引用保留。' });
        }
        refs.push(id);
      }
      const target = round.checks[index];
      if (target) target.evidence = refs;
    });
  }
  for (const round of qa.rounds) for (const check of round.checks) check.evidence ??= [];
  const omitted = [...evidence.values()].filter(item => item.kind === 'screenshot' && !item.attachment).length;
  if (omitted) limitations.push({ code: 'evidence-omitted', detail: omittedDetail(omitted) });
  const supplementRaw = readOptional(root, 'build-review.supplement.json', []);
  const supplementUsage = object(supplementRaw?.supplementalUsage) && positive(supplementRaw.supplementalUsage.runId) ? supplementRaw.supplementalUsage : null;
  const executions = [...chain.executions];
  for (const review of reviews) {
    if (!review.reviewer?.replay || !review.reviewer.runId) continue;
    const key = `review-run/${review.reviewer.runId}/attempt/${review.reviewer.attempt ?? 1}`;
    if (executions.some(e => e.key === key)) continue;
    // The adopted supplement's artifact time (Actions API) is when this review produced its result.
    const endedAt = supplementUsage?.runId === review.reviewer.runId ? iso(Date.parse(supplementUsage.reviewedAt ?? '')) : null;
    executions.push({ key, kind: 'review', order: executions.length + 1, workflow: 'reassess-build-quality', runId: review.reviewer.runId,
      attempt: review.reviewer.attempt ?? 1, event: null, previousRunId: null, conclusion: review.state === 'failed' ? 'failed' : 'completed',
      startedAt: null, endedAt, jobSeconds: null, controlSha: review.reviewer.controlSha, patchSha256: review.basis.patchSha256, source: 'build-review' });
  }
  const metrics = metricsOf({ ...chain, executions }, reviews, supplementUsage);
  if (!metrics.usage.totals.complete) limitations.push({ code: 'usage-incomplete', detail: '部分用量未取得或不完整；缺失值为 null，不按零处理。' });
  if (metrics.time.missingJobTimes) limitations.push({ code: 'time-incomplete', detail: `${metrics.time.missingJobTimes} 个作业缺少时长。` });
  const originalReview = readOptional(root, 'build-review.json', []);
  const baseline = baselineOf(metadata, root, reviews, facts, limitations, originalReview?.basis?.packages);
  const pr = object(report.pr) ? report.pr : null;
  baseline.application.candidate.headSha = shaOrNull(pr?.headSha);
  const outcome = outcomeOf(record, pipeline, qa, pr);
  if (outcome.delivery === 'published' && !outcome.pullRequest) limitations.push({ code: 'pr-unknown', detail: '发布作业已成功，但报告时未取得带交付标记的 PR。' });
  const primary = reviews.find(review => review.selected);
  const rubric = Math.max(0, ...reviews.filter(r => ['completed', 'partial'].includes(r.state)).map(r => r.rubric?.version ?? 0));
  const links = [
    { rel: 'task-issue', label: `Issue #${record.issue}`, url: `https://github.com/${record.repository}/issues/${record.issue}`, path: null },
    ...chain.executions.map(e => ({ rel: 'run', label: `Run ${e.runId} / attempt ${e.attempt}`,
      url: `https://github.com/${record.repository}/actions/runs/${e.runId}/attempts/${e.attempt}`, path: null })),
    ...(outcome.pullRequest ? [{ rel: 'pull-request', label: `PR #${outcome.pullRequest.number}`, url: `https://github.com/${record.repository}/pull/${outcome.pullRequest.number}`, path: null }] : []),
    { rel: 'report-archive', label: '固定版本 HTML 报告（gh-pages 归档路径）', url: null, path: `reports/issues/${record.issue}/runs/${record.runId}/attempt-${record.attempt}/index.html` },
  ];
  const identityBlock = {
    key: identity.runKey, kind: identity.kind, identity: identity.derivation,
    batchKey: identity.batchKey ?? null, caseKey: identity.caseKey ?? null, sampleIndex: identity.sampleIndex ?? null, sampleKey: identity.sampleKey ?? null,
    task: { repository: record.repository, issue: record.issue, buildCommentId: identity.buildCommentId ?? null,
      title: text(metadata?.issue?.title, 300) ?? `Issue #${record.issue}` },
    case: metadata?.preset ? { source: 'preset', presetIssueNumber: positive(metadata.preset.sourceIssueNumber) ? metadata.preset.sourceIssueNumber : null,
      capturedAt: iso(Date.parse(metadata.preset.capturedAt)), inputHash: hashOrNull(metadata.preset.inputHash), reviewHash: hashOrNull(metadata.preset.reviewHash) } : null,
  };
  if (identity.derivation === 'legacy-derived') limitations.push({ code: 'identity-legacy', detail: '任务早于运行身份记录，run.key 由已校验的仓库、Issue 与 /build 评论推导。' });
  const draft = {
    schemaVersion: 1, type: 'evaluation-report',
    source: { producer: PRODUCER, instance: record.repository, project: record.repository,
      exporter: { version: EXPORTER_VERSION, controlSha: shaOrNull(exporter.controlSha), runId: positive(Number(exporter.runId)) ? Number(exporter.runId) : null,
        attempt: positive(Number(exporter.attempt)) ? Number(exporter.attempt) : null } },
    run: identityBlock,
    precedence: { producer: { runId: record.runId, attempt: record.attempt, startedAt: iso(record.start) },
      executionOrder: chain.executions.length, knownLaterExecutions: chain.later, chainTerminal: outcome.execution !== 'running',
      reviewRubric: rubric, reviewState: primary?.state ?? 'not-reviewed', review: reviewOrder(primary, supplementUsage, record), qaCoverage: qa.coverage },
    baseline, executions, outcome, qa, reviews, processNotes: notesOf(root, producerKey), metrics,
    evidence: [...evidence.values()], links,
    limitations: dedupeLimitations(limitations),
  };
  return { draft, attachments: [...attachments.values()] };
}

function dedupeLimitations(items) {
  const seen = new Set();
  return items.filter(item => { const key = `${item.code}:${item.detail}`; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 60);
}

// Volatile publication details never change the logical content of a revision.
export function fingerprintEvaluation(document, attachments = []) {
  const { revision, createdAt, source, ...rest } = document;
  const { exporter, ...stable } = source ?? {};
  return digest(canonicalJson({ ...rest, source: { ...stable, exporterVersion: exporter?.version ?? null },
    attachments: attachments.map(a => [a.path, a.sha256]).sort() }));
}

export const documentKeyOf = document => document.type === 'evaluation-batch' ? document.batch.subjectKey : document.run.key;

// Which review the selected one is, in execution order: any reassessment follows the
// build's own review; reassessments are ordered by the Actions API time of their review
// artifact. Run and attempt only break ties.
function reviewOrder(primary, supplement, record) {
  if (!primary || primary.state === 'not-reviewed') return { kind: null, at: null, runId: null, attempt: null };
  if (primary.role === 'supplement') return { kind: 'reassessment',
    at: supplement?.runId === primary.reviewer?.runId ? iso(Date.parse(supplement.reviewedAt ?? '')) : null,
    runId: primary.reviewer?.runId ?? null, attempt: primary.reviewer?.attempt ?? null };
  return { kind: 'build', at: iso(record.start), runId: record.runId, attempt: record.attempt };
}

export function finalizeEvaluation(draft, { revision, createdAt }) {
  if (!positive(revision)) throw new Error('Revision must be a positive integer');
  // Keep the identity block first, then the revision it was archived under.
  const { schemaVersion, type, source, ...rest } = draft;
  const identity = type === 'evaluation-batch' ? { batch: rest.batch } : { run: rest.run };
  delete rest.batch; delete rest.run;
  const document = { schemaVersion, type, source, ...identity, revision, createdAt: iso(Date.parse(createdAt)), ...rest };
  if (!document.createdAt) throw new Error('Invalid revision creation time');
  assertSchema(loadContract(`${type}.v${schemaVersion}`), document, type);
  const bytes = Buffer.from(`${JSON.stringify(document, null, 2)}\n`);
  if (bytes.length > LIMITS.jsonBytes) throw new Error(`${type} exceeds ${LIMITS.jsonBytes} bytes; refusing to truncate evidence silently`);
  return { document, bytes };
}

// Receivers must not pick "current" by the largest revision: compare facts first.
export function comparePrecedence(a, b) {
  const pa = a.precedence, pb = b.precedence;
  const order = x => [Date.parse(x.producer.startedAt) || 0, x.producer.runId, x.producer.attempt];
  const byProducer = compareTuples(order(pa), order(pb));
  if (byProducer) return byProducer;
  if (pa.reviewRubric !== pb.reviewRubric) return pa.reviewRubric - pb.reviewRubric;
  const complete = x => ({ completed: 3, partial: 2, failed: 1, 'not-reviewed': 0 })[x.reviewState] ?? 0;
  if (complete(pa) !== complete(pb)) return complete(pa) - complete(pb);
  // Then the newer review of the same facts: re-exporting an older reassessment keeps it as
  // history. Run and attempt only break ties (or order reviews recorded without a time).
  const reviewed = x => [{ build: 1, reassessment: 2 }[x.review?.kind] ?? 0, Date.parse(x.review?.at ?? '') || 0, x.review?.runId ?? 0, x.review?.attempt ?? 0];
  const byReview = compareTuples(reviewed(pa), reviewed(pb));
  if (byReview) return byReview;
  const qa = x => ({ complete: 2, partial: 1, none: 0 })[x.qaCoverage] ?? 0;
  return qa(pa) - qa(pb);
}
