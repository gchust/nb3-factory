import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const deploy = readFileSync(
  path.resolve(import.meta.dirname, '../preview/preview-deploy.sh'),
  'utf8',
);
const from = deploy.indexOf('# Apply the current CLI plan');
const to = deploy.indexOf('\nlog "starting $name"', from);
assert.ok(from >= 0 && to > from);
const migrate = deploy.slice(from, to);

for (const [mode, expected] of [['cli', ['db apply']]]) {
  for (const fail of [false, true]) {
    test(`preview ${mode} database ${fail ? 'failure stops without fallback' : 'uses the published command'}`, (t) => {
      const root = mkdtempSync(path.join(os.tmpdir(), 'preview-db-'));
      t.after(() => rmSync(root, { recursive: true, force: true }));
      const result = spawnSync(
        'bash',
        [
          '-ec',
          `
log() { :; }
die() { echo "$*" >&2; exit 1; }
run_app_once() {
  shift 2
  printf '%s\\n' "$*" >> "$COMMAND_LOG"
  [[ "$FAIL" == false ]]
}
${migrate}
`,
        ],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            MODE: mode,
            FAIL: String(fail),
            PREVIEW_LOG_DIR: root,
            COMMAND_LOG: path.join(root, 'commands'),
            pr: '353',
          },
        },
      );
      assert.equal(result.status, fail ? 1 : 0, result.stderr);
      const calls = readFileSync(path.join(root, 'commands'), 'utf8')
        .trim()
        .split('\n');
      assert.deepEqual(calls, fail ? expected.slice(0, 1) : expected);
    });
  }
}
