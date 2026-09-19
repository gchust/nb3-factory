import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ExpenseFileView } from '../../client/pages/expenses/api.js';
import {
  fileExtension,
  formatFileSize,
  isUploadAllowed,
  resolvePreviewKind,
  resolveSafeFileUrl,
  withFeedbackFloor,
} from '../../client/pages/expenses/files/file-utils.js';

function file(
  overrides: Partial<ExpenseFileView> & {
    filename: string;
    mimeType: string;
  },
): ExpenseFileView {
  return {
    id: 'f-1',
    ext: fileExtension(overrides.filename).replace('.', ''),
    size: 1024,
    createdAt: '2026-08-01T00:00:00.000Z',
    contentUrl: '/main/expense-files/f-1',
    ...overrides,
  };
}

describe('expense file preview helpers', () => {
  it('classifies the file types the workflow supports', () => {
    expect(
      resolvePreviewKind(file({ filename: 'a.png', mimeType: 'image/png' })),
    ).toBe('image');
    expect(
      resolvePreviewKind(
        file({ filename: 'a.pdf', mimeType: 'application/pdf' }),
      ),
    ).toBe('pdf');
    expect(
      resolvePreviewKind(file({ filename: 'a.txt', mimeType: 'text/plain' })),
    ).toBe('text');
    expect(
      resolvePreviewKind(file({ filename: 'a.md', mimeType: 'text/markdown' })),
    ).toBe('markdown');
  });

  it('falls back to download for active or unrenderable content', () => {
    expect(
      resolvePreviewKind(
        file({ filename: 'a.svg', mimeType: 'image/svg+xml' }),
      ),
    ).toBe('unsupported');
    expect(
      resolvePreviewKind(file({ filename: 'a.html', mimeType: 'text/html' })),
    ).toBe('unsupported');
    expect(
      resolvePreviewKind(
        file({
          filename: 'a.docx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
      ),
    ).toBe('unsupported');
  });

  it('only allows http(s) and locally created object URLs', () => {
    expect(resolveSafeFileUrl('/main/expense-files/f-1.png')).toBe(
      '/main/expense-files/f-1.png',
    );
    expect(resolveSafeFileUrl('blob:http://localhost/abc')).toBe(
      'blob:http://localhost/abc',
    );
    expect(resolveSafeFileUrl('javascript:alert(1)')).toBeUndefined();
    expect(resolveSafeFileUrl('data:text/html,<b>x</b>')).toBeUndefined();
    expect(resolveSafeFileUrl('')).toBeUndefined();
  });

  it('formats sizes for display', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('accepts documents that cannot be previewed so they can be downloaded', () => {
    const rules = ['image/*', 'application/pdf', 'text/*', '.docx', '.zip'];
    expect(isUploadAllowed({ name: 'a.png', type: 'image/png' }, rules)).toBe(
      true,
    );
    expect(
      isUploadAllowed({ name: 'a.pdf', type: 'application/pdf' }, rules),
    ).toBe(true);
    expect(isUploadAllowed({ name: 'a.csv', type: 'text/csv' }, rules)).toBe(
      true,
    );
    expect(
      isUploadAllowed(
        {
          name: 'a.docx',
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
        rules,
      ),
    ).toBe(true);
    expect(
      isUploadAllowed({ name: 'a.zip', type: 'application/zip' }, rules),
    ).toBe(true);
  });

  it('blocks executable and active content even under a broad rule', () => {
    const rules = ['image/*', 'text/*'];
    expect(
      isUploadAllowed(
        { name: 'payload.exe', type: 'application/octet-stream' },
        rules,
      ),
    ).toBe(false);
    expect(
      isUploadAllowed({ name: 'page.html', type: 'text/html' }, rules),
    ).toBe(false);
    expect(
      isUploadAllowed({ name: 'vector.svg', type: 'image/svg+xml' }, rules),
    ).toBe(false);
    expect(
      isUploadAllowed({ name: 'script.js', type: 'text/javascript' }, rules),
    ).toBe(false);
  });
});

describe('upload feedback floor', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps a fast upload visible until the floor elapses', async () => {
    vi.useFakeTimers();
    let settled = false;
    const promise = withFeedbackFloor(async () => 'saved', 800).then(
      (value) => {
        settled = true;
        return value;
      },
    );
    // Flush the microtask that starts the (instant) upload and the floor timer.
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(800);
    await expect(promise).resolves.toBe('saved');
    expect(settled).toBe(true);
  });

  it('adds no extra wait once a slow operation already outlasts the floor', async () => {
    vi.useFakeTimers();
    const promise = withFeedbackFloor(
      () =>
        new Promise<string>((resolve) => {
          setTimeout(() => resolve('done'), 1000);
        }),
      800,
    );
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toBe('done');
    // Nothing is left pending: a further advance does not hang the promise.
    await vi.advanceTimersByTimeAsync(5000);
    await expect(promise).resolves.toBe('done');
  });
});
