import { describe, expect, it } from 'vitest';

import {
  ALLOWED_ATTACHMENT_EXTENSIONS as CLIENT_EXTENSIONS,
  MAX_ATTACHMENT_BYTES as CLIENT_MAX_BYTES,
  TICKET_PRIORITIES as CLIENT_PRIORITIES,
  TICKET_STATUSES as CLIENT_STATUSES,
} from '../client/lib/support-constants.js';
import {
  ALLOWED_ATTACHMENT_EXTENSIONS as SERVER_EXTENSIONS,
  MAX_ATTACHMENT_BYTES as SERVER_MAX_BYTES,
  TICKET_PRIORITIES as SERVER_PRIORITIES,
  TICKET_STATUSES as SERVER_STATUSES,
} from '../server/providers/support/constants.js';
import {
  fileExtension,
  validateAttachmentFile,
} from '../server/providers/support/files.js';

describe('attachment rules stay in sync between client and server', () => {
  it('accepts the same extensions on both sides', () => {
    expect([...CLIENT_EXTENSIONS]).toEqual([...SERVER_EXTENSIONS]);
  });

  it('uses the same size limit on both sides', () => {
    expect(CLIENT_MAX_BYTES).toBe(SERVER_MAX_BYTES);
  });

  it('uses the same ticket enums on both sides', () => {
    expect([...CLIENT_PRIORITIES]).toEqual([...SERVER_PRIORITIES]);
    expect([...CLIENT_STATUSES]).toEqual([...SERVER_STATUSES]);
  });
});

describe('fileExtension', () => {
  it('lower-cases the extension', () => {
    expect(fileExtension('Screenshot.PNG')).toBe('png');
  });

  it('returns an empty string when there is no usable extension', () => {
    expect(fileExtension('report')).toBe('');
    expect(fileExtension('report.')).toBe('');
    expect(fileExtension('.env')).toBe('');
  });
});

describe('validateAttachmentFile', () => {
  it('accepts a screenshot within the limit', () => {
    expect(
      validateAttachmentFile({ filename: 'screen.png', size: 1024 }),
    ).toEqual({ ok: true, extension: 'png' });
  });

  it('accepts a log file', () => {
    expect(
      validateAttachmentFile({ filename: 'service.log', size: 2048 }),
    ).toEqual({ ok: true, extension: 'log' });
  });

  it('rejects an executable with a stable code', () => {
    const result = validateAttachmentFile({ filename: 'virus.exe', size: 10 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it('rejects a file larger than the single-file limit', () => {
    const result = validateAttachmentFile({
      filename: 'huge.log',
      size: SERVER_MAX_BYTES + 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FILE_TOO_LARGE');
  });

  it('rejects an empty upload', () => {
    const result = validateAttachmentFile({ filename: 'empty.log', size: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INVALID_FILE');
  });
});
