// @vitest-environment node
import { expect, it } from 'vitest';

import { REPAIR_SAMPLE_FILES } from '../../server/samples/repair-sample-files.js';
import { decodeRepairSampleFile } from '../../server/samples/types.js';
import { REPAIR_SAMPLE_FILE_METADATA } from '../../database/main/seeds/202609200002_seed_property_repair_demo.js';

/**
 * The seed declares the sample-file metadata and the server module holds the bytes. They are separate on purpose,
 * so this test is what keeps them from drifting.
 */
it('keeps the seeded sample metadata identical to the sample bytes module', () => {
  expect(
    REPAIR_SAMPLE_FILE_METADATA.map((file) => ({
      id: file.id,
      key: file.key,
      filename: file.filename,
      ext: file.ext,
      mimeType: file.mimeType,
      size: file.size,
    })),
  ).toEqual(
    REPAIR_SAMPLE_FILES.map((file) => ({
      id: file.id,
      key: file.key,
      filename: file.filename,
      ext: file.ext,
      mimeType: file.mimeType,
      size: file.size,
    })),
  );
});

it('ships the promised sample formats and byte sizes', () => {
  const bytes = REPAIR_SAMPLE_FILES.map((file) => decodeRepairSampleFile(file));
  for (const [index, file] of REPAIR_SAMPLE_FILES.entries()) {
    expect({ file: file.filename, size: bytes[index]?.byteLength }).toEqual({
      file: file.filename,
      size: file.size,
    });
  }

  const images = REPAIR_SAMPLE_FILES.filter((file) =>
    file.mimeType.startsWith('image/'),
  );
  expect(images).toHaveLength(2);
  // Two genuinely different pictures, not the same bytes under two names.
  expect(bytes[0]).not.toEqual(bytes[1]);
  expect(bytes[0]?.slice(0, 8)).toEqual(
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );

  const text = REPAIR_SAMPLE_FILES.find((file) => file.ext === 'txt');
  expect(text).toBeDefined();
  const decoded = new TextDecoder('utf-8', { fatal: true }).decode(
    decodeRepairSampleFile(text!),
  );
  expect(decoded).toContain('物业报修系统样例说明文件');

  const csv = REPAIR_SAMPLE_FILES.find((file) => file.ext === 'csv');
  expect(
    new TextDecoder('utf-8').decode(decodeRepairSampleFile(csv!)),
  ).toContain('ticket_no,status,material');

  // One format the preview deliberately refuses, so the "cannot preview" path is demonstrable.
  expect(REPAIR_SAMPLE_FILES.some((file) => file.ext === 'zip')).toBe(true);
});

it('ships a three-page PDF whose pages differ', () => {
  const pdf = REPAIR_SAMPLE_FILES.find((file) => file.ext === 'pdf');
  expect(pdf).toBeDefined();
  const raw = Buffer.from(decodeRepairSampleFile(pdf!)).toString('latin1');
  expect(raw.startsWith('%PDF-')).toBe(true);
  expect(raw).toContain('/Type /Pages');
  expect(raw).toMatch(/\/Count 3\b/);
  expect(raw.match(/\/Type \/Page[^s]/g) ?? []).toHaveLength(3);
  for (const page of ['Page 1 of 3', 'Page 2 of 3', 'Page 3 of 3']) {
    expect(raw).toContain(page);
  }
  expect((raw.match(/\/Type \/Page[^s]/g) ?? []).length).toBe(3);
});
