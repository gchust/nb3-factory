import { describe, expect, it } from 'vitest';

import {
  fileSizeUnits,
  formatFileSize,
  isImageFile,
  resolveFileUrl,
} from '../../client/lib/file-utils.js';

const units = { b: 'B', kb: 'KB', mb: 'MB', gb: 'GB' };

describe('formatFileSize', () => {
  it('renders bytes, kilobytes, megabytes and gigabytes', () => {
    expect(formatFileSize(0, units)).toBe('0 B');
    expect(formatFileSize(512, units)).toBe('512 B');
    expect(formatFileSize(1536, units)).toBe('1.5 KB');
    expect(formatFileSize(2 * 1024, units)).toBe('2 KB');
    expect(formatFileSize(5 * 1024 * 1024, units)).toBe('5 MB');
    expect(formatFileSize(3 * 1024 * 1024 * 1024, units)).toBe('3 GB');
  });

  it('builds unit labels from translation keys', () => {
    expect(fileSizeUnits((key) => `[${key}]`)).toEqual({
      b: '[files.units.b]',
      kb: '[files.units.kb]',
      mb: '[files.units.mb]',
      gb: '[files.units.gb]',
    });
  });
});

describe('isImageFile', () => {
  it('accepts raster images and rejects SVG and documents', () => {
    expect(isImageFile({ mimeType: 'image/png' })).toBe(true);
    expect(isImageFile({ mimeType: 'image/jpeg' })).toBe(true);
    expect(isImageFile({ mimeType: 'image/svg+xml' })).toBe(false);
    expect(isImageFile({ mimeType: 'image/png', ext: 'svg' })).toBe(false);
    expect(isImageFile({ mimeType: 'application/pdf' })).toBe(false);
  });
});

describe('resolveFileUrl', () => {
  it('allows relative and http(s) URLs', () => {
    expect(resolveFileUrl('/main/uploads/a.png')).toBe('/main/uploads/a.png');
    expect(resolveFileUrl('https://example.com/a.png')).toBe(
      'https://example.com/a.png',
    );
  });

  it('rejects unsafe schemes and missing values', () => {
    expect(resolveFileUrl('javascript:alert(1)')).toBeUndefined();
    expect(resolveFileUrl(undefined)).toBeUndefined();
    expect(resolveFileUrl('')).toBeUndefined();
  });
});
