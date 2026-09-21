// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  SAMPLE_CSV,
  SAMPLE_DOCX,
  SAMPLE_FILES,
  SAMPLE_IMAGES,
  SAMPLE_PDF,
  SAMPLE_PDF_V1,
  SAMPLE_TEXT,
  SAMPLE_UNSUPPORTED,
  createPdf,
} from '../../database/main/seeds/202609200011_seed_project_delivery_sample_files.js';

/**
 * The demonstration files are generated, not checked in, so their format is
 * asserted here rather than assumed: a preview that renders nothing would pass
 * a test that only checked the file exists.
 */
describe('seeded sample files', () => {
  it('builds PNG images with a valid signature and the declared dimensions', () => {
    for (const image of SAMPLE_IMAGES) {
      expect(image.mimeType).toBe('image/png');
      expect(image.bytes.subarray(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      expect(image.bytes.readUInt32BE(16)).toBe(640);
      expect(image.bytes.readUInt32BE(20)).toBe(360);
      expect(image.bytes.length).toBeGreaterThan(1000);
    }
    expect(SAMPLE_IMAGES[0]?.bytes.equals(SAMPLE_IMAGES[1]?.bytes)).toBe(false);
  });

  it('builds three-page PDFs whose pages carry different text', () => {
    for (const pdf of [SAMPLE_PDF, SAMPLE_PDF_V1]) {
      expect(pdf.ext).toBe('pdf');
      expect(pdf.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      const text = pdf.bytes.toString('latin1');
      expect(text.match(/\/Type \/Page[^s]/g)).toHaveLength(3);
      expect(text).toContain('Page 1 of 3');
      expect(text).toContain('Page 2 of 3');
      expect(text).toContain('Page 3 of 3');
      const startxref = /startxref\n(\d+)/.exec(text);
      expect(startxref).toBeTruthy();
      expect(Number(startxref?.[1])).toBeLessThan(pdf.bytes.length);
      expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    }
  });

  it('escapes parentheses so an arbitrary page title still produces a valid stream', () => {
    const pdf = createPdf([['A (parenthesised) title']]);
    expect(pdf.toString('latin1')).toContain('\\(parenthesised\\)');
  });

  it('builds UTF-8 text and CSV samples that stay readable', () => {
    const text = SAMPLE_TEXT.bytes.toString('utf8');
    expect(text).toContain('接口文档');
    expect(SAMPLE_TEXT.bytes.equals(Buffer.from(text, 'utf8'))).toBe(true);

    const csv = SAMPLE_CSV.bytes.toString('utf8');
    expect(csv.split('\n')[0]).toContain('里程碑编号');
    expect(csv.split('\n').length).toBeGreaterThan(2);
  });

  it('includes one format that has no online preview', () => {
    expect(SAMPLE_UNSUPPORTED.ext).toBe('zip');
    // A ZIP archive begins with its first local file header.
    expect(SAMPLE_UNSUPPORTED.bytes.subarray(0, 4).toString('latin1')).toBe(
      'PK\x03\x04',
    );
    expect(SAMPLE_UNSUPPORTED.bytes.includes(Buffer.from('readme.txt'))).toBe(
      true,
    );
  });

  it('builds a Word document that offline tools can open but browsers cannot', () => {
    expect(SAMPLE_DOCX.ext).toBe('docx');
    expect(SAMPLE_DOCX.mimeType).toContain('wordprocessingml.document');
    expect(SAMPLE_DOCX.bytes.subarray(0, 4).toString('latin1')).toBe(
      'PK\x03\x04',
    );
    // An Office Open XML package declares its parts and its relationships.
    const text = SAMPLE_DOCX.bytes.toString('utf8');
    expect(text).toContain('[Content_Types].xml');
    expect(text).toContain('word/document.xml');
    expect(text).toContain('wordprocessingml/2006/main');
    expect(text).toContain('项目交付验收单');
  });

  it('is byte-identical when regenerated, so seeds are reproducible', () => {
    for (const file of SAMPLE_FILES) {
      expect(file.bytes.length).toBeGreaterThan(0);
    }
    expect(createPdf([['stable']]).equals(createPdf([['stable']]))).toBe(true);
  });
});
