// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  sniffAttachmentContent,
  validateAttachmentContent,
} from '../../server/services/attachment-content.js';

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00);
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04, 0x00);
const OLE = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
const PDF = bytes(0x25, 0x50, 0x44, 0x46);

describe('attachment content sniffing', () => {
  it('recognizes the container formats it knows', () => {
    expect(sniffAttachmentContent(PNG)).toBe('png');
    expect(sniffAttachmentContent(JPEG)).toBe('jpeg');
    expect(sniffAttachmentContent(ZIP)).toBe('zip');
    expect(sniffAttachmentContent(OLE)).toBe('ole');
    expect(sniffAttachmentContent(PDF)).toBe('pdf');
    expect(sniffAttachmentContent(bytes(0x00, 0x01))).toBe('unknown');
  });

  it('rejects a corrupt image uploaded as a ticket photo', () => {
    // A renamed text file: it passes the plugin's size/extension check but is
    // not an image, which is what produced the broken thumbnails.
    const corrupt = new TextEncoder().encode('this is not a png');
    const problem = validateAttachmentContent(corrupt, 'photo');
    expect(problem?.code).toBe('INVALID_ATTACHMENT');
    expect(problem?.message).toMatch(/PNG or JPEG/);
  });

  it('rejects a non-Office file uploaded as a report', () => {
    expect(validateAttachmentContent(PNG, 'report')?.code).toBe(
      'INVALID_ATTACHMENT',
    );
    expect(validateAttachmentContent(ZIP, 'report')).toBeUndefined();
    expect(validateAttachmentContent(OLE, 'report')).toBeUndefined();
  });

  it('leaves other and undeclared kinds to the repository', () => {
    expect(validateAttachmentContent(bytes(0x00), 'other')).toBeUndefined();
    expect(validateAttachmentContent(bytes(0x00), undefined)).toBeUndefined();
  });
});
