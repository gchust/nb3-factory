import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// The uploader is rendered without the application's i18n runtime, so translate to the key and keep the assertions
// about behavior rather than wording.
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));

import { DocumentUploader } from '../../client/components/document-library/uploader.js';
import {
  FALLBACK_CAPABILITIES,
  type DocumentCapabilities,
  type DocumentRecord,
} from '../../client/components/document-library/types.js';

const capabilities: DocumentCapabilities = {
  ...FALLBACK_CAPABILITIES,
  canUpload: true,
  limits: { maxFileBytes: 100, maxBatchBytes: 150, maxFiles: 2 },
};

function pdf(name: string, size = 10): File {
  const file = new File(['x'], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function setup() {
  const request = vi.fn(async () => ({
    data: [
      {
        id: 'doc-1',
        filename: 'a.pdf',
        ext: 'pdf',
        mimeType: 'application/pdf',
        size: 10,
        contentUrl: '/uploads/documents/doc-1.pdf',
      } as unknown as DocumentRecord,
    ],
  }));
  const onUploaded = vi.fn();
  render(
    <DocumentUploader
      api={{ request } as never}
      capabilities={capabilities}
      onUploaded={onUploaded}
    />,
  );
  const input = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  return { request, onUploaded, input };
}

describe('DocumentUploader', () => {
  it('refuses more files than the batch allows without calling the server', async () => {
    const user = userEvent.setup();
    const { request, input } = setup();

    await user.upload(input, [pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf')]);
    await user.click(
      screen.getByRole('button', { name: 'documents.upload.submit' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'documents.errors.TOO_MANY_FILES',
    );
    expect(request).not.toHaveBeenCalled();
  });

  it('refuses a file type outside the whitelist', async () => {
    // `applyAccept: false` so the file reaches the component: the input's `accept` attribute would otherwise drop
    // it before the component's own validation (and the server's) could refuse it.
    const user = userEvent.setup({ applyAccept: false });
    const { request, input } = setup();

    await user.upload(
      input,
      new File(['MZ'], 'payload.exe', { type: 'application/octet-stream' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'documents.upload.submit' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'documents.errors.UNSUPPORTED_TYPE',
    );
    expect(request).not.toHaveBeenCalled();
  });

  it('refuses a single file above the single-file limit', async () => {
    const user = userEvent.setup();
    const { request, input } = setup();

    await user.upload(input, [pdf('big.pdf', 101)]);
    await user.click(
      screen.getByRole('button', { name: 'documents.upload.submit' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'documents.errors.FILE_TOO_LARGE',
    );
    expect(request).not.toHaveBeenCalled();
  });

  it('uploads a valid batch and reports the registered records', async () => {
    const user = userEvent.setup();
    const { request, onUploaded, input } = setup();

    await user.upload(input, [pdf('a.pdf', 10), pdf('b.pdf', 20)]);
    await user.click(
      screen.getByRole('button', { name: 'documents.upload.submit' }),
    );

    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    const call = request.mock.calls[0] as unknown as [
      { path: string; method: string; body: FormData },
    ];
    expect(call[0].path).toBe('/document-library/upload');
    expect(call[0].method).toBe('POST');
    const body = call[0].body;
    expect(body.getAll('file')).toHaveLength(2);
    expect(body.get('discipline')).toBe('architecture');
    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText('documents.upload.success'),
    ).toBeInTheDocument();
  });
});
