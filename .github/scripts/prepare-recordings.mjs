import {
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { findFfmpeg, listRecordings } from './check-recording-health.mjs';

// GitHub refuses comment attachments above a per-file budget (10 MB for video on a free plan),
// and a whole-run acceptance recording can pass it. Splitting keeps the recording reviewable in
// the pull request instead of pushing it to the artifact only. Publication is the only concern
// here: the original stays in the artifact, and visual-report.mjs reads the manifest this writes.

export const DEFAULT_MAX_BYTES = 9_500_000;
// Aim below the hard limit so one re-encode pass is enough.
const TARGET_SHARE = 0.8;
const MAX_ATTEMPTS = 3;
const MIN_PART_BYTES = 1_000;
const MAX_PARTS = 40;
const SPLIT_TIMEOUT_MS = 900_000;

export function probeDurationSeconds(ffmpeg, file) {
  const result = spawnSync(ffmpeg, ['-hide_banner', '-i', file], {
    encoding: 'utf8',
    timeout: 60_000,
    killSignal: 'SIGKILL',
  });
  const match = /Duration:\s*(\d+):(\d\d):(\d\d(?:\.\d+)?)/u.exec(
    result.stderr ?? '',
  );
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

export function splitArguments(file, pattern, segmentSeconds) {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-i',
    file,
    '-an',
    '-vf',
    'fps=5',
    '-c:v',
    'libvpx',
    '-crf',
    '33',
    '-b:v',
    '0',
    '-deadline',
    'good',
    '-cpu-used',
    '2',
    '-f',
    'segment',
    '-segment_time',
    String(segmentSeconds),
    '-reset_timestamps',
    '1',
    '-force_key_frames',
    `expr:gte(t,n_forced*${segmentSeconds})`,
    pattern,
  ];
}

export function partPrefix(file) {
  return `${path.basename(file, '.webm')}-part-`;
}

function producedParts(evidence, file) {
  return readdirSync(evidence)
    .filter(
      (name) => name.startsWith(partPrefix(file)) && name.endsWith('.webm'),
    )
    .sort()
    .map((name) => ({
      name,
      bytes: statSync(path.join(evidence, name)).size,
    }));
}

function removeParts(evidence, file) {
  for (const part of producedParts(evidence, file))
    rmSync(path.join(evidence, part.name));
}

// ffmpeg numbers segments from zero; humans and the report count from one. Renaming runs from
// the last part backwards so a target name is always free when it is written.
function numberParts(evidence, file, parts) {
  const names = parts.map(
    (_, index) =>
      `${partPrefix(file)}${String(index + 1).padStart(2, '0')}.webm`,
  );
  for (let index = parts.length - 1; index >= 0; index--) {
    if (parts[index].name === names[index]) continue;
    renameSync(
      path.join(evidence, parts[index].name),
      path.join(evidence, names[index]),
    );
  }
  return names.map((name, index) => ({ name, bytes: parts[index].bytes }));
}

// Returns null when the recording already fits, an { error } when it could not be split, and a
// split descriptor otherwise.
export function splitRecording(
  ffmpeg,
  file,
  evidence,
  maxBytes = DEFAULT_MAX_BYTES,
) {
  const bytes = statSync(file).size;
  if (bytes <= maxBytes) return null;
  const duration = probeDurationSeconds(ffmpeg, file);
  if (!duration || duration < 2) return { error: '无法读取录像时长' };
  let parts = Math.max(2, Math.ceil(bytes / (maxBytes * TARGET_SHARE)));
  for (
    let attempt = 0;
    attempt < MAX_ATTEMPTS && parts <= MAX_PARTS;
    attempt++
  ) {
    // One segment per remaining second is the useful ceiling: shorter pieces carry no
    // picture a reviewer could follow.
    const segmentSeconds = Math.max(
      1,
      Math.ceil(duration / Math.min(parts, Math.max(2, Math.floor(duration)))),
    );
    const result = spawnSync(
      ffmpeg,
      splitArguments(
        file,
        path.join(evidence, `${partPrefix(file)}%02d.webm`),
        segmentSeconds,
      ),
      { encoding: 'utf8', timeout: SPLIT_TIMEOUT_MS, killSignal: 'SIGKILL' },
    );
    const produced = producedParts(evidence, file);
    const usable =
      !result.error &&
      result.status === 0 &&
      produced.length >= 2 &&
      produced.every(
        (part) => part.bytes >= MIN_PART_BYTES && part.bytes <= maxBytes,
      );
    if (usable) {
      const numbered = numberParts(evidence, file, produced);
      return {
        file: path.basename(file),
        bytes,
        seconds: Math.round(duration),
        segmentSeconds,
        parts: numbered.map((part) => part.name),
        partBytes: numbered.map((part) => part.bytes),
      };
    }
    // A busy stretch can fill one segment while the rest stays empty, so scale the next
    // attempt by how far the worst segment overshot rather than inching ahead.
    const worst = produced.reduce((max, part) => Math.max(max, part.bytes), 0);
    removeParts(evidence, file);
    parts = Math.min(
      MAX_PARTS + 1,
      worst > maxBytes
        ? Math.max(parts + 1, Math.ceil((parts * worst * 1.15) / maxBytes))
        : parts * 2,
    );
  }
  removeParts(evidence, file);
  console.warn(
    `::warning::${path.basename(file)} could not be split below ${maxBytes} bytes; leaving it in the artifact.`,
  );
  return { error: `分段后仍超过 ${maxBytes} 字节` };
}

export function prepareRecordings(
  evidence,
  ffmpeg = findFfmpeg(),
  maxBytes = DEFAULT_MAX_BYTES,
) {
  const plan = { maxBytes, splits: [], skipped: [] };
  if (!ffmpeg) {
    plan.skipped.push({ reason: 'ffmpeg-unavailable' });
    return plan;
  }
  for (const name of listRecordings(evidence)) {
    const file = path.join(evidence, name);
    let split;
    try {
      split = splitRecording(ffmpeg, file, evidence, maxBytes);
    } catch (error) {
      plan.skipped.push({ file: name, reason: error.message });
      continue;
    }
    if (!split) continue;
    if (split.error) plan.skipped.push({ file: name, reason: split.error });
    else plan.splits.push(split);
  }
  return plan;
}

function main() {
  const argv = process.argv.slice(2);
  const args = Object.fromEntries(
    Array.from({ length: argv.length / 2 }, (_, index) => [
      argv[index * 2].replace(/^--/, ''),
      argv[index * 2 + 1],
    ]),
  );
  if (!args.evidence || !args.output)
    throw new Error('Usage: --evidence <dir> --output <media-parts.json>');
  const maxBytes = args['max-bytes']
    ? Number(args['max-bytes'])
    : DEFAULT_MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1_000_000)
    throw new Error('Invalid --max-bytes');
  const plan = prepareRecordings(
    path.resolve(args.evidence),
    findFfmpeg(),
    maxBytes,
  );
  const output = path.resolve(args.output);
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(
    plan.splits.length
      ? `Split ${plan.splits.length} oversized recording(s) for attachment.`
      : 'No recording exceeded the attachment budget.',
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
    console.warn(`Warning: recording split skipped (${error.message}).`);
  }
}
