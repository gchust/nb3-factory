import { problemSubmission } from './problem-submission.mjs';

// A feature point decision the receiver applies only to still-unclassified problems.
export function validProblemClassification(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join() === 'featurePointId,method,reason' &&
    (value.featurePointId === null || (Number.isSafeInteger(value.featurePointId) && value.featurePointId > 0)) &&
    ['rule', 'model'].includes(value.method) && typeof value.reason === 'string' && value.reason.trim().length > 0 && value.reason.length <= 1000;
}

// classification.json from the delivery classify job → plan item id → { problem key → decision }.
export function classificationsByItem(value) {
  if (value?.version !== 1 || !Array.isArray(value.items)) throw new Error('Invalid problem classification file');
  const items = new Map();
  for (const item of value.items) {
    if (typeof item?.id !== 'string' || !item.problems || typeof item.problems !== 'object' || items.has(item.id)) throw new Error('Invalid problem classification item');
    for (const [key, decision] of Object.entries(item.problems))
      if (!/^[a-f0-9]{64}$/.test(key) || !validProblemClassification(decision)) throw new Error('Invalid problem classification decision');
    items.set(item.id, item.problems);
  }
  return items;
}

// The versioned Pages archive remains the owner of HTML and screenshots.
// Send structured metadata and selected problems, never inline attachment bytes.
export function reportLinkSubmission(document, classifications = {}) {
  const [owner, repository] = document.source.instance.split('/');
  const archive = document.type === 'evaluation-report' ? document.links.find(link => link.rel === 'report-archive') : undefined;
  const pathname = archive?.path;
  if (pathname && (!pathname.startsWith('reports/') || pathname.split('/').some(part => part === '..' || part === '.') || /[?#%\\]/.test(pathname))) {
    throw new Error('Report archive path is invalid');
  }
  const reportUrl = pathname ? new URL(pathname, `https://${owner}.github.io/${repository}/`).href : null;
  if (document.type === 'evaluation-report' && !reportUrl) throw new Error('Report has no immutable HTML archive link');
  const problems = problemSubmission(document).problems.map(problem =>
    Object.hasOwn(classifications, problem.key) ? { ...problem, classification: classifications[problem.key] } : problem);
  return { version: 1, document, reportUrl, problems };
}
