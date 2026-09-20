import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/**
 * The pdf.js worker asset URL.
 *
 * Kept in its own module so the Vite-specific `?url` import has exactly one
 * home and the preview component can be tested with this module mocked.
 */
export default workerUrl;
