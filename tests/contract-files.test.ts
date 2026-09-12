import { describe, expect, it } from 'vitest';

import {
  contractFileViolation,
  exceedsContractFileSize,
  fileExtensionOf,
  isAllowedContractFile,
  MAX_CONTRACT_FILE_SIZE,
} from '../server/providers/contract-files.js';

function file(
  name: string,
  type: string,
  size: number,
): { readonly name: string; readonly type: string; readonly size: number } {
  return { name, type, size };
}

describe('contract file admission rules', () => {
  it('accepts a PDF as the contract body by mime type', () => {
    expect(
      isAllowedContractFile(file('lease.pdf', 'application/pdf', 1024), 'body'),
    ).toBe(true);
  });

  it('accepts a body PDF by extension when the mime type is generic', () => {
    expect(
      isAllowedContractFile(
        file('LEASE.PDF', 'application/octet-stream', 1024),
        'body',
      ),
    ).toBe(true);
  });

  it('rejects a non-PDF body and reports the body code', () => {
    const violation = contractFileViolation(
      file('scan.png', 'image/png', 1024),
      'body',
    );
    expect(violation?.code).toBe('BODY_FILE_TYPE_NOT_ALLOWED');
  });

  it('accepts PDFs, images and office documents as attachments', () => {
    const candidates: readonly { name: string; type: string; size: number }[] =
      [
        file('scan.pdf', 'application/pdf', 1024),
        file('photo.jpg', 'image/jpeg', 1024),
        file('diagram.png', 'image/png', 1024),
        file(
          'report.docx',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          1024,
        ),
        file(
          'sheet.xlsx',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          1024,
        ),
        file('notes.txt', 'text/plain', 1024),
        file('notes.md', 'text/markdown', 1024),
      ];
    for (const candidate of candidates) {
      expect(isAllowedContractFile(candidate, 'attachment')).toBe(true);
    }
  });

  it('rejects an executable attachment and reports the attachment code', () => {
    const violation = contractFileViolation(
      file('setup.exe', 'application/x-msdownload', 1024),
      'attachment',
    );
    expect(violation?.code).toBe('ATTACHMENT_FILE_TYPE_NOT_ALLOWED');
  });

  it('derives the extension case-insensitively from the filename', () => {
    expect(fileExtensionOf('报告.DOCX')).toBe('docx');
    expect(fileExtensionOf('no-extension')).toBe('');
    expect(fileExtensionOf('a.b.pdf')).toBe('pdf');
  });

  it('does not trust mime parameters: text/plain; charset=utf-8 falls back to the name', () => {
    const candidate = file('notes.txt', 'text/plain; charset=utf-8', 1024);
    expect(isAllowedContractFile(candidate, 'attachment')).toBe(true);
  });

  it('rejects a file above the 5 MiB per-file limit with the size code', () => {
    const violation = contractFileViolation(
      file('big.pdf', 'application/pdf', MAX_CONTRACT_FILE_SIZE + 1),
      'body',
    );
    expect(violation?.code).toBe('CONTRACT_FILE_TOO_LARGE');
    expect(
      exceedsContractFileSize(file('x', 'text/plain', MAX_CONTRACT_FILE_SIZE)),
    ).toBe(false);
  });

  it('admits files at exactly 5 MiB', () => {
    expect(
      contractFileViolation(
        file('ok.pdf', 'application/pdf', MAX_CONTRACT_FILE_SIZE),
        'body',
      ),
    ).toBeUndefined();
  });
});
