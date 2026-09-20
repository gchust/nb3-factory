import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

for (const succeeds of [true, false]) {
  test(`public preview DNS fallback ${succeeds ? 'succeeds' : 'fails closed'}`, () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'preview-dns-'));
    try {
      writeFileSync(
        path.join(root, 'curl'),
        `#!/bin/bash\nprintf '%s\\n' "$*" >> "$RUNNER_TEMP/calls"\n[[ "$*" == *--resolve* && "$PROBE_SUCCESS" == true ]]\n`,
        { mode: 0o755 },
      );
      writeFileSync(
        path.join(root, 'fetch.mjs'),
        `globalThis.fetch = async () => ({ok:true,json:async()=>({Answer:[{type:1,data:'104.21.46.85'}]})});`,
      );
      const result = spawnSync(
        process.execPath,
        [
          '--import',
          path.join(root, 'fetch.mjs'),
          path.resolve(import.meta.dirname, '../preview-public-check.mjs'),
        ],
        {
          env: {
            ...process.env,
            PATH: `${root}:${process.env.PATH}`,
            RUNNER_TEMP: root,
            PREVIEW_URL: 'https://nb3-127.nfvd.net/main/',
            PROBE_SUCCESS: String(succeeds),
          },
          encoding: 'utf8',
        },
      );
      assert.equal(result.status, succeeds ? 0 : 1, result.stderr);
      const calls = readFileSync(path.join(root, 'calls'), 'utf8');
      assert.match(calls, /--resolve nb3-127.nfvd.net:443:104.21.46.85/);
      assert.ok(!calls.includes('--insecure'));
      assert.match(calls, /https:\/\/nb3-127.nfvd.net\/main\//);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
