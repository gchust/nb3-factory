import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  PREVIEW_EVICTED_MARKER,
  PREVIEW_VERIFIED_MARKER,
  buildStatusFromBody,
  parseCapacityListing,
  planCapacity,
} from '../preview-host.mjs';

// On 2026-10-05 about 82% of preview deploys failed with "already 30 previews
// (limit 30)": 49 open build pull requests competed for 30 slots, and each
// refused deploy had already uploaded its payload as a public release asset. A
// full host now gives up previews nobody needs — closed pull requests, then
// failed builds, oldest first — and when only successful builds of open pull
// requests remain the deploy is skipped and the pull request is told why.

const Capacity = path.resolve(
  import.meta.dirname,
  '..',
  'preview',
  'preview-capacity.sh',
);
const Script = path.resolve(import.meta.dirname, '..', 'deploy-preview.mjs');
const workflow = readFileSync(
  path.resolve(
    import.meta.dirname,
    '..',
    '..',
    'workflows',
    'deploy-preview.yml',
  ),
  'utf8',
);

const instance = (pr, deployedAt = '', buildStatus = 'unknown') => ({
  pr,
  deployedAt,
  buildStatus,
});
const listing = (instances, { limit = 3, self = false } = {}) => ({
  limit,
  self,
  instances,
});
const open = (status) => ({
  state: 'open',
  body: status ? `<!-- factory-build-status: ${status} -->` : '',
});
const evicted = (plan) => plan.evict.map(({ pr, reason }) => `${pr}:${reason}`);

test('a host with a free slot, or one this PR already holds, evicts nothing', () => {
  const free = planCapacity({
    listing: listing([instance(1), instance(2)]),
    pr: 9,
  });
  assert.deepEqual(free, { room: true, evict: [], count: 2, limit: 3 });
  // A redeploy replaces its own instance and needs no new slot.
  const redeploy = planCapacity({
    listing: listing([instance(1), instance(2), instance(9)], { self: true }),
    pr: 9,
  });
  assert.equal(redeploy.room, true);
  assert.deepEqual(redeploy.evict, []);
});

test('a full host gives up every preview of a closed or missing PR first', () => {
  // Teardown should have removed these; nothing else ever will, so all of them
  // go even when one would make room — and before any open PR's preview.
  const plan = planCapacity({
    listing: listing([
      instance(1, '2026-09-01T00:00:00Z', 'failed'),
      instance(2, '2026-09-02T00:00:00Z', 'success'),
      instance(3, '2026-09-03T00:00:00Z', 'success'),
    ]),
    pr: 9,
    pulls: new Map([
      [1, open('failed')],
      [2, { state: 'closed', body: '' }],
      [3, null],
    ]),
  });
  assert.equal(plan.room, true);
  assert.deepEqual(evicted(plan), ['2:closed', '3:closed']);
});

test('then failed builds give way, oldest deployment first', () => {
  const plan = planCapacity({
    listing: listing(
      [
        instance(1, '2026-09-05T00:00:00Z', 'failed'),
        instance(2, '2026-09-01T00:00:00Z', 'success'),
        instance(3, '2026-09-03T00:00:00Z', 'failed'),
        instance(4, '2026-09-02T00:00:00Z', 'unknown'),
      ],
      { limit: 3 },
    ),
    pr: 9,
    pulls: new Map([
      [1, open('failed')],
      [2, open('success')],
      [3, open('failed')],
      [4, open('')],
    ]),
  });
  // Two must go for a fourth slot to become a third: the two failed builds,
  // oldest first, ahead of the older preview whose status is unknown.
  assert.equal(plan.room, true);
  assert.deepEqual(evicted(plan), ['3:failed', '1:failed']);
});

test('an unrecorded status is read from the PR, and the host record wins', () => {
  const plan = planCapacity({
    listing: listing([
      // Deployed before the host recorded a status; the PR says failed.
      instance(1, '2026-09-04T00:00:00Z', 'unknown'),
      // Recorded as success; a stale PR body does not override the build the
      // preview actually serves.
      instance(2, '2026-09-01T00:00:00Z', 'success'),
      instance(3, '2026-09-02T00:00:00Z', 'unknown'),
    ]),
    pr: 9,
    pulls: new Map([
      [1, open('failed')],
      [2, open('failed')],
      [3, open('success')],
    ]),
  });
  assert.deepEqual(evicted(plan), ['1:failed']);
});

test('with no status anywhere, the least recently deployed unknown goes', () => {
  const plan = planCapacity({
    listing: listing([
      instance(1, '2026-09-04T00:00:00Z'),
      instance(2, '2026-09-02T00:00:00Z', 'success'),
      // No recorded deployment time sorts as the oldest.
      instance(3, ''),
    ]),
    pr: 9,
    pulls: new Map([
      [1, open('')],
      [2, open('')],
      [3, open('')],
    ]),
  });
  assert.deepEqual(evicted(plan), ['3:unknown']);
});

test('successful previews of open PRs are never evicted; the deploy is skipped', () => {
  const plan = planCapacity({
    listing: listing([
      instance(1, '2026-09-01T00:00:00Z', 'success'),
      instance(2, '2026-09-02T00:00:00Z', 'success'),
      instance(3, '2026-09-03T00:00:00Z', 'success'),
      instance(4, '2026-09-04T00:00:00Z', 'failed'),
    ]),
    pr: 9,
    pulls: new Map([
      [1, open('success')],
      [2, open('success')],
      [3, open('success')],
      [4, open('failed')],
    ]),
  });
  // Two slots are needed and only one failed build can give way: evicting it
  // alone would not let this deploy in, so it stays up.
  assert.equal(plan.room, false);
  assert.deepEqual(plan.evict, []);
  assert.equal(plan.count, 4);
});

test('closed PRs are still reclaimed when the deploy is skipped', () => {
  const plan = planCapacity({
    listing: listing(
      [
        instance(1, '', 'success'),
        instance(2, '', 'success'),
        instance(3, '', 'success'),
        instance(4, '', 'failed'),
      ],
      { limit: 2 },
    ),
    pr: 9,
    pulls: new Map([
      [1, open('success')],
      [2, open('success')],
      [3, open('success')],
      [4, { state: 'closed', body: '' }],
    ]),
  });
  assert.equal(plan.room, false);
  assert.deepEqual(evicted(plan), ['4:closed']);
});

test('the capacity listing is read strictly', () => {
  assert.deepEqual(
    parseCapacityListing(
      'limit 30\nself absent\ninstance 12 2026-09-01T00:00:00Z failed\ninstance 7 - unknown\n',
    ),
    {
      limit: 30,
      self: false,
      instances: [
        instance(12, '2026-09-01T00:00:00Z', 'failed'),
        instance(7, '', 'unknown'),
      ],
    },
  );
  // What it decides is destroyed, so anything unexpected stops the step rather
  // than being read as an empty host.
  assert.throws(() => parseCapacityListing('self absent\n'), /Incomplete/);
  assert.throws(
    () => parseCapacityListing('Welcome!\nlimit 30\nself absent\n'),
    /Unexpected/,
  );
  assert.throws(
    () =>
      parseCapacityListing('limit 30\nself absent\ninstance 1; - unknown\n'),
    /Unexpected/,
  );
  assert.equal(
    buildStatusFromBody('x <!-- factory-build-status: failed --> y'),
    'failed',
  );
  assert.equal(buildStatusFromBody(undefined), 'unknown');
});

// The host side, against a fake host root.
function hostListing(instances, pr = '9', limit = '3') {
  const root = mkdtempSync(path.join(os.tmpdir(), 'preview-capacity-'));
  try {
    for (const [name, env] of Object.entries(instances)) {
      const dir = path.join(root, 'instances', name);
      mkdirSync(dir, { recursive: true });
      if (env !== null) writeFileSync(path.join(dir, 'preview.env'), env);
    }
    return spawnSync('bash', [Capacity, '--pr', pr], {
      env: { ...process.env, PREVIEW_ROOT: root, PREVIEW_MAX_INSTANCES: limit },
      encoding: 'utf8',
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('the host reports its limit, this PR, and every instance with its status', () => {
  const result = hostListing({
    'pr-12': 'pr=12\ndeployedAt=2026-09-01T00:00:00Z\nbuildStatus=failed\n',
    // Deployed before the status was recorded.
    'pr-13': 'pr=13\ndeployedAt=2026-09-02T00:00:00Z\n',
    // A first deploy that failed before writing its final record.
    'pr-14': null,
    'pr-9': 'pr=9\nbuildStatus=success\n',
  });
  assert.equal(result.status, 0, result.stderr);
  const parsed = parseCapacityListing(result.stdout);
  assert.equal(parsed.limit, 3);
  assert.equal(parsed.self, true);
  assert.deepEqual(
    [...parsed.instances].sort((a, b) => a.pr - b.pr),
    [
      instance(9, '', 'success'),
      instance(12, '2026-09-01T00:00:00Z', 'failed'),
      instance(13, '2026-09-02T00:00:00Z', 'unknown'),
      instance(14, '', 'unknown'),
    ],
  );
  assert.match(hostListing({}, '9').stdout, /^limit 3\nself absent\n$/);
  assert.notEqual(hostListing({}, 'x').status, 0);
});

test('a deploy records the build status the capacity check reads', () => {
  const deploy = readFileSync(
    path.resolve(import.meta.dirname, '..', 'preview', 'preview-deploy.sh'),
    'utf8',
  );
  assert.match(deploy, /--build-status\) build_status="\$\{2:-\}"; shift 2 ;;/);
  assert.match(deploy, /buildStatus=\$\{build_status:-unknown\}\nENV/);
  assert.match(workflow, /--build-status '\$BUILD_STATUS'/);
  assert.match(
    workflow,
    /BUILD_STATUS: \$\{\{ steps\.prepare\.outputs\.build_status \}\}/,
  );
});

test('capacity is settled before anything is packaged or uploaded', () => {
  const capacity = workflow.indexOf('- name: Make room on the preview host');
  const publish = workflow.indexOf(
    '- name: Publish the payload for the host to fetch',
  );
  assert.ok(capacity > workflow.indexOf('- name: Send the host scripts'));
  assert.ok(
    publish > capacity,
    'the capacity check must come before the upload',
  );
  assert.ok(workflow.indexOf('gh release upload') > publish);
  assert.ok(workflow.indexOf('steps.prepare.outputs.probe') > publish);
  assert.match(
    workflow,
    /id: publish\n\s+if: steps\.capacity\.outputs\.room == 'true'/,
  );
  // ssh in a `while read` loop would otherwise swallow the eviction list.
  assert.match(
    workflow,
    /ssh -n "\$\{ssh_opts\[@\]\}" "\$remote" "bash \/srv\/nb3-preview\/scripts\/preview-destroy\.sh '\$victim'"/,
  );
  // Only a capacity step that finished reports a skip; one that broke is a
  // failed deploy.
  assert.ok(
    workflow.includes(
      "steps.capacity.outcome == 'success' && steps.capacity.outputs.room == 'false' && 'skipped'",
    ),
  );
});

// deploy-preview.mjs against a recorded API.
function runMode(mode, extra, { pulls = {}, comments = [], files = {} } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'preview-capacity-api-'));
  try {
    const output = path.join(root, 'plan');
    mkdirSync(output, { recursive: true });
    writeFileSync(
      path.join(output, 'deploy.json'),
      JSON.stringify({
        repository: 'o/r',
        runId: 99,
        runUrl: 'https://github.com/o/r/actions/runs/99',
        runAttempt: 1,
        prNumber: 9,
        headSha: 'a'.repeat(40),
        url: 'https://nb3-9.nfvd.net/main/',
      }),
    );
    for (const [name, content] of Object.entries(files))
      writeFileSync(path.join(root, name), content);
    writeFileSync(
      path.join(root, 'api.mjs'),
      `import { appendFileSync } from 'node:fs';
const pulls = ${JSON.stringify(pulls)};
const comments = ${JSON.stringify(comments)};
globalThis.fetch = async (url, options = {}) => {
  const method = options.method ?? 'GET';
  const route = new URL(url).pathname.replace('/repos/o/r', '');
  appendFileSync(process.env.CALLS, JSON.stringify({ method, route, body: options.body ?? '' }) + '\\n');
  const ok = (value) => ({ ok: true, status: 200, json: async () => value });
  const pull = /^\\/pulls\\/(\\d+)$/.exec(route);
  if (pull && pulls[pull[1]]) return ok(pulls[pull[1]]);
  if (route.startsWith('/issues/')) return ok(method === 'GET' ? comments : {});
  // The repository API client reads an error's body for its message.
  return { ok: false, status: 404, json: async () => ({}), text: async () => '{"message":"Not Found"}' };
};
`,
    );
    writeFileSync(path.join(root, 'calls'), '');
    writeFileSync(path.join(root, 'outputs'), '');
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        path.join(root, 'api.mjs'),
        Script,
        mode,
        '--run-id',
        '99',
        '--output',
        output,
        ...extra.map((arg) => arg.replace('<root>', root)),
      ],
      {
        env: {
          ...process.env,
          CALLS: path.join(root, 'calls'),
          GITHUB_OUTPUT: path.join(root, 'outputs'),
          GITHUB_REPOSITORY: 'o/r',
          GITHUB_TOKEN: 'test-token',
          GITHUB_API_URL: 'https://api.example.com',
          GITHUB_RUN_ID: '555',
        },
        encoding: 'utf8',
      },
    );
    const read = (name) => readFileSync(path.join(root, name), 'utf8');
    const calls = read('calls')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    let evict = '';
    try {
      evict = readFileSync(path.join(output, 'evict.txt'), 'utf8');
    } catch {}
    return { result, calls, outputs: read('outputs'), evict };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('the capacity step looks PRs up only on a full host and writes the plan', () => {
  const full = runMode('capacity', ['--listing', '<root>/listing.txt'], {
    files: {
      'listing.txt':
        'limit 2\nself absent\ninstance 3 2026-09-01T00:00:00Z unknown\ninstance 4 2026-09-02T00:00:00Z success\n',
    },
    // #3 is answered with a 404: a preview of no PR is reclaimed like a closed one.
    pulls: { 4: open('success') },
  });
  assert.equal(full.result.status, 0, full.result.stderr);
  assert.match(full.outputs, /^room=true$/m);
  assert.equal(full.evict, '3 closed\n');

  const free = runMode('capacity', ['--listing', '<root>/listing.txt'], {
    files: { 'listing.txt': 'limit 30\nself absent\ninstance 3 - unknown\n' },
  });
  assert.equal(free.result.status, 0, free.result.stderr);
  assert.match(free.outputs, /^room=true$/m);
  assert.deepEqual(free.calls, [], 'a host with room asks GitHub nothing');

  const skip = runMode('capacity', ['--listing', '<root>/listing.txt'], {
    files: { 'listing.txt': 'limit 1\nself absent\ninstance 4 - success\n' },
    pulls: { 4: open('success') },
  });
  assert.equal(skip.result.status, 0, skip.result.stderr);
  assert.match(skip.outputs, /^room=false$/m);
  assert.match(skip.result.stdout, /PREVIEW SKIPPED/);

  // A listing that cannot be read never reports a skip.
  const broken = runMode('capacity', ['--listing', '<root>/listing.txt'], {
    files: { 'listing.txt': 'garbage\n' },
  });
  assert.notEqual(broken.result.status, 0);
  assert.doesNotMatch(broken.outputs, /room=/);
});

test('a skipped deploy tells the PR why and how to free a slot', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'preview-skip-'));
  try {
    // The report reads the numbers the capacity step wrote into the same plan
    // directory. An earlier verified report for this run is replaced: a skip
    // means this PR has no preview at all, so that address no longer answers.
    const output = path.join(root, 'plan');
    mkdirSync(output, { recursive: true });
    writeFileSync(
      path.join(output, 'deploy.json'),
      JSON.stringify({
        repository: 'o/r',
        runId: 99,
        runUrl: 'https://github.com/o/r/actions/runs/99',
        runAttempt: 1,
        prNumber: 9,
        headSha: 'a'.repeat(40),
        url: 'https://nb3-9.nfvd.net/main/',
      }),
    );
    writeFileSync(
      path.join(output, 'capacity.json'),
      JSON.stringify({ room: false, evict: [], count: 30, limit: 30 }),
    );
    writeFileSync(
      path.join(root, 'api.mjs'),
      `import { appendFileSync } from 'node:fs';
globalThis.fetch = async (url, options = {}) => {
  const method = options.method ?? 'GET';
  const route = new URL(url).pathname.replace('/repos/o/r', '');
  appendFileSync(process.env.CALLS, JSON.stringify({ method, route, body: options.body ?? '' }) + '\\n');
  const ok = (value) => ({ ok: true, status: 200, json: async () => value });
  if (route === '/pulls/9') return ok({ state: 'open', body: '- [GitHub Actions 运行记录](https://github.com/o/r/actions/runs/99)', head: { sha: '${'a'.repeat(40)}' } });
  if (route === '/issues/9/comments' && method === 'GET')
    return ok([{ id: 5, body: '<!-- factory-preview:99:1 -->\\n${PREVIEW_VERIFIED_MARKER}', user: { login: 'github-actions[bot]' } }]);
  return ok({});
};
`,
    );
    writeFileSync(path.join(root, 'calls'), '');
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        path.join(root, 'api.mjs'),
        Script,
        'publish',
        '--run-id',
        '99',
        '--output',
        output,
        '--status',
        'skipped',
      ],
      {
        env: {
          ...process.env,
          CALLS: path.join(root, 'calls'),
          GITHUB_REPOSITORY: 'o/r',
          GITHUB_TOKEN: 'test-token',
          GITHUB_API_URL: 'https://api.example.com',
        },
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Preview skipped for capacity/);
    const writes = readFileSync(path.join(root, 'calls'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .filter((call) => call.method === 'PATCH');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].route, '/issues/comments/5');
    const body = JSON.parse(writes[0].body).body;
    assert.ok(body.includes('预览已跳过：预览机名额已满'));
    assert.ok(body.includes('30/30'));
    assert.ok(body.includes('preview-destroy.sh <PR 号>'));
    assert.ok(body.includes('Run workflow'));
    assert.ok(!body.includes(PREVIEW_VERIFIED_MARKER));
    assert.ok(!body.includes('https://nb3-9.nfvd.net/main/'));
    assert.ok(!body.includes('仍以它为准'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an open PR whose preview was evicted is told; a closed one is not', () => {
  const failed = runMode('evicted', ['--pr', '4', '--reason', 'failed']);
  assert.equal(failed.result.status, 0, failed.result.stderr);
  assert.equal(failed.calls.length, 1);
  assert.equal(failed.calls[0].method, 'POST');
  assert.equal(failed.calls[0].route, '/issues/4/comments');
  const body = JSON.parse(failed.calls[0].body).body;
  assert.ok(body.includes(PREVIEW_EVICTED_MARKER));
  assert.ok(body.includes('为部署 #9 的预览回收了本 PR 的预览'));
  assert.ok(body.includes('失败构建'));

  const closed = runMode('evicted', ['--pr', '3', '--reason', 'closed']);
  assert.equal(closed.result.status, 0, closed.result.stderr);
  assert.deepEqual(closed.calls, []);
});
