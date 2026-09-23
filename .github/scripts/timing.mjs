import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

// Record labels and durations only: command arguments/environment may contain secrets.
export function recordTiming(stage, started, status = 0) {
  const record = {
    stage,
    startedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    status,
  };
  const file = process.env.FACTORY_TIMINGS_FILE;
  if (file) {
    mkdirSync(path.dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify(record)}\n`);
  }
  console.error(
    `[timing] ${stage}: ${(record.durationMs / 1000).toFixed(2)}s (exit ${status})`,
  );
}
