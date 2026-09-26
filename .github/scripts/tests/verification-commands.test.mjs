import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const scripts = path.resolve(import.meta.dirname, '..');
const verify = readFileSync(path.join(scripts, 'verify.sh'), 'utf8');
const applyDatabase = path.join(scripts, 'apply-database.sh');

// Verification runs against whatever template the refresh generated, so it may only use the
// application's published commands. Reaching into template-owned files broke the beta.22
// refresh, where the migration commands moved behind the application CLI.
test('verification applies migrations and seeds through the application commands', () => {
  assert.match(verify, /^"\$script_dir\/apply-database\.sh"$/m);
  for (const source of [verify, readFileSync(applyDatabase, 'utf8')]) {
    assert.doesNotMatch(source, /scripts\/(migrate|seed)\.ts/);
  }
});

const commandsFor = (packageJson, { fail = '', status = 0 } = {}) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-apply-database-'));
  try {
    const log = path.join(root, 'commands');
    writeFileSync(
      path.join(root, 'pnpm'),
      '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> "$COMMAND_LOG"\nif [[ "$*" == "$COMMAND_FAIL" ]]; then exit 7; fi\n',
      { mode: 0o755 },
    );
    if (packageJson) {
      writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify(packageJson),
      );
    }
    const result = spawnSync('bash', [applyDatabase], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${root}:${process.env.PATH}`,
        COMMAND_LOG: log,
        COMMAND_FAIL: fail,
        FACTORY_TIMINGS_FILE: path.join(root, 'timings.jsonl'),
      },
    });
    assert.equal(result.status, status, result.stderr);
    return readFileSync(log, 'utf8').trim().split('\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

test('CLI-owned templates apply the database without local script aliases', () => {
  assert.deepEqual(
    commandsFor({
      dependencies: { '@nocobase/app-cli': '^1.0.0-beta.6' },
      scripts: { build: 'nocobase build' },
    }),
    ['exec nocobase db apply'],
  );
});

test('a failed CLI migration is propagated without retrying through old commands', () => {
  assert.deepEqual(
    commandsFor(
      {
        dependencies: { '@nocobase/app-cli': '^1.0.0-beta.6' },
        scripts: { build: 'nocobase build' },
      },
      { fail: 'exec nocobase db apply', status: 7 },
    ),
    ['exec nocobase db apply'],
  );
});
