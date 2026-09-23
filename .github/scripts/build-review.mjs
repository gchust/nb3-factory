// Evidence-backed build assessment. Scores are reviewer opinions, never QA verdicts.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const rubricVersion = 1;
export const dimensions = {
  design: '设计合理性', completeness: '开发完整性',
  agentFriendliness: 'Agent 使用友好度', outputQuality: 'Agent 产出质量',
};
export const owners = {
  framework: 'NocoBase3 内核', plugin: 'NocoBase3 插件', template: '应用模板',
  documentation: '文档 / Skill / 示例', application: 'Agent / 业务实现',
  factory: '工厂流程', environment: '环境 / 外部服务', unknown: '归因待确认',
};
export const findingKinds = { strength: '做得好的地方', issue: '问题', misleading: '误导或明显错误', improvement: '改进建议' };
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

export function validateEvaluation(review, inputHash, catalog) {
  need(object(review) && review.version === 1 && review.inputHash === inputHash, 'Review input identity mismatch');
  text(review.summary, 'summary');
  list(review.modules, 'modules', 30); list(review.findings, 'findings', 60);
  list(review.evidence, 'evidence', 100); list(review.limitations, 'limitations', 30);
  review.limitations.forEach(value => text(value, 'limitation'));
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
  unique(review.modules.map(module => module.name), 'modules');
  for (const module of review.modules) {
    text(module.name, 'module.name', 120); text(module.scope, 'module.scope');
    text(module.limitations, 'module.limitations'); list(module.criteria, 'module.criteria', 100);
    module.criteria.forEach(id => text(id, 'criterion id', 100)); unique(module.criteria, 'module.criteria');
    need(object(module.scores), 'module.scores required');
    for (const key of Object.keys(dimensions)) score(module.scores[key], key);
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
  need(['completed', 'not-reviewed', 'failed'].includes(report.state), 'Invalid build review state');
  need(object(report.basis), 'Missing review basis');
  if (identity) for (const key of ['repository', 'issue', 'runId', 'attempt']) {
    need(String(report.basis[key]) === String(identity[key]), `Review ${key} does not match this run`);
  }
  if (report.state === 'completed') {
    need(report.basis.rubricVersion === rubricVersion && /^[a-f0-9]{64}$/.test(report.basis.inputHash), 'Missing rubric/input fingerprint');
    validateEvaluation(report.evaluation, report.basis.inputHash);
    for (const evidence of report.evaluation.evidence) {
      need(/^[a-f0-9]{64}$/.test(evidence.sha256), 'Missing captured evidence hash');
      if (evidence.kind !== 'screenshot') text(evidence.excerpt, 'captured excerpt', 12000);
    }
  } else need(report.evaluation === null, 'An incomplete review must not expose scores');
  return report;
}

export function loadBuildReview(root, identity) {
  const process = collectReviewProcess(root);
  let report;
  try { report = optional(root, 'build-review.json'); }
  catch { return { version: 1, state: 'failed', reason: '评审文件无法读取；不显示评分。', process, evaluation: null }; }
  if (!report) return { version: 1, state: 'not-reviewed', reason: '本轮没有独立评审记录；未评估不代表通过，也不按零分处理。', process, evaluation: null };
  try { validateBuildReview(report, identity); }
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
