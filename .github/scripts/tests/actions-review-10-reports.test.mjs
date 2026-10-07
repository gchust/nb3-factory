import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { HISTORY_ASSET_URL } from '../agent-history.mjs';
import {
  ensureLedger,
  findNewestFirst,
  LEDGER_TITLE,
} from '../publish-retro.mjs';

const workflows = path.resolve(import.meta.dirname, '../../workflows');
const workflow = (name) => readFileSync(path.join(workflows, name), 'utf8');
const jobOf = (source, name) =>
  source.split(`\n  ${name}:\n`)[1].split(/\n {2}[a-z][a-z-]*:\n/)[0];
const stepOf = (source, name) =>
  source.split(`- name: ${name}\n`)[1].split(/\n {6}- /)[0];

// A fake gh that records its calls and answers `release view` from a state file.
function fakeGh(t, { exists = false, createFails = false } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'history-asset-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const log = path.join(root, 'calls.log');
  const state = path.join(root, 'exists');
  if (exists) writeFileSync(state, '');
  writeFileSync(
    path.join(root, 'gh'),
    `#!/usr/bin/env bash
echo "$*" >> "${log}"
case "$1 $2" in
  "release view") [[ -e "${state}" ]] || { echo 'release not found' >&2; exit 1; } ;;
  "release create")
    # A concurrent publisher created it first.
    touch "${state}"
    ${createFails ? "echo 'a release with the same tag name already exists' >&2; exit 1" : ''} ;;
  "release upload") [[ -e "${state}" ]] || exit 1 ;;
esac
`,
  );
  chmodSync(path.join(root, 'gh'), 0o755);
  const archive = path.join(root, 'agent-history-42.tar.gz');
  writeFileSync(archive, 'archive');
  const run = () =>
    spawnSync(
      'bash',
      [
        path.resolve(import.meta.dirname, '../upload-history-asset.sh'),
        archive,
        '已归档',
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${root}:${process.env.PATH}`,
          GITHUB_REPOSITORY: 'owner/repo',
          GH_TOKEN: 'test',
          FACTORY_HISTORY_MONTH: '2026-10',
        },
      },
    );
  return { run, calls: () => readFileSync(log, 'utf8').trim().split('\n') };
}

test('history archives go to the month release, which is created when missing', (t) => {
  const gh = fakeGh(t);
  const result = gh.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout.trim(),
    'https://github.com/owner/repo/releases/download/factory-history-2026-10/agent-history-42.tar.gz',
  );
  const calls = gh.calls();
  assert.match(
    calls[1],
    /^release create factory-history-2026-10 --repo owner\/repo --prerelease /,
  );
  assert.match(
    calls.at(-1),
    /^release upload factory-history-2026-10 \S+agent-history-42\.tar\.gz --repo owner\/repo --clobber$/,
  );
});

test('a publisher that loses the release creation race uploads to the winner', (t) => {
  const gh = fakeGh(t, { createFails: true });
  const result = gh.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(gh.calls().at(-1), /^release upload factory-history-2026-10 /);
});

test('an existing month release is reused without creating another', (t) => {
  const gh = fakeGh(t, { exists: true });
  assert.equal(gh.run().status, 0);
  assert.ok(!gh.calls().some((call) => call.startsWith('release create')));
});

test('history links on both the original and the monthly releases are recognised', () => {
  assert.ok(
    HISTORY_ASSET_URL.test(
      'https://github.com/o/r/releases/download/factory-history/a.tar.gz',
    ),
  );
  assert.ok(
    HISTORY_ASSET_URL.test(
      'https://github.com/o/r/releases/download/factory-history-2026-10/a.tar.gz',
    ),
  );
  assert.ok(
    !HISTORY_ASSET_URL.test(
      'https://github.com/o/r/releases/download/factory-history-evil/a.tar.gz',
    ),
  );
});

test('a re-run of the evaluation job replaces its unregistered bundle upload instead of failing', () => {
  const step = stepOf(
    jobOf(workflow('report-task-usage.yml'), 'evaluation'),
    'Keep the exact bundle bytes for replay',
  );
  assert.match(
    step,
    /name: \$\{\{ steps\.prepare\.outputs\.artifact_name \}\}/,
  );
  assert.match(step, /overwrite: true/);
});

test('the public classification artifact carries only what the send job reads', () => {
  const classify = jobOf(workflow('deliver-evaluation.yml'), 'classify');
  const upload = classify
    .split('id: classification-upload')[1]
    .split(/\n {6}- /)[0];
  assert.match(upload, /problem-classification\/classification\.json/);
  assert.match(upload, /problem-classification\/failure\.json/);
  assert.doesNotMatch(
    upload,
    /pending\.json|agent-problems|path: \$\{\{ runner\.temp \}\}\/problem-classification\n/,
  );
});

test('report workflows pass expressions to run blocks through env', () => {
  for (const name of [
    'report-task-usage.yml',
    'deliver-evaluation.yml',
    'publish-agent-history.yml',
    'publish-build-review-history.yml',
    'publish-retro.yml',
    'publish-visual-report.yml',
    'report-dispatch-gate.yml',
    'daily-findings.yml',
    'classify-findings.yml',
    'reset-findings.yml',
  ]) {
    const lines = workflow(name).split('\n');
    let indent = -1;
    lines.forEach((line, index) => {
      const run = /^(\s*)(?:- )?run: ?(.*)$/.exec(line);
      if (run) {
        indent = ['|', '>', '|-', '>-'].includes(run[2].trim())
          ? run[1].length
          : -1;
        assert.doesNotMatch(run[2], /\$\{\{/, `${name}:${index + 1}`);
        return;
      }
      if (indent < 0 || !line.trim()) return;
      if (line.length - line.trimStart().length <= indent) indent = -1;
      else assert.doesNotMatch(line, /\$\{\{/, `${name}:${index + 1}`);
    });
  }
});

test('a superseded classification run stops before installing the Agent', () => {
  const classify = jobOf(workflow('classify-findings.yml'), 'classify');
  const order = [
    'name: Read latest published findings',
    'name: Check for a queued run before installing the classifier',
    'name: Install selected pinned classifier',
    'name: Check the prepared findings are still current',
    'name: Classify findings with the selected Agent',
  ].map((name) => classify.indexOf(name));
  assert.ok(
    order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])),
    String(order),
  );
  const precheck = stepOf(
    classify,
    'Check for a queued run before installing the classifier',
  );
  assert.match(precheck, /classify-findings\.mjs check/);
  assert.match(precheck, /continue-on-error: true/);
  for (const name of [
    'Install selected pinned classifier',
    'Check the prepared findings are still current',
    'Classify findings with the selected Agent',
  ])
    assert.match(
      stepOf(classify, name),
      /steps\.precheck\.outputs\.current != 'false'/,
      name,
    );
  // A report does not request another classification while one is waiting.
  const findings = jobOf(workflow('report-task-usage.yml'), 'findings');
  assert.ok(
    findings.indexOf('workflow_runs[]') <
      findings.indexOf('gh workflow run classify-findings.yml'),
  );
  assert.match(findings, /\|\| echo 0/);
});

test('ledger lookups read the newest comments first and stop at the entry or the run start', async () => {
  const pages = [];
  // One comment a minute from 2026-10-01T00:00Z.
  const at = (i) => new Date(Date.UTC(2026, 9, 1) + i * 60_000).toISOString();
  const comments = Array.from({ length: 250 }, (_, i) => ({
    id: i + 1,
    body: `entry ${i + 1}`,
    created_at: at(i),
    user: { login: 'github-actions[bot]' },
  }));
  const read = async (method, route) => {
    const page = Number(/[?&]page=(\d+)/.exec(route)[1]);
    pages.push(page);
    return comments.slice((page - 1) * 100, page * 100);
  };
  const found = await findNewestFirst(99, 250, (c) => c.body === 'entry 230', {
    read,
  });
  assert.equal(found.id, 230);
  assert.deepEqual(pages, [3]);
  // A first publish: nothing matches, and the search stops at the first page
  // whose comments all predate the run instead of reading back to page 1.
  pages.length = 0;
  assert.equal(
    await findNewestFirst(99, 250, () => false, { read, since: at(150) }),
    undefined,
  );
  assert.deepEqual(pages, [3, 2]);
  pages.length = 0;
  await findNewestFirst(99, 250, () => false, { read, since: at(240) });
  assert.deepEqual(pages, [3]);
  // Without a run start (an older source file) it still reads every page.
  pages.length = 0;
  assert.equal(
    await findNewestFirst(99, 250, () => false, { read }),
    undefined,
  );
  assert.deepEqual(pages, [3, 2, 1]);
  // Far beyond the old 30-page cap.
  await findNewestFirst(99, 4000, () => false, { read: async () => [] });
});

test('the retro source records when its run started', () => {
  const source = readFileSync(
    path.resolve(import.meta.dirname, '../publish-retro.mjs'),
    'utf8',
  );
  assert.match(source, /runCreatedAt: run\.created_at/);
  assert.match(source, /since: source\.runCreatedAt/);
});

test('an open ledger is preferred, and a closed one is still used when none is open', async () => {
  const request = async (method, route) => {
    if (route.startsWith('/labels')) return {};
    throw new Error(`Unexpected ${method} ${route}`);
  };
  const ledger = (issues) =>
    ensureLedger({ request, read: async () => issues });
  // The live repository's only ledger is closed and still written to.
  assert.equal(
    (await ledger([{ number: 114, state: 'closed', title: LEDGER_TITLE }]))
      .number,
    114,
  );
  assert.equal(
    (
      await ledger([
        { number: 300, state: 'open', title: LEDGER_TITLE },
        { number: 114, state: 'closed', title: LEDGER_TITLE },
      ])
    ).number,
    300,
  );
});

test('two runs creating the retro ledger at once settle on the oldest', async () => {
  const issues = [];
  const writes = [];
  const request = async (method, route, body) => {
    writes.push([method, route, body]);
    if (route.startsWith('/labels')) return {};
    if (method === 'POST' && route === '/issues') {
      // Another run's ledger landed first, between this run's lookup and create.
      issues.push({ number: 200, state: 'open', title: LEDGER_TITLE });
      const created = { number: 201, state: 'open', title: LEDGER_TITLE };
      issues.push(created);
      return created;
    }
    if (method === 'PATCH') {
      issues.find((issue) => route === `/issues/${issue.number}`).state =
        body.state;
      return {};
    }
    throw new Error(`Unexpected ${method} ${route}`);
  };
  const read = async () => [...issues].reverse();
  const ledger = await ensureLedger({ request, read });
  assert.equal(ledger.number, 200);
  const close = writes.find(([method]) => method === 'PATCH');
  assert.equal(close[1], '/issues/201');
  assert.equal(close[2].state, 'closed');
  assert.match(close[2].body, /#200/);
  // The next run picks the oldest without creating another.
  writes.length = 0;
  assert.equal((await ensureLedger({ request, read })).number, 200);
  assert.ok(
    !writes.some(([method, route]) => method === 'POST' && route === '/issues'),
  );
});

test('a label another run just created does not fail the ledger', async () => {
  let gets = 0;
  const request = async (method, route) => {
    if (method === 'GET' && route.startsWith('/labels/')) {
      if (gets++ === 0) throw new Error('404');
      return {};
    }
    if (method === 'POST' && route === '/labels')
      throw new Error('422 already_exists');
    throw new Error(`Unexpected ${method} ${route}`);
  };
  const ledger = await ensureLedger({
    request,
    read: async () => [{ number: 7, title: LEDGER_TITLE }],
  });
  assert.equal(ledger.number, 7);
});

test('the daily digest never logs names from the owner mapping', () => {
  const source = readFileSync(
    path.resolve(import.meta.dirname, '../daily-findings.mjs'),
    'utf8',
  );
  assert.match(
    source,
    /unknownOwnerKeys\(config\.owners, loadRules\(\)\)\.length/,
  );
  assert.doesNotMatch(source, /FEISHU_PROBLEM_OWNERS names \$\{/);
});

test('the media publisher reuses an attach-capable gh or a cached, digest-checked pinned one', () => {
  const job = jobOf(workflow('publish-visual-report.yml'), 'publish-media');
  const check = stepOf(job, 'Check for a GitHub CLI with attachment support');
  assert.match(check, /gh pr comment --help .*grep -q -- '--attach'/);
  const restore = stepOf(job, 'Restore the pinned GitHub CLI');
  const install = stepOf(
    job,
    'Install pinned GitHub CLI with attachment support',
  );
  const save = stepOf(job, 'Cache the pinned GitHub CLI');
  const digest = /digest=([a-f0-9]{64})/.exec(install)[1];
  for (const step of [restore, save]) {
    assert.match(step, /actions\/cache\/(?:restore|save)@[0-9a-f]{40} # v6\./);
    assert.ok(step.includes(`key: media-gh-2.100.0-linux-amd64-${digest}`));
  }
  assert.match(restore, /if: steps\.media-gh\.outputs\.needed == 'true'/);
  assert.match(install, /sha256sum --check --strict/);
  assert.match(
    save,
    /if: steps\.media-gh-install\.outputs\.downloaded == 'true'/,
  );
});
