import { act } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  FilePreviewDialog,
  type FileRecord,
} from '../../client/extensions/nocobase-file-component-ui/index';

const viewer = vi.hoisted(() => ({
  load: vi.fn<(data: ArrayBuffer) => Promise<void>>(),
  destroy: vi.fn(),
  options: [] as Record<string, unknown>[],
}));

vi.mock('@silurus/ooxml/docx', () => ({
  DocxScrollViewer: class {
    load = viewer.load;
    destroy = viewer.destroy;
    constructor(_host: unknown, options: Record<string, unknown>) {
      viewer.options.push(options);
    }
  },
}));
vi.mock('@silurus/ooxml/xlsx', () => ({
  XlsxViewer: class {
    load = viewer.load;
    destroy = viewer.destroy;
    constructor(_host: unknown, options: Record<string, unknown>) {
      viewer.options.push(options);
    }
  },
}));
vi.mock('@silurus/ooxml/pptx', () => ({
  PptxScrollViewer: class {
    load = viewer.load;
    destroy = viewer.destroy;
    constructor(_host: unknown, options: Record<string, unknown>) {
      viewer.options.push(options);
    }
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
  viewer.options.length = 0;
});
afterEach(() => vi.unstubAllGlobals());

function stubContentFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([1]))),
  );
}

it('reports a stalled viewer instead of loading forever', async () => {
  vi.useFakeTimers();
  try {
    stubContentFetch();
    // The parser worker never answers and never raises an error: `load()` stays pending for good.
    viewer.load.mockReturnValue(new Promise<void>(() => undefined));
    render(
      <FilePreviewDialog files={[file('docx')]} open onOpenChange={vi.fn()} />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(viewer.load).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent('Loading preview...');

    // The first attempt is bounded and retried once, because a dropped worker handshake is transient.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(viewer.load).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status')).toHaveTextContent('Loading preview...');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      /took too long to load/,
    );
    expect(screen.queryByRole('status')).toBeNull();
    expect(viewer.destroy).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});

it('replaces the loading state when the viewer reports a failure', async () => {
  vi.useFakeTimers();
  try {
    stubContentFetch();
    // The viewer reports the failure through its own error callback rather than by rejecting.
    viewer.load.mockReturnValue(new Promise<void>(() => undefined));
    render(
      <FilePreviewDialog files={[file('docx')]} open onOpenChange={vi.fn()} />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(viewer.options).toHaveLength(1);

    // The first failure is retried; only the second one is surfaced to the user.
    await act(async () => {
      (viewer.options[0]!.onError as (error: Error) => void)(
        new Error('parse failed'),
      );
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(viewer.options).toHaveLength(2);

    await act(async () => {
      (viewer.options[1]!.onError as (error: Error) => void)(
        new Error('parse failed'),
      );
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unable to render this Office Open XML file.',
    );
    expect(screen.queryByRole('status')).toBeNull();
    expect(viewer.destroy).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});

it('keeps a rendered document when the viewer reports an error after load', async () => {
  stubContentFetch();
  viewer.load.mockResolvedValue(undefined);
  render(
    <FilePreviewDialog files={[file('docx')]} open onOpenChange={vi.fn()} />,
  );

  // The document is on screen once `load()` resolves and the loading overlay is gone.
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  expect(
    document.querySelector('[data-office-open-xml-format="docx"]'),
  ).not.toBeNull();

  // With progressive layout the viewer keeps laying pages out after `load()` resolved and
  // reports a later failure through `onError`. That must not throw away the document the user
  // is already reading, which is how a valid DOCX ended up as "Unable to render...".
  await act(async () => {
    (viewer.options[0]!.onError as (error: Error) => void)(
      new Error('background layout failed'),
    );
  });

  expect(screen.queryByRole('alert')).toBeNull();
  expect(
    document.querySelector('[data-office-open-xml-format="docx"]'),
  ).not.toBeNull();
  expect(viewer.destroy).not.toHaveBeenCalled();
});

it('tells the reader when a file named .png cannot be shown as an image', async () => {
  stubContentFetch();
  const png: FileRecord = { ...file('png'), mimeType: 'image/png' };
  render(<FilePreviewDialog files={[png]} open onOpenChange={vi.fn()} />);

  // The preview image is the one that is not the thumbnail in the fallback.
  const image = document.querySelector('img:not([data-slot])');
  expect(image).not.toBeNull();

  // A `.png` name is not proof of a decodable image; a broken decode must say so instead of
  // leaving an empty frame the reader mistakes for a successful preview.
  fireEvent.error(image!);

  expect(
    screen.getByText(
      'This image could not be displayed. The file may be corrupt or not a real image.',
    ),
  ).not.toBeNull();
  expect(document.querySelector('img:not([data-slot])')).toBeNull();
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
