import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const script = path.resolve(import.meta.dirname, '../preview-connect.sh');
for (const scenario of [
  'retry',
  'unreachable',
  'unauthorized',
  'ping-failed-ssh-ready',
  'relay',
]) {
  test(`preview SSH preflight: ${scenario}`, () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'preview-connect-'));
    try {
      const bin = path.join(root, 'bin');
      mkdirSync(bin);
      const mock = (name, body) =>
        writeFileSync(path.join(bin, name), `#!/bin/bash\n${body}\n`, {
          mode: 0o755,
        });
      mock('sleep', 'exit 0');
      mock(
        'tailscale',
        `
if [[ "$1" == ping ]]; then
  [[ "$*" == *--until-direct=false* ]] || exit 2
  if [[ "$SCENARIO" == ping-failed-ssh-ready ]]; then echo probe-failed; exit 1; fi
  echo 'pong via DERP relay'
else
  echo diagnostic-status
fi`,
      );
      mock(
        'ssh-keyscan',
        `echo scan >> "$HOME/calls"
if [[ "$SCENARIO" == unreachable ]]; then echo unavailable >&2; exit 1; fi
if [[ "$SCENARIO" == retry && ! -f "$HOME/retried" ]]; then touch "$HOME/retried"; exit 1; fi
echo host-key`,
      );
      mock('ssh', '[[ "$SCENARIO" != unauthorized ]]');
      const result = spawnSync('bash', [script], {
        env: {
          ...process.env,
          HOME: root,
          PATH: `${bin}:${process.env.PATH}`,
          SCENARIO: scenario,
          PREVIEW_HOST: 'preview.test',
          PREVIEW_USER: 'root',
          PREVIEW_SSH_KEY: 'test-key',
        },
        encoding: 'utf8',
      });
      assert.equal(
        result.status,
        ['retry', 'ping-failed-ssh-ready', 'relay'].includes(scenario) ? 0 : 1,
        result.stderr,
      );
      assert.equal(
        readFileSync(path.join(root, 'calls'), 'utf8').trim().split('\n')
          .length,
        scenario === 'retry'
          ? 2
          : ['relay', 'ping-failed-ssh-ready'].includes(scenario)
            ? 1
            : 6,
      );
      if (['unreachable', 'unauthorized'].includes(scenario))
        assert.match(result.stdout, /diagnostic-status/);
      assert.ok(!result.stdout.includes('test-key'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
