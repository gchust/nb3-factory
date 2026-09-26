// Original factory-visible interactions, not another model-generated summary.
// History has its own budget; it must not evict framework source or authorize QA.
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { scrubHistoryFile } from './history-redaction.mjs';

const MiB = 1024 * 1024;
export const historyLimits = Object.freeze({ fileBytes: 32 * MiB, totalBytes: 64 * MiB, chunkBytes: MiB, files: 2000, runs: 50 });
const hash = value => createHash('sha256').update(value).digest('hex');
const suffix = /\.(?:prompt\.md|invocation\.json|result\.json)$/;
const logPattern = /^(?:agent-(?:implement|repair-[1-9]\d*)|verify-[1-9]\d*\/browser-(?:acceptance|focused)\/agent-browser-(?:acceptance|report-repair-[1-9]\d*))\.jsonl(?:\.(?:prompt\.md|invocation\.json|result\.json))?$/;
const runPattern = /^run-([1-9]\d*)-attempt-([1-9]\d*)$/;
const scope = '工厂可观察的本次搭建及已恢复 Handoff 交互；不是 CLI 内部上下文，不代表每个文件已被评审者读取。';
const bounded = values => {
  const unique = [...new Set(values)];
  return unique.length <= 50 ? unique : [...unique.slice(0, 49), `另有 ${unique.length - 49} 项历史覆盖限制。`];
};
const save = (file, text) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text, { mode: 0o400 }); };
const json = value => `${JSON.stringify(value, null, 2)}\n`;

function regular(root, relative) {
  const file = path.join(root, relative);
  if (!relative || relative.split('/').some(part => !part || part === '.' || part === '..') || relative.includes('\\') || relative.includes('\0')) throw new Error('Unsafe history path');
  // Resolve the root once for macOS /tmp aliases; reject links below it.
  if (realpathSync(file) !== path.join(realpathSync(root), relative) || !lstatSync(file).isFile()) throw new Error('History is not a regular file');
  return file;
}
function read(root, relative, maximum = historyLimits.fileBytes) {
  const file = regular(root, relative);
  if (lstatSync(file).size > maximum) throw new Error('History file exceeds byte limit');
  return readFileSync(file);
}
function scan(root, warnings) {
  const files = [];
  function visit(relative = '') {
    let entries;
    try { entries = readdirSync(path.join(root, relative), { withFileTypes: true }); }
    catch { warnings.push(`历史目录无法读取：${relative || '.'}`); return; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      const directory = /^verify-[1-9]\d*(?:\/browser-(?:acceptance|focused))?$/.test(name);
      if (entry.isSymbolicLink()) { if (directory || logPattern.test(name)) warnings.push(`历史链接未采集：${name}`); continue; }
      if (entry.isDirectory() && directory) visit(name);
      else if (entry.isFile() && logPattern.test(name)) files.push(name);
    }
  }
  visit();
  if (files.length > historyLimits.files) warnings.push('历史文件数量超限，未采集的调用不能推断通过。');
  return files.slice(0, historyLimits.files);
}

// Deliberately excludes mutable Run identity and QA scope. Matches the frozen
// business task rather than the Issue number alone; does not pool other builds.
function taskIdentity(metadata) {
  const task = metadata?.task ?? {};
  return { repository: metadata?.repository ?? null, issue: metadata?.issue?.number ?? null,
    controlSha: metadata?.controlSha ?? null,
    inputHash: hash(JSON.stringify([task.targetBranch, task.taskType, task.requirements, task.acceptanceCriteria, task.sampleData, task.buildReviewMode])) };
}
function metadataAt(root) {
  try { return JSON.parse(read(root, 'task-metadata.json', 2 * MiB)); }
  catch { return null; }
}
function sources(root, metadata, warnings) {
  const identity = taskIdentity(metadata);
  const current = { ...identity, runId: metadata?.run?.id ?? null, attempt: metadata?.run?.attempt ?? null,
    prefix: '', files: scan(root, warnings), expected: null };
  const result = [current];
  const directory = path.join(root, 'review-history');
  if (!existsSync(directory)) return result;
  if (realpathSync(directory) !== path.join(realpathSync(root), 'review-history')) { warnings.push('续跑历史目录是链接，未采集。'); return result; }
  try {
    const previous = JSON.parse(read(root, 'review-history/coverage.json', MiB));
    if (Array.isArray(previous)) warnings.push(...previous.filter(value => typeof value === 'string').slice(0, 50));
  } catch { warnings.push('续跑历史覆盖记录缺失或无效。'); }
  const names = readdirSync(directory).filter(name => runPattern.test(name)).sort().reverse();
  if (names.length > historyLimits.runs) warnings.push('续跑历史数量超限。');
  for (const name of names.slice(0, historyLimits.runs)) {
    const prefix = `review-history/${name}/`;
    try {
      const stored = JSON.parse(read(root, `${prefix}source.json`, MiB));
      if (stored.version !== 1 || !identity.repository || !identity.issue ||
          ['repository', 'issue', 'controlSha', 'inputHash'].some(key => stored[key] !== identity[key]) ||
          name !== `run-${stored.runId}-attempt-${stored.attempt}` || !Array.isArray(stored.files) || stored.files.length > historyLimits.files)
        throw new Error('History identity mismatch');
      const expected = new Map();
      for (const file of stored.files) {
        if (!logPattern.test(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256) || expected.has(file.path)) throw new Error('Invalid history manifest');
        expected.set(file.path, file.sha256);
      }
      result.push({ ...stored, prefix, files: [...expected.keys()], expected });
    } catch { warnings.push(`续跑历史身份或清单无法验证：${name}`); }
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
    if (!previous || !expected.repository || !expected.issue ||
        ['repository', 'issue', 'controlSha', 'inputHash'].some(key => taskIdentity(previous)[key] !== expected[key]))
      throw new Error('Previous task identity unavailable or mismatched');
    let bytes = 0, count = 0;
    for (const item of sources(source, previous, warnings)) {
      if (!/^[1-9]\d*$/.test(String(item.runId)) || !/^[1-9]\d*$/.test(String(item.attempt))) {
        warnings.push('原始 Run/attempt 未记录，未恢复该轮历史。'); continue;
      }
      const directory = `run-${item.runId}-attempt-${item.attempt}`;
      if (existsSync(path.join(staging, directory))) { warnings.push(`重复的续跑历史身份：${directory}`); continue; }
      const files = [];
      for (const relative of item.files) {
        if (++count > historyLimits.files) { warnings.push('累计历史文件数量超限。'); break; }
        try {
          const data = read(source, `${item.prefix}${relative}`);
          if (item.expected && hash(data) !== item.expected.get(relative)) throw new Error('History fingerprint mismatch');
          if (bytes + data.length > historyLimits.totalBytes) throw new Error('History budget exceeded');
          save(path.join(staging, directory, relative), data); bytes += data.length;
          files.push({ path: relative, sha256: hash(data) });
        } catch { warnings.push(`历史未恢复（缺失、超限或指纹不符）：${directory}/${relative}`); }
      }
      save(path.join(staging, directory, 'source.json'), json({ version: 1, ...expected, runId: item.runId, attempt: item.attempt, files }));
    }
  } catch {
    warnings.push('未能验证上一轮历史；不能声称已获得完整搭建过程。');
  }
  save(path.join(staging, 'coverage.json'), json(bounded(warnings)));
  rmSync(target, { recursive: true, force: true });
  // Rename is atomic within the artifact directory.
  renameSync(staging, target);
}

function recordsAt(root) {
  const warnings = [];
  const metadata = metadataAt(root);
  const records = [];
  let bytes = 0;
  const add = (relative, item, expected) => {
    let data, reason;
    try {
      const file = regular(root, relative);
      const size = lstatSync(file).size;
      if (size > historyLimits.fileBytes || bytes + size > historyLimits.totalBytes) throw new Error('byte-limit');
      data = readFileSync(file);
      if (expected && hash(data) !== expected) { data = undefined; throw new Error('fingerprint-mismatch'); }
      bytes += size;
    } catch { reason = 'unavailable-or-over-budget'; warnings.push(`历史未采集（缺失、超限或指纹不符）：${relative}`); }
    records.push({ relative, data, reason, runId: item?.runId ?? null, attempt: item?.attempt ?? null });
  };
  for (const item of sources(root, metadata, warnings)) {
    if (item.prefix) add(`${item.prefix}source.json`, item);
    for (const file of item.files) {
      if (records.length >= historyLimits.files) { warnings.push('累计历史文件数量超限。'); break; }
      add(`${item.prefix}${file}`, item, item.expected?.get(file));
    }
  }
  if (existsSync(path.join(root, 'review-history/coverage.json'))) add('review-history/coverage.json');
  const fingerprint = hash(JSON.stringify(records.map(record => [record.relative, record.data ? hash(record.data) : record.reason])));
  return { records, warnings, fingerprint };
}

// Separate from the legacy artifact hash: old reports and reassessments retain
// their existing identity. Publication can verify this without model credentials.
export function historyFingerprint(root) { return recordsAt(root).fingerprint; }

export function captureReviewHistory(root, destination, redact = value => value) {
  const { records, warnings, fingerprint } = recordsAt(root);
  const files = [];
  const entries = [];
  let bytes = 0;
  const capture = (relative, text, source) => {
    const data = Buffer.from(text);
    save(path.join(destination, relative), data);
    files.push({ path: relative, kind: 'text', sha256: hash(data), lines: text.split('\n').length, ...(source ? { source } : {}) });
    bytes += data.length;
  };
  for (const record of records) {
    const entry = { source: record.relative, runId: record.runId, attempt: record.attempt,
      sourceSha256: record.data ? hash(record.data) : null, chunks: [], omitted: [] };
    entries.push(entry);
    if (!record.data) { entry.omitted.push(record.reason); continue; }
    const text = scrubHistoryFile(record.data.toString('utf8'), record.relative, redact);
    let chunk = '', chunkBytes = 0, first = 1, line = 1;
    const flush = () => {
      if (!chunk) return;
      const relative = `artifacts/agent-history/${record.relative}/part-${String(entry.chunks.length + 1).padStart(4, '0')}.txt`;
      if (bytes + chunkBytes > historyLimits.totalBytes) entry.omitted.push(`redacted-lines:${first}-${line - 1}:byte-limit`);
      else {
        capture(relative, chunk, { path: record.relative, sha256: entry.sourceSha256, redactedLines: [first, line - 1] });
        entry.chunks.push({ path: relative, redactedLines: [first, line - 1] });
      }
      chunk = ''; chunkBytes = 0;
    };
    // Split at line boundaries, never truncate JSON tool events or invent their
    // content. References target the redacted copy; raw source SHA is retained.
    for (const part of text.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
      const size = Buffer.byteLength(part);
      if (chunkBytes + size > historyLimits.chunkBytes) flush();
      if (size > historyLimits.chunkBytes) { entry.omitted.push(`redacted-line:${line}:line-too-large`); line++; continue; }
      if (!chunk) first = line;
      chunk += part; chunkBytes += size; line++;
    }
    flush();
    if (entry.omitted.length) warnings.push(`历史仅部分可读：${record.relative}`);
  }
  const invocations = new Map();
  for (const entry of entries) {
    const relative = entry.source.replace(/^review-history\/run-[1-9]\d*-attempt-[1-9]\d*\//, '');
    if (!logPattern.test(relative)) continue;
    const log = entry.source.replace(suffix, '');
    if (!invocations.has(log)) invocations.set(log, { log, runId: entry.runId, attempt: entry.attempt,
      phase: relative.startsWith('verify-') ? 'qa' : relative.startsWith('agent-repair-') ? 'repair' : 'implementation', files: [], missing: [] });
    invocations.get(log).files.push(entry.source);
  }
  for (const invocation of invocations.values()) {
    const record = records.find(item => item.relative === `${invocation.log}.invocation.json`);
    let details;
    try { details = JSON.parse(record?.data); } catch { /* Missing/legacy sidecar is visible below. */ }
    if (invocation.runId == null || invocation.attempt == null) warnings.push(`调用 Run/attempt 未记录：${invocation.log}`);
    const expected = [`${invocation.log}.prompt.md`, `${invocation.log}.invocation.json`];
    if (details?.invoked !== false) expected.push(invocation.log, `${invocation.log}.result.json`);
    invocation.missing = expected.filter(name => !entries.some(entry => entry.source === name && entry.chunks.length && !entry.omitted.length));
    if (invocation.missing.length || details?.version !== 1) warnings.push(`调用记录不完整或为旧格式：${invocation.log}`);
  }
  if (!invocations.size) warnings.push('未捕获原始 Agent 调用；不能推断未曾试错或已读取 Skill。');
  const limitations = bounded(warnings);
  const indexPath = 'artifacts/agent-history/index.json';
  const index = { version: 1, scope, coverage: !invocations.size ? 'unavailable' : limitations.length ? 'partial' : 'available',
    limitations, invocations: [...invocations.values()], files: entries };
  const indexText = json(index);
  if (Buffer.byteLength(indexText) > MiB) throw new Error('History index exceeds byte limit');
  capture(indexPath, indexText);
  return { files, fingerprint, bytes,
    input: { path: indexPath, scope, coverage: index.coverage, invocations: invocations.size, limitations } };
}
