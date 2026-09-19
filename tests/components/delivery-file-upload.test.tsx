import { ApiClientError } from '@nocobase/app-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const uploadDeliveryFile = vi.hoisted(() => vi.fn());

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
  NamespaceScope: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@nocobase/app-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nocobase/app-client')>();
  return { ...actual, useApiClient: () => ({ request: vi.fn() }) };
});
vi.mock('@/lib/delivery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/delivery')>();
  return { ...actual, uploadDeliveryFile };
});

import { DeliveryFileUpload } from '../../client/components/delivery/file-upload.js';

function selectFile(container: HTMLElement, file: File): void {
  const input = container.querySelector<HTMLInputElement>('input[type=file]');
  if (!input) throw new Error('file input not found');
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  fireEvent.change(input);
}

/**
 * The transport rejects an oversized body with a 413 before the route runs.
 * The progress line must be replaced by the reason, otherwise a failed upload
 * looks like one that never finished.
 */
describe('delivery file upload failure prompt', () => {
  beforeEach(() => {
    uploadDeliveryFile.mockReset();
  });

  it('replaces the progress line with the server reason when an upload fails', async () => {
    uploadDeliveryFile.mockRejectedValue(
      new ApiClientError('Upload request body is too large.', {
        status: 413,
        payload: { code: 'FILE_TOO_LARGE', message: '文件超过 5 MB 限制。' },
      }),
    );

    const { container } = render(
      <DeliveryFileUpload onUploaded={() => undefined} />,
    );
    selectFile(
      container,
      new File([new Uint8Array(4)], 'big5mb.txt', { type: 'text/plain' }),
    );

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        '文件超过 5 MB 限制。',
      ),
    );
    expect(
      screen.queryByText(/delivery\.file\.uploading/),
    ).not.toBeInTheDocument();
  });

  /**
   * "Cancel upload" must actually stop the request: the button is only useful
   * if aborting ends the transfer, leaves no partial version behind and tells
   * the user what happened.
   */
  it('aborts the in-flight upload and reports the cancellation', async () => {
    const onUploaded = vi.fn();
    let signal: AbortSignal | undefined;
    uploadDeliveryFile.mockImplementation(
      (_api: unknown, _file: File, abortSignal?: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal = abortSignal;
          abortSignal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );

    const { container } = render(
      <DeliveryFileUpload onUploaded={onUploaded} />,
    );
    selectFile(
      container,
      new File([new Uint8Array(8)], 'report.txt', { type: 'text/plain' }),
    );

    fireEvent.click(await screen.findByText('delivery.file.cancel'));

    await waitFor(() => expect(signal?.aborted).toBe(true));
    await waitFor(() =>
      expect(screen.getByText('delivery.file.cancelled')).toBeInTheDocument(),
    );
    expect(onUploaded).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
