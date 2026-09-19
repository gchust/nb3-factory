import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PdfPreview } from '../../client/components/inspection/pdf-preview.js';
import locales from '../../client/locales/index.js';

const hoisted = vi.hoisted(() => {
  const render = vi.fn(() => ({ promise: Promise.resolve() }));
  const getPage = vi.fn(async () => ({
    getViewport: () => ({ width: 120, height: 160 }),
    render,
  }));
  const destroy = vi.fn(async () => undefined);
  const getDocument = vi.fn(() => ({
    promise: Promise.resolve({ numPages: 2, getPage }),
    destroy,
  }));
  return { render, getPage, destroy, getDocument };
});

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: hoisted.getDocument,
}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: 'pdf.worker.min.mjs',
}));

async function runtime(): Promise<I18nRuntime> {
  const value = new I18nRuntime({
    applicationNamespace: 'app',
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
  });
  value.registerApplicationNamespace('app', locales);
  await value.init('en-US');
  return value;
}

function renderPreview(runtimeValue: I18nRuntime) {
  return render(
    <I18nProvider runtime={runtimeValue}>
      <PdfPreview fileId='file-1' filename='manual.pdf' />
    </I18nProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(new ArrayBuffer(16), {
          status: 200,
          headers: { 'content-type': 'application/pdf' },
        }),
    ),
  );
  // jsdom implements no canvas backend; the component only needs a context object.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as unknown as CanvasRenderingContext2D,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  hoisted.getDocument.mockClear();
  hoisted.getPage.mockClear();
  hoisted.render.mockClear();
});

describe('PDF preview', () => {
  it('downloads the file with credentials and draws every page to a canvas', async () => {
    const value = await runtime();
    const { container } = renderPreview(value);

    await waitFor(() => {
      expect(container.querySelectorAll('canvas')).toHaveLength(2);
    });

    expect(container.querySelector('iframe')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init).toMatchObject({ credentials: 'include' });
    expect(hoisted.render).toHaveBeenCalledTimes(2);
  });

  it('reports a readable error instead of a blank page when the file cannot be read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 403 })),
    );
    const value = await runtime();
    const { container } = renderPreview(value);

    expect(
      await screen.findByText('Could not load the file content.'),
    ).toBeVisible();
    expect(container.querySelectorAll('canvas')).toHaveLength(0);
  });
});
