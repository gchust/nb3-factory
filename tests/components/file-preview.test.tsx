import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import locales from '../../client/locales/index.js';
import { FilePreviewContent } from '../../client/extensions/nocobase-file-component-ui/components/previewers/file-preview-content.js';
import {
  resolveFilePreviewKind,
  type FilePreviewKind,
} from '../../client/extensions/nocobase-file-component-ui/lib/file-preview.js';
import type { FileRecord } from '../../client/extensions/nocobase-file-component-ui/types.js';

const pdfMocks = vi.hoisted(() => {
  const render = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }));
  const getPage = vi.fn(async () => ({
    getViewport: ({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 800 * scale,
    }),
    render,
  }));
  const destroy = vi.fn();
  const getDocument = vi.fn(() => ({
    promise: Promise.resolve({ numPages: 3, getPage, destroy }),
  }));
  return { getDocument, getPage, render, destroy };
});

vi.mock(
  '../../client/extensions/nocobase-file-component-ui/lib/pdfjs.js',
  () => ({
    pdfjs: {
      getDocument: pdfMocks.getDocument,
      GlobalWorkerOptions: { workerSrc: '' },
    },
  }),
);

async function runtime() {
  const value = new I18nRuntime({
    applicationNamespace: 'app',
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
  });
  value.registerApplicationNamespace('app', locales);
  await value.init('en-US');
  return value;
}

function record(
  filename: string,
  mimeType: string,
  contentUrl = `/uploads/rental-files/id.${filename.split('.').pop()}`,
): FileRecord {
  return {
    id: 'id',
    disk: 'local',
    key: 'objects/id',
    filename,
    ext: filename.split('.').pop() ?? '',
    mimeType,
    size: 1024,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    contentUrl,
  } as FileRecord;
}

async function renderContent(
  file: FileRecord,
  kind: FilePreviewKind,
  extra: { url?: string; text?: string; onDownload?: () => void } = {},
) {
  const value = await runtime();
  return render(
    <I18nProvider runtime={value}>
      <FilePreviewContent file={file} kind={kind} {...extra} />
    </I18nProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('file preview rendering', () => {
  it('classifies image, PDF, text and unsupported files', () => {
    expect(resolveFilePreviewKind(record('photo.png', 'image/png'))).toBe(
      'image',
    );
    expect(
      resolveFilePreviewKind(record('agreement.pdf', 'application/pdf')),
    ).toBe('pdf');
    expect(resolveFilePreviewKind(record('notes.txt', 'text/plain'))).toBe(
      'text',
    );
    expect(
      resolveFilePreviewKind(record('archive.zip', 'application/zip')),
    ).toBe('unsupported');
  });

  it('renders image bytes, not just a file name', async () => {
    const file = record(
      'photo.png',
      'image/png',
      '/uploads/rental-files/a.png',
    );
    await renderContent(file, 'image', { url: file.contentUrl });

    const image = screen.getByRole('img', { name: 'photo.png' });
    expect(image).toHaveAttribute('src', '/uploads/rental-files/a.png');
  });

  it('draws a multi-page PDF in-app and pages through it', async () => {
    const fetchBytes = vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(8),
    }));
    vi.stubGlobal('fetch', fetchBytes);
    const file = record('agreement.pdf', 'application/pdf');
    await renderContent(file, 'pdf', { url: 'blob:preview' });

    // The first page is rendered from real PDF bytes, not a frame or a name.
    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument();
    expect(pdfMocks.getDocument).toHaveBeenCalledTimes(1);
    const canvas = screen.getByRole('img', { name: 'agreement.pdf' });
    expect(canvas.tagName).toBe('CANVAS');
    expect((canvas as HTMLCanvasElement).width).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: 'Previous page' }),
    ).toBeDisabled();

    // Paging forward asks pdf.js for the next page of the same document.
    const documentCount = pdfMocks.getDocument.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument();
    expect(pdfMocks.getPage).toHaveBeenLastCalledWith(2);
    expect(pdfMocks.getDocument).toHaveBeenCalledTimes(documentCount);
  });

  it('offers a download when the PDF cannot be displayed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500 })),
    );
    const onDownload = vi.fn();
    const file = record('agreement.pdf', 'application/pdf');
    await renderContent(file, 'pdf', { url: 'blob:preview', onDownload });

    expect(
      await screen.findByText(
        'The PDF could not be displayed in the app. You can download it instead.',
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Download the PDF' }));
    expect(onDownload).toHaveBeenCalledTimes(1);
    // No blank preview surface is left behind.
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('shows text content directly', async () => {
    const file = record('notes.txt', 'text/plain');
    await renderContent(file, 'text', {
      url: file.contentUrl,
      text: '租赁补充说明：布置时间 30 分钟。',
    });

    expect(
      screen.getByText('租赁补充说明：布置时间 30 分钟。'),
    ).toBeInTheDocument();
  });

  it('explains an unsupported format and offers a download instead of a blank frame', async () => {
    const file = record('archive.zip', 'application/zip');
    const onDownload = vi.fn();
    await renderContent(file, 'unsupported', { onDownload });

    expect(
      screen.getByText('Preview is unavailable for this file type.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Download file' }),
    ).toBeInTheDocument();
    // No empty preview surface is left behind.
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByTitle('archive.zip')).toBeNull();
  });
});
