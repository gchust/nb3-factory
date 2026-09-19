// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import {
  MAX_FILE_BYTES,
  MAX_FILES_PER_UPLOAD,
  validateAttachmentSelection,
} from '../../client/components/procurement/attachment-limits.js';
import {
  isAbortError,
  isHttpError,
  uploadFiles,
  type UploadRepository,
} from '../../client/components/procurement/upload.js';
import {
  ATTACHMENT_CATEGORIES,
  MAX_ATTACHMENTS_PER_REQUEST,
  MAX_ATTACHMENT_BYTES,
  PROCUREMENT_FILE_ACCESS_PATH,
} from '../../server/providers/procurement-service.js';

describe('attachment selection limits', () => {
  const file = (name: string, size: number) => ({ name, size });

  it('accepts a selection within both limits', () => {
    expect(
      validateAttachmentSelection([
        file('a.pdf', 1024),
        file('b.png', MAX_FILE_BYTES),
      ]),
    ).toBeNull();
  });

  it('reports too many files', () => {
    const files = Array.from({ length: MAX_FILES_PER_UPLOAD + 1 }, (_, index) =>
      file(`f${index}.pdf`, 10),
    );
    expect(validateAttachmentSelection(files)).toEqual({
      reason: 'tooMany',
      limit: MAX_FILES_PER_UPLOAD,
    });
  });

  it('names the file that exceeds the size limit', () => {
    expect(
      validateAttachmentSelection([
        file('ok.pdf', 10),
        file('big.pdf', MAX_FILE_BYTES + 1),
      ]),
    ).toEqual({
      reason: 'tooLarge',
      name: 'big.pdf',
      limit: MAX_FILE_BYTES,
    });
  });

  it('uses five files and five megabytes as the defaults', () => {
    expect(MAX_FILES_PER_UPLOAD).toBe(5);
    expect(MAX_FILE_BYTES).toBe(5 * 1024 * 1024);
    expect(MAX_ATTACHMENTS_PER_REQUEST).toBe(5);
    // The server enforces the same per-file ceiling the client checks.
    expect(MAX_ATTACHMENT_BYTES).toBe(MAX_FILE_BYTES);
  });
});

describe('attachment categories', () => {
  it('maps every document type to its allowed categories', () => {
    expect(ATTACHMENT_CATEGORIES.supplier).toEqual([
      'license',
      'qualification',
    ]);
    expect(ATTACHMENT_CATEGORIES.order).toEqual(['quotation', 'contract']);
    expect(ATTACHMENT_CATEGORIES.receipt).toEqual([
      'signed_photo',
      'delivery_note',
    ]);
  });

  it('serves file content from the guarded uploads path', () => {
    expect(PROCUREMENT_FILE_ACCESS_PATH.startsWith('/')).toBe(true);
    expect(PROCUREMENT_FILE_ACCESS_PATH.endsWith('/')).toBe(false);
  });
});

describe('upload transport retry', () => {
  const files = [] as unknown as readonly File[];

  it('retries a transport failure once and returns the second result', async () => {
    const records = [{ id: 'file-1' }];
    const uploadMany = vi
      .fn<UploadRepository['uploadMany']>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ records });
    await expect(uploadFiles({ uploadMany }, files)).resolves.toEqual({
      records,
    });
    expect(uploadMany).toHaveBeenCalledTimes(2);
  });

  it('does not retry an HTTP error the server answered with', async () => {
    const error = Object.assign(new Error('Upload body too large.'), {
      status: 413,
      code: 'BODY_TOO_LARGE',
    });
    const uploadMany = vi
      .fn<UploadRepository['uploadMany']>()
      .mockRejectedValueOnce(error);
    await expect(uploadFiles({ uploadMany }, files)).rejects.toBe(error);
    expect(uploadMany).toHaveBeenCalledTimes(1);
  });

  it('rethrows the transport failure after exhausting attempts', async () => {
    const uploadMany = vi
      .fn<UploadRepository['uploadMany']>()
      .mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(uploadFiles({ uploadMany }, files)).rejects.toBeInstanceOf(
      TypeError,
    );
    expect(uploadMany).toHaveBeenCalledTimes(2);
  });

  it('treats only errors carrying a numeric status as HTTP errors', () => {
    expect(isHttpError({ status: 403 })).toBe(true);
    expect(isHttpError(new TypeError('Failed to fetch'))).toBe(false);
    expect(isHttpError(new Error('boom'))).toBe(false);
    expect(isHttpError(null)).toBe(false);
  });

  it('stops before uploading when the caller already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const uploadMany = vi.fn<UploadRepository['uploadMany']>();

    await expect(
      uploadFiles({ uploadMany }, files, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(uploadMany).not.toHaveBeenCalled();
  });

  it('does not retry an upload the caller cancelled', async () => {
    const controller = new AbortController();
    const uploadMany = vi
      .fn<UploadRepository['uploadMany']>()
      .mockImplementation(async () => {
        controller.abort();
        throw new DOMException('Aborted', 'AbortError');
      });

    await expect(
      uploadFiles({ uploadMany }, files, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(uploadMany).toHaveBeenCalledTimes(1);
  });

  it('recognises an AbortError from the transport', () => {
    expect(isAbortError(new DOMException('stop', 'AbortError'))).toBe(true);
    expect(isAbortError(new TypeError('Failed to fetch'))).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});
