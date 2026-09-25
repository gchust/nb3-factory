// Evidence-backed build assessment. Scores are reviewer opinions, never QA verdicts.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const rubricVersion = 2;
const legacyDimensions = {
  design: '设计合理性', completeness: '开发完整性',
  agentFriendliness: 'Agent 使用友好度', outputQuality: 'Agent 产出质量',
};
export const dimensions = {
  requirementFit: '需求满足度', usability: '使用便利度', agentFriendliness: 'Agent 友好度',
  design: '设计合理性', reliability: '实现完整性与可靠性',
};
export function dimensionsFor(version) {
  if (version === 1) return legacyDimensions;
  if (version === 2) return dimensions;
  throw new Error('Unsupported review rubric');
}
export const supportLabels = {
  direct: '直接支持', composition: '正常组合', workaround: '需要绕行',
  missing: '能力缺口', unknown: '尚未确认', 'out-of-scope': '框架职责之外',
};
export const targetKinds = { library: '库', plugin: '插件', guidance: '指引 / Skill' };
export const owners = {
  framework: 'NocoBase3 内核', plugin: 'NocoBase3 插件', template: '应用模板',
  documentation: '文档 / Skill / 示例', application: 'Agent / 业务实现',
  factory: '工厂流程', environment: '环境 / 外部服务', unknown: '归因待确认',
};
export const findingKinds = { strength: '做得好的地方', issue: '问题', misleading: '误导或明显错误', improvement: '改进建议' };
export const diagnosisCategories = {
  'runtime-defect': '实现缺陷', 'capability-gap': '能力 / 接入缺口',
  'guidance-gap': '指引 / 示例缺陷', 'usability-improvement': '易用性改进',
};
export const digest = value => createHash('sha256').update(value).digest('hex');
const count = value => Number.isSafeInteger(value) && value >= 0;
const checkStates = ['passed', 'failed', 'blocked', 'not_run', 'unknown'];
const need = (condition, message) => { if (!condition) throw new Error(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, name, max = 2000) => need(typeof value === 'string' && value.trim().length > 0 && value.length <= max, `${name}: non-empty text required (max ${max})`);
const list = (value, name, max = 40) => need(Array.isArray(value) && value.length <= max, `${name}: bounded array required`);
const unique = (values, name) => need(new Set(values).size === values.length, `${name}: duplicates`);
export const safeRelative = value => typeof value === 'string' && value.length <= 500 &&
  !value.includes('\\') && !value.includes('\0') && !path.posix.isAbsolute(value) &&
  !value.split('/').some(part => !part || part === '.' || part === '..');

export function readReviewJson(root, relative) {
  need(safeRelative(relative), 'Invalid review file path');
  // Reject links at every level, not just the leaf.
  let file = root;
  for (const part of relative.split('/')) {
    file = path.join(file, part);
    need(!lstatSync(file).isSymbolicLink(), 'Review files cannot be symlinks');
  }
  const stat = lstatSync(file);
  need(stat.isFile() && stat.size <= 2 * 1024 * 1024, 'Review JSON exceeds 2 MiB');
  return JSON.parse(readFileSync(file, 'utf8'));
}
function optional(root, file) {
  try { return readReviewJson(root, file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

// No model supplies these counts or statuses. Missing rounds stay missing,
// especially when a handoff artifact contains only this Run's verification data.
export function collectReviewProcess(root) {
  const warnings = [];
  const read = file => {
    try { return optional(root, file); }
    catch { warnings.push(`${file} 无法读取`); return null; }
  };
  const repair = read('repair-summary.json');
  let entries = [];
  try { entries = readdirSync(root, { withFileTypes: true }); }
  catch (error) { if (error.code !== 'ENOENT') warnings.push('验证记录目录无法读取'); }
  const numbers = entries.filter(e => e.isDirectory() && /^verify-[1-9]\d*$/.test(e.name))
    .map(e => Number(e.name.slice(7))).sort((a, b) => a - b);
  const selected = numbers.length > 100 ? [numbers[0], ...numbers.slice(-99)] : numbers;
  if (numbers.length > selected.length) warnings.push('只展示首个及最近 99 个验证轮次，未显示的轮次不推断通过');
  const rounds = selected.map(round => {
    const reports = ['browser-acceptance', 'browser-focused'].flatMap(scope => {
      const source = `verify-${round}/${scope}/report.json`;
      const report = read(source);
      if (!report) return [];
      return [{ scope: scope === 'browser-acceptance' ? 'full' : 'focused', source,
        passed: typeof report.passed === 'boolean' ? report.passed : null,
        checks: (Array.isArray(report.checks) ? report.checks : []).slice(0, 300).map(check => ({
          id: typeof check?.id === 'string' ? check.id : null,
          criterion: String(check?.criterion ?? ''),
          status: checkStates.includes(check?.status) ? check.status : 'unknown',
          reason: String(check?.reason ?? ''),
        })),
      }];
    });
    return { round, reports };
  });
  return {
    verificationAttempts: count(repair?.verificationAttempts) ? repair.verificationAttempts : null,
    repairAttempts: count(repair?.repairAttempts) ? repair.repairAttempts : null,
    finalRound: count(repair?.finalVerificationAttempt) ? repair.finalVerificationAttempt : numbers.at(-1) ?? null,
    rounds, warnings,
    scope: '仅本 Run 已归档记录；工厂修复轮次不等于 Agent 开发中全部试错次数。缺少 verify-1 时不能声称任务首轮通过。',
  };
}

// Match paths, not the model's evidence.kind: application code cannot be relabeled
// as package/Skill evidence. Manifest metadata identifies versions, not capabilities.
function isTargetEvidence(target, evidence) {
  if (evidence.kind === 'screenshot') return false;
  const root = target.kind === 'guidance' ? target.name : `packages/${target.name}`;
  return (evidence.path === root || evidence.path.startsWith(root + '/')) &&
    !evidence.path.endsWith('/package.json') && !evidence.path.endsWith('.map');
}
export function validateEvaluation(review, inputHash, catalog, expectedVersion = review?.version) {
  need(object(review) && [1, 2].includes(review.version) && review.version === expectedVersion && review.inputHash === inputHash, 'Review input identity mismatch');
  const scoreDimensions = dimensionsFor(review.version);
  text(review.summary, 'summary');
  list(review.modules, 'modules', 30); list(review.findings, 'findings', 60);
  list(review.evidence, 'evidence', 100); list(review.limitations, 'limitations', 30);
  review.limitations.forEach(value => text(value, 'limitation'));
  if (review.version === 2) need(object(review.progress), 'Framework review requires explicit progress');
  if (review.progress !== undefined) {
    need(object(review.progress) && typeof review.progress.complete === 'boolean', 'Invalid assessment progress');
    list(review.progress.pendingModules, 'pendingModules', 30);
    review.progress.pendingModules.forEach(name => text(name, 'pending module', 120));
    need(!review.progress.complete || review.progress.pendingModules.length === 0, 'Completed progress still has pending modules');
  }
  const ids = new Set();
  for (const evidence of review.evidence) {
    need(object(evidence) && /^E[1-9]\d*$/.test(evidence.id), 'Invalid evidence id');
    need(!ids.has(evidence.id), 'Duplicate evidence id'); ids.add(evidence.id);
    need(safeRelative(evidence.path) && /^(app|packages|artifacts)\//.test(evidence.path), 'Invalid evidence path');
    need(['code', 'package', 'skill', 'qa', 'screenshot', 'log'].includes(evidence.kind), 'Invalid evidence kind');
    text(evidence.observation, 'evidence.observation');
    const file = catalog?.find(item => item.path === evidence.path);
    if (catalog) need(file, `Evidence file was not captured: ${evidence.path}`);
    if (evidence.kind === 'screenshot') {
      need(/^artifacts\/verify-[1-9]\d*\/browser-(acceptance|focused)\/evidence\/[A-Za-z0-9][A-Za-z0-9-]*\.png$/.test(evidence.path), 'Invalid screenshot evidence');
      if (catalog) need(file.kind === 'screenshot', 'Evidence is not a captured PNG');
    } else {
      need(Array.isArray(evidence.lines) && evidence.lines.length === 2 &&
        evidence.lines.every(n => Number.isSafeInteger(n) && n > 0) &&
        evidence.lines[1] >= evidence.lines[0] && evidence.lines[1] - evidence.lines[0] < 100, 'Evidence needs a bounded line range');
      if (catalog) need(file.kind !== 'screenshot' && evidence.lines[1] <= file.lines, 'Evidence lines outside captured file');
    }
  }
  function refs(values, required = false) {
    list(values, 'evidence refs', 20); unique(values, 'evidence refs');
    need(!required || values.length > 0, 'A score or finding requires evidence');
    values.forEach(id => need(ids.has(id), `Unknown evidence id: ${id}`));
  }
  function score(value, name) {
    need(object(value), `${name}: score object required`);
    need(value.score === null || (Number.isInteger(value.score) && value.score >= 0 && value.score <= 100), `${name}: score must be 0–100 or null`);
    text(value.reason, `${name}.reason`); refs(value.evidence, value.score !== null);
  }
  function frameworkModule(module) {
    list(module.targets, 'module.targets', 12);
    need(module.targets.length > 0, 'Framework module needs explicit library/plugin/guidance targets');
    unique(module.targets.map(target => target.name), 'targets');
    for (const target of module.targets) {
      need(object(target) && Object.hasOwn(targetKinds, target.kind), `Invalid framework target kind in ${module.name}: ${String(target?.kind)} (expected library/plugin/guidance)`);
      text(target.name, 'target.name', 250);
      if (target.kind === 'guidance') need(safeRelative(target.name) &&
        /^(app\/\.agents\/skills\/|app\/AGENTS\.md$|packages\/@nocobase\/[^/]+\/(?:docs|skills)\/)/.test(target.name), 'Guidance target must identify captured instructions');
      else need(/^@nocobase\/[a-z0-9][a-z0-9._-]*$/.test(target.name), 'Target must identify a NocoBase3 package, not business code');
      list(target.entrypoints, 'target.entrypoints', 12);
      need(target.entrypoints.length > 0, 'Target requires API or guidance entrypoints');
      target.entrypoints.forEach(entry => text(entry, 'entrypoint', 300));
      refs(target.evidence);
      for (const id of target.evidence) need(isTargetEvidence(target, review.evidence.find(e => e.id === id)), `Target evidence must come from its framework source or guidance: ${module.name} / ${target.name} / ${id}`);
    }
    list(module.requirements, 'module.requirements', 20);
    need(module.requirements.length > 0, 'Framework module needs a requirement-to-capability mapping');
    for (const item of module.requirements) {
      for (const key of ['need', 'responsibility', 'recommendedUsage', 'actualUsage']) text(item[key], `requirement.${key}`);
      need(Object.hasOwn(supportLabels, item.support), 'Invalid requirement support classification');
      need(item.gapOwner === 'none' || Object.hasOwn(owners, item.gapOwner), 'Invalid gap owner');
      if (['workaround', 'missing'].includes(item.support)) need(item.gapOwner !== 'none', 'A capability gap needs attribution (or unknown)');
      refs(item.evidence, !['unknown', 'out-of-scope'].includes(item.support));
    }
    const linked = values => values.map(id => review.evidence.find(e => e.id === id))
      .filter(e => module.targets.some(target => target.evidence.includes(e.id) && isTargetEvidence(target, e)));
    for (const [key, value] of Object.entries(module.scores)) {
      if (value.score === null) continue;
      const sources = linked(value.evidence);
      need(sources.length > 0, `${key}: numeric framework score requires evidence from a declared target; app/QA alone is insufficient`);
      if (key === 'requirementFit') need(module.requirements.some(item => !['unknown', 'out-of-scope'].includes(item.support)), 'Unknown or out-of-scope requirements cannot receive a fit score');
      if (key === 'reliability') need(sources.some(e => module.targets.every(target => target.kind === 'guidance') ||
        (module.targets.some(target => target.kind !== 'guidance' && isTargetEvidence(target, e)) && /\.(?:[cm]?js|jsx|tsx?|sql)$/.test(e.path) && !/\.d\.(?:[cm]?ts)$/.test(e.path))), 'Framework reliability requires implementation evidence; declarations/QA alone are insufficient');
    }
  }
  unique(review.modules.map(module => module.name), 'modules');
  for (const module of review.modules) {
    text(module.name, 'module.name', 120); text(module.scope, 'module.scope');
    text(module.limitations, 'module.limitations'); list(module.criteria, 'module.criteria', 100);
    module.criteria.forEach(id => text(id, 'criterion id', 100)); unique(module.criteria, 'module.criteria');
    need(object(module.scores), 'module.scores required');
    if (review.version === 2) need(Object.keys(module.scores).length === Object.keys(scoreDimensions).length &&
      Object.keys(module.scores).every(key => Object.hasOwn(scoreDimensions, key)), 'Framework rubric has five dimensions; application output quality is not a framework score');
    for (const key of Object.keys(scoreDimensions)) score(module.scores[key], key);
    if (review.version === 2) frameworkModule(module);
  }
  unique(review.findings.map(finding => finding.id), 'findings');
  for (const finding of review.findings) {
    need(/^F[1-9]\d*$/.test(finding.id), 'Invalid finding id');
    need(Object.hasOwn(findingKinds, finding.kind) && Object.hasOwn(owners, finding.owner), 'Invalid finding kind/owner');
    need(['confirmed', 'suspected'].includes(finding.confidence), 'Invalid confidence');
    need(['info', 'minor', 'major', 'critical'].includes(finding.severity), 'Invalid severity');
    need(['open', 'resolved', 'unknown', 'not-applicable'].includes(finding.status), 'Invalid finding status');
    for (const key of ['title', 'detail', 'impact', 'suggestedChange']) text(finding[key], `finding.${key}`);
    refs(finding.evidence, true);
    // Optional for archived v2 reports; new reviews provide an actionable record.
    if (finding.diagnosis !== undefined) {
      need(review.version === 2 && finding.kind !== 'strength' && object(finding.diagnosis), 'Invalid finding diagnosis');
      need(Object.hasOwn(diagnosisCategories, finding.diagnosis.category), 'Invalid diagnosis category');
      for (const key of ['trigger', 'expected', 'actual', 'workaround', 'acceptance']) text(finding.diagnosis[key], `diagnosis.${key}`);
    }
    if (review.version === 2 && finding.confidence === 'confirmed' &&
        ['framework', 'plugin', 'template', 'documentation'].includes(finding.owner)) {
      need(finding.evidence.some(id => review.modules.some(module => module.targets.some(target =>
        target.evidence.includes(id) && isTargetEvidence(target, review.evidence.find(e => e.id === id))))),
      'Confirmed framework feedback needs target evidence, not author self-report or QA alone');
    }
    if (finding.kind === 'misleading') {
      text(finding.claimed, 'misleading.claimed'); text(finding.observed, 'misleading.observed');
    }
  }
  need(object(review.ui) && ['reviewed', 'not-reviewed'].includes(review.ui.status), 'UI review status required');
  score(review.ui, 'ui');
  const images = review.ui.evidence.map(id => review.evidence.find(e => e.id === id)).filter(e => e.kind === 'screenshot');
  if (review.ui.status === 'not-reviewed') need(review.ui.score === null, 'Unreviewed UI cannot have a score');
  else need(new Set(images.map(e => e.path)).size >= 2, 'Cross-page UI assessment requires at least two actual screenshots');
  return review;
}

export function validateBuildReview(report, identity) {
  need(object(report) && report.version === 1, 'Invalid build review version');
  need(['completed', 'partial', 'not-reviewed', 'failed'].includes(report.state), 'Invalid build review state');
  need(object(report.basis), 'Missing review basis');
  if (identity) for (const key of ['repository', 'issue', 'runId', 'attempt']) {
    need(String(report.basis[key]) === String(identity[key]), `Review ${key} does not match this run`);
  }
  if (['completed', 'partial'].includes(report.state)) {
    need([1, 2].includes(report.basis.rubricVersion) && /^[a-f0-9]{64}$/.test(report.basis.inputHash), 'Missing rubric/input fingerprint');
    validateEvaluation(report.evaluation, report.basis.inputHash, undefined, report.basis.rubricVersion);
    if (report.basis.rubricVersion === 2) {
      need(Array.isArray(report.basis.packages), 'Framework review needs captured package identities');
      if (report.state === 'completed') need(report.evaluation.progress.complete, 'Completed framework review still has unfinished progress');
      for (const module of report.evaluation.modules) if (Object.values(module.scores).some(score => score.score !== null)) {
        for (const target of module.targets) if (target.kind !== 'guidance') need(report.basis.packages.some(pkg => pkg.name === target.name), 'Scored framework target was not installed');
      }
    }
    if (report.state === 'partial') need(report.evaluation.modules.length > 0 && report.evaluation.evidence.length > 0, 'Partial review requires assessed modules and evidence');
    for (const evidence of report.evaluation.evidence) {
      need(/^[a-f0-9]{64}$/.test(evidence.sha256), 'Missing captured evidence hash');
      if (evidence.kind !== 'screenshot') text(evidence.excerpt, 'captured excerpt', 12000);
    }
  } else need(report.evaluation === null, 'An incomplete review must not expose scores');
  return report;
}

// Publication retries can reuse an earlier producer's sealed artifact. Keep that
// identity intact: a later publication attempt is not a new assessment.
export function resolveReviewIdentity(root, report, identity) {
  if (!identity) return undefined;
  const basis = report.basis;
  for (const key of ['repository', 'issue', 'runId']) {
    need(String(basis?.[key]) === String(identity[key]), `Review ${key} does not match this run`);
  }
  const producer = Number(basis.attempt), publication = Number(identity.attempt);
  need(Number.isSafeInteger(producer) && producer > 0 && producer <= publication, 'Invalid review producer attempt');
  const metadata = optional(root, 'task-metadata.json');
  // New or historical producer metadata is mandatory for cross-attempt reuse.
  if (producer !== publication || metadata?.run) {
    need(metadata?.repository === identity.repository && metadata.issue?.number === Number(identity.issue) &&
      Number(metadata.run?.id) === Number(identity.runId) && Number(metadata.run?.attempt) === producer,
      'Review producer does not match the captured task metadata');
    if (report.evaluation !== null || basis.patchHash) {
      need(basis.baseSha === metadata.applicationBase?.sha && basis.controlSha === metadata.controlSha,
        'Review application/control baseline mismatch');
      need(basis.patchHash === digest(readFileSync(path.join(root, 'agent.patch'))), 'Review sealed patch mismatch');
      need(basis.reviewCriteriaHash === digest(metadata.task?.reviewCriteria ?? ''), 'Review criteria mismatch');
      if (basis.artifactHash) need(basis.artifactHash === reviewArtifactHash(root), 'Review evidence fingerprint mismatch');
    }
  }
  return { ...identity, attempt: producer };
}

// Does not include mutable publication state, timings or the review itself.
export function reviewArtifactHash(root) {
  const process = collectReviewProcess(root);
  const files = ['task-metadata.json', 'agent.patch', 'repair-summary.json', 'retro.json',
    ...process.rounds.flatMap(round => round.reports.map(report => report.source))].sort();
  return digest(JSON.stringify(files.map(file => {
    try { return [file, digest(readFileSync(path.join(root, file)))]; }
    catch (error) { if (error.code === 'ENOENT') return [file, null]; throw error; }
  })));
}

export function loadBuildReview(root, identity) {
  const process = collectReviewProcess(root);
  let report, originalError = false;
  try { report = optional(root, 'build-review.json'); }
  catch { originalError = true; process.warnings.push('原评审文件无法读取'); }
  try {
    const supplement = optional(root, 'build-review.supplement.json');
    if (supplement) {
      validateBuildReview(supplement, resolveReviewIdentity(root, supplement, identity));
      // A new rubric is a new assessment, not a relabeling of old scores. A
      // valid v2 partial can coexist with a complete v1; never downgrade v2 to v1.
      let originalValid = false;
      try { validateBuildReview(report, resolveReviewIdentity(root, report, identity)); originalValid = true; } catch {}
      const older = originalValid && ['completed', 'partial'].includes(report.state) ? report : null;
      if (['completed', 'partial'].includes(supplement.state) &&
          (!older || supplement.basis.rubricVersion > older.basis.rubricVersion ||
           (supplement.basis.rubricVersion === older.basis.rubricVersion && !(older.state === 'completed' && supplement.state === 'partial')))) {
        report = { ...supplement, ...(older?.basis.rubricVersion === 1 && supplement.basis.rubricVersion === 2 ? { legacyReview: older } : {}) };
      }
    }
  } catch (error) { process.warnings.push(`后补评审未采用：${error.message}`); }
  if (!report && originalError) return { version: 1, state: 'failed', reason: '评审文件无法读取；不显示评分。', process, evaluation: null };
  if (!report) return { version: 1, state: 'not-reviewed', reason: '本轮没有独立评审记录；未评估不代表通过，也不按零分处理。', process, evaluation: null };
  try { validateBuildReview(report, resolveReviewIdentity(root, report, identity)); }
  catch (error) { return { version: 1, state: 'failed', reason: `评审未采用：${error.message}`, process, evaluation: null }; }
  // Round facts always come from the original reports, not the reviewer's JSON.
  return { ...report, process };
}

export function moduleRoundResult(module, process, round) {
  if (!module.criteria.length || round == null) return 'unknown';
  const report = process?.rounds?.find(item => item.round === round)?.reports.find(item => item.scope === 'full');
  if (!report) return 'unknown';
  const checks = module.criteria.map(id => report.checks.find(check => check.id === id));
  if (checks.some(check => check?.status === 'failed')) return 'failed';
  if (checks.some(check => check?.status === 'blocked')) return 'blocked';
  if (checks.some(check => check?.status === 'not_run')) return 'not_run';
  return checks.every(check => check?.status === 'passed') ? 'passed' : 'unknown';
}
