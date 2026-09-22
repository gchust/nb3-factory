import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const SCRIPT = path.resolve(
  import.meta.dirname,
  '..',
  'preview-public-check.mjs',
);
const PREVIEW_URL = 'https://nb3-127.nfvd.net/main/';
// Two answers the zone can give for a preview: the address its own record
// publishes, and the wildcard the zone falls back to until that record exists.
// The wildcard never completes a connection, which is what made the first probe
// of a freshly deployed preview time out for forty seconds.
const PROXIED = '104.21.46.85';
const WILDCARD = '52.184.25.30';

/**
 * Runs the check against a recorded DNS service and a recorded curl. The curl
 * stub logs every invocation and decides for itself whether it succeeded, so a
 * test can say which address answers and which one does not.
 */
function check({
  curl,
  dns,
  budgetMs = 5_000,
  intervalMs = 200,
  ...env
}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'preview-public-'));
  try {
    writeFileSync(
      path.join(root, 'curl'),
      `#!/bin/bash\nprintf '%s\\n' "$*" >> "$CALLS"\n${curl}\n`,
      { mode: 0o755 },
    );
    writeFileSync(path.join(root, 'dns.mjs'), dns);
    const result = spawnSync(
      process.execPath,
      ['--import', path.join(root, 'dns.mjs'), SCRIPT],
      {
        env: {
          ...process.env,
          ...env,
          CALLS: path.join(root, 'calls'),
          PATH: `${root}:${process.env.PATH}`,
          PREVIEW_PUBLIC_CHECK_BUDGET_MS: String(budgetMs),
          PREVIEW_PUBLIC_CHECK_INTERVAL_MS: String(intervalMs),
          PREVIEW_URL,
          PROXIED,
          RUNNER_TEMP: root,
          WILDCARD,
        },
        encoding: 'utf8',
      },
    );
    const log = (name) => {
      const file = path.join(root, name);
      return existsSync(file) ? readFileSync(file, 'utf8') : '';
    };
    return {
      calls: log('calls'),
      questions: log('calls.dns'),
      status: result.status,
      stderr: result.stderr,
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** A DNS service that keeps answering the wildcard, and counts the questions. */
const wildcardDns = `
import { appendFileSync } from 'node:fs';
globalThis.fetch = async () => {
  appendFileSync(process.env.CALLS + '.dns', 'q\\n');
  return {
    ok: true,
    json: async () => ({ Answer: [{ type: 1, data: process.env.WILDCARD }] }),
  };
};
`;

/** A DNS service that answers the wildcard once and the real address after. */
const lateRecordDns = `
import { appendFileSync } from 'node:fs';
let asked = 0;
globalThis.fetch = async () => {
  asked += 1;
  appendFileSync(process.env.CALLS + '.dns', 'q\\n');
  const data = asked === 1 ? process.env.WILDCARD : process.env.PROXIED;
  return { ok: true, json: async () => ({ Answer: [{ type: 1, data }] }) };
};
`;

/** A DNS service that never answers. */
const unreachableDns = `
globalThis.fetch = async () => {
  throw new Error('dns service unreachable');
};
`;

test('the address public DNS publishes is probed under the preview hostname', () => {
  const { calls, status } = check({
    curl: `[[ "$*" == *"$PROXIED"* ]]`,
    dns: `
globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({ Answer: [{ type: 1, data: process.env.PROXIED }] }),
});
`,
  });
  assert.equal(status, 0);
  // The lookup is replaced, not the request: hostname, TLS and routing intact.
  assert.match(calls, /--resolve nb3-127\.nfvd\.net:443:104\.21\.46\.85/);
  assert.match(calls, /https:\/\/nb3-127\.nfvd\.net\/main\//);
  assert.ok(!calls.includes('--insecure'));
  // Nothing here may depend on the address family the zone also publishes.
  assert.match(calls, /--ipv4/);
});

test('a wildcard answer is not the preview, and is asked again until the record exists', () => {
  const { calls, questions, status } = check({
    curl: `[[ "$*" == *"$PROXIED"* ]]`,
    dns: lateRecordDns,
  });
  assert.equal(status, 0, 'the check must survive a record that arrives late');
  assert.equal(questions.trim().split('\n').length, 2, 'it must ask again');
  // The address that cannot answer is probed first and does not end the check.
  assert.ok(
    calls.indexOf(WILDCARD) < calls.indexOf(PROXIED),
    'the wildcard answer is tried before the published record appears',
  );
  assert.match(calls, /--resolve nb3-127\.nfvd\.net:443:104\.21\.46\.85/);
});

test('the runner resolver is used when public DNS cannot be reached', () => {
  const { calls, status } = check({
    curl: `[[ "$*" != *--resolve* ]]`,
    dns: unreachableDns,
  });
  assert.equal(status, 0);
  // An unpinned request, and the failure is reported rather than swallowed.
  assert.ok(!calls.includes('--resolve'));
  assert.match(calls, /https:\/\/nb3-127\.nfvd\.net\/main\//);
});

test('a preview that never answers fails the check', () => {
  const { calls, questions, status, stderr } = check({
    budgetMs: 700,
    curl: 'false',
    dns: wildcardDns,
    intervalMs: 100,
  });
  assert.equal(status, 1);
  assert.match(stderr, /Public preview HTTPS check failed/);
  // The failure names what it could not reach, so a log reader does not have to
  // guess whether the record was missing or the edge was.
  assert.match(
    stderr,
    /did not answer from 52\.184\.25\.30 \(\d+ public DNS question\(s\) answered\)/,
  );
  // It spends its budget asking again rather than giving up on one answer.
  assert.ok(
    questions.trim().split('\n').length >= 2,
    'a short budget must still contain more than one question',
  );
  assert.match(calls, /--resolve nb3-127\.nfvd\.net:443:52\.184\.25\.30/);
});

test('a check that could not ask public DNS says so', () => {
  const { status, stderr } = check({
    budgetMs: 500,
    curl: 'false',
    dns: unreachableDns,
    intervalMs: 100,
  });
  assert.equal(status, 1);
  assert.match(stderr, /Public DNS query failed: dns service unreachable/);
  assert.match(stderr, /\(public DNS never answered\)/);
});
