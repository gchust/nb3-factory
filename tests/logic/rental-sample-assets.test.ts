// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Guards the sample files the application ships and links from its home page.
 *
 * The acceptance requires a real image, a real multi-page PDF and a real text
 * file, so this asserts their actual content rather than a placeholder: the PNG
 * carries a valid header and dimensions, the PDFs really hold several pages of
 * extractable text, and the text file is non-empty UTF-8. Without this a
 * placeholder that is only named `.pdf` could pass the preview tests.
 */
const DEMO_DIR = path.resolve(import.meta.dirname, '../../public/assets/demo');

function read(name: string): Buffer {
  return fs.readFileSync(path.join(DEMO_DIR, name));
}

interface PngHeader {
  readonly width: number;
  readonly height: number;
}

function pngHeader(bytes: Buffer): PngHeader {
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  // The first chunk after the signature must be IHDR, whose payload starts at
  // byte 16 with width and height as big-endian uint32 values.
  expect(bytes.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('bundled sample files', () => {
  it('ships real raster images with visible dimensions', () => {
    for (const name of [
      'venue-cover.png',
      'venue-gallery-1.png',
      'venue-gallery-2.png',
      'delivery-photo.png',
      'return-photo.png',
    ]) {
      const { width, height } = pngHeader(read(name));
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
    }
  });

  it('ships genuinely multi-page PDFs with extractable text', async () => {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const cases = [
      { name: 'rental-agreement.pdf', pages: 3 },
      { name: 'delivery-acceptance.pdf', pages: 2 },
      { name: 'return-acceptance.pdf', pages: 2 },
    ] as const;

    for (const entry of cases) {
      const document = await getDocument({
        data: new Uint8Array(read(entry.name)),
      }).promise;
      expect(document.numPages).toBe(entry.pages);
      const text: string[] = [];
      for (let page = 1; page <= document.numPages; page += 1) {
        const content = await (await document.getPage(page)).getTextContent();
        text.push(content.items.map((item) => String(item.str)).join(' '));
      }
      expect(text.join(' ')).toMatch(/sample/i);
      expect(text[1]).not.toBe('');
      await document.destroy();
    }
  });

  it('ships a readable UTF-8 text sample', () => {
    const text = read('rental-supplement.txt').toString('utf8');
    expect(text).toContain('租赁补充说明');
    expect(text.trim().length).toBeGreaterThan(20);
  });
});
