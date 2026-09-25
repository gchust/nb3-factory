import { problemSubmission } from './problem-submission.mjs';

// The versioned Pages archive remains the owner of HTML and screenshots.
// Send structured metadata and selected problems, never inline attachment bytes.
export function reportLinkSubmission(document) {
  const [owner, repository] = document.source.instance.split('/');
  const archive = document.type === 'evaluation-report' ? document.links.find(link => link.rel === 'report-archive') : undefined;
  const pathname = archive?.path;
  if (pathname && (!pathname.startsWith('reports/') || pathname.split('/').some(part => part === '..' || part === '.') || /[?#%\\]/.test(pathname))) {
    throw new Error('Report archive path is invalid');
  }
  const reportUrl = pathname ? new URL(pathname, `https://${owner}.github.io/${repository}/`).href : null;
  if (document.type === 'evaluation-report' && !reportUrl) throw new Error('Report has no immutable HTML archive link');
  return { version: 1, document, reportUrl, problems: problemSubmission(document).problems };
}
