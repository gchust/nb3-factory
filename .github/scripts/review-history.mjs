import { Buffer } from 'node:buffer';
// Original factory-visible interactions, not another model-generated summary.
// Capture all observable history independently of the source/QA snapshot budget.
// Stream original logs; chunk size is a target, never permission to drop an event.
import { createHash } from 'node:crypto';
import {
  closeSync,
  copyFileSync,
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { scrubHistoryFile } from './history-redaction.mjs';

const MiB = 1024 * 1024;
export const historyLimits = Object.freeze({ chunkBytes: MiB });
// Only used to validate already-published v1 history fingerprints.
const legacyLimits = Object.freeze({
  fileBytes: 32 * MiB,
  totalBytes: 64 * MiB,
  files: 2000,
  runs: 50,
});
const hash = (value) => createHash('sha256').update(value).digest('hex');
const suffix = /\.(?:prompt\.md|invocation\.json|result\.json)$/;
const logPattern =
  /^(?:agent-(?:implement|repair-[1-9]\d*)|verify-[1-9]\d*\/browser-(?:acceptance|focused)\/agent-browser-(?:acceptance|report-repair-[1-9]\d*))\.jsonl(?:\.(?:prompt\.md|invocation\.json|result\.json))?$/;
const runPattern = /^run-([1-9]\d*)-attempt-([1-9]\d*)$/;
const scope =
  '工厂可观察的本次搭建及已恢复 Handoff 交互；不是 CLI 内部上下文，不代表每个文件已被评审者读取。';
const bounded = (values) => {
  const unique = [...new Set(values)];
  return unique.length <= 50
    ? unique
    : [...unique.slice(0, 49), `另有 ${unique.length - 49} 项历史覆盖限制。`];
};
const save = (file, text) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text, { mode: 0o400 });
};
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function regular(root, relative) {
  const file = path.join(root, relative);
  if (
    !relative ||
    relative
      .split('/')
      .some((part) => !part || part === '.' || part === '..') ||
    relative.includes('\\') ||
    relative.includes('\0')
  )
    throw new Error('Unsafe history path');
  // Resolve the root once for macOS /tmp aliases; reject links below it.
  if (
    realpathSync(file) !== path.join(realpathSync(root), relative) ||
    !lstatSync(file).isFile()
  )
    throw new Error('History is not a regular file');
  return file;
}
function read(root, relative, maximum = Infinity) {
  const file = regular(root, relative);
  if (lstatSync(file).size > maximum)
    throw new Error('History file exceeds byte limit');
  return readFileSync(file);
}
function scan(root, warnings, legacy = false) {
  const files = [];
  function visit(relative = '') {
    let entries;
    try {
      entries = readdirSync(path.join(root, relative), { withFileTypes: true });
    } catch {
      warnings.push(`历史目录无法读取：${relative || '.'}`);
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      const directory =
        /^verify-[1-9]\d*(?:\/browser-(?:acceptance|focused))?$/.test(name);
      if (entry.isSymbolicLink()) {
        if (directory || logPattern.test(name))
          warnings.push(`历史链接未采集：${name}`);
        continue;
      }
      if (entry.isDirectory() && directory) visit(name);
      else if (entry.isFile() && logPattern.test(name)) files.push(name);
    }
  }
  visit();
  return legacy ? files.slice(0, legacyLimits.files) : files;
}

// Deliberately excludes mutable Run identity and QA scope. Matches the frozen
// business task rather than the Issue number alone; does not pool other builds.
function taskIdentity(metadata) {
  const task = metadata?.task ?? {};
  return {
    repository: metadata?.repository ?? null,
    issue: metadata?.issue?.number ?? null,
    controlSha: metadata?.controlSha ?? null,
    inputHash: hash(
      JSON.stringify([
        task.targetBranch,
        task.taskType,
        task.requirements,
        task.acceptanceCriteria,
        task.sampleData,
        task.buildReviewMode,
      ]),
    ),
  };
}
function metadataAt(root) {
  try {
    return JSON.parse(read(root, 'task-metadata.json', 2 * MiB));
  } catch {
    return null;
  }
}
function sources(root, metadata, warnings, legacy = false) {
  const identity = taskIdentity(metadata);
  const current = {
    ...identity,
    runId: metadata?.run?.id ?? null,
    attempt: metadata?.run?.attempt ?? null,
    prefix: '',
    files: scan(root, warnings, legacy),
    expected: null,
  };
  const result = [current];
  const directory = path.join(root, 'review-history');
  if (!existsSync(directory)) return result;
  if (
    realpathSync(directory) !== path.join(realpathSync(root), 'review-history')
  ) {
    warnings.push('续跑历史目录是链接，未采集。');
    return result;
  }
  try {
    const previous = JSON.parse(
      read(root, 'review-history/coverage.json', MiB),
    );
    if (Array.isArray(previous))
      warnings.push(
        ...previous.filter((value) => typeof value === 'string').slice(0, 50),
      );
  } catch {
    warnings.push('续跑历史覆盖记录缺失或无效。');
  }
  const names = readdirSync(directory)
    .filter((name) => runPattern.test(name))
    .sort()
    .reverse();
  for (const name of legacy ? names.slice(0, legacyLimits.runs) : names) {
    const prefix = `review-history/${name}/`;
    try {
      const stored = JSON.parse(
        read(root, `${prefix}source.json`, legacy ? MiB : Infinity),
      );
      if (
        stored.version !== 1 ||
        !identity.repository ||
        !identity.issue ||
        ['repository', 'issue', 'controlSha', 'inputHash'].some(
          (key) => stored[key] !== identity[key],
        ) ||
        name !== `run-${stored.runId}-attempt-${stored.attempt}` ||
        !Array.isArray(stored.files) ||
        (legacy && stored.files.length > legacyLimits.files)
      )
        throw new Error('History identity mismatch');
      const expected = new Map();
      for (const file of stored.files) {
        if (
          !logPattern.test(file.path) ||
          !/^[a-f0-9]{64}$/.test(file.sha256) ||
          expected.has(file.path)
        )
          throw new Error('Invalid history manifest');
        expected.set(file.path, file.sha256);
      }
      result.push({ ...stored, prefix, files: [...expected.keys()], expected });
    } catch {
      warnings.push(`续跑历史身份或清单无法验证：${name}`);
    }
  }
  return result;
}

// Keep ancestors separate from verify-N and usage logs, so they never become a
// new Run's QA verdict or token bill. Called only after checkpoint validation.
export function preserveReviewHistory(source, destination, metadata) {
  const warnings = [];
  const target = path.join(destination, 'review-history');
  const staging = `${target}.tmp`;
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  try {
    const previous = metadataAt(source);
    const expected = taskIdentity(metadata);
    if (
      !previous ||
      !expected.repository ||
      !expected.issue ||
      ['repository', 'issue', 'controlSha', 'inputHash'].some(
        (key) => taskIdentity(previous)[key] !== expected[key],
      )
    )
      throw new Error('Previous task identity unavailable or mismatched');
    for (const item of sources(source, previous, warnings)) {
      if (
        !/^[1-9]\d*$/.test(String(item.runId)) ||
        !/^[1-9]\d*$/.test(String(item.attempt))
      ) {
        warnings.push('原始 Run/attempt 未记录，未恢复该轮历史。');
        continue;
      }
      const directory = `run-${item.runId}-attempt-${item.attempt}`;
      if (existsSync(path.join(staging, directory))) {
        warnings.push(`重复的续跑历史身份：${directory}`);
        continue;
      }
      const files = [];
      for (const relative of item.files) {
        try {
          const file = regular(source, `${item.prefix}${relative}`);
          const sha256 = hashFile(file);
          if (item.expected && sha256 !== item.expected.get(relative))
            throw new Error('History fingerprint mismatch');
          const output = path.join(staging, directory, relative);
          mkdirSync(path.dirname(output), { recursive: true });
          copyFileSync(file, output);
          if (hashFile(output) !== sha256) {
            rmSync(output);
            throw new Error('History changed while copying');
          }
          chmodSync(output, 0o400);
          files.push({ path: relative, sha256 });
        } catch {
          warnings.push(
            `历史未恢复（不可读取或指纹不符）：${directory}/${relative}`,
          );
        }
      }
      save(
        path.join(staging, directory, 'source.json'),
        json({
          version: 1,
          ...expected,
          runId: item.runId,
          attempt: item.attempt,
          files,
        }),
      );
    }
  } catch {
    warnings.push('未能验证上一轮历史；不能声称已获得完整搭建过程。');
  }
  save(path.join(staging, 'coverage.json'), json(bounded(warnings)));
  rmSync(target, { recursive: true, force: true });
  // Rename is atomic within the artifact directory.
  renameSync(staging, target);
}

// Bounded memory for hashing and JSONL iteration, independent of total log size.
function hashFile(file) {
  const fd = openSync(file, 'r'),
    buffer = Buffer.alloc(64 * 1024),
    digest = createHash('sha256');
  try {
    let n;
    while ((n = readSync(fd, buffer, 0, buffer.length, null)))
      digest.update(buffer.subarray(0, n));
  } finally {
    closeSync(fd);
  }
  return digest.digest('hex');
}
function* linesOf(file) {
  const fd = openSync(file, 'r'),
    buffer = Buffer.alloc(64 * 1024),
    decoder = new StringDecoder('utf8');
  let pending = [];
  try {
    let n;
    while ((n = readSync(fd, buffer, 0, buffer.length, null))) {
      const text = decoder.write(buffer.subarray(0, n));
      let start = 0,
        end;
      while ((end = text.indexOf('\n', start)) !== -1) {
        pending.push(text.slice(start, end + 1));
        yield pending.join('');
        pending = [];
        start = end + 1;
      }
      if (start < text.length) pending.push(text.slice(start));
    }
    pending.push(decoder.end());
    if (pending.some(Boolean)) yield pending.join('');
  } finally {
    closeSync(fd);
  }
}
function recordsAt(root, version = 2) {
  const warnings = [],
    records = [];
  let bytes = 0;
  const add = (relative, item, expected) => {
    let file,
      sha256,
      size = null,
      reason;
    try {
      file = regular(root, relative);
      size = lstatSync(file).size;
      if (
        version === 1 &&
        (size > legacyLimits.fileBytes ||
          bytes + size > legacyLimits.totalBytes)
      )
        throw new Error('legacy byte limit');
      sha256 = hashFile(file);
      if (expected && sha256 !== expected)
        throw new Error('History fingerprint mismatch');
      bytes += size;
    } catch {
      file = undefined;
      sha256 = undefined;
      reason =
        version === 1
          ? 'unavailable-or-over-budget'
          : 'unavailable-or-fingerprint-mismatch';
      warnings.push(`历史未采集（不可读取或指纹不符）：${relative}`);
    }
    records.push({
      relative,
      file,
      sha256,
      size,
      reason,
      runId: item?.runId ?? null,
      attempt: item?.attempt ?? null,
    });
  };
  for (const item of sources(root, metadataAt(root), warnings, version === 1)) {
    if (item.prefix) add(`${item.prefix}source.json`, item);
    for (const file of item.files) {
      if (version === 1 && records.length >= legacyLimits.files) break;
      add(`${item.prefix}${file}`, item, item.expected?.get(file));
    }
  }
  if (existsSync(path.join(root, 'review-history/coverage.json')))
    add('review-history/coverage.json');
  return {
    records,
    warnings,
    fingerprint: hash(
      JSON.stringify(records.map((r) => [r.relative, r.sha256 ?? r.reason])),
    ),
  };
}

// Explicit version keeps old reports with size-limited fingerprints verifiable.
export function historyFingerprint(root, version = 2) {
  if (![1, 2].includes(version))
    throw new Error('Unsupported review history version');
  return recordsAt(root, version).fingerprint;
}

// A deterministic navigation aid, not a model summary or a substitute for raw events.
const transportEvents = new Set([
  'message_start',
  'message_update',
  'tool_execution_update',
  'turn_start',
  'turn_end',
  'agent_start',
  'agent_end',
  'agent_settled',
]);
function eventDetails(text) {
  let event;
  try {
    event = JSON.parse(text);
  } catch {
    return {
      type: 'unparsed',
      error: false,
      preview: text.slice(0, 240),
      previewTruncated: text.length > 240,
    };
  }
  if (!event || typeof event !== 'object')
    return { type: 'scalar', error: false };
  if (transportEvents.has(event.type)) return null;
  const item = event.item ?? event.message ?? event;
  const error =
    event.isError === true ||
    item.isError === true ||
    event.is_error === true ||
    item.is_error === true ||
    event.type === 'error' ||
    event.part?.state?.status === 'error' ||
    event.result?.isError === true ||
    (Array.isArray(item.content) &&
      item.content.some((block) => block?.is_error === true)) ||
    [event.exit_code, item.exit_code, event.result?.exitCode].some(
      (value) => typeof value === 'number' && value !== 0,
    );
  const preview =
    typeof event.args?.command === 'string'
      ? event.args.command
      : typeof item.command === 'string'
        ? item.command
        : '';
  return {
    type: event.type ?? 'event',
    ...(item.role ? { role: item.role } : {}),
    ...(event.toolName || item.name
      ? { tool: event.toolName ?? item.name }
      : {}),
    ...(event.toolCallId || item.call_id
      ? { callId: event.toolCallId ?? item.call_id }
      : {}),
    error,
    ...(preview
      ? {
          preview: preview.slice(0, 240),
          previewTruncated: preview.length > 240,
        }
      : {}),
  };
}

export function captureReviewHistory(
  root,
  destination,
  redact = (value) => value,
) {
  const { records, warnings, fingerprint } = recordsAt(root);
  const files = [],
    entries = [];
  let bytes = 0;
  const capture = (relative, text, source) => {
    const data = Buffer.from(text);
    save(path.join(destination, relative), data);
    files.push({
      path: relative,
      kind: 'text',
      sha256: hash(data),
      lines: text.split('\n').length,
      ...(source ? { source } : {}),
    });
    bytes += data.length;
  };
  for (const record of records) {
    const entry = {
      source: record.relative,
      runId: record.runId,
      attempt: record.attempt,
      sourceSha256: record.sha256 ?? null,
      sourceBytes: record.size,
      capturedBytes: 0,
      chunks: [],
      omitted: [],
      eventIndexes: [],
      errors: [],
    };
    entries.push(entry);
    if (!record.file) {
      entry.omitted.push(record.reason);
      continue;
    }
    let chunk = '',
      chunkBytes = 0,
      first = 1,
      line = 1,
      eventText = '',
      eventBytes = 0,
      eventCount = 0;
    const sourceInfo = () => ({
      path: record.relative,
      sha256: entry.sourceSha256,
      redactedLines: [first, line - 1],
    });
    const flush = () => {
      if (!chunk) return;
      const relative = `artifacts/agent-history/${record.relative}/part-${String(entry.chunks.length + 1).padStart(4, '0')}.txt`;
      capture(relative, chunk, sourceInfo());
      entry.chunks.push({
        path: relative,
        redactedLines: [first, line - 1],
        bytes: chunkBytes,
      });
      entry.capturedBytes += chunkBytes;
      chunk = '';
      chunkBytes = 0;
    };
    const flushEvents = () => {
      if (!eventText) return;
      const relative = `artifacts/agent-history/${record.relative}/events-${String(entry.eventIndexes.length + 1).padStart(4, '0')}.jsonl`;
      capture(relative, eventText);
      entry.eventIndexes.push(relative);
      eventText = '';
      eventBytes = 0;
    };
    // JSONL is redacted one complete event at a time, including oversized events.
    // Other sidecars retain whole-document redaction (including multiline secrets).
    const parts = record.relative.endsWith('.jsonl')
      ? linesOf(record.file)
      : (scrubHistoryFile(
          readFileSync(record.file, 'utf8'),
          record.relative,
          redact,
        ).match(/[^\n]*\n|[^\n]+$/g) ?? []);
    for (const raw of parts) {
      const part = record.relative.endsWith('.jsonl')
        ? scrubHistoryFile(raw, record.relative, redact)
        : raw;
      const size = Buffer.byteLength(part);
      if (chunk && chunkBytes + size > historyLimits.chunkBytes) flush();
      if (!chunk) first = line;
      const reference = {
        path: `artifacts/agent-history/${record.relative}/part-${String(entry.chunks.length + 1).padStart(4, '0')}.txt`,
        lines: [line - first + 1, line - first + 1],
        sourceLine: line,
      };
      if (record.relative.endsWith('.jsonl') && part.trim()) {
        const details = eventDetails(part);
        if (details) {
          const event = { ...reference, ...details };
          const serialized = `${JSON.stringify(event)}
`;
          if (
            eventBytes + Buffer.byteLength(serialized) >
            historyLimits.chunkBytes
          )
            flushEvents();
          eventText += serialized;
          eventBytes += Buffer.byteLength(serialized);
          eventCount++;
          if (details.error) entry.errors.push(reference);
        }
      }
      chunk += part;
      chunkBytes += size;
      line++;
      // A long line is preserved intact in a dedicated chunk, never skipped.
      if (chunkBytes >= historyLimits.chunkBytes) flush();
    }
    flush();
    flushEvents();
    entry.events = eventCount;
    if (hashFile(record.file) !== record.sha256)
      throw new Error(`History changed during capture: ${record.relative}`);
  }
  const invocations = new Map();
  for (const entry of entries) {
    const relative = entry.source.replace(
      /^review-history\/run-[1-9]\d*-attempt-[1-9]\d*\//,
      '',
    );
    if (!logPattern.test(relative)) continue;
    const log = entry.source.replace(suffix, '');
    if (!invocations.has(log))
      invocations.set(log, {
        log,
        runId: entry.runId,
        attempt: entry.attempt,
        phase: relative.startsWith('verify-')
          ? 'qa'
          : relative.startsWith('agent-repair-')
            ? 'repair'
            : 'implementation',
        files: [],
        missing: [],
      });
    invocations.get(log).files.push(entry.source);
  }
  for (const invocation of invocations.values()) {
    const record = records.find(
      (item) => item.relative === `${invocation.log}.invocation.json`,
    );
    let details;
    try {
      details = JSON.parse(readFileSync(record?.file, 'utf8'));
    } catch {
      /* Visible below. */
    }
    invocation.invoked = details?.invoked !== false;
    const log = entries.find((entry) => entry.source === invocation.log);
    invocation.eventIndexes = log?.eventIndexes ?? [];
    invocation.errors = log?.errors ?? [];
    if (invocation.runId == null || invocation.attempt == null)
      warnings.push(`调用 Run/attempt 未记录：${invocation.log}`);
    const expected = [
      `${invocation.log}.prompt.md`,
      `${invocation.log}.invocation.json`,
    ];
    if (invocation.invoked)
      expected.push(invocation.log, `${invocation.log}.result.json`);
    invocation.missing = expected.filter(
      (name) =>
        !entries.some(
          (entry) =>
            entry.source === name &&
            (entry.chunks.length || entry.sourceBytes === 0) &&
            !entry.omitted.length,
        ),
    );
    if (invocation.missing.length || details?.version !== 1)
      warnings.push(`调用记录不完整或为旧格式：${invocation.log}`);
  }
  if (!invocations.size)
    warnings.push('未捕获原始 Agent 调用；不能推断未曾试错或已读取 Skill。');
  const limitations = bounded(warnings),
    indexPath = 'artifacts/agent-history/index.json';
  const index = {
    version: 2,
    scope,
    coverage: !invocations.size
      ? 'unavailable'
      : limitations.length
        ? 'partial'
        : 'available',
    sourceBytes: entries.reduce((sum, e) => sum + (e.sourceBytes ?? 0), 0),
    capturedBytes: entries.reduce((sum, e) => sum + e.capturedBytes, 0),
    limitations,
    invocations: [...invocations.values()],
    files: entries,
  };
  capture(indexPath, json(index));
  return {
    files,
    fingerprint,
    bytes,
    index,
    input: {
      version: 2,
      path: indexPath,
      scope,
      coverage: index.coverage,
      invocations: invocations.size,
      sourceBytes: index.sourceBytes,
      capturedBytes: index.capturedBytes,
      errorSignals: [...invocations.values()].reduce(
        (sum, invocation) => sum + invocation.errors.length,
        0,
      ),
      limitations,
    },
  };
}
