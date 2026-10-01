import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  FilePreviewDialog,
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
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

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

it('leaves the loading state when the document viewer stalls', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(new Uint8Array([1, 2, 3]))),
  );
  // A viewer whose parse never resolves is what the bounded load wait exists
  // for: the dialog must surface a real failure instead of spinning forever.
  viewer.load.mockReset().mockReturnValue(new Promise<void>(() => {}));
  render(
    <FilePreviewDialog files={[file('docx')]} open onOpenChange={vi.fn()} />,
  );

  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(screen.getByRole('status')).toHaveTextContent('Loading preview');

  await act(async () => {
    await vi.advanceTimersByTimeAsync(20_000);
  });

  expect(viewer.destroy).toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent(/took too long/i);
});
