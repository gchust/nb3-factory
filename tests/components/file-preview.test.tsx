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
import { buildDocx } from '../fixtures/docx';

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

it('reports a damaged image instead of leaving its filename as the preview', async () => {
  render(
    <FilePreviewDialog
      files={[{ ...file('png'), mimeType: 'image/png' }]}
      open
      onOpenChange={vi.fn()}
    />,
  );
  // A PNG that decodes to nothing fires `error` on the img; the filename alone must not look like a success.
  const image = await screen.findByRole('img', { name: 'attachment.png' });
  fireEvent.error(image);
  expect(
    await screen.findByText('Unable to load the file preview.'),
  ).toBeInTheDocument();
  expect(viewer.load).not.toHaveBeenCalled();
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

// The vendor viewer parses in a module worker. A worker that starts and then goes silent leaves
// `load()` pending forever, which is the hang this suite guards: the dialog must not sit on its
// loading state and must not let the filename count as a preview. The viewer also transfers the
// DOCX to that worker, detaching the caller's buffer, so the fallback has to read its own copy.
it('shows the document text when the DOCX viewer never settles', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi
      .fn<typeof fetch>()
      // Stored rather than deflated so the fallback resolves on microtasks, without depending on
      // the native `DecompressionStream` finishing before fake timers advance.
      .mockResolvedValue(new Response(buildDocx('Factory DOCX sample', 0))),
  );
  viewer.load.mockImplementation((data) => {
    // Reproduce the worker transfer: the received ArrayBuffer is detached here.
    structuredClone(data, { transfer: [data] });
    return new Promise<void>(() => {});
  });

  render(
    <FilePreviewDialog files={[file('docx')]} open onOpenChange={vi.fn()} />,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20_000);
  });

  expect(screen.getByText('Factory DOCX sample')).toBeInTheDocument();
  expect(document.querySelector('[data-office-open-xml-text]')).not.toBeNull();
  expect(viewer.destroy).toHaveBeenCalled();
});

it('explains a DOCX that cannot be read as text instead of loading forever', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(new Uint8Array([1, 2, 3]))),
  );
  viewer.load.mockReturnValue(new Promise<void>(() => {}));

  render(
    <FilePreviewDialog files={[file('docx')]} open onOpenChange={vi.fn()} />,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20_000);
  });

  expect(screen.getByRole('alert')).toHaveTextContent(
    'Unable to render this Office Open XML file.',
  );
  expect(screen.queryByText('Loading preview...')).not.toBeInTheDocument();
});
