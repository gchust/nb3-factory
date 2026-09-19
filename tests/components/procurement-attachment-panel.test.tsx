import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listAttachments: vi.fn(),
  attachFiles: vi.fn(),
  removeAttachment: vi.fn(),
  uploadMany: vi.fn(),
}));

const pdfMocks = vi.hoisted(() => ({ getDocument: vi.fn() }));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {} as Record<string, unknown>,
  getDocument: (...args: unknown[]) => pdfMocks.getDocument(...args),
}));

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: '/assets/pdf.worker.mjs',
}));

const i18nMocks = vi.hoisted(() => ({
  t: (key: string, options?: Record<string, unknown>) =>
    options ? `${key} ${JSON.stringify(options)}` : key,
}));

const clientMocks = vi.hoisted(() => ({ api: {} }));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: i18nMocks.t }),
}));

vi.mock('@nocobase/app-client', () => ({
  useApiClient: () => clientMocks.api,
  useService: () => ({ repository: () => ({ uploadMany: mocks.uploadMany }) }),
}));

vi.mock('@nocobase/app-plugin-file/client', () => ({
  clientFileRepositoryManagerToken: Symbol('file-repository'),
}));

vi.mock('../../client/components/procurement/api.js', () => ({
  attachFiles: (...args: unknown[]) => mocks.attachFiles(...args),
  errorCode: () => undefined,
  listAttachments: (...args: unknown[]) => mocks.listAttachments(...args),
  removeAttachment: (...args: unknown[]) => mocks.removeAttachment(...args),
}));

import { AttachmentPanel } from '../../client/components/procurement/attachment-panel.js';

const ATTACHMENT = {
  id: 1,
  fileId: 'file-1',
  targetType: 'order' as const,
  targetId: 7,
  category: 'quotation' as const,
  uploadedById: 'buyer1',
  uploadedByName: 'buyer1',
  createdAt: '2026-09-10T02:00:00.000Z',
  filename: 'quote.pdf',
  ext: 'pdf',
  mimeType: 'application/pdf',
  size: 1024,
  contentUrl: '/main/uploads/procurement-files/file-1.pdf',
  canWrite: true,
};

function renderPanel(
  props: Partial<Parameters<typeof AttachmentPanel>[0]> = {},
) {
  return render(
    <AttachmentPanel
      category='quotation'
      targetId={7}
      targetType='order'
      title='Quotations'
      {...props}
    />,
  );
}

describe('AttachmentPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listAttachments.mockResolvedValue({ canWrite: true, items: [] });
    mocks.attachFiles.mockResolvedValue({ canWrite: true, items: [] });
  });

  it('lists an attachment with its size, uploader and time', async () => {
    mocks.listAttachments.mockResolvedValue({
      canWrite: true,
      items: [ATTACHMENT],
    });
    renderPanel();

    expect(await screen.findByText('quote.pdf')).toBeInTheDocument();
    expect(screen.getByText(/1\.0 KB/)).toBeInTheDocument();
    expect(screen.getByText(/buyer1/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /procurement.attachment.download/ }),
    ).toHaveAttribute('href', ATTACHMENT.contentUrl);
  });

  it('renders only attachments of its own category', async () => {
    const contract = {
      ...ATTACHMENT,
      id: 2,
      category: 'contract' as const,
      filename: 'contract.pdf',
      contentUrl: '/main/uploads/procurement-files/file-2.pdf',
    };
    mocks.listAttachments.mockResolvedValue({
      canWrite: true,
      items: [ATTACHMENT, contract],
    });
    renderPanel();

    expect(await screen.findByText('quote.pdf')).toBeInTheDocument();
    expect(screen.queryByText('contract.pdf')).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: /procurement.attachment.download/ }),
    ).toHaveLength(1);
  });

  it('refuses more than five files without uploading anything', async () => {
    renderPanel();
    await screen.findByText('procurement.attachment.empty');
    const input = screen.getByLabelText('procurement.attachment.selectFiles');

    const files = Array.from(
      { length: 6 },
      (_, index) =>
        new File(['x'], `f${index}.pdf`, { type: 'application/pdf' }),
    );
    await userEvent.upload(input, files);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'procurement.attachment.tooMany',
    );
    expect(mocks.uploadMany).not.toHaveBeenCalled();
  });

  it('names an oversized file and does not upload it', async () => {
    renderPanel();
    await screen.findByText('procurement.attachment.empty');
    const input = screen.getByLabelText('procurement.attachment.selectFiles');

    const oversized = new File(['x'], 'big.pdf', { type: 'application/pdf' });
    Object.defineProperty(oversized, 'size', { value: 6 * 1024 * 1024 });
    await userEvent.upload(input, oversized);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('procurement.attachment.tooLarge');
    expect(alert).toHaveTextContent('big.pdf');
    expect(mocks.uploadMany).not.toHaveBeenCalled();
  });

  it('uploads and links a valid selection', async () => {
    mocks.uploadMany.mockResolvedValue({ records: [{ id: 'file-9' }] });
    renderPanel();
    await screen.findByText('procurement.attachment.empty');
    const input = screen.getByLabelText('procurement.attachment.selectFiles');

    await userEvent.upload(
      input,
      new File(['x'], 'a.pdf', { type: 'application/pdf' }),
    );

    await waitFor(() => {
      expect(mocks.uploadMany).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(mocks.attachFiles).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          targetType: 'order',
          targetId: 7,
          category: 'quotation',
          fileIds: ['file-9'],
        }),
      );
    });
  });

  it('locks the write controls as soon as the owning document is read-only', async () => {
    mocks.listAttachments.mockResolvedValue({
      canWrite: true,
      items: [ATTACHMENT],
    });
    renderPanel({ readOnly: true });

    expect(await screen.findByText('quote.pdf')).toBeInTheDocument();
    expect(
      screen.getByLabelText('procurement.attachment.selectFiles'),
    ).toBeDisabled();
    expect(
      screen.queryByRole('button', {
        name: /procurement.attachment.remove/,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('procurement.attachment.readOnly'),
    ).toBeInTheDocument();
  });

  it('re-reads write permission when the document revision changes', async () => {
    mocks.listAttachments.mockResolvedValue({
      canWrite: true,
      items: [ATTACHMENT],
    });
    const view = renderPanel({ revision: 'draft' });
    await screen.findByText('quote.pdf');
    expect(
      screen.getByLabelText('procurement.attachment.selectFiles'),
    ).not.toBeDisabled();
    const callsBefore = mocks.listAttachments.mock.calls.length;

    mocks.listAttachments.mockResolvedValue({
      canWrite: false,
      items: [ATTACHMENT],
    });
    view.rerender(
      <AttachmentPanel
        category='quotation'
        revision='submitted'
        targetId={7}
        targetType='order'
        title='Quotations'
      />,
    );

    await waitFor(() => {
      expect(mocks.listAttachments.mock.calls.length).toBeGreaterThan(
        callsBefore,
      );
    });
    await waitFor(() => {
      expect(
        screen.getByLabelText('procurement.attachment.selectFiles'),
      ).toBeDisabled();
    });
  });

  it('lets the user cancel an in-progress upload and says nothing was saved', async () => {
    mocks.uploadMany.mockImplementation(
      (_input: unknown, options?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    renderPanel();
    await screen.findByText('procurement.attachment.empty');
    const input = screen.getByLabelText('procurement.attachment.selectFiles');

    await userEvent.upload(
      input,
      new File(['x'], 'a.pdf', { type: 'application/pdf' }),
    );

    const cancel = await screen.findByRole('button', {
      name: 'procurement.attachment.cancelUpload',
    });
    await userEvent.click(cancel);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'procurement.attachment.canceled',
    );
    expect(mocks.attachFiles).not.toHaveBeenCalled();
  });

  it('keeps the upload failure reason even when the follow-up listing fails', async () => {
    mocks.uploadMany.mockRejectedValue(new TypeError('Failed to fetch'));
    renderPanel();
    await screen.findByText('procurement.attachment.empty');
    // Only the reload that follows the failed upload is unavailable.
    mocks.listAttachments.mockRejectedValue(new Error('list unavailable'));
    const input = screen.getByLabelText('procurement.attachment.selectFiles');

    await userEvent.upload(
      input,
      new File(['x'], 'a.pdf', { type: 'application/pdf' }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('procurement.attachment.networkFailed');
    expect(alert).not.toHaveTextContent('procurement.attachment.loadFailed');
  });

  it('explains a permission failure instead of a generic preview error', async () => {
    const text = {
      ...ATTACHMENT,
      id: 5,
      filename: 'note.txt',
      ext: 'txt',
      mimeType: 'text/plain',
      contentUrl: '/main/uploads/procurement-files/file-5.txt',
    };
    mocks.listAttachments.mockResolvedValue({ canWrite: true, items: [text] });
    const fetchMock = vi.fn(async () => ({ ok: false, status: 403 }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      renderPanel();
      const view = await screen.findByRole('button', {
        name: /procurement.attachment.view/,
      });
      await userEvent.click(view);

      expect(
        await screen.findByText('procurement.attachment.previewForbidden'),
      ).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('renders a PDF through the in-app viewer, not the browser plugin', async () => {
    mocks.listAttachments.mockResolvedValue({
      canWrite: true,
      items: [ATTACHMENT],
    });
    pdfMocks.getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: vi.fn(async () => ({
          getViewport: ({ scale }: { scale: number }) => ({
            width: 600 * scale,
            height: 800 * scale,
          }),
          render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
        })),
        destroy: vi.fn(async () => undefined),
      }),
    });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      renderPanel();
      const view = await screen.findByRole('button', {
        name: /procurement.attachment.view/,
      });
      await userEvent.click(view);

      await waitFor(() => {
        expect(document.querySelector('canvas')).not.toBeNull();
      });
      expect(document.querySelector('object')).toBeNull();
      expect(fetchMock).toHaveBeenCalledWith(
        ATTACHMENT.contentUrl,
        expect.objectContaining({ credentials: 'include' }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
