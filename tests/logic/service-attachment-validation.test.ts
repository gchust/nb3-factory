import { describe, expect, it } from 'vitest';

import { validateAttachmentFile } from '../../client/pages/service/service-api.ts';

/** The eight-byte PNG signature plus a header byte. */
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);
/** The ZIP local-file header every DOCX starts with. */
const DOCX_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const GARBAGE_BYTES = new TextEncoder().encode('this is not an image');

function file(name: string, bytes: Uint8Array): File {
  return new File([bytes], name);
}

describe('service attachment validation', () => {
  it('accepts a real PNG photo and a real DOCX report', async () => {
    await expect(
      validateAttachmentFile(file('photo.png', PNG_BYTES)),
    ).resolves.toBeUndefined();
    await expect(
      validateAttachmentFile(file('report.docx', DOCX_BYTES)),
    ).resolves.toBeUndefined();
  });

  it('refuses a corrupt or mislabelled file before it is uploaded', async () => {
    // A file named `.png` whose bytes are not a PNG.
    await expect(
      validateAttachmentFile(file('corrupt.png', GARBAGE_BYTES)),
    ).rejects.toThrow('ATTACHMENT_CONTENT_INVALID');
    // A PNG renamed to `.docx`, and an unsupported extension.
    await expect(
      validateAttachmentFile(file('report.docx', PNG_BYTES)),
    ).rejects.toThrow('ATTACHMENT_CONTENT_INVALID');
    await expect(
      validateAttachmentFile(file('photo.jpg', PNG_BYTES)),
    ).rejects.toThrow('ATTACHMENT_CONTENT_INVALID');
  });
});
