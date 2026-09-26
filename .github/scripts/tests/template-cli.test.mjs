import assert from 'node:assert/strict';
import test from 'node:test';
import { hasPackageCli, templateCommand } from '../template-cli.mjs';

const modern = {
  dependencies: { '@nocobase/app-cli': '^1.0.0-beta.6' },
  scripts: { build: 'nocobase build' },
};

test('CLI ownership requires both the official dependency and the published build entry', () => {
  assert.equal(hasPackageCli(modern), true);
  assert.equal(hasPackageCli({ scripts: modern.scripts }), false);
  assert.equal(hasPackageCli({ dependencies: modern.dependencies }), false);
  assert.equal(
    hasPackageCli({
      dependencies: modern.dependencies,
      scripts: { build: 'node scripts/build.mjs' },
    }),
    false,
  );
});

for (const operation of ['skills:sync', 'plugin:register', 'plugin:inspect']) {
  test(`${operation} resolves the modern bin and preserves declared legacy aliases`, () => {
    assert.deepEqual(templateCommand(modern, operation), [
      'exec',
      'nocobase',
      ...operation.split(':'),
    ]);
    assert.deepEqual(
      templateCommand({ scripts: { [operation]: 'legacy' } }, operation),
      [operation],
    );
    assert.throws(() => templateCommand({}, operation), /does not declare/);
  });
}

test('unrecognized commands are never forwarded to the application CLI', () => {
  assert.throws(() => templateCommand(modern, 'unknown'), /Unsupported/);
  assert.throws(() => templateCommand(modern, 'toString'), /Unsupported/);
});
