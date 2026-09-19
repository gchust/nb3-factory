import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getDocument = vi.hoisted(() => vi.fn());

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
  NamespaceScope: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {} as { workerSrc?: string },
  getDocument,
}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: 'pdf.worker.min.mjs',
}));

import { PdfPreview } from '../../client/components/delivery/pdf-preview.js';

function stubPdf(numPages: number): void {
  getDocument.mockReturnValue({
    promise: Promise.resolve({
      numPages,
      getPage: async () => ({
        getViewport: () => ({ width: 200, height: 200 }),
        render: () => ({ promise: Promise.resolve() }),
      }),
    }),
    destroy: async () => undefined,
  });
}

/**
 * Headless browsers have no built-in PDF viewer, so the previous
 * `<iframe src="….pdf">` rendered nothing and left the page context lost.
 * The dialog now paints the pages with pdf.js; these tests pin that contract.
 */
describe('PdfPreview', () => {
  beforeEach(() => {
    getDocument.mockReset();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: () => undefined,
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches the protected URL and paints a canvas per page', async () => {
    stubPdf(2);

    const { container } = render(
      <PdfPreview
        filename='spec.pdf'
        url='/main/uploads/delivery-files/f1.pdf'
      />,
    );

    await waitFor(() =>
      expect(container.querySelectorAll('canvas')).toHaveLength(2),
    );
    expect(getDocument).toHaveBeenCalledWith({
      url: '/main/uploads/delivery-files/f1.pdf',
      withCredentials: true,
    });
    expect(screen.queryByText('delivery.file.pdfLoading')).toBeNull();
    expect(screen.queryByText('delivery.file.previewFailed')).toBeNull();
  });

  it('shows a readable reason instead of a blank frame when the document cannot be read', async () => {
    getDocument.mockReturnValue({
      promise: Promise.reject(new Error('Invalid PDF structure')),
      destroy: async () => undefined,
    });

    render(<PdfPreview filename='broken.pdf' url='/main/uploads/broken.pdf' />);

    await waitFor(() =>
      expect(
        screen.getByText('delivery.file.previewFailed'),
      ).toBeInTheDocument(),
    );
  });
});
