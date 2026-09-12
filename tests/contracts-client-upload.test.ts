import type { FileRecord } from '@nocobase/app-plugin-file/client';
import { describe, expect, it } from 'vitest';

import { pickSingleUploadRecord } from '../client/lib/contract-files.js';
import {
  isSafeImagePreview,
  resolveFilePreviewKind,
} from '../client/extensions/nocobase-file-component-ui/lib/file-preview.js';

function record(
  id: string,
  filename: string,
  mimeType = 'application/pdf',
): FileRecord {
  return {
    id,
    disk: 'local',
    key: `objects/${id}`,
    filename,
    ext: 'pdf',
    mimeType,
    size: 1024,
    createdAt: '2026-09-09T00:00:00.000',
    updatedAt: '2026-09-09T00:00:00.000',
  };
}

describe('pickSingleUploadRecord', () => {
  it('passes through a single record payload (body endpoint shape)', () => {
    const body = record('1', 'contract-a.pdf');
    expect(pickSingleUploadRecord(body)).toBe(body);
  });

  it('picks the single record from an array payload (attachment endpoint shape)', () => {
    const attachment = record('2', 'scan.pdf');
    const payload: readonly FileRecord[] = [
      attachment,
      record('3', 'photo.jpg', 'image/jpeg'),
    ];
    // `uploadOne` sends exactly one file, so the array holds one record.
    expect(pickSingleUploadRecord(payload)).toBe(attachment);
  });

  it('rejects a payload that carries no record', () => {
    expect(() => pickSingleUploadRecord([])).toThrow(
      /did not include a file record/,
    );
    expect(() => pickSingleUploadRecord(undefined)).toThrow(
      /did not include a file record/,
    );
  });
});

describe('thumbnail preview resolution against malformed records', () => {
  it('does not throw when a record lacks mimeType (the observed page crash)', () => {
    // A record whose `mimeType` is undefined used to reach the renderer and
    // crash the edit page (`Cannot read properties of undefined (reading
    // 'split')`); the guards must degrade to a generic icon/preview instead.
    const broken = { ...record('4', 'notes.txt'), mimeType: undefined } as
      FileRecord | undefined;
    const file = broken as FileRecord;
    expect(() => isSafeImagePreview(file)).not.toThrow();
    expect(() => resolveFilePreviewKind(file)).not.toThrow();
    expect(isSafeImagePreview(file)).toBe(false);
    // Without a mime type the kind degrades to the generic fallback instead
    // of throwing.
    expect(resolveFilePreviewKind(file)).toBe('unsupported');
  });

  it('resolves preview kinds of real attachment types', () => {
    expect(
      resolveFilePreviewKind(record('5', 'scan.pdf', 'application/pdf')),
    ).toBe('pdf');
    expect(resolveFilePreviewKind(record('6', 'photo.png', 'image/png'))).toBe(
      'image',
    );
    expect(isSafeImagePreview(record('7', 'photo.png', 'image/png'))).toBe(
      true,
    );
  });
});
