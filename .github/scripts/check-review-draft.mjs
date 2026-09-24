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
      if (excerpt !== null && /^[\s{}\[\],:;()]*$/u.test(excerpt))
        throw new Error(`Evidence ${evidence.id} must select substantive lines: ${evidence.path}`);
      return { id: evidence.id, kind: evidence.kind, path: evidence.path, observation: evidence.observation,
        ...(evidence.kind === 'screenshot' ? {} : { lines: evidence.lines, excerpt }), sha256: file.sha256,
      };
    }),
  };
}

export function finalizeAssessment(snapshot, captured, basis, finished) {
  const raw = readReviewJson(snapshot, 'assessment.json');
  validateEvaluation(raw, basis.inputHash, captured.files, basis.rubricVersion);
  const partial = !finished || raw.progress?.complete === false;
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
  if (captured.omitted.length && evaluation.limitations.length < 30) evaluation.limitations.push(`快照未包含 ${captured.omitted.length} 个超出预算、非普通文件或不可读取的文件；未据此确认其实现。`);
  return { evaluation, partial };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const root = process.cwd();
    const input = readReviewJson(root, 'review-input.json');
    const files = readReviewJson(root, 'review-files.json');
    const assessed = finalizeAssessment(root, {
      files, process: input.process, packages: input.basis.packages, omitted: [],
    }, input.basis, true);
    console.log(JSON.stringify({ valid: true, partial: assessed.partial,
      modules: assessed.evaluation.modules.length,
      note: 'Draft contract and captured evidence validated; not a semantic review or publication verdict.' }));
  } catch (error) {
    console.error(JSON.stringify({ valid: false, error: String(error.message).slice(0, 2000) }));
    process.exitCode = 1;
  }
}
