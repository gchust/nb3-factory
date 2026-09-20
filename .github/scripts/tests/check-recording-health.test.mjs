import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  SAMPLE_BYTES,
  analyzeFrames,
  collectRecordingHealth,
  findFfmpeg,
  judgeRecording,
  listRecordings,
} from '../check-recording-health.mjs';

const grayFrames = (...values) =>
  Buffer.concat(values.map((value) => Buffer.alloc(SAMPLE_BYTES, value)));

test('counts operated seconds and the longest idle stretch', () => {
  const analysis = analyzeFrames(grayFrames(0, 0, 0, 255, 255, 254));
  assert.deepEqual(analysis, {
    seconds: 6,
    operatedSeconds: 2,
    longestIdleSeconds: 2,
  });
});

test('a recording with nothing happening is not healthy', () => {
  assert.equal(
    judgeRecording({ seconds: 8, operatedSeconds: 0, longestIdleSeconds: 7 })
      .ok,
    false,
  );
  assert.match(
    judgeRecording({ seconds: 8, operatedSeconds: 0, longestIdleSeconds: 7 })
      .reason,
    /没有可辨识的操作/,
  );
  assert.equal(
    judgeRecording({ seconds: 2, operatedSeconds: 1, longestIdleSeconds: 0 })
      .ok,
    false,
  );
});

test('a recording that is mostly one idle stretch is not healthy', () => {
  const published = judgeRecording({
    seconds: 348,
    operatedSeconds: 53,
    longestIdleSeconds: 107,
  });
  assert.equal(published.ok, true);
  const stuck = judgeRecording({
    seconds: 181,
    operatedSeconds: 2,
    longestIdleSeconds: 161,
  });
  assert.equal(stuck.ok, false);
  assert.match(stuck.reason, /连续 161 秒/);
});

test('skips the check when ffmpeg is unavailable and never throws', () => {
  assert.deepEqual(collectRecordingHealth('/nonexistent', null), {
    checked: false,
    reason: 'ffmpeg-unavailable',
    videos: [],
  });
});

test('lists only safe webm file names', (t) => {
  const evidence = mkdtempSync(path.join(os.tmpdir(), 'nb3-recording-list-'));
  t.after(() => rmSync(evidence, { recursive: true, force: true }));
  for (const name of [
    'acceptance-admin.webm',
    'acceptance-admin-2.webm',
    'page-assets.png',
    'not safe.webm',
    '../escape.webm',
    '.hidden.webm',
  ])
    writeFileSync(path.join(evidence, name), '');
  assert.deepEqual(listRecordings(evidence), [
    'acceptance-admin-2.webm',
    'acceptance-admin.webm',
  ]);
  assert.deepEqual(listRecordings(path.join(evidence, 'missing')), []);
});

test('detects a still recording end to end when ffmpeg is available', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-recording-health-'));
  const evidence = path.join(root, 'evidence');
  mkdirSync(evidence, { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) {
    // Without the optional encoder the same call has to report the check as unavailable.
    assert.deepEqual(collectRecordingHealth(evidence, ffmpeg), {
      checked: false,
      reason: 'ffmpeg-unavailable',
      videos: [],
    });
    return;
  }
  const render = (file, source) => {
    const result = spawnSync(
      ffmpeg,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        source,
        '-c:v',
        'libvpx',
        '-b:v',
        '300k',
        path.join(evidence, file),
        '-y',
      ],
      { timeout: 60_000 },
    );
    assert.equal(result.status, 0);
  };
  render('still.webm', 'color=c=black:s=320x240:r=8:d=8');
  render('moving.webm', 'testsrc2=s=320x240:r=8:d=8');
  const health = collectRecordingHealth(evidence, ffmpeg);
  assert.equal(health.checked, true);
  const verdicts = Object.fromEntries(
    health.videos.map((video) => [video.file, video]),
  );
  assert.equal(verdicts['still.webm'].ok, false);
  assert.equal(verdicts['moving.webm'].ok, true);
});
