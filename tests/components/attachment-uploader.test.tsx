import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import locales from '../../client/locales/index.js';
import { AttachmentUploader } from '../../client/components/attachments/attachment-uploader.js';

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

function repository(options: {
  readonly uploadOne?: (input: { file: File }) => Promise<unknown>;
}) {
  return {
    uploadOne: vi.fn(options.uploadOne ?? (async () => ({ record: {} }))),
    uploadMany: vi.fn(),
  };
}

async function renderUploader(props: {
  readonly repository: ReturnType<typeof repository>;
  readonly onFiles: (ids: readonly string[]) => Promise<void>;
  readonly onError?: (error: Error) => void;
  readonly maxSize?: number;
  readonly maxFiles?: number;
}) {
  const value = await runtime();
  return render(
    <I18nProvider runtime={value}>
      <AttachmentUploader
        maxFiles={props.maxFiles}
        maxSize={props.maxSize}
        multiple
        onError={props.onError}
        onFiles={props.onFiles}
        repository={props.repository as never}
      />
    </I18nProvider>,
  );
}

function select(input: HTMLElement, files: readonly File[]): void {
  fireEvent.change(input, { target: { files } });
}

describe('AttachmentUploader', () => {
  it('links uploaded file ids only after the save request succeeds', async () => {
    const upload = repository({
      uploadOne: async () => ({
        record: {
          id: 'file-1',
          disk: 'local',
          key: 'objects/file-1',
          filename: 'photo.png',
          ext: 'png',
          mimeType: 'image/png',
          size: 10,
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      }),
    });
    const onFiles = vi.fn(async () => undefined);
    await renderUploader({ repository: upload, onFiles });

    select(screen.getByLabelText('Choose files'), [
      new File(['hello'], 'photo.png', { type: 'image/png' }),
    ]);

    await waitFor(() => expect(onFiles).toHaveBeenCalledWith(['file-1']));
    expect(upload.uploadOne).toHaveBeenCalledTimes(1);
  });

  it('shows a clear failure and never a saved file when linking fails', async () => {
    const upload = repository({
      uploadOne: async () => ({
        record: {
          id: 'file-2',
          disk: 'local',
          key: 'objects/file-2',
          filename: 'photo.png',
          ext: 'png',
          mimeType: 'image/png',
          size: 10,
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      }),
    });
    const onFiles = vi.fn(async () => {
      throw new Error('The server rejected the link.');
    });
    await renderUploader({ repository: upload, onFiles });

    select(screen.getByLabelText('Choose files'), [
      new File(['hello'], 'photo.png', { type: 'image/png' }),
    ]);

    expect(
      await screen.findByText('The server rejected the link.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Done')).toBeNull();
  });

  it('rejects an empty file before it reaches the repository', async () => {
    const upload = repository({});
    const onFiles = vi.fn(async () => undefined);
    await renderUploader({ repository: upload, onFiles });

    select(screen.getByLabelText('Choose files'), [
      new File([], 'empty.png', { type: 'image/png' }),
    ]);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'This file is empty. Choose a file with content.',
    );
    expect(upload.uploadOne).not.toHaveBeenCalled();
    expect(onFiles).not.toHaveBeenCalled();
    // The failed selection is never shown as a saved file.
    expect(screen.queryByText('Done')).toBeNull();
  });

  it('rejects an oversized file before it reaches the repository', async () => {
    const upload = repository({});
    const onFiles = vi.fn(async () => undefined);
    await renderUploader({ repository: upload, onFiles, maxSize: 4 });

    select(screen.getByLabelText('Choose files'), [
      new File(['12345'], 'big.png', { type: 'image/png' }),
    ]);

    expect((await screen.findByRole('alert')).textContent).toMatch(
      /maximum size|too large/i,
    );
    expect(upload.uploadOne).not.toHaveBeenCalled();
    expect(onFiles).not.toHaveBeenCalled();
    expect(screen.queryByText('Done')).toBeNull();
  });
});
