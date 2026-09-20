import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { findFfmpeg } from '../check-recording-health.mjs';
import {
  DEFAULT_MAX_BYTES,
  prepareRecordings,
  probeDurationSeconds,
  splitArguments,
  splitRecording,
} from '../prepare-recordings.mjs';

const write = (file, bytes = 2_000) => writeFileSync(file, Buffer.alloc(bytes));

test('a recording inside the budget is published untouched', (t) => {
  const evidence = mkdtempSync(path.join(os.tmpdir(), 'nb3-parts-'));
  t.after(() => rmSync(evidence, { recursive: true, force: true }));
  const file = path.join(evidence, 'acceptance-admin.webm');
  write(file, DEFAULT_MAX_BYTES);
  // A missing encoder proves the size check happens before any ffmpeg call.
  assert.equal(
    splitRecording('/nonexistent/ffmpeg', file, evidence, DEFAULT_MAX_BYTES),
    null,
  );
  assert.deepEqual(prepareRecordings(evidence, null), {
    maxBytes: DEFAULT_MAX_BYTES,
    splits: [],
    skipped: [{ reason: 'ffmpeg-unavailable' }],
  });
});

test('splitting re-encodes to a fixed frame rate so segments stay small', () => {
  const args = splitArguments('/tmp/in.webm', '/tmp/out-%02d.webm', 30);
  assert.equal(args[args.indexOf('-f') + 1], 'segment');
  assert.ok(args.includes('fps=5'));
  assert.equal(args[args.indexOf('-segment_time') + 1], '30');
  assert.match(args.join(' '), /force_key_frames/);
  assert.ok(args.at(-1).endsWith('%02d.webm'));
});

test('splits an oversized recording into ordered parts when ffmpeg is available', (t) => {
  const ffmpeg = findFfmpeg();
  const evidence = mkdtempSync(path.join(os.tmpdir(), 'nb3-parts-'));
  mkdirSync(evidence, { recursive: true });
  t.after(() => rmSync(evidence, { recursive: true, force: true }));
  const file = path.join(evidence, 'acceptance-admin.webm');
  if (!ffmpeg) {
    // Without the optional encoder the manifest stays empty instead of failing the round.
    write(file, 50_000);
    assert.deepEqual(prepareRecordings(evidence, null), {
      maxBytes: DEFAULT_MAX_BYTES,
      splits: [],
      skipped: [{ reason: 'ffmpeg-unavailable' }],
    });
    return;
  }
  const rendered = spawnSync(
    ffmpeg,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=s=320x240:r=10:d=8',
      '-c:v',
      'libvpx',
      '-b:v',
      '600k',
      file,
      '-y',
    ],
    { timeout: 60_000 },
  );
  assert.equal(rendered.status, 0);
  assert.ok(probeDurationSeconds(ffmpeg, file) >= 7);
  const maxBytes = 60_000;
  const plan = prepareRecordings(evidence, ffmpeg, maxBytes);
  assert.equal(plan.skipped.length, 0);
  assert.equal(plan.splits.length, 1);
  const split = plan.splits[0];
  assert.equal(split.file, 'acceptance-admin.webm');
  assert.ok(split.parts.length >= 2, 'expected the recording to be split');
  assert.deepEqual(
    split.parts,
    Array.from(
      { length: split.parts.length },
      (_, index) =>
        `acceptance-admin-part-${String(index + 1).padStart(2, '0')}.webm`,
    ),
  );
  for (const part of split.parts) {
    const bytes = statSync(path.join(evidence, part)).size;
    assert.ok(bytes > 1_000 && bytes <= maxBytes, `${part} is ${bytes} bytes`);
  }
  assert.ok(
    readdirSync(evidence).includes('acceptance-admin.webm'),
    'the original recording stays in the artifact',
  );
});
