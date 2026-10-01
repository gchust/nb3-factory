import { describe, expect, it } from 'vitest';

import {
  isReadableImageFile,
  MATERIAL_ACCEPT,
  MATERIAL_MAX_SIZE,
} from '../../client/pages/materials/files.js';

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function file(bytes: readonly number[], name: string, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

function textBytes(text: string): readonly number[] {
  return Array.from(new TextEncoder().encode(text));
}

describe('material file validation', () => {
  it('accepts an image whose bytes match its declared type', async () => {
    await expect(
      isReadableImageFile(
        file([...PNG_MAGIC, 0, 0, 0, 0], 'photo.png', 'image/png'),
      ),
    ).resolves.toBe(true);
  });

  it('rejects a .png whose bytes are not a PNG', async () => {
    // The corrupt fixture is short ASCII text handed to the browser as a PNG. Letting it upload would leave a file
    // that can only ever show a filename, so the upload field has to refuse it.
    await expect(
      isReadableImageFile(
        file(textBytes('this is not an image'), 'corrupt.png', 'image/png'),
      ),
    ).resolves.toBe(false);
  });

  it('rejects a truncated PNG header', async () => {
    await expect(
      isReadableImageFile(file([0x89, 0x50], 'truncated.png', 'image/png')),
    ).resolves.toBe(false);
  });

  it('accepts a JPEG whose bytes are a JPEG', async () => {
    await expect(
      isReadableImageFile(
        file([0xff, 0xd8, 0xff, 0xe0], 'photo.jpg', 'image/jpeg'),
      ),
    ).resolves.toBe(true);
  });

  it('rejects a .jpg whose bytes are not a JPEG', async () => {
    await expect(
      isReadableImageFile(file(textBytes('nope'), 'photo.jpg', 'image/jpeg')),
    ).resolves.toBe(false);
  });

  it('leaves non-image documents, unknown image types and SVG to the previewer', async () => {
    const bytes = textBytes('plain text');
    await expect(
      isReadableImageFile(file(bytes, 'notes.txt', 'text/plain')),
    ).resolves.toBe(true);
    await expect(
      isReadableImageFile(file(bytes, 'vector.svg', 'image/svg+xml')),
    ).resolves.toBe(true);
    await expect(
      isReadableImageFile(file(bytes, 'scan.jxl', 'image/jxl')),
    ).resolves.toBe(true);
  });

  it('declares the document and image types the feature supports, inside the server limit', () => {
    expect(MATERIAL_ACCEPT).toContain('image/png');
    expect(MATERIAL_ACCEPT).toContain('image/jpeg');
    expect(MATERIAL_ACCEPT).toContain('.docx');
    expect(MATERIAL_MAX_SIZE).toBe(5 * 1024 * 1024);
  });
});
