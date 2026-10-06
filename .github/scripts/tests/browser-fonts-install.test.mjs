import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const script = path.resolve(import.meta.dirname, '../install-browser-fonts.sh');

// Runs the real script against stub system commands: no sudo, network or
// package changes. The stubs record their calls and fake the font state.
function run({
  fontsPresent = false,
  aptFails = false,
  failingHosts = [],
  badHash = [],
} = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-fonts-'));
  const bin = path.join(root, 'bin');
  mkdirSync(bin);
  const log = path.join(root, 'calls.log');
  const marker = path.join(root, 'installed');
  if (fontsPresent) writeFileSync(marker, '');
  const stub = (name, body) => {
    const file = path.join(bin, name);
    writeFileSync(
      file,
      `#!/usr/bin/env bash\necho "${name} $*" >> "$STUB_LOG"\n${body}\n`,
    );
    chmodSync(file, 0o755);
  };
  stub('sudo', 'exec "$@"');
  stub('timeout', 'while [[ "$1" == --* ]]; do shift; done; shift; exec "$@"');
  stub('sleep', 'exit 0');
  stub(
    'apt-get',
    `if [[ "$STUB_APT_FAILS" == true ]]; then exit 100; fi
     if [[ " $* " == *" install "* ]]; then touch "$STUB_MARKER"; fi`,
  );
  stub(
    'curl',
    `out=''; url=''
     while (( $# )); do case "$1" in -o) out="$2"; shift 2;; http*) url="$1"; shift;; *) shift;; esac; done
     for host in $STUB_FAILING_HOSTS; do [[ "$url" == "$host"* ]] && exit 28; done
     content=GOOD
     for host in $STUB_BAD_HASH; do [[ "$url" == "$host"* ]] && content=BAD; done
     printf '%s' "$content" > "$out"`,
  );
  // Only the pinned digest is accepted, and only for the good payload.
  stub(
    'sha256sum',
    `read -r digest file
     [[ "$digest" =~ ^[0-9a-f]{64}$ && "$(cat "$file")" == GOOD ]]`,
  );
  stub('dpkg', 'if [[ "$1" == -i ]]; then touch "$STUB_MARKER"; fi');
  stub('fc-list', '[[ -e "$STUB_MARKER" ]] && echo "Noto Sans CJK SC"; exit 0');
  stub('fc-cache', 'exit 0');
  stub('fc-match', 'echo "Chinese font fallback: Noto Sans CJK SC"');
  const result = spawnSync('bash', [script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      STUB_LOG: log,
      STUB_MARKER: marker,
      STUB_APT_FAILS: String(aptFails),
      STUB_FAILING_HOSTS: failingHosts.join(' '),
      STUB_BAD_HASH: badHash.join(' '),
    },
  });
  const calls = existsSync(log)
    ? readFileSync(log, 'utf8').trim().split('\n')
    : [];
  return { ...result, calls, installed: existsSync(marker) };
}

const ARCHIVE = 'http://archive.ubuntu.com';
const KERNEL = 'http://mirrors.edge.kernel.org';
const named = (calls, name) =>
  calls.filter((call) => call.startsWith(`${name} `));

test('fonts already present: nothing is installed', () => {
  const result = run({ fontsPresent: true });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(named(result.calls, 'apt-get'), []);
  assert.deepEqual(named(result.calls, 'curl'), []);
});

test('apt installs the fonts and no direct download runs', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(named(result.calls, 'apt-get').length, 2);
  assert.deepEqual(named(result.calls, 'curl'), []);
});

test('a failed apt round falls back to the next host that serves the pinned file', () => {
  const result = run({ aptFails: true, failingHosts: [ARCHIVE] });
  assert.equal(result.status, 0, result.stderr);
  // apt is not retried; its index is never refreshed again.
  assert.equal(named(result.calls, 'apt-get').length, 1);
  const curls = named(result.calls, 'curl');
  assert.equal(curls.length, 2);
  assert.match(
    curls[0],
    new RegExp(`${ARCHIVE}/ubuntu/pool/main/f/fonts-noto-cjk/`),
  );
  assert.match(
    curls[1],
    new RegExp(`${KERNEL}/ubuntu/pool/main/f/fonts-noto-cjk/`),
  );
  assert.match(curls[1], /--speed-limit \d+ --speed-time \d+/);
  assert.equal(
    named(result.calls, 'dpkg').filter((call) => call.startsWith('dpkg -i '))
      .length,
    1,
  );
  assert.ok(result.installed);
});

test('a file that does not match the pinned hash is never installed', () => {
  const result = run({ aptFails: true, badHash: [ARCHIVE, KERNEL] });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not match its pinned SHA-256/);
  assert.match(result.stderr, /failed through apt and every direct download/);
  assert.deepEqual(
    named(result.calls, 'dpkg').filter((call) => call.startsWith('dpkg -i ')),
    [],
  );
  assert.equal(result.installed, false);
});
