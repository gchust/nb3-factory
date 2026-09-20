// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getPage = vi.fn(async (page: number) => ({
  getViewport: () => ({ width: 600, height: 800 }),
  render: () => ({ promise: Promise.resolve() }),
  page,
}));
const destroy = vi.fn(async () => undefined);
const getDocument = vi.fn(() => ({
  promise: Promise.resolve({ numPages: 2, getPage, destroy }),
}));
const GlobalWorkerOptions = { workerSrc: '' };

vi.mock('pdfjs-dist', () => ({
  getDocument: (...args: unknown[]) =>
    (getDocument as (...a: unknown[]) => unknown)(...args),
  GlobalWorkerOptions,
}));
vi.mock(
  '../../client/extensions/nocobase-file-component-ui/lib/pdf-worker-url.js',
  () => ({ default: 'pdf.worker.mjs' }),
);

import { PdfPreview } from '../../client/extensions/nocobase-file-component-ui/components/previewers/pdf-preview.js';

afterEach(() => {
  vi.clearAllMocks();
});

/**
 * PDF preview must really show content. The previous implementation embedded
 * the PDF in an iframe, which delegated to a native viewer that headless
 * browsers may not have and could blank the whole page. These tests pin the
 * canvas-rendering contract: every page is drawn and each one is labelled.
 */
describe('PdfPreview', () => {
  it('renders every page of a multi-page PDF onto a canvas', async () => {
    const { container } = render(
      <PdfPreview url='blob:pdf-bytes' filename='resume.pdf' />,
    );

    await waitFor(() => {
      expect(container.querySelectorAll('canvas')).toHaveLength(2);
    });
    const canvases = container.querySelectorAll('canvas');
    expect(canvases[0]?.dataset.page).toBe('1');
    expect(canvases[1]?.dataset.page).toBe('2');
    expect(container.querySelectorAll('figcaption')).toHaveLength(2);
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('offers a download instead of a blank frame when rendering fails', async () => {
    getDocument.mockReturnValueOnce({
      promise: Promise.reject(new Error('worker unavailable')),
    } as never);
    const onDownload = vi.fn();

    const { container } = render(
      <PdfPreview
        url='blob:pdf-bytes'
        filename='resume.pdf'
        onDownload={onDownload}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(container.querySelectorAll('canvas')).toHaveLength(0);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
