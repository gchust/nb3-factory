import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// The worker is served from this application's own origin instead of relying
// on the browser's bundled PDF viewer. An asset URL rather than a blob keeps
// the worker usable under a strict Content-Security-Policy, and it is also the
// URL pdf.js falls back to if module workers are unavailable.
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export { pdfjs };
