import { describe, expect, it } from 'vitest';

import { DEMO_FILE_META } from '../../database/main/seeds/202609200011_seed_library_demo.js';
import {
  DEMO_FILE_CONTENT_TYPE,
  generateDemoFileBuffer,
} from '../../server/providers/library-demo-files.js';

describe('demo file generators', () => {
  it('produces a real PNG with the declared dimensions', () => {
    const png = generateDemoFileBuffer('png');
    expect([...png.subarray(0, 8)]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    expect(png.subarray(12, 16).toString('latin1')).toBe('IHDR');
    expect(png.readUInt32BE(16)).toBe(320);
    expect(png.readUInt32BE(20)).toBe(200);
  });

  it('produces a PDF with three pages', () => {
    const pdf = generateDemoFileBuffer('pdf').toString('latin1');
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('/Count 3');
    const pages = pdf.match(/\/Type \/Page[^s]/g) ?? [];
    expect(pages).toHaveLength(3);
    expect(pdf).toContain('Page 3 of 3');
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('produces readable UTF-8 text', () => {
    const text = generateDemoFileBuffer('text').toString('utf8');
    expect(text).toContain('团队资料借阅系统');
    expect(text).toContain('示例文件');
  });

  it('produces a valid ZIP archive with one entry', () => {
    const zip = generateDemoFileBuffer('zip');
    expect(zip.subarray(0, 4).toString('latin1')).toBe('PK\u0003\u0004');
    expect(
      zip.subarray(zip.length - 22, zip.length - 18).toString('latin1'),
    ).toBe('PK\u0005\u0006');
    expect(zip.includes(Buffer.from('readme.txt', 'utf8'))).toBe(true);
  });

  it('is deterministic, so the seeded size stays truthful', () => {
    for (const kind of ['png', 'pdf', 'text', 'zip'] as const) {
      expect(
        generateDemoFileBuffer(kind).equals(generateDemoFileBuffer(kind)),
      ).toBe(true);
      expect(DEMO_FILE_CONTENT_TYPE[kind]).toBeTruthy();
      expect(generateDemoFileBuffer(kind).length).toBeGreaterThan(0);
      expect(DEMO_FILE_CONTENT_TYPE[kind]).toBe(DEMO_FILE_META[kind].mimeType);
      // The seed stores this literal as the file size, and the content route serves it as
      // Content-Length, so a generator change must update the seed in the same commit.
      expect(generateDemoFileBuffer(kind).length).toBe(
        DEMO_FILE_META[kind].size,
      );
    }
  });
});
