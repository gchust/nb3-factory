/**
 * Plain-text extraction from a DOCX, used only when the rich `@silurus/ooxml` viewer cannot
 * render. That viewer parses in a module worker; when the worker never publishes layout
 * progress, `viewer.load()` neither resolves nor rejects, so the preview would otherwise sit
 * on its loading state forever.
 *
 * DOCX is a ZIP archive and the body text lives in `word/document.xml`. The browser inflates
 * the deflate entry with `DecompressionStream`, so this fallback needs no parser dependency
 * and never hangs on a worker. The result is text only — the caller labels it as such.
 */

const DOCUMENT_PART = 'word/document.xml';
const MAX_TEXT_LENGTH = 200_000;

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const STORED = 0;
const DEFLATED = 8;
/** The fixed EOCD record is 22 bytes; a trailing comment may follow it. */
const MINIMUM_ZIP_LENGTH = 22;
const MAXIMUM_COMMENT_LENGTH = 65_535;

export async function extractDocxText(
  data: ArrayBuffer,
): Promise<string | undefined> {
  if (typeof DecompressionStream === 'undefined') return undefined;
  try {
    const xml = await readZipEntry(data, DOCUMENT_PART);
    if (!xml) return undefined;
    const text = documentXmlToText(new TextDecoder('utf-8').decode(xml));
    return text ? text.slice(0, MAX_TEXT_LENGTH) : undefined;
  } catch {
    // A damaged or unexpected archive is not a viewable document, not a crash.
    return undefined;
  }
}

async function readZipEntry(
  data: ArrayBuffer,
  wanted: string,
): Promise<Uint8Array | undefined> {
  const bytes = new Uint8Array(data);
  if (bytes.length < MINIMUM_ZIP_LENGTH) return undefined;
  const view = new DataView(data);
  const end = findEndOfCentralDirectory(view);
  if (end < 0) return undefined;

  const entryCount = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  for (let index = 0; index < entryCount; index += 1) {
    if (
      offset + 46 > bytes.length ||
      view.getUint32(offset, true) !== CENTRAL_DIRECTORY_ENTRY
    ) {
      return undefined;
    }
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    if (offset + 46 + nameLength > bytes.length) return undefined;
    const name = new TextDecoder('utf-8').decode(
      bytes.subarray(offset + 46, offset + 46 + nameLength),
    );
    if (name === wanted) {
      return inflateEntry(bytes, view, localOffset, method, compressedSize);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return undefined;
}

function findEndOfCentralDirectory(view: DataView): number {
  const minimum = Math.max(
    0,
    view.byteLength - MINIMUM_ZIP_LENGTH - MAXIMUM_COMMENT_LENGTH,
  );
  for (
    let offset = view.byteLength - MINIMUM_ZIP_LENGTH;
    offset >= minimum;
    offset -= 1
  ) {
    if (view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY)
      return offset;
  }
  return -1;
}

async function inflateEntry(
  bytes: Uint8Array,
  view: DataView,
  localOffset: number,
  method: number,
  compressedSize: number,
): Promise<Uint8Array | undefined> {
  if (
    localOffset + 30 > bytes.length ||
    view.getUint32(localOffset, true) !== LOCAL_FILE_HEADER
  ) {
    return undefined;
  }
  const nameLength = view.getUint16(localOffset + 26, true);
  const extraLength = view.getUint16(localOffset + 28, true);
  const start = localOffset + 30 + nameLength + extraLength;
  const end = start + compressedSize;
  if (end > bytes.length) return undefined;
  const compressed = bytes.subarray(start, end);
  if (method === STORED) return compressed.slice();
  if (method !== DEFLATED) return undefined;
  return inflateRaw(compressed);
}

async function inflateRaw(compressed: Uint8Array): Promise<Uint8Array> {
  const stream = new DecompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  // A `Uint8Array` view can be backed by a `SharedArrayBuffer`; the stream writer only accepts
  // an `ArrayBuffer`-backed source, so hand it a copy.
  const source = new Uint8Array(compressed);
  void writer.write(source).then(
    () => writer.close(),
    () => writer.abort(),
  );
  const buffer = await new Response(stream.readable).arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Reads the runs of a WordprocessingML body into paragraphs. `w:t` holds the visible runs;
 * `w:tab`, `w:br` and `w:cr` are whitespace controls that only carry meaning once the tags
 * around them are gone.
 */
function documentXmlToText(xml: string): string {
  const withBreaks = xml
    .replace(/<w:(?:tab|ptab)\b[^>]*\/?>/gu, '\t')
    .replace(/<w:(?:br|cr)\b[^>]*\/?>/gu, '\n');
  const lines: string[] = [];
  for (const paragraph of withBreaks.split(/<\/w:p\s*>/u)) {
    let line = '';
    const runs = /<w:t\b[^>]*>([\s\S]*?)<\/w:t\s*>/gu;
    let match: RegExpExecArray | null;
    while ((match = runs.exec(paragraph)) !== null) {
      line += decodeXmlEntities(match[1] ?? '');
    }
    lines.push(line);
  }
  return lines
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/gu, (_match, hex: string) =>
      codePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/gu, (_match, decimal: string) =>
      codePoint(Number(decimal)),
    )
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, '&');
}

function codePoint(value: number): string {
  try {
    return String.fromCodePoint(value);
  } catch {
    return '';
  }
}
