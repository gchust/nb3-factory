// Factory's small, vendor-neutral result contract. The transcript remains raw;
// only the adapter may interpret its events. Missing counters are never zeroed.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { writeJson } from './agent-adapter.mjs';

export const tokenKeys = ['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning', 'totalTokens'];
const count = (value) => Number.isSafeInteger(value) && value >= 0;

export function createResult(identity) {
  const startedAt = Date.now();
  const measurements = new Map();
  let complete = false;
  let invalidEvents = 0;
  let incomplete = false;
  return {
    observe(parsed, line) {
      if (parsed.incomplete) incomplete = true;
      if (parsed.active) complete = false;
      if (parsed.complete) complete = true;
      for (const measurement of parsed.measurements ?? []) {
        const id = measurement.id ?? createHash('sha256').update(line).digest('hex');
        const usage = measurement.usage;
        // Keep valid counters only; record malformed values as incomplete instead
        // of trusting arbitrary objects copied from model/tool output.
        const normalized = usage && Object.fromEntries(tokenKeys
          .filter((key) => count(usage[key])).map((key) => [key, usage[key]]));
        if (usage && tokenKeys.some((key) => usage[key] != null && !count(usage[key]))) invalidEvents++;
        measurements.set(id, { phase: measurement.phase === 'compaction' ? 'compaction' : undefined, usage: normalized });
      }
    },
    malformed() { invalidEvents++; },
    save(log, { status, exitCode, error }, redact) {
      const result = { version: 1, ...identity, startedAt, endedAt: Date.now(),
        status, exitCode, terminalEvent: complete, invalidEvents, incomplete,
        error: error ? redact(String(error)) : undefined,
        measurements: [...measurements.values()] };
      writeJson(`${log}.result.json`, JSON.parse(redact(JSON.stringify(result))));
      return result;
    },
  };
}

export function readResult(log) {
  let result;
  try {
    const file = `${log}.result.json`;
    if (lstatSync(file).isSymbolicLink()) throw new Error('Agent result cannot be a symlink');
    result = JSON.parse(readFileSync(file, 'utf8'));
  }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
  if (result?.version !== 1 || typeof result.engine !== 'string' ||
      !['completed', 'failed', 'stalled', 'handoff', 'timed_out'].includes(result.status) ||
      !count(result.invalidEvents) || !Array.isArray(result.measurements) ||
      result.measurements.some((m) => !m ||
        (m.phase != null && m.phase !== 'compaction') ||
        (m.usage != null && (typeof m.usage !== 'object' || Array.isArray(m.usage) ||
          Object.entries(m.usage).some(([key, value]) => !tokenKeys.includes(key) || !count(value)))))) {
    throw new Error('Invalid normalized agent result');
  }
  return result;
}
