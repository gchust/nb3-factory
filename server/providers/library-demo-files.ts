import { deflateSync } from 'node:zlib';

/**
 * Deterministic generators for the sample documents the demo seed references.
 *
 * The seed can only insert metadata rows, not write objects, because a `SeedContext` has no
 * storage access. So the seed stores the exact byte length each generator produces and the content
 * route recreates the object the first time it is requested. Everything here is pure and
 * reproducible: the same kind always yields the same bytes, so the seeded `size` stays truthful.
 */
export type DemoFileKind = 'png' | 'pdf' | 'text' | 'zip';

export const DEMO_FILE_CONTENT_TYPE: Readonly<Record<DemoFileKind, string>> = {
  png: 'image/png',
  pdf: 'application/pdf',
  text: 'text/plain',
  zip: 'application/zip',
};

export function generateDemoFileBuffer(kind: DemoFileKind): Buffer {
  switch (kind) {
    case 'png':
      return createPng();
    case 'pdf':
      return createPdf();
    case 'text':
      return createText();
    case 'zip':
      return createZip();
  }
}

const CRC_TABLE: Uint32Array = createCrcTable();

function createCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

function crc32(input: Buffer): number {
  let value = 0xffffffff;
  for (const byte of input) {
    value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'latin1');
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

/** A 320×200 RGB image with a deterministic gradient and border, used as a cover thumbnail. */
function createPng(): Buffer {
  const width = 320;
  const height = 200;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let cursor = 0;
  for (let y = 0; y < height; y += 1) {
    raw[cursor] = 0;
    cursor += 1;
    for (let x = 0; x < width; x += 1) {
      const border = x < 4 || y < 4 || x >= width - 4 || y >= height - 4;
      raw[cursor] = border ? 32 : Math.round((x / width) * 180) + 40;
      raw[cursor + 1] = border ? 48 : Math.round((y / height) * 140) + 60;
      raw[cursor + 2] = border ? 64 : 190;
      cursor += 3;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: truecolour
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A three-page PDF with a text line per page, so page navigation can be exercised. */
function createPdf(): Buffer {
  const pageCount = 3;
  const fontNumber = 3 + pageCount;
  const pageNumbers = Array.from(
    { length: pageCount },
    (_, index) => 3 + index,
  );
  const contentNumbers = pageNumbers.map((_, index) => fontNumber + 1 + index);
  const objects = new Map<number, Buffer>();

  objects.set(1, Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1'));
  objects.set(
    2,
    Buffer.from(
      `<< /Type /Pages /Kids [${pageNumbers.map((number) => `${number} 0 R`).join(' ')}] /Count ${pageCount} >>`,
      'latin1',
    ),
  );
  pageNumbers.forEach((number, index) => {
    objects.set(
      number,
      Buffer.from(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
          `/Resources << /Font << /F1 ${fontNumber} 0 R >> >> ` +
          `/Contents ${contentNumbers[index]} 0 R >>`,
        'latin1',
      ),
    );
  });
  objects.set(
    fontNumber,
    Buffer.from(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      'latin1',
    ),
  );
  contentNumbers.forEach((number, index) => {
    const heading = `BT /F1 26 Tf 72 760 Td (Team Handbook - Page ${index + 1} of ${pageCount}) Tj ET`;
    const body = `BT /F1 14 Tf 72 720 Td (A sample multi-page document for online reading.) Tj ET`;
    const stream = `${heading}\n${body}\n`;
    objects.set(
      number,
      Buffer.from(
        `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}endstream`,
        'latin1',
      ),
    );
  });

  const maxObject = fontNumber + pageCount;
  const chunks: Buffer[] = [
    Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1'),
  ];
  const offsets = new Array<number>(maxObject + 1).fill(0);
  let position = chunks[0].length;
  for (let number = 1; number <= maxObject; number += 1) {
    const head = Buffer.from(`${number} 0 obj\n`, 'latin1');
    const body = objects.get(number);
    if (!body) continue;
    const tail = Buffer.from('\nendobj\n', 'latin1');
    offsets[number] = position;
    chunks.push(head, body, tail);
    position += head.length + body.length + tail.length;
  }

  const xrefStart = position;
  let xref = `xref\n0 ${maxObject + 1}\n0000000000 65535 f \n`;
  for (let number = 1; number <= maxObject; number += 1) {
    xref += `${String(offsets[number]).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${maxObject + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(Buffer.from(`${xref}${trailer}`, 'latin1'));

  return Buffer.concat(chunks);
}

const TEXT_BODY = [
  '团队资料借阅系统 · 示例文本文件',
  '',
  '这是一份用于验证在线文字阅读的示例文件。',
  '成员可以直接在资料详情页阅读本文件的内容，也可以下载原件。',
  '',
  '要点：',
  '1. 文本内容以 UTF-8 编码存储，浏览器按原样显示。',
  '2. 文件列表会显示文件名、大小、上传人和上传时间。',
  '3. 受权限限制的资料，未授权的成员无法预览或下载。',
  '',
  '—— 本文件为虚构示例，不包含任何真实信息。',
].join('\n');

function createText(): Buffer {
  return Buffer.from(TEXT_BODY, 'utf8');
}

/** A stored, uncompressed ZIP with one entry — used to exercise the "cannot preview" path. */
function createZip(): Buffer {
  const fileName = Buffer.from('readme.txt', 'utf8');
  const content = Buffer.from(
    'This archive demonstrates a file format that cannot be previewed in the browser.\n',
    'utf8',
  );
  const checksum = crc32(content);
  const { date, time } = dosTimestamp();

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0x0800, 6); // UTF-8 file name flag
  local.writeUInt16LE(0, 8); // stored
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(date, 12);
  local.writeUInt32LE(checksum, 14);
  local.writeUInt32LE(content.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(fileName.length, 26);
  local.writeUInt16LE(0, 28);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4); // version made by
  central.writeUInt16LE(20, 6); // version needed
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt16LE(time, 12);
  central.writeUInt16LE(date, 14);
  central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(content.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(fileName.length, 28);
  central.writeUInt16LE(0, 30); // extra
  central.writeUInt16LE(0, 32); // comment
  central.writeUInt16LE(0, 34); // disk
  central.writeUInt16LE(0, 36); // internal attributes
  central.writeUInt32LE(0, 38); // external attributes
  central.writeUInt32LE(0, 42); // local header offset

  const localPart = Buffer.concat([local, fileName, content]);
  const centralPart = Buffer.concat([central, fileName]);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralPart.length, 12);
  end.writeUInt32LE(localPart.length, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([localPart, centralPart, end]);
}

function dosTimestamp(): { date: number; time: number } {
  const year = 2024;
  const month = 1;
  const day = 1;
  return {
    date: ((year - 1980) << 9) | (month << 5) | day,
    time: 0,
  };
}
