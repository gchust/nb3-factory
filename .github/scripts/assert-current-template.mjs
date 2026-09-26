import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// One supported contract, with no adapters or fallback commands. A task keeps
// its verified version pinned, but cannot start from a retired template.
export function assertCurrentTemplate(app) {
  assert.ok(
    app?.dependencies?.['@nocobase/app-cli'] &&
      app.scripts?.build === 'nocobase build',
    'Unsupported legacy template: create a new task from the latest verified NocoBase 3 baseline with @nocobase/app-cli and nocobase build.',
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [root, ...extra] = process.argv.slice(2);
  assert.ok(
    root && extra.length === 0,
    'Usage: assert-current-template.mjs APP_ROOT',
  );
  assertCurrentTemplate(
    JSON.parse(readFileSync(path.resolve(root, 'package.json'), 'utf8')),
  );
}
