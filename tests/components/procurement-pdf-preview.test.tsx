import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {} as Record<string, unknown>,
  getDocument: (...args: unknown[]) => mocks.getDocument(...args),
}));

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: '/assets/pdf.worker.mjs',
}));

import { PdfPreview } from '../../client/components/procurement/pdf-preview.js';

interface FakePage {
  getViewport: (input: { scale: number }) => { width: number; height: number };
  render: () => { promise: Promise<void>; cancel: () => void };
}

function fakeDocument(pageCount: number) {
  const pages: FakePage[] = Array.from({ length: pageCount }, () => ({
    getViewport: ({ scale }) => ({ width: 600 * scale, height: 800 * scale }),
    render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
  }));
  return {
    numPages: pageCount,
    getPage: vi.fn(async (pageNumber: number) => pages[pageNumber - 1]),
    destroy: vi.fn(async () => undefined),
  };
}

describe('PdfPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('draws every page onto a canvas inside the app', async () => {
    mocks.getDocument.mockReturnValue({
      promise: Promise.resolve(fakeDocument(2)),
    });

    const { container } = render(
      <PdfPreview data={new Uint8Array([1, 2, 3])} filename='quote.pdf' />,
    );

    await waitFor(() => {
      expect(container.querySelectorAll('canvas')).toHaveLength(2);
    });
    const canvases = container.querySelectorAll('canvas');
    expect(canvases[0]).toHaveAttribute('role', 'img');
    expect(canvases[0]).toHaveAttribute('aria-label', 'quote.pdf 1');
    expect(canvases[1]).toHaveAttribute('aria-label', 'quote.pdf 2');
    // The browser's own PDF viewer (object/embed/iframe) must never be used.
    expect(container.querySelector('object')).toBeNull();
    expect(container.querySelector('embed')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('reports a localized error when the document cannot be read', async () => {
    mocks.getDocument.mockReturnValue({
      promise: Promise.reject(new Error('broken')),
    });

    render(<PdfPreview data={new Uint8Array([1])} filename='quote.pdf' />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'procurement.attachment.previewFailed',
    );
  });
});
