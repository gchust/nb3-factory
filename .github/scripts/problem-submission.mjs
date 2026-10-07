// TestManage owns issue storage; the factory owns deciding what problems to submit.
// This is a projection of existing QA/review evidence, never another model call.
import { createHash } from 'node:crypto';
import { validateFeedbackReview } from './feedback-review.mjs';
import { isFrameworkFinding } from '../reports/framework-overview.mjs';
const digest = parts => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const normalized = value => value.trim().replace(/\s+/g, ' ').toLowerCase();
// TestManage3 problems.ts validates JavaScript string length (UTF-16 code units).
export const MAX_PROBLEM_DESCRIPTION_CHARS = 100000;
const descriptionSeparator = '\n\n关联发现：\n';
const excerptNotice = '\n\n受接收端长度限制，摘要或证据已节选；原文和完整证据见完整报告同名发现。';
const sourceNotice = '\n\n原文和完整证据见完整报告同名发现。';

function safePrefix(value, maximum) {
  let end = Math.max(0, maximum);
  // Never leave half of a supplementary Unicode character at the cut boundary.
  if (end < value.length && /[\uD800-\uDBFF]/.test(value[end - 1] ?? '') && /[\uDC00-\uDFFF]/.test(value[end])) end--;
  return value.slice(0, end);
}
const diagnosisCategories = new Set(['runtime-defect', 'capability-gap', 'guidance-gap', 'usability-improvement']);

// Confirmation of a runtime defect is separate from support for a useful suggestion.
// Unknown processing status and old findings without semantic review remain visible
// in the full report; neither is silently promoted to a formal problem.
function submittable(finding, evidence) {
  if (finding.kind === 'strength' || !isFrameworkFinding(finding) || finding.reviewerStatus !== 'open' ||
      finding.feedbackReview?.status !== 'supported' || !diagnosisCategories.has(finding.diagnosis?.category) ||
      (finding.diagnosis.category === 'runtime-defect' && finding.confidence !== 'confirmed')) return false;
  // Imported or replayed DTOs must meet the same structural support guarantee as
  // the original review, not merely claim the supported enum value.
  try { validateFeedbackReview(finding.feedbackReview, evidence, finding); return true; }
  catch { return false; }
}

function descriptionOf(finding, evidenceById, maximum) {
  const diagnosis = finding.diagnosis, review = finding.feedbackReview;
  const identity = `原始评审：${finding.id}\nkind=${finding.kind}; owner=${finding.owner}; confidence=${finding.confidence}; reviewerStatus=${finding.reviewerStatus}`;
  // Reserve space for citations. Even a large merged group keeps a short summary
  // of each diagnosis/check before any long evidence list can consume its share.
  const fieldLimit = Math.max(1, Math.min(2000, Math.floor((maximum * 0.7 - identity.length - 600) / 15)));
  let shortened = false;
  const summary = value => {
    const text = String(value ?? '');
    if (text.length <= fieldLimit) return text;
    shortened = true;
    return `${safePrefix(text, fieldLimit - 1)}…`;
  };
  const evidenceIds = [...new Set([...(finding.evidence ?? []), ...review.checks.flatMap(check => check.evidence)])];
  const citations = evidenceIds.map(id => {
    const item = evidenceById.get(id);
    const checks = review.checks.filter(check => check.evidence.includes(id)).map(check => check.kind);
    const context = checks.length ? ` | checks:${checks.join(',')}` : '';
    if (!item) return `- ${id}${context}（见完整报告）`;
    const lines = item.lines?.length ? `:${item.lines.join('-')}` : '';
    // Observations/excerpts remain in the report, not repeated once per citation.
    return `- ${id} | ${item.path}${lines}${item.sha256 ? ` | sha256:${item.sha256}` : ''}${context}`;
  });
  const body = [
    identity,
    `诊断类别：${diagnosis.category}\n触发条件：${summary(diagnosis.trigger)}\n预期：${summary(diagnosis.expected)}\n实际：${summary(diagnosis.actual)}\n绕行方式：${summary(diagnosis.workaround)}\n建议验收：${summary(diagnosis.acceptance)}`,
    `反馈核验：${review.status}（证据支持，不代表人工确认）\n${summary(review.reason)}`,
    ...review.checks.map(check => `核验 ${check.kind}：${summary(check.reason)}`),
    ...new Set([finding.detail, finding.impact, finding.suggestedChange].filter(Boolean).map(summary)),
    `证据出处（check 对应关系随引用列出）：\n${citations.join('\n')}`,
  ].join('\n\n');
  const notice = shortened || body.length + sourceNotice.length > maximum ? excerptNotice : sourceNotice;
  return safePrefix(body, maximum - notice.length) + safePrefix(notice, maximum);
}

// Same case naming as the independent review: a preset names the task, otherwise its Issue.
const caseIdOf = report => report.run.case?.presetIssueNumber ? `preset-${report.run.case.presetIssueNumber}` : `issue-${report.run.task.issue}`;

// Only NocoBase3 problems leave the factory: the owners the framework findings page counts.
// Application, factory, environment and unknown-owner findings, and failed QA criteria no
// finding attributes, stay in the factory report.
export function problemSubmission(report) {
  const problems = new Map();
  const findingsByKey = new Map();
  if (report.type !== 'evaluation-report') return { version: 1, problems: [] };
  const prefix = [report.source.instance, report.run.key];
  const evidenceById = new Map((report.evidence ?? []).map(item => [item.id, item]));
  // The same task built again (a daily preset rerun, another /build) is a new run
  // with new keys; the fingerprint lets TestManage merge its problems into the ones
  // the task already reported. Separate tasks never share a fingerprint.
  const taskKey = caseIdOf(report), casePrefix = [report.source.instance, taskKey];
  for (const review of report.reviews.filter(r => r.selected)) {
    for (const finding of review.findings) {
      if (!submittable(finding, report.evidence ?? [])) continue;
      const subjectKeys = [...new Set(finding.subjectKeys)].sort();
      const identity = [finding.kind, finding.owner, subjectKeys, normalized(finding.title)];
      const key = digest([...prefix, ...identity]);
      if (problems.has(key)) {
        const problem = problems.get(key);
        problem.findingIds.push(finding.id);
        findingsByKey.get(key).push(finding);
        continue;
      }
      findingsByKey.set(key, [finding]);
      problems.set(key, { key, taskKey, fingerprint: digest([...casePrefix, ...identity]), title: finding.title, description: '', subjectKeys, findingIds: [finding.id] });
    }
  }
  for (const [key, problem] of problems) {
    const findings = findingsByKey.get(key);
    const share = Math.floor((MAX_PROBLEM_DESCRIPTION_CHARS - descriptionSeparator.length * (findings.length - 1)) / findings.length);
    problem.description = findings.map(finding => descriptionOf(finding, evidenceById, share)).join(descriptionSeparator);
    // This guard applies after deduplication, including groups larger than the
    // ordinary validated-report bounds, without ever splitting a surrogate pair.
    if (problem.description.length > MAX_PROBLEM_DESCRIPTION_CHARS)
      problem.description = safePrefix(problem.description, MAX_PROBLEM_DESCRIPTION_CHARS - excerptNotice.length) + excerptNotice;
  }
  return { version: 1, problems: [...problems.values()] };
}
