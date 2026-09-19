import { describe, expect, it } from 'vitest';

import {
  attachmentPreviewKind,
  attachmentSelectionError,
  attachmentUrl,
  clampPage,
  formatFileSize,
  MAX_ATTACHMENT_FILES,
  MAX_ATTACHMENT_SIZE,
} from '../../client/components/quality/lib.js';

describe('attachment helpers', () => {
  it('accepts a selection within the size and count limits', () => {
    expect(
      attachmentSelectionError([{ size: 1 }, { size: MAX_ATTACHMENT_SIZE }]),
    ).toBeUndefined();
  });

  it('rejects more than five files, empty files and oversized files', () => {
    expect(
      attachmentSelectionError(
        Array.from({ length: MAX_ATTACHMENT_FILES + 1 }, () => ({ size: 10 })),
      ),
    ).toBe('quality.attachments.tooMany');
    expect(attachmentSelectionError([{ size: 0 }])).toBe(
      'quality.attachments.emptyFile',
    );
    expect(attachmentSelectionError([{ size: MAX_ATTACHMENT_SIZE + 1 }])).toBe(
      'quality.attachments.tooLarge',
    );
  });

  it('classifies previewable formats and leaves others for download', () => {
    expect(attachmentPreviewKind({ mimeType: 'image/png', ext: 'png' })).toBe(
      'image',
    );
    expect(
      attachmentPreviewKind({ mimeType: 'image/svg+xml', ext: 'svg' }),
    ).toBe('unsupported');
    expect(
      attachmentPreviewKind({ mimeType: 'application/pdf', ext: 'pdf' }),
    ).toBe('pdf');
    expect(attachmentPreviewKind({ mimeType: 'text/plain', ext: 'txt' })).toBe(
      'text',
    );
    expect(
      attachmentPreviewKind({
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ext: 'docx',
      }),
    ).toBe('unsupported');
    expect(
      attachmentPreviewKind({ mimeType: 'application/zip', ext: 'zip' }),
    ).toBe('unsupported');
  });

  it('formats file sizes for the metadata column', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5 MB');
  });

  it('builds same-origin content and download URLs', () => {
    expect(attachmentUrl('abc')).toContain(
      '/api/quality/attachments/abc/content',
    );
    expect(attachmentUrl('abc', true)).toContain(
      '/api/quality/attachments/abc/download',
    );
  });

  it('keeps PDF page navigation inside the document range', () => {
    expect(clampPage(1, 3)).toBe(1);
    expect(clampPage(2, 3)).toBe(2);
    expect(clampPage(0, 3)).toBe(1);
    expect(clampPage(-5, 3)).toBe(1);
    expect(clampPage(9, 3)).toBe(3);
    expect(clampPage(2, 0)).toBe(1);
    expect(clampPage(Number.NaN, 3)).toBe(1);
  });
});
