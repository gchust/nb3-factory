// TestManage owns issue storage; the factory owns deciding what problems to submit.
// This is a projection of existing QA/review evidence, never another model call.
import { createHash } from 'node:crypto';
const digest = parts => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const normalized = value => value.trim().replace(/\s+/g, ' ').toLowerCase();

export function problemSubmission(report) {
  const problems = new Map();
  if (report.type !== 'evaluation-report') return { version: 1, problems: [] };
  const prefix = [report.source.instance, report.run.key];
  for (const review of report.reviews.filter(r => r.selected)) {
    for (const finding of review.findings) {
      if (finding.kind === 'strength' || ['resolved', 'not-applicable'].includes(finding.reviewerStatus)) continue;
      const subjectKeys = [...new Set(finding.subjectKeys)].sort();
      const key = digest([...prefix, finding.kind, finding.owner, subjectKeys, normalized(finding.title)]);
      if (problems.has(key)) { problems.get(key).findingIds.push(finding.id); continue; }
      problems.set(key, { key, title: finding.title, description: [...new Set([finding.detail, finding.impact, finding.suggestedChange].filter(Boolean))].join('\n\n'), subjectKeys, findingIds: [finding.id] });
    }
  }
  if (!report.reviews.some(r => r.selected && r.findings.some(f => f.kind !== 'strength'))) {
    for (const criterion of report.qa.criteria.filter(c => c.finalFull === 'failed')) {
      const key = digest([...prefix, 'qa', criterion.id]);
      problems.set(key, { key, title: criterion.text, description: criterion.text, subjectKeys: [], findingIds: [], qaCriterionId: criterion.id });
    }
  }
  return { version: 1, problems: [...problems.values()] };
}
