// Deterministic evaluation bundles and a strict ZIP reader. The writer stores
// entries uncompressed with fixed timestamps and sorted paths, so the same
// content always yields the same bytes; the reader rejects path escapes, links,
// duplicates, forged sizes and decompression bombs before reading any content.
import { createHash } from 'node:crypto';
import { crc32, inflateRawSync } from 'node:zlib';
import { assertSchema, loadContract } from './json-schema.mjs';

export const BUNDLE_LIMITS = { zipBytes: 64 * 1024 * 1024, unpackedBytes: 128 * 1024 * 1024, files: 2048, jsonBytes: 4 * 1024 * 1024 };
const sha256 = value => createHash('sha256').update(value).digest('hex');
const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01, the earliest ZIP date.
const UTF8 = 0x0800;

export function safeEntryName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 300 && !name.includes('\\') && !name.includes('\0') &&
    !name.startsWith('/') && !/^[A-Za-z]:/.test(name) &&
    name.split('/').every(part => part && part !== '.' && part !== '..' && !/[\u0000-\u001f]/u.test(part));
}

export function writeZip(files) {
  const entries = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const names = new Set();
  const locals = [], centrals = [];
  let offset = 0;
  for (const { path, data } of entries) {
    if (!safeEntryName(path) || names.has(path)) throw new Error(`Invalid or duplicate bundle path: ${path}`);
    names.add(path);
    const name = Buffer.from(path, 'utf8');
    const crc = crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(UTF8, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(DOS_DATE, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE((3 << 8) | 20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(UTF8, 8);
    central.writeUInt16LE(0, 10); central.writeUInt16LE(0, 12); central.writeUInt16LE(DOS_DATE, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38); central.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

// allowDeflate is only for GitHub's own artifact wrapper; evaluation bundles are stored.
export function readZip(buffer, { maxFiles = BUNDLE_LIMITS.files, maxUnpacked = BUNDLE_LIMITS.unpackedBytes, maxZip = BUNDLE_LIMITS.zipBytes, allowDeflate = false } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22 || buffer.length > maxZip) throw new Error('ZIP is empty or exceeds its size limit');
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 65535); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP end record not found');
  const count = buffer.readUInt16LE(eocd + 10);
  const size = buffer.readUInt32LE(eocd + 12), start = buffer.readUInt32LE(eocd + 16);
  if (buffer.readUInt16LE(eocd + 4) || buffer.readUInt16LE(eocd + 6) || count !== buffer.readUInt16LE(eocd + 8) ||
      count === 0xffff || start === 0xffffffff || start + size > eocd) throw new Error('Unsupported or corrupt ZIP directory');
  if (count > maxFiles) throw new Error(`ZIP has more than ${maxFiles} entries`);
  const entries = [], names = new Set();
  let cursor = start, total = 0, previousEnd = 0;
  for (let n = 0; n < count; n++) {
    if (cursor + 46 > start + size || buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Corrupt ZIP central directory');
    const madeBy = buffer.readUInt16LE(cursor + 4) >> 8;
    const flags = buffer.readUInt16LE(cursor + 8), method = buffer.readUInt16LE(cursor + 10);
    const crc = buffer.readUInt32LE(cursor + 16), compressed = buffer.readUInt32LE(cursor + 20), uncompressed = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28), extraLength = buffer.readUInt16LE(cursor + 30), commentLength = buffer.readUInt16LE(cursor + 32);
    const external = buffer.readUInt32LE(cursor + 38), offset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    cursor += 46 + nameLength + extraLength + commentLength;
    if (flags & 0x1) throw new Error('Encrypted ZIP entries are not accepted');
    const directory = name.endsWith('/');
    const clean = directory ? name.slice(0, -1) : name;
    if (!safeEntryName(clean)) throw new Error(`Unsafe ZIP entry path: ${JSON.stringify(name)}`);
    if (names.has(clean)) throw new Error(`Duplicate ZIP entry: ${clean}`);
    names.add(clean);
    const mode = madeBy === 3 ? external >>> 16 : 0;
    const type = mode & 0o170000;
    if (type === 0o120000 || (type && type !== 0o100000 && type !== 0o040000)) throw new Error(`Links and special files are not accepted: ${clean}`);
    if (directory) { if (compressed || uncompressed) throw new Error('Directory entry with data'); continue; }
    if (method === 0 ? compressed !== uncompressed : method !== 8 || !allowDeflate) throw new Error(`Unsupported ZIP compression for ${clean}`);
    total += uncompressed;
    if (total > maxUnpacked) throw new Error('ZIP unpacked size exceeds its limit');
    if (offset < previousEnd || offset + 30 > start || buffer.readUInt32LE(offset) !== 0x04034b50) throw new Error(`Overlapping or corrupt local entry: ${clean}`);
    const localName = buffer.subarray(offset + 30, offset + 30 + buffer.readUInt16LE(offset + 26)).toString('utf8');
    const localMethod = buffer.readUInt16LE(offset + 8), localFlags = buffer.readUInt16LE(offset + 6);
    if (localName !== name || localMethod !== method) throw new Error(`Local header disagrees with directory: ${clean}`);
    if (!(localFlags & 0x8) && (buffer.readUInt32LE(offset + 18) !== compressed || buffer.readUInt32LE(offset + 22) !== uncompressed))
      throw new Error(`Forged ZIP size: ${clean}`);
    const dataStart = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28);
    const dataEnd = dataStart + compressed;
    if (dataEnd > start) throw new Error(`ZIP entry exceeds archive: ${clean}`);
    previousEnd = dataEnd;
    const raw = buffer.subarray(dataStart, dataEnd);
    let data;
    try { data = method === 0 ? Buffer.from(raw) : inflateRawSync(raw, { maxOutputLength: Math.max(1, uncompressed) }); }
    catch { throw new Error(`ZIP entry cannot be decompressed within its declared size: ${clean}`); }
    if (data.length !== uncompressed || (crc32(data) >>> 0) !== crc) throw new Error(`ZIP entry size or checksum mismatch: ${clean}`);
    entries.push({ path: clean, data });
  }
  return entries;
}

export const idempotencyKey = ({ instance, type, key, revision }) =>
  `nb3-eval-v1-${sha256(`${instance}\n${type}\n${key}\n${revision}`)}`;

export function subjectOf(document) {
  if (document.type === 'evaluation-report') return { type: document.type, key: document.run.key, revision: document.revision, sourceInstance: document.source.instance };
  if (document.type === 'evaluation-batch') return { type: document.type, key: document.batch.subjectKey, revision: document.revision, sourceInstance: document.source.instance };
  throw new Error('Unknown evaluation document type');
}

// manifest.json lists every other file with its purpose and hash. It never lists itself.
export function createBundle({ evaluationBytes, files = [] }) {
  const document = JSON.parse(evaluationBytes.toString('utf8'));
  const all = [{ path: 'evaluation.json', role: document.type, mediaType: 'application/json', data: evaluationBytes }, ...files];
  const manifest = {
    schemaVersion: 1, type: 'evaluation-bundle', subject: subjectOf(document),
    files: all.map(file => ({ path: file.path, role: file.role, mediaType: file.mediaType, size: file.data.length, sha256: sha256(file.data),
      ...(file.evidenceIds?.length ? { evidenceIds: [...new Set(file.evidenceIds)].sort() } : {}) }))
      .sort((a, b) => (a.path < b.path ? -1 : 1)),
  };
  assertSchema(loadContract('evaluation-bundle.v1'), manifest, 'bundle manifest');
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const zip = writeZip([...all.map(({ path, data }) => ({ path, data })), { path: 'manifest.json', data: manifestBytes }]);
  if (zip.length > BUNDLE_LIMITS.zipBytes) throw new Error('Evaluation bundle exceeds 64 MiB');
  return { zip, sha256: sha256(zip), manifest, manifestBytes };
}

export function verifyBundle(zip, { sha256: expected, subject } = {}) {
  if (expected && sha256(zip) !== expected) throw new Error('Bundle SHA-256 does not match its registered revision');
  const entries = readZip(zip);
  const byPath = new Map(entries.map(entry => [entry.path, entry.data]));
  const json = (file, limit = BUNDLE_LIMITS.jsonBytes) => {
    const data = byPath.get(file);
    if (!data || data.length > limit) throw new Error(`Bundle ${file} is missing or too large`);
    return JSON.parse(data.toString('utf8'));
  };
  const manifest = assertSchema(loadContract('evaluation-bundle.v1'), json('manifest.json'), 'bundle manifest');
  const evaluation = json('evaluation.json');
  if (!['evaluation-report', 'evaluation-batch'].includes(evaluation?.type)) throw new Error('Unknown evaluation document type');
  assertSchema(loadContract(`${evaluation.type}.v1`), evaluation, evaluation.type);
  const actual = subjectOf(evaluation);
  for (const key of ['type', 'key', 'revision', 'sourceInstance']) {
    if (manifest.subject[key] !== actual[key] || (subject && subject[key] !== undefined && subject[key] !== actual[key]))
      throw new Error(`Bundle ${key} does not match its registered identity`);
  }
  const listed = new Set(manifest.files.map(file => file.path));
  for (const file of manifest.files) {
    const data = byPath.get(file.path);
    if (!data || data.length !== file.size || sha256(data) !== file.sha256) throw new Error(`Bundle file does not match manifest: ${file.path}`);
  }
  for (const path of byPath.keys()) if (path !== 'manifest.json' && !listed.has(path)) throw new Error(`Unlisted bundle file: ${path}`);
  return { manifest, evaluation, entries };
}
