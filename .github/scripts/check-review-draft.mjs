// One validator for both reviewer authoring feedback and trusted final acceptance.
// The CLI only reads the draft and frozen snapshot; it never repairs or publishes.
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { digest, readReviewJson, validateEvaluation } from './build-review.mjs';

export function materializeEvidence(review, snapshot, catalog) {
  // Any edit to a reviewed input invalidates the assessment, not the delivery.
  for (const file of catalog) {
    const target = path.join(snapshot, file.path);
    if (!existsSync(target) || lstatSync(target).isSymbolicLink() || digest(readFileSync(target)) !== file.sha256)
      throw new Error(`Reviewer changed captured input: ${file.path}`);
  }
  return {
    ...review,
    evidence: review.evidence.map(evidence => {
      const file = catalog.find(item => item.path === evidence.path);
      const data = readFileSync(path.join(snapshot, file.path));
      const excerpt = evidence.kind === 'screenshot' ? null : data.toString('utf8')
        .split('\n').slice(evidence.lines[0] - 1, evidence.lines[1]).join('\n').slice(0, 12000);
      // A valid file/line reference to only "{" is not a useful citation.
      // Do not widen the reviewer's range or substitute its claimed quote.
      if (excerpt !== null && /^[\s{}[\],:;()]*$/u.test(excerpt))
        throw new Error(`Evidence ${evidence.id} must select substantive lines: ${evidence.path}`);
      return { id: evidence.id, kind: evidence.kind, path: evidence.path, observation: evidence.observation,
        ...(evidence.kind === 'screenshot' ? {} : { lines: evidence.lines, excerpt }), sha256: file.sha256,
      };
    }),
  };
}

// Require source events, not a file inventory or a reviewer-written summary.
// This proves references and explicit triage, never that a model understood every byte.
export function assessHistoryReview(review, history, catalog) {
  if (history?.version !== 2) return null;
  const supplied = review.historyReview ?? [];
  if (!Array.isArray(supplied))
    throw new Error('historyReview must be an array');
  const entries = new Map();
  for (const item of supplied) {
    if (
      !item ||
      typeof item.log !== 'string' ||
      entries.has(item.log) ||
      !history.invocations.some((invocation) => invocation.log === item.log)
    )
      throw new Error('Invalid or duplicate history invocation');
    if (
      !['reviewed', 'not-reviewed', 'unavailable'].includes(item.status) ||
      typeof item.reason !== 'string' ||
      !item.reason.trim()
    )
      throw new Error('History review needs a status and reason');
    entries.set(item.log, item);
  }
  const covers = (ids, log, expected) =>
    Array.isArray(ids) &&
    ids.some((id) => {
      const evidence = review.evidence.find((item) => item.id === id);
      const file = catalog.find((item) => item.path === evidence?.path);
      return (
        evidence?.kind === 'log' &&
        file?.source?.path === log &&
        (!expected ||
          (evidence.path === expected.path &&
            evidence.lines[0] <= expected.lines[0] &&
            evidence.lines[1] >= expected.lines[1]))
      );
    });
  let reviewed = 0,
    errors = 0,
    checkedErrors = 0;
  const pending = [];
  for (const invocation of history.invocations.filter((item) => item.invoked)) {
    const item = entries.get(invocation.log);
    const failures = item?.errors ?? [];
    if (!Array.isArray(failures))
      throw new Error('History errors must be an array');
    const seen = new Set();
    for (const failure of failures) {
      if (
        !failure ||
        seen.has(failure.sourceLine) ||
        !invocation.errors.some(
          (error) => error.sourceLine === failure.sourceLine,
        )
      )
        throw new Error('Unknown or duplicate history error signal');
      if (
        ![
          'finding',
          'resolved',
          'expected',
          'unrelated',
          'unassessed',
        ].includes(failure.disposition) ||
        typeof failure.reason !== 'string' ||
        !failure.reason.trim()
      )
        throw new Error('History error needs disposition and reason');
      seen.add(failure.sourceLine);
    }
    let checked = 0;
    for (const error of invocation.errors) {
      const failure = failures.find(
        (item) => item.sourceLine === error.sourceLine,
      );
      if (
        failure &&
        failure.disposition !== 'unassessed' &&
        covers(failure.evidence, invocation.log, error)
      )
        checked++;
    }
    errors += invocation.errors.length;
    checkedErrors += checked;
    if (
      item?.status === 'reviewed' &&
      covers(item.evidence, invocation.log) &&
      checked === invocation.errors.length &&
      !invocation.missing.length
    )
      reviewed++;
    else pending.push(invocation.log);
  }
  const total = history.invocations.filter((item) => item.invoked).length;
  return {
    status:
      history.coverage === 'available' && total > 0 && pending.length === 0
        ? 'referenced'
        : 'partial',
    inputCoverage: history.coverage,
    invocations: total,
    referencedInvocations: reviewed,
    errorSignals: errors,
    assessedErrorSignals: checkedErrors,
    pending,
    boundary:
      '核对原始事件引用及显式错误处置，不证明模型已通读或理解每一字节；错误信号不等于框架缺陷。',
  };
}

export function finalizeAssessment(snapshot, captured, basis, finished) {
  const raw = readReviewJson(snapshot, 'assessment.json');
  validateEvaluation(raw, basis.inputHash, captured.files, basis.rubricVersion);
  const history = assessHistoryReview(raw, captured.history?.index, captured.files);
  const partial = !finished || raw.progress?.complete === false || history?.status === 'partial';
  if (partial && (!raw.modules.length || !raw.evidence.length)) throw new Error('No assessed module checkpoint');
  const knownCriteria = new Set(captured.process.rounds.flatMap(round => round.reports.flatMap(item => item.checks.map(check => check.id))).filter(Boolean));
  for (const module of raw.modules) for (const id of module.criteria) {
    if (!knownCriteria.has(id)) throw new Error(`Module references an unrecorded criterion: ${id}`);
  }
  if (raw.version === 2) for (const module of raw.modules) for (const target of module.targets) {
    if (target.kind !== 'guidance' && !captured.packages.some(pkg => pkg.name === target.name) &&
        Object.values(module.scores).some(score => score.score !== null)) throw new Error(`Framework target was not installed: ${target.name}`);
  }
  const evaluation = materializeEvidence(raw, snapshot, captured.files);
  if (history) {
    evaluation.historyCoverage = history;
    if (history.status === 'partial') {
      if (evaluation.limitations.length === 30) evaluation.limitations.pop();
      evaluation.limitations.push('搭建过程证据未完成：原始调用 ' + history.referencedInvocations + '/' + history.invocations + '；显式错误信号 ' + history.assessedErrorSignals + '/' + history.errorSignals + '。未覆盖过程不推断无问题。');
    }
  }
  if (captured.omitted.length && evaluation.limitations.length < 30) evaluation.limitations.push(`快照未包含 ${captured.omitted.length} 个超出预算、非普通文件或不可读取的文件；未据此确认其实现。`);
  return { evaluation, partial };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const root = process.cwd();
    const input = readReviewJson(root, 'review-input.json');
    const files = readReviewJson(root, 'review-files.json', Infinity);
    const assessed = finalizeAssessment(root, {
      files, process: input.process, packages: input.basis.packages, omitted: [],
      history: input.history?.version === 2 ? { index: readReviewJson(root, input.history.path, Infinity) } : undefined,
    }, input.basis, true);
    console.log(JSON.stringify({ valid: true, partial: assessed.partial,
      modules: assessed.evaluation.modules.length,
      historyCoverage: assessed.evaluation.historyCoverage,
      note: 'Draft contract and captured evidence validated; not a semantic review or publication verdict.' }));
  } catch (error) {
    console.error(JSON.stringify({ valid: false, error: String(error.message).slice(0, 2000) }));
    process.exitCode = 1;
  }
}
