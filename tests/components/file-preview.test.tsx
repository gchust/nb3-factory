import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  FilePreviewDialog,
  FileThumbnail,
  type FileRecord,
} from '../../client/extensions/nocobase-file-component-ui/index';

const viewer = vi.hoisted(() => ({
  load: vi.fn<(data: ArrayBuffer) => Promise<void>>(),
  destroy: vi.fn(),
}));

vi.mock('@silurus/ooxml/docx', () => ({
  DocxScrollViewer: class {
    load = viewer.load;
    destroy = viewer.destroy;
  },
}));
vi.mock('@silurus/ooxml/xlsx', () => ({
  XlsxViewer: class {
    load = viewer.load;
    destroy = viewer.destroy;
  },
}));
vi.mock('@silurus/ooxml/pptx', () => ({
  PptxScrollViewer: class {
    load = viewer.load;
    destroy = viewer.destroy;
  },
}));

function file(ext: string): FileRecord {
  return {
    id: 'attachment',
    filename: `attachment.${ext}`,
    ext,
    mimeType: 'application/octet-stream',
    size: 3,
    createdAt: '2026-09-20T00:00:00.000Z',
    updatedAt: '2026-09-20T00:00:00.000Z',
    contentUrl: `/main/expense-files/attachment.${ext}`,
  };
}

beforeEach(() => {
  viewer.load.mockReset().mockResolvedValue(undefined);
  viewer.destroy.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

it.each(['docx', 'xlsx', 'pptx'])(
  'preinstalled preview fetches private %s content for the local viewer',
  async (ext) => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal('fetch', fetchMock);
    const { unmount } = render(
      <FilePreviewDialog files={[file(ext)]} open onOpenChange={vi.fn()} />,
    );
    await waitFor(() => expect(viewer.load).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      `/main/expense-files/attachment.${ext}`,
      {
        credentials: 'same-origin',
        signal: expect.any(AbortSignal),
      },
    );
    expect(new Uint8Array(viewer.load.mock.calls[0]![0])).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(
      document.querySelector(`[data-office-open-xml-format="${ext}"]`),
    ).not.toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
    unmount();
    expect(viewer.destroy).toHaveBeenCalledOnce();
  },
);

it('shows the denied content response without trying a third-party viewer', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 403 })),
  );
  render(
    <FilePreviewDialog
      files={[file('docx')]}
      open
      onOpenChange={vi.fn()}
      download={false}
    />,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('403');
  expect(viewer.load).not.toHaveBeenCalled();
  expect(document.querySelector('iframe')).toBeNull();
  expect(screen.queryByRole('button', { name: /Download/ })).toBeNull();
});

it('reports an image the browser cannot decode', async () => {
  render(
    <FilePreviewDialog
      files={[{ ...file('png'), mimeType: 'image/png' }]}
      open
      onOpenChange={vi.fn()}
      download={false}
    />,
  );

  const image = document.querySelector('img');
  expect(image).not.toBeNull();
  // The server accepts these bytes; only the browser's decode attempt reveals
  // the file is corrupt, so the feedback is triggered by the load failure.
  fireEvent.error(image!);

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(/corrupted/i);
  expect(document.querySelector('img')).toBeNull();
});

it('falls back to the file type icon when a thumbnail image cannot decode', async () => {
  render(<FileThumbnail file={{ ...file('png'), mimeType: 'image/png' }} />);

  const image = document.querySelector('img');
  expect(image).not.toBeNull();
  fireEvent.error(image!);

  await waitFor(() => expect(document.querySelector('img')).toBeNull());
  expect(
    document.querySelector('[data-slot="file-thumbnail"]'),
  ).toHaveAttribute('aria-label', 'attachment.png');
});
