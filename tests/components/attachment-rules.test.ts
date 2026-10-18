import { describe, expect, it } from 'vitest';

import { inspectAttachment } from '../../client/pages/tickets/attachment-rules.js';

/** A `File` whose bytes are exactly the given header followed by filler. */
function file(
  name: string,
  type: string,
  header: readonly number[],
  filler = 32,
): File {
  return new File(
    [new Uint8Array([...header, ...new Array(filler).fill(0)])],
    name,
    { type },
  );
}

function textFile(name: string, type: string, content: string): File {
  return new File([content], name, { type });
}

describe('the attachment content check', () => {
  it('accepts a real PNG', async () => {
    const png = file(
      'screenshot.png',
      'image/png',
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    );
    await expect(inspectAttachment(png)).resolves.toBeNull();
  });

  it('accepts a real JPEG, GIF, WEBP, PDF and DOCX', async () => {
    await expect(
      inspectAttachment(file('photo.jpg', 'image/jpeg', [0xff, 0xd8, 0xff])),
    ).resolves.toBeNull();
    await expect(
      inspectAttachment(textFile('anim.gif', 'image/gif', 'GIF89a...')),
    ).resolves.toBeNull();
    await expect(
      inspectAttachment(
        textFile('shot.webp', 'image/webp', 'RIFFxxxxWEBPVP8 '),
      ),
    ).resolves.toBeNull();
    await expect(
      inspectAttachment(textFile('report.pdf', 'application/pdf', '%PDF-1.7')),
    ).resolves.toBeNull();
    await expect(
      inspectAttachment(
        file(
          'notes.docx',
          'application/vnd.openxmlformats',
          [0x50, 0x4b, 0x03, 0x04],
        ),
      ),
    ).resolves.toBeNull();
  });

  it('rejects a `.png` whose bytes are not a PNG', async () => {
    const corrupt = new File(
      [new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07])],
      'corrupt.png',
      { type: 'image/png' },
    );
    await expect(inspectAttachment(corrupt)).resolves.toEqual({
      key: 'serviceDesk.form.attachmentContentMismatch',
      filename: 'corrupt.png',
    });
  });

  it('leaves a plain text or log file alone', async () => {
    await expect(
      inspectAttachment(textFile('notes.txt', 'text/plain', 'hello')),
    ).resolves.toBeNull();
    await expect(
      inspectAttachment(textFile('server.log', '', 'a line')),
    ).resolves.toBeNull();
  });
});
