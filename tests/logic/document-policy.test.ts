import { describe, expect, it } from 'vitest';

import {
  MAX_BATCH_BYTES,
  MAX_FILES,
  MAX_FILE_BYTES,
  contentUrl,
  isDiscipline,
  isStatus,
  nameFromFilename,
  normalizeExtension,
  parseContentFileParam,
  validateUploadSelection,
} from '../../server/routes/document-policy.js';

const file = (name: string, size: number) => ({ name, size });

describe('document upload policy', () => {
  it('accepts the whitelisted types within every limit', () => {
    const result = validateUploadSelection({
      discipline: 'architecture',
      version: '2.0',
      files: [file('plan.pdf', 1024), file('facade.png', 2048)],
    });
    expect(result).toEqual({
      ok: true,
      value: { discipline: 'architecture', version: '2.0' },
    });
  });

  it('defaults the version when it is omitted', () => {
    const result = validateUploadSelection({
      discipline: 'hvac',
      files: [file('duct.xlsx', 10)],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.version).toBe('1.0');
  });

  it('rejects an extension outside the whitelist', () => {
    const result = validateUploadSelection({
      discipline: 'structure',
      files: [file('payload.exe', 10)],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('UNSUPPORTED_TYPE');
      expect(result.details).toMatchObject({ extension: 'exe' });
    }
  });

  it('rejects a file larger than the single-file limit', () => {
    const result = validateUploadSelection({
      discipline: 'structure',
      files: [file('big.pdf', MAX_FILE_BYTES + 1)],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FILE_TOO_LARGE');
  });

  it('rejects more files than the batch allows, before checking any file', () => {
    const files = Array.from({ length: MAX_FILES + 1 }, (_, index) =>
      file(`drawing-${index}.pdf`, 1),
    );
    const result = validateUploadSelection({
      discipline: 'architecture',
      files,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('TOO_MANY_FILES');
      expect(result.details).toMatchObject({ maxFiles: MAX_FILES });
    }
  });

  it('rejects a batch whose total exceeds the batch limit', () => {
    const perFile = Math.ceil(MAX_BATCH_BYTES / 3) + 1;
    const result = validateUploadSelection({
      discipline: 'architecture',
      files: [
        file('a.pdf', perFile),
        file('b.pdf', perFile),
        file('c.pdf', perFile),
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('BATCH_TOO_LARGE');
  });

  it('rejects an empty selection and an unknown discipline', () => {
    expect(
      validateUploadSelection({ discipline: 'architecture', files: [] }),
    ).toMatchObject({ ok: false, code: 'NO_FILES' });
    expect(
      validateUploadSelection({
        discipline: 'plumbing',
        files: [file('a.pdf', 1)],
      }),
    ).toMatchObject({ ok: false, code: 'INVALID_DISCIPLINE' });
  });
});

describe('document helpers', () => {
  it('normalizes extensions and rejects a file with none', () => {
    expect(normalizeExtension('Plan.PDF')).toBe('pdf');
    expect(normalizeExtension('archive')).toBe('');
    expect(normalizeExtension('.gitignore')).toBe('');
  });

  it('derives a document name from the file name', () => {
    expect(nameFromFilename('A-101-floor-plan.pdf')).toBe('A-101-floor-plan');
    expect(nameFromFilename('no-extension')).toBe('no-extension');
  });

  it('builds a content URL that carries the deployment base path', () => {
    expect(contentUrl('/main', { id: 'abc', ext: 'pdf' })).toBe(
      '/main/uploads/documents/abc.pdf',
    );
    expect(contentUrl('/main/', { id: 'abc', ext: 'png' })).toBe(
      '/main/uploads/documents/abc.png',
    );
    expect(contentUrl('', { id: 'abc', ext: '' })).toBe(
      '/uploads/documents/abc',
    );
  });

  it('parses only a UUID with an optional extension', () => {
    const id = 'e83498ea-f718-4401-a94e-4ace0e9f205f';
    expect(parseContentFileParam(`${id}.pdf`)).toEqual({ id, ext: 'pdf' });
    expect(parseContentFileParam(id)).toEqual({ id, ext: '' });
    expect(parseContentFileParam('../etc/passwd')).toBeUndefined();
    expect(parseContentFileParam(`${id}.pdf/../../x`)).toBeUndefined();
  });

  it('recognizes the configured disciplines and statuses', () => {
    expect(isDiscipline('mechanical-electrical')).toBe(true);
    expect(isDiscipline('other')).toBe(false);
    expect(isStatus('obsolete')).toBe(true);
    expect(isStatus('draft')).toBe(false);
  });
});
