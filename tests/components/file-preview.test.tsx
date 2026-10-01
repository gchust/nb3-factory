import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
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

it('explains an image that cannot be displayed instead of showing the filename alone', async () => {
  render(
    <FilePreviewDialog
      files={[{ ...file('png'), mimeType: 'image/png' }]}
      open
      onOpenChange={vi.fn()}
    />,
  );
  const image = screen.getByAltText('attachment.png');
  fireEvent.error(image);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    /could not be displayed/i,
  );
});

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

// A parser Worker that dies silently leaves `viewer.load()` pending. With `workerTimeoutMs` the library rejects it as
// "no layout progress", but the preinstalled dialog used to await it forever and never call `onError`, so it sat on
// "Loading preview...". The fix retries once with a fresh viewer before falling back to an explanation.
it('retries an Office Open XML preview whose parser worker went silent', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(new Uint8Array([1, 2, 3]))),
  );
  viewer.load
    .mockRejectedValueOnce(
      new Error('worker layout produced no progress for 10000ms'),
    )
    .mockResolvedValueOnce(undefined);
  render(
    <FilePreviewDialog files={[file('docx')]} open onOpenChange={vi.fn()} />,
  );
  await waitFor(() => expect(viewer.load).toHaveBeenCalledTimes(2));
  // The stalled viewer is torn down so its parser Worker cannot keep running behind the retry.
  expect(viewer.destroy).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('alert')).toBeNull();
});

// Even a viewer that never settles at all — no rejection, no watchdog — must not leave the dialog spinning forever.
it('explains an Office Open XML preview that stays stuck after a retry', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(new Uint8Array([1, 2, 3]))),
  );
  viewer.load.mockImplementation(() => new Promise<void>(() => {}));
  render(
    <FilePreviewDialog files={[file('docx')]} open onOpenChange={vi.fn()} />,
  );
  await act(async () => {
    // Past the last-resort bound on each of the two attempts.
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(viewer.load).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('alert')).toHaveTextContent(
    /Unable to render this Office Open XML file/i,
  );
  expect(screen.queryByRole('status')).toBeNull();
});
