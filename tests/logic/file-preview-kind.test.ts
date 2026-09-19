// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  fileExtension,
  isSafeImagePreview,
  resolveFilePreviewKind,
} from '../../client/extensions/nocobase-file-component-ui/lib/file-preview.js';

function file(filename: string, mimeType: string) {
  return { filename, mimeType } as never;
}

describe('file preview classification', () => {
  it('previews images, PDFs, text and Markdown', () => {
    expect(resolveFilePreviewKind(file('photo.png', 'image/png'))).toBe(
      'image',
    );
    expect(resolveFilePreviewKind(file('resume.pdf', 'application/pdf'))).toBe(
      'pdf',
    );
    expect(resolveFilePreviewKind(file('work.txt', 'text/plain'))).toBe('text');
    expect(resolveFilePreviewKind(file('notes.md', 'text/markdown'))).toBe(
      'markdown',
    );
  });

  it('reports binary documents and active content as unsupported', () => {
    expect(
      resolveFilePreviewKind(
        file(
          'letter.docx',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ),
      ),
    ).toBe('unsupported');
    expect(resolveFilePreviewKind(file('page.html', 'text/html'))).toBe(
      'unsupported',
    );
    expect(resolveFilePreviewKind(file('logo.svg', 'image/svg+xml'))).toBe(
      'unsupported',
    );
    expect(resolveFilePreviewKind(file('archive.zip', 'application/zip'))).toBe(
      'unsupported',
    );
  });

  it('classifies by extension when the browser sends a generic MIME type', () => {
    expect(resolveFilePreviewKind(file('resume.PDF', ''))).toBe('pdf');
    // A raster image is only rendered when the browser reports an image MIME
    // type; a generic type falls back to download instead of guessing.
    expect(
      resolveFilePreviewKind(file('photo.PNG', 'application/octet-stream')),
    ).toBe('unsupported');
  });

  it('only treats raster images as safe image previews', () => {
    expect(isSafeImagePreview(file('a.png', 'image/png'))).toBe(true);
    expect(isSafeImagePreview(file('a.svg', 'image/svg+xml'))).toBe(false);
    expect(fileExtension('Resume.PDF')).toBe('.pdf');
    expect(fileExtension('no-extension')).toBe('');
  });
});
