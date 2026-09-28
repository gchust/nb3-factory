// TestManage owns issue storage; the factory owns deciding what problems to submit.
// This is a projection of existing QA/review evidence, never another model call.
import { createHash } from 'node:crypto';
import { isFrameworkFinding } from '../reports/framework-overview.mjs';
const digest = parts => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const normalized = value => value.trim().replace(/\s+/g, ' ').toLowerCase();

// Only NocoBase3 problems leave the factory: the owners the framework findings page counts.
// Application, factory, environment and unknown-owner findings, and failed QA criteria no
// finding attributes, stay in the factory report.
export function problemSubmission(report) {
  const problems = new Map();
  if (report.type !== 'evaluation-report') return { version: 1, problems: [] };
  const prefix = [report.source.instance, report.run.key];
  for (const review of report.reviews.filter(r => r.selected)) {
    for (const finding of review.findings) {
      if (finding.kind === 'strength' || !isFrameworkFinding(finding) || ['resolved', 'not-applicable'].includes(finding.reviewerStatus)) continue;
      const subjectKeys = [...new Set(finding.subjectKeys)].sort();
      const key = digest([...prefix, finding.kind, finding.owner, subjectKeys, normalized(finding.title)]);
      if (problems.has(key)) { problems.get(key).findingIds.push(finding.id); continue; }
      problems.set(key, { key, title: finding.title, description: [...new Set([finding.detail, finding.impact, finding.suggestedChange].filter(Boolean))].join('\n\n'), subjectKeys, findingIds: [finding.id] });
    }
  }
  return { version: 1, problems: [...problems.values()] };
}
