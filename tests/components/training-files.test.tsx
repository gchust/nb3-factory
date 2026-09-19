import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  downloadAttachment,
  formatFileSize,
  previewKind,
} from '../../client/pages/training/file-utils.js';
import {
  AttachmentList,
  AttachmentUploader,
  FilePreviewDialog,
} from '../../client/pages/training/files.js';
import { FILE_MAX_SIZE } from '../../client/pages/training/types.js';

const uploadMany = vi.fn();
const deleteOne = vi.fn();

vi.mock('@nocobase/app-client', () => ({
  useService: () => ({
    repository: () => ({ uploadMany, deleteOne }),
  }),
}));

vi.mock('@nocobase/app-plugin-file/client', () => ({
  clientFileRepositoryManagerToken: 'file-repository-manager',
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'zh-CN' },
  }),
}));

function attachment(overrides: {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size?: number;
}) {
  return {
    id: overrides.id,
    filename: overrides.filename,
    ext: overrides.ext,
    mimeType: overrides.mimeType,
    size: overrides.size ?? 1024,
    contentUrl: `/uploads/training/${overrides.id}.${overrides.ext}`,
    uploadedById: 'student-user',
    createdAt: '2026-09-19T00:00:00.000Z',
  };
}

describe('training file helpers', () => {
  it('classifies files by the preview they can actually render', () => {
    expect(previewKind({ ext: 'png', mimeType: 'image/png' })).toBe('image');
    expect(previewKind({ ext: 'pdf', mimeType: 'application/pdf' })).toBe(
      'pdf',
    );
    expect(previewKind({ ext: 'txt', mimeType: 'text/plain' })).toBe('text');
    expect(previewKind({ ext: 'md', mimeType: 'text/markdown' })).toBe('text');
    expect(previewKind({ ext: 'zip', mimeType: 'application/zip' })).toBe(
      'unsupported',
    );
    // SVG must never be treated as an inline image.
    expect(previewKind({ ext: 'svg', mimeType: 'image/svg+xml' })).toBe(
      'unsupported',
    );
  });

  it('formats a stored size for the interface', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('downloads through a same-origin link carrying the stored address', () => {
    const clicked: HTMLAnchorElement[] = [];
    const original = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function click(
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    };
    try {
      downloadAttachment(
        attachment({
          id: 'aaaa',
          filename: '报告.txt',
          ext: 'txt',
          mimeType: 'text/plain',
        }),
      );
    } finally {
      HTMLAnchorElement.prototype.click = original;
    }
    expect(clicked).toHaveLength(1);
    expect(clicked[0]?.getAttribute('href')).toBe('/uploads/training/aaaa.txt');
    expect(clicked[0]?.getAttribute('download')).toBe('报告.txt');
  });
});

describe('attachment list', () => {
  it('offers preview and download for each stored file', () => {
    render(
      <AttachmentList
        files={[
          attachment({
            id: 'aaaa',
            filename: '课件.png',
            ext: 'png',
            mimeType: 'image/png',
          }),
        ]}
      />,
    );
    expect(screen.getByText('课件.png')).toBeTruthy();
    expect(screen.getByText('training.files.preview')).toBeTruthy();
    expect(screen.getByText('training.files.download')).toBeTruthy();
  });

  it('explains an unsupported format and still offers the download', async () => {
    render(
      <FilePreviewDialog
        files={[
          attachment({
            id: 'bbbb',
            filename: '资料.zip',
            ext: 'zip',
            mimeType: 'application/zip',
          }),
        ]}
        open
        initialIndex={0}
        onOpenChange={() => undefined}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('training.files.unsupported')).toBeTruthy();
    });
    // The unsupported branch must not be an empty frame: a download is present.
    expect(
      screen.getAllByText('training.files.download').length,
    ).toBeGreaterThan(0);
  });
});

describe('attachment uploader', () => {
  beforeEach(() => {
    uploadMany.mockReset();
    deleteOne.mockReset();
  });

  function fileInput(): HTMLInputElement {
    const input = document.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('no file input');
    return input;
  }

  it('refuses a file larger than the limit without uploading', async () => {
    render(<AttachmentUploader value={[]} onChange={() => undefined} />);
    const oversized = new File(
      [new Uint8Array(FILE_MAX_SIZE + 1)],
      'huge.pdf',
      { type: 'application/pdf' },
    );
    await userEvent.upload(fileInput(), oversized);
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain(
        'training.files.tooLarge',
      );
    });
    expect(uploadMany).not.toHaveBeenCalled();
  });

  it('refuses an empty file without uploading', async () => {
    render(<AttachmentUploader value={[]} onChange={() => undefined} />);
    await userEvent.upload(
      fileInput(),
      new File([], 'empty.txt', { type: 'text/plain' }),
    );
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain(
        'training.files.emptyFile',
      );
    });
    expect(uploadMany).not.toHaveBeenCalled();
  });

  it('uploads small files and reports them to the form', async () => {
    const onChange = vi.fn();
    uploadMany.mockResolvedValue({
      createdCount: 1,
      records: [
        {
          id: 'cccc',
          disk: 'local',
          key: 'k',
          filename: 'notes.txt',
          ext: 'txt',
          mimeType: 'text/plain',
          size: 12,
          createdAt: '2026-09-19T00:00:00.000Z',
          updatedAt: '2026-09-19T00:00:00.000Z',
          contentUrl: '/uploads/training/cccc.txt',
        },
      ],
    });
    render(<AttachmentUploader value={[]} onChange={onChange} />);
    await userEvent.upload(
      fileInput(),
      new File(['hello world!'], 'notes.txt', { type: 'text/plain' }),
    );
    await waitFor(() => {
      expect(uploadMany).toHaveBeenCalledTimes(1);
    });
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'cccc', filename: 'notes.txt' }),
    ]);
  });
});
