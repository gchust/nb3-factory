import { deflateRawSync } from 'node:zlib';

interface ZipEntry {
  readonly name: string;
  readonly content: string;
  /** 0 stores the bytes, 8 deflates them; real DOCX parts are deflated. */
  readonly method?: 0 | 8;
}

/**
 * Builds the parts of a ZIP archive a DOCX reader has to walk: a local header per entry, a
 * central directory, and the end-of-central-directory record. Nothing here verifies a CRC, so
 * it can be left at zero and the fixture stays readable.
 */
export function buildZip(entries: readonly ZipEntry[]): ArrayBuffer {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  let centralSize = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const raw = encoder.encode(entry.content);
    const method = entry.method ?? 8;
    const stored = method === 8 ? new Uint8Array(deflateRawSync(raw)) : raw;

    const local = new Uint8Array(30 + name.length + stored.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, method, true);
    localView.setUint32(18, stored.length, true);
    localView.setUint32(22, raw.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(stored, 30 + name.length);
    localParts.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(10, method, true);
    centralView.setUint32(20, stored.length, true);
    centralView.setUint32(24, raw.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, localOffset, true);
    central.set(name, 46);
    centralParts.push(central);
    centralSize += central.length;

    localOffset += local.length;
  }

  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, localOffset, true);

  const total = localOffset + centralSize + eocd.length;
  const archive = new Uint8Array(total);
  let cursor = 0;
  for (const part of [...localParts, ...centralParts, eocd]) {
    archive.set(part, cursor);
    cursor += part.length;
  }
  return archive.buffer;
}

export function documentPart(body: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:body>' +
    body +
    '</w:body></w:document>'
  );
}

/** A complete, valid-enough DOCX holding one paragraph of text. */
export function buildDocx(text: string, method: 0 | 8 = 8): ArrayBuffer {
  return buildZip([
    { name: '[Content_Types].xml', content: '<Types />' },
    {
      name: 'word/document.xml',
      content: documentPart(`<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`),
      method,
    },
  ]);
}
