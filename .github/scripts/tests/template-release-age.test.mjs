import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('published template generation admits one fresh dependency graph throughout verification', () => {
  const workflow = readFileSync(
    new URL('../../workflows/refresh-template.yml', import.meta.url),
    'utf8',
  );
  const generator = workflow.split('  generate:\n')[1].split('\n  publish:')[0];
  const jobSettings = generator.split('    steps:')[0];
  assert.match(
    jobSettings,
    /    env:\n(?:      #.*\n)*      PNPM_CONFIG_MINIMUM_RELEASE_AGE: ['"]?0['"]?\n/,
  );
  // A step-level setting would leave other installs (including verification)
  // using pnpm's default 24-hour gate again.
  assert.equal(
    (generator.match(/PNPM_CONFIG_MINIMUM_RELEASE_AGE:/g) ?? []).length,
    1,
  );
  assert.doesNotMatch(
    generator,
    /PNPM_CONFIG_MINIMUM_RELEASE_AGE(?:=|\s*:)\s*['"]?[1-9]/,
  );
  const publisher = workflow.split('\n  publish:')[1];
  assert.doesNotMatch(publisher, /PNPM_CONFIG_MINIMUM_RELEASE_AGE/);
});
