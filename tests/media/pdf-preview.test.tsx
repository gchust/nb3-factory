// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The preview dialog's job for a PDF is to put the pages in this document. It must never point a
// frame element at PDF bytes: the browser this application is verified in has no PDF viewer
// plugin, and a frame pointed at a PDF takes the whole tab to about:blank instead of rendering.
const pdf = vi.hoisted(() => ({
  document: {
    numPages: 2,
    getPage: vi.fn(async () => ({
      getViewport: ({ scale }: { scale: number }) => ({
        width: 600 * scale,
        height: 800 * scale,
      }),
      render: () => ({ promise: Promise.resolve() }),
    })),
    destroy: vi.fn(async () => undefined),
  },
}));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(() => ({ promise: Promise.resolve(pdf.document) })),
}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: 'pdf.worker.min.mjs',
}));

import { FilePreviewContent } from '../../client/extensions/nocobase-file-component-ui/components/previewers/file-preview-content.js';
import { resolveFilePreviewKind } from '../../client/extensions/nocobase-file-component-ui/lib/file-preview.js';

const file = {
  id: 'file-1',
  disk: 'local',
  key: 'file-1',
  filename: 'report.pdf',
  ext: '.pdf',
  mimeType: 'application/pdf',
  size: 1024,
  contentUrl: '/main/uploads/media/file-1.pdf',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PDF preview', () => {
  it('resolves a PDF to the canvas preview rather than a frame', () => {
    expect(resolveFilePreviewKind(file)).toBe('pdf');
  });

  it('draws the pages onto canvases and never renders a frame element', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
          status: 200,
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(
      <FilePreviewContent
        file={file}
        kind='pdf'
        url='/main/uploads/media/file-1.pdf'
      />,
    );

    await waitFor(() => {
      expect(container.querySelectorAll('canvas').length).toBe(2);
    });

    expect(container.querySelectorAll('iframe, embed, object').length).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith(
      '/main/uploads/media/file-1.pdf',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('reports a failure instead of leaving the preview blank', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 403 })),
    );

    const { container } = render(
      <FilePreviewContent
        file={file}
        kind='pdf'
        url='/main/uploads/media/file-1.pdf'
      />,
    );

    await waitFor(() => {
      expect(container.querySelector("[role='alert']")).not.toBeNull();
    });
    expect(container.querySelectorAll('canvas').length).toBe(0);
  });
});
