// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { assertAllowedAttachment } from '../../server/services/attachment-validation.js';
import { ServiceError } from '../../server/services/errors.js';

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

function fileOf(bytes: readonly number[], name: string, type: string): File {
  return new File([Uint8Array.from(bytes)], name, { type });
}

function validPng(): File {
  return fileOf(
    [...PNG_MAGIC, 0x00, 0x00, 0x00, 0x0d],
    'photo.png',
    'image/png',
  );
}

function validDocx(): File {
  // A DOCX is a ZIP whose entries include `[Content_Types].xml` and a `word/`
  // directory. Only those markers are read, so the fixture does not need a
  // fully-formed archive to exercise the check.
  const body = new TextEncoder().encode('[Content_Types].xmlword/document.xml');
  return fileOf(
    [...ZIP_MAGIC, ...body],
    'report.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
}

async function rejection(file: File): Promise<ServiceError> {
  try {
    await assertAllowedAttachment(file);
  } catch (error) {
    if (error instanceof ServiceError) return error;
    throw error;
  }
  throw new Error('Expected the attachment to be rejected.');
}

describe('attachment content validation', () => {
  it('accepts a real PNG and a real DOCX', async () => {
    await expect(assertAllowedAttachment(validPng())).resolves.toBeUndefined();
    await expect(assertAllowedAttachment(validDocx())).resolves.toBeUndefined();
  });

  it('rejects a file whose name and MIME claim PNG but whose bytes are not', async () => {
    // The observed QA case: a 28-byte file named `corrupt.png`, sent as
    // `image/png`, which the plugin previously stored without inspection.
    const corrupt = fileOf(
      Array.from({ length: 28 }, (_, index) => index),
      'corrupt.png',
      'image/png',
    );
    const error = await rejection(corrupt);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.status).toBe(400);
    expect(error.message).toMatch(/not a PNG/iu);
  });

  it('rejects a DOCX whose bytes are not a ZIP package', async () => {
    const corrupt = fileOf([0x00, 0x01, 0x02, 0x03], 'report.docx', '');
    expect((await rejection(corrupt)).message).toMatch(/DOCX/iu);
  });

  it('rejects a ZIP that is not a Word package', async () => {
    const plainZip = fileOf(
      [...ZIP_MAGIC, ...new TextEncoder().encode('some/other.txt')],
      'archive.docx',
      '',
    );
    expect((await rejection(plainZip)).message).toMatch(/DOCX/iu);
  });

  it('rejects an unsupported format and an empty file', async () => {
    const gif = fileOf([0x47, 0x49, 0x46, 0x38], 'photo.gif', 'image/gif');
    expect((await rejection(gif)).message).toMatch(/Only PNG/u);
    const empty = fileOf([], 'empty.png', 'image/png');
    expect((await rejection(empty)).message).toMatch(/empty/iu);
  });
});
