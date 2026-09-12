import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { lstatSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Media health is diagnostic: it tells the visual report whether a recording shows any work at
// all, so a video left running on a screen nobody is operating is labelled instead of published
// as evidence. It never changes the business acceptance result.

// Sample one frame per second at a small fixed size: enough to separate real operations from a
// page that only keeps repainting site chrome, cheap enough for a long acceptance run.
export const SAMPLE_WIDTH = 160;
export const SAMPLE_HEIGHT = 120;
export const SAMPLE_BYTES = SAMPLE_WIDTH * SAMPLE_HEIGHT;

// Mean absolute luminance change between two sampled seconds. Calibrated on published factory
// recordings: a click, a dialog, a navigation or a filled field moves this well above 0.5,
// while a blinking caret, a spinner or a hover highlight stays below it.
export const OPERATION_THRESHOLD = 0.5;

// A pause while a step runs is normal. Half a recording spent with no operation at all, for at
// least two minutes, means the video no longer shows the work its title claims.
export const IDLE_SECONDS_LIMIT = 120;
export const IDLE_SHARE_LIMIT = 0.5;

const DECODE_TIMEOUT_MS = 300_000;
const PROBE_TIMEOUT_MS = 20_000;
const MAX_VIDEOS = 12;
const VIDEO_NAME = /^[A-Za-z0-9][A-Za-z0-9-]*\.webm$/;

export function meanAbsoluteDifference(previous, current) {
  let total = 0;
  for (let index = 0; index < current.length; index++)
    total += Math.abs(current[index] - previous[index]);
  return total / current.length;
}

// `buffer` holds consecutive gray frames of `frameBytes`; one sampled second per frame.
export function analyzeFrames(
  buffer,
  frameBytes = SAMPLE_BYTES,
  threshold = OPERATION_THRESHOLD,
) {
  const seconds = Math.floor(buffer.length / frameBytes);
  let operatedSeconds = 0;
  let longestIdleSeconds = 0;
  let run = 0;
  for (let index = 1; index < seconds; index++) {
    const previous = buffer.subarray(
      (index - 1) * frameBytes,
      index * frameBytes,
    );
    const current = buffer.subarray(
      index * frameBytes,
      (index + 1) * frameBytes,
    );
    const operated = meanAbsoluteDifference(previous, current) > threshold;
    if (operated) {
      operatedSeconds++;
      run = 0;
    } else {
      run++;
      if (run > longestIdleSeconds) longestIdleSeconds = run;
    }
  }
  return { seconds, operatedSeconds, longestIdleSeconds };
}

export function judgeRecording({
  seconds,
  operatedSeconds,
  longestIdleSeconds,
}) {
  if (seconds < 3) return { ok: false, reason: '录像过短或无法解码' };
  if (operatedSeconds === 0)
    return { ok: false, reason: '整段没有可辨识的操作画面' };
  const share = seconds > 0 ? longestIdleSeconds / seconds : 0;
  if (longestIdleSeconds >= IDLE_SECONDS_LIMIT && share >= IDLE_SHARE_LIMIT)
    return {
      ok: false,
      reason: `连续 ${longestIdleSeconds} 秒没有可辨识的操作（占整段的 ${Math.round(share * 100)}%）`,
    };
  return { ok: true, reason: '' };
}

export function findFfmpeg() {
  for (const candidate of [process.env.FACTORY_FFMPEG_PATH, 'ffmpeg'].filter(
    Boolean,
  )) {
    const probe = spawnSync(candidate, ['-hide_banner', '-version'], {
      encoding: 'utf8',
      timeout: PROBE_TIMEOUT_MS,
      killSignal: 'SIGKILL',
    });
    if (probe.status === 0) return candidate;
  }
  return null;
}

export function sampleFrames(ffmpeg, file) {
  const result = spawnSync(
    ffmpeg,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-i',
      file,
      '-an',
      '-sn',
      '-vf',
      `fps=1,scale=${SAMPLE_WIDTH}:${SAMPLE_HEIGHT}:flags=area,format=gray`,
      '-f',
      'rawvideo',
      '-',
    ],
    {
      maxBuffer: 512 * 1024 * 1024,
      timeout: DECODE_TIMEOUT_MS,
      killSignal: 'SIGKILL',
    },
  );
  if (result.error || result.status !== 0)
    return {
      ok: false,
      reason: `录像无法解码（${result.error?.code ?? `ffmpeg 退出码 ${result.status}`}）`,
    };
  return { ok: true, buffer: Buffer.from(result.stdout) };
}

export function listRecordings(directory) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && VIDEO_NAME.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .slice(0, MAX_VIDEOS);
}

export function collectRecordingHealth(evidence, ffmpeg = findFfmpeg()) {
  if (!ffmpeg)
    return { checked: false, reason: 'ffmpeg-unavailable', videos: [] };
  const videos = [];
  for (const file of listRecordings(evidence)) {
    const absolute = path.join(evidence, file);
    try {
      if (lstatSync(absolute).isSymbolicLink()) continue;
    } catch {
      continue;
    }
    const sample = sampleFrames(ffmpeg, absolute);
    if (!sample.ok) {
      videos.push({ file, ok: false, reason: sample.reason });
      continue;
    }
    const analysis = analyzeFrames(sample.buffer);
    videos.push({ file, ...analysis, ...judgeRecording(analysis) });
  }
  return { checked: true, ffmpeg: path.basename(ffmpeg), videos };
}

function main() {
  const argv = process.argv.slice(2);
  const argvPairs = Object.fromEntries(
    Array.from({ length: argv.length / 2 }, (_, index) => [
      argv[index * 2].replace(/^--/, ''),
      argv[index * 2 + 1],
    ]),
  );
  if (!argvPairs.evidence || !argvPairs.output)
    throw new Error('Usage: --evidence <dir> --output <media-health.json>');
  const health = collectRecordingHealth(path.resolve(argvPairs.evidence));
  const output = path.resolve(argvPairs.output);
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(health, null, 2)}\n`);
  for (const video of health.videos.filter((entry) => entry.ok === false))
    console.warn(`::warning::${video.file}: ${video.reason}`);
  console.log(
    health.checked
      ? `Recording health checked for ${health.videos.length} file(s).`
      : 'Recording health skipped: ffmpeg is unavailable.',
  );
}

// Optional media must not fail the acceptance run.
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.warn(`Warning: recording health check skipped (${error.message}).`);
  }
}
