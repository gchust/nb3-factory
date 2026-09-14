import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { removeSupersededDatabaseDirectory } from '../prune-superseded-sources.mjs';

const write = (root, file, value) => {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), value);
};

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-prune-sources-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test('a database directory whose compiled mirror is complete is removed', (t) => {
  const root = fixture(t);
  const pkg = path.join(root, 'app-plugin-ai-employee');
  write(
    root,
    'app-plugin-ai-employee/database/migrations/001_create.ts',
    'source',
  );
  write(
    root,
    'app-plugin-ai-employee/database/collections/orders.ts',
    'source',
  );
  write(
    root,
    'app-plugin-ai-employee/dist/database/migrations/001_create.js',
    'compiled',
  );
  write(
    root,
    'app-plugin-ai-employee/dist/database/collections/orders.js',
    'compiled',
  );
  const removed = { bytes: 0, count: 0 };

  assert.equal(
    removeSupersededDatabaseDirectory(path.join(pkg, 'database'), removed),
    true,
  );
  // The whole directory has to go: a `database/migrations` left behind with no files in it reports zero migrations
  // and the compiled ones are never reached.
  assert.equal(existsSync(path.join(pkg, 'database')), false);
  assert.equal(removed.count, 2);
  assert.ok(removed.bytes > 0);
});

test('a database directory is kept when the compiled mirror is incomplete', (t) => {
  const root = fixture(t);
  const pkg = path.join(root, 'app-plugin-partial');
  write(root, 'app-plugin-partial/database/migrations/001_create.ts', 'source');
  write(root, 'app-plugin-partial/database/migrations/002_seed.ts', 'source');
  write(
    root,
    'app-plugin-partial/dist/database/migrations/001_create.js',
    'compiled',
  );
  const removed = { bytes: 0, count: 0 };

  assert.equal(
    removeSupersededDatabaseDirectory(path.join(pkg, 'database'), removed),
    false,
  );
  assert.equal(
    existsSync(path.join(pkg, 'database/migrations/002_seed.ts')),
    true,
  );
  assert.deepEqual(removed, { bytes: 0, count: 0 });
});

test('a database directory with nothing compiled is kept, as is any other directory', (t) => {
  const root = fixture(t);
  const pkg = path.join(root, 'app-plugin-sources-only');
  write(
    root,
    'app-plugin-sources-only/database/migrations/001_create.ts',
    'source',
  );
  write(root, 'app-plugin-sources-only/dist/index.js', 'compiled');
  const removed = { bytes: 0, count: 0 };

  assert.equal(
    removeSupersededDatabaseDirectory(path.join(pkg, 'database'), removed),
    false,
  );
  assert.equal(
    removeSupersededDatabaseDirectory(path.join(pkg, 'dist'), removed),
    false,
  );
  assert.equal(
    existsSync(path.join(pkg, 'database/migrations/001_create.ts')),
    true,
  );
});
