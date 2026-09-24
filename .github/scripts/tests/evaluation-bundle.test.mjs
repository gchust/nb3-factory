import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { crc32, deflateRawSync } from 'node:zlib';
import { createBundle, idempotencyKey, readZip, verifyBundle, writeZip } from '../evaluation-bundle.mjs';
import { buildEvaluation, finalizeEvaluation } from '../evaluation-report.mjs';
import { buildArtifacts, png, reportFor, temporary, usageRecord } from './evaluation-fixtures.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
function evaluationBytes(t) {
  const root = temporary(t);
  buildArtifacts(root);
  const { draft } = buildEvaluation({ report: reportFor(root, usageRecord()), root });
  return finalizeEvaluation(draft, { revision: 1, createdAt: '2026-09-25T00:00:00Z' }).bytes;
}
// Hand-built archive entries for hostile inputs the writer refuses to produce.
function rawZip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const { name, data, stored = data, method = 0, mode = 0o100644, declared = data.length, localName = name } of entries) {
    const nameBytes = Buffer.from(name), localBytes = Buffer.from(localName);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(data) >>> 0, 14); local.writeUInt32LE(stored.length, 18); local.writeUInt32LE(declared, 22); local.writeUInt16LE(localBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE((3 << 8) | 20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc32(data) >>> 0, 16); central.writeUInt32LE(stored.length, 20); central.writeUInt32LE(declared, 24);
    central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE((mode << 16) >>> 0, 38); central.writeUInt32LE(offset, 42);
    locals.push(local, localBytes, stored); centrals.push(central, nameBytes);
    offset += 30 + localBytes.length + stored.length;
  }
  const directory = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

test('bundles are byte-identical for identical content and list every file except the manifest', t => {
  const bytes = evaluationBytes(t);
  const files = [{ path: 'evidence/verify-1/browser-acceptance/b01.png', role: 'evidence', mediaType: 'image/png', data: png, evidenceIds: ['qa/1/b01.png'] }];
  const a = createBundle({ evaluationBytes: bytes, files }), b = createBundle({ evaluationBytes: bytes, files: [...files].reverse() });
  assert.equal(a.sha256, b.sha256);
  assert.deepEqual(a.zip, b.zip);
  assert.deepEqual(a.manifest.files.map(f => f.path), ['evaluation.json', 'evidence/verify-1/browser-acceptance/b01.png']);
  assert.ok(!a.manifest.files.some(f => f.path === 'manifest.json'));
  const { evaluation, manifest } = verifyBundle(a.zip, { sha256: a.sha256 });
  assert.equal(manifest.subject.key, evaluation.run.key);
  assert.throws(() => verifyBundle(a.zip, { sha256: '0'.repeat(64) }), /SHA-256/);
  assert.match(idempotencyKey({ instance: 'o/r', type: 'evaluation-report', key: evaluation.run.key, revision: 1 }), /^nb3-eval-v1-[a-f0-9]{64}$/);
});

test('the reader rejects escapes, links, duplicates, forged sizes, unsupported compression and bombs', () => {
  const data = Buffer.from('x');
  for (const name of ['/etc/passwd', '../x', 'a/../../x', 'a\\..\\x', 'C:/x', 'a//b', './a'])
    assert.throws(() => readZip(rawZip([{ name, data }])), /Unsafe/, name);
  assert.throws(() => readZip(rawZip([{ name: 'link', data, mode: 0o120777 }])), /Links/);
  assert.throws(() => readZip(rawZip([{ name: 'fifo', data, mode: 0o010644 }])), /Links/);
  assert.throws(() => readZip(rawZip([{ name: 'a', data }, { name: 'a', data }])), /Duplicate/);
  assert.throws(() => readZip(rawZip([{ name: 'a', data, declared: 9 }])), /Unsupported ZIP compression|Forged|mismatch/);
  assert.throws(() => readZip(rawZip([{ name: 'a', data, localName: 'b' }])), /disagrees/);
  const bomb = Buffer.alloc(8 * 1024 * 1024);
  const packed = deflateRawSync(bomb);
  // A tiny deflated entry that claims a small size but expands much further.
  assert.throws(() => readZip(rawZip([{ name: 'bomb', data: bomb.subarray(0, 10), stored: packed, method: 8, declared: 10 }]), { allowDeflate: true }), /declared size|mismatch/);
  assert.throws(() => readZip(rawZip([{ name: 'bomb', data: bomb, stored: packed, method: 8 }])), /compression/); // bundles are never deflated
  assert.throws(() => readZip(rawZip([{ name: 'big', data: bomb, stored: packed, method: 8 }]), { allowDeflate: true, maxUnpacked: 1024 }), /unpacked/);
  assert.throws(() => readZip(rawZip(Array.from({ length: 5 }, (_, i) => ({ name: `f${i}`, data }))), { maxFiles: 4 }), /entries/);
  assert.equal(readZip(rawZip([{ name: 'ok', data: Buffer.from('hello'), stored: deflateRawSync(Buffer.from('hello')), method: 8 }]), { allowDeflate: true })[0].data.toString(), 'hello');
  assert.throws(() => writeZip([{ path: '../x', data }]), /Invalid/);
});

test('a bundle with an unlisted, altered or mislabelled file is rejected', t => {
  const bytes = evaluationBytes(t);
  const { zip, manifestBytes } = createBundle({ evaluationBytes: bytes });
  const extra = writeZip([{ path: 'evaluation.json', data: bytes }, { path: 'manifest.json', data: manifestBytes }, { path: 'evidence/x.png', data: png }]);
  assert.throws(() => verifyBundle(extra), /Unlisted/);
  const altered = JSON.parse(bytes); altered.outcome.acceptance = 'failed';
  const swapped = writeZip([{ path: 'evaluation.json', data: Buffer.from(JSON.stringify(altered)) }, { path: 'manifest.json', data: manifestBytes }]);
  assert.throws(() => verifyBundle(swapped), /does not match manifest/);
  assert.throws(() => verifyBundle(zip, { subject: { revision: 2 } }), /revision/);
  assert.equal(sha(zip), createBundle({ evaluationBytes: bytes }).sha256);
});
