import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import locales from '../../client/locales/index.js';
import type { MaterialFileDto } from '../../client/pages/library/api.js';
import { clampPage } from '../../client/pages/library/pdf-pages.js';
import { PdfPreview } from '../../client/pages/library/pdf-preview.js';

/**
 * Stands in for PDF.js. `numPages` and `fail` drive the two interesting outcomes, and `pages`
 * records which page numbers the viewer actually asked to render so the test can prove the
 * controls change pages. `options` proves the viewer loads the fetched bytes rather than a URL.
 */
const pdf = vi.hoisted(() => ({
  pages: [] as number[],
  options: null as Record<string, unknown> | null,
  numPages: 3,
  fail: false,
}));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: (options: Record<string, unknown>) => {
    pdf.options = options;
    return {
      promise: pdf.fail
        ? Promise.reject(new Error('load failed'))
        : Promise.resolve({
            numPages: pdf.numPages,
            destroy: () => Promise.resolve(),
            getPage: (page: number) => {
              pdf.pages.push(page);
              return Promise.resolve({
                getViewport: ({ scale }: { scale: number }) => ({
                  width: 400 * scale,
                  height: 300 * scale,
                }),
                render: () => ({
                  promise: Promise.resolve(),
                  cancel: () => {},
                }),
              });
            },
          }),
    };
  },
}));

const file: MaterialFileDto = {
  id: 'file-1',
  filename: 'manual.pdf',
  ext: 'pdf',
  mimeType: 'application/pdf',
  size: 2048,
  role: 'attachment',
  uploaderId: null,
  uploaderName: null,
  createdAt: '2026-09-20T00:00:00.000Z',
  previewKind: 'pdf',
};

async function renderViewer(): Promise<HTMLElement> {
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: 'test-app',
  });
  runtime.registerApplicationNamespace('test-app', locales);
  await runtime.init('en-US');
  const { container } = render(
    <I18nProvider runtime={runtime}>
      <PdfPreview file={file} />
    </I18nProvider>,
  );
  return container;
}

describe('clampPage', () => {
  it('keeps a requested page inside the document', () => {
    expect(clampPage(0, 3)).toBe(1);
    expect(clampPage(-4, 3)).toBe(1);
    expect(clampPage(2, 3)).toBe(2);
    expect(clampPage(9, 3)).toBe(3);
  });

  it('is stable when the page count is unknown', () => {
    expect(clampPage(5, 0)).toBe(1);
    expect(clampPage(Number.NaN, 3)).toBe(1);
  });
});

describe('PdfPreview', () => {
  beforeEach(() => {
    pdf.pages.length = 0;
    pdf.options = null;
    pdf.numPages = 3;
    pdf.fail = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(16),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('paints the first page in the page and turns to the next one in place', async () => {
    const container = await renderViewer();

    expect(await screen.findByText('Page 1 of 3')).toBeVisible();
    expect(screen.getByRole('img', { name: 'manual.pdf' })).toBeVisible();
    // The bytes are handed to the renderer; the viewer never navigates to the file URL.
    expect(pdf.options?.data).toBeInstanceOf(Uint8Array);
    expect(container.querySelector('iframe')).toBeNull();
    expect(
      container.querySelector('a[href*="/api/library/files/"]'),
    ).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));

    expect(await screen.findByText('Page 2 of 3')).toBeVisible();
    expect(pdf.pages).toEqual([1, 2]);
  });

  it('disables the controls at the first and last page', async () => {
    await renderViewer();
    await screen.findByText('Page 1 of 3');

    expect(
      screen.getByRole('button', { name: 'Previous page' }),
    ).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText('Page 2 of 3');
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText('Page 3 of 3');

    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled();

    await userEvent.click(
      screen.getByRole('button', { name: 'Previous page' }),
    );
    expect(await screen.findByText('Page 2 of 3')).toBeVisible();
  });

  it('shows a clear error instead of a blank area when the file cannot be read', async () => {
    pdf.fail = true;
    await renderViewer();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to load the preview.',
    );
    expect(screen.queryByRole('img')).toBeNull();
  });
});
