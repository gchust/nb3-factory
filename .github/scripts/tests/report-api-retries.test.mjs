import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// A dispatched report that fails on one transient API error is never redone:
// its Request step succeeded, so the dispatch gate skips the workflow_run copy.
// These scripts therefore call GitHub only through repositoryApi, which retries
// GET/HEAD/PUT/PATCH and never repeats a POST that may already have landed.
for (const script of [
  'report-task-usage.mjs',
  'agent-history.mjs',
  'publish-visual-report.mjs',
  'publish-retro.mjs',
  'task-progress.mjs',
]) {
  test(`${script} calls GitHub through the retrying repository API`, () => {
    const source = readFileSync(
      path.resolve(import.meta.dirname, '..', script),
      'utf8',
    );
    assert.match(
      source,
      /import \{[^}]*\brepositoryApi\b[^}]*\} from '\.\/factory-lib\.mjs';/,
    );
    assert.match(source, /repositoryApi\(/);
    assert.doesNotMatch(source, /await fetch\(/);
  });
}
