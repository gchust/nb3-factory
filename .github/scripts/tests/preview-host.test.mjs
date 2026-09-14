import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  depsKeyFromEntries,
  depsProbeCommand,
  planFrom,
  previewHost,
  previewUrl,
  readDepsEntries,
  renderPreviewComment,
  selectDistArtifact,
  containerName,
  routerName,
  isDepsKey,
  requireDomain,
  slimEntries,
} from '../preview-host.mjs';

// A dependency tree as `depsKeyFromEntries` sees it: path and size, which is
// what the tree walk produces.
const tree = (...files) => files.map(([name, size]) => `${name}\u0000${size}`);

const SAMPLE_TREE = tree(
  ['dist/node_modules/@nocobase/app-server/dist/index.js', 120_000],
  [
    'dist/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
    1_900_000,
  ],
);

const run = (overrides = {}) => ({
  path: '.github/workflows/code-agent-task.yml',
  head_repository: { full_name: 'gchust/nb3-factory' },
  event: 'issues',
  status: 'completed',
  conclusion: 'success',
  run_attempt: 1,
  ...overrides,
});

const deliveredJobs = () => [
  { name: 'prepare', conclusion: 'success' },
  { name: 'agent', conclusion: 'success' },
  { name: 'verify-final', conclusion: 'success' },
  { name: 'publish', conclusion: 'success' },
];

test('a dependency key identifies the installed tree', () => {
  assert.ok(isDepsKey(depsKeyFromEntries(SAMPLE_TREE)));
  assert.equal(
    depsKeyFromEntries(SAMPLE_TREE),
    depsKeyFromEntries([...SAMPLE_TREE]),
  );
});

test('the dependency key depends on the order of nothing', () => {
  assert.equal(
    depsKeyFromEntries(SAMPLE_TREE),
    depsKeyFromEntries([...SAMPLE_TREE].reverse()),
  );
});

test('any change in the tree changes the key', () => {
  // Pruning a file is the case that motivated hashing the tree: the declared
  // versions are identical and the tree is not.
  assert.notEqual(
    depsKeyFromEntries(SAMPLE_TREE),
    depsKeyFromEntries(SAMPLE_TREE.slice(1)),
  );
  assert.notEqual(
    depsKeyFromEntries(SAMPLE_TREE),
    depsKeyFromEntries(
      tree(
        [SAMPLE_TREE[0].split('\u0000')[0], 120_001],
        [SAMPLE_TREE[1].split('\u0000')[0], 1_900_000],
      ),
    ),
  );
});

test('an emptied directory is a different tree', () => {
  // The application picks the first candidate path that exists, so a plugin's
  // `database/migrations` surviving as an empty directory reports no migrations
  // instead of using the compiled directory beside it. A tree that differs only
  // in which directories exist must not hash the same.
  const withDirectory = [
    'database/migrations\u0000dir',
    'database/migrations/a.js\u000010',
  ];
  const withoutDirectory = ['database/migrations/a.js\u000010'];
  assert.notEqual(
    depsKeyFromEntries(withDirectory),
    depsKeyFromEntries(withoutDirectory),
  );
});

test('a differently built native module is a different tree', () => {
  const binary =
    'dist/node_modules/better-sqlite3/build/Release/better_sqlite3.node';
  assert.notEqual(
    depsKeyFromEntries(tree([binary, 1_900_000])),
    depsKeyFromEntries(tree([binary, 1_700_000])),
  );
});

test('the tree walk records paths, sizes and links', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'preview-deps-'));
  try {
    mkdirSync(path.join(root, 'pkg'));
    writeFileSync(path.join(root, 'pkg', 'index.js'), 'abc');
    writeFileSync(path.join(root, 'LICENSE'), 'x'.repeat(11));
    symlinkSync('pkg/index.js', path.join(root, 'link.js'));

    const entries = readDepsEntries(root).sort();
    assert.deepEqual(entries, [
      'LICENSE\u000011',
      'link.js\u0000link',
      // Directories are part of the identity: one left behind empty changes how
      // the application resolves a plugin's migrations.
      'pkg\u0000dir',
      'pkg/index.js\u00003',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('preview identity is derived consistently', () => {
  assert.equal(previewHost(12, 'preview.nfvd.net'), 'pr-12.preview.nfvd.net');
  assert.equal(
    previewUrl(12, 'preview.nfvd.net'),
    'https://pr-12.preview.nfvd.net/main/',
  );
  assert.equal(containerName(12), 'preview-pr-12');
  assert.equal(routerName(12), 'pr12');
});

test('domain and pull request numbers are validated', () => {
  assert.throws(() => requireDomain('preview.nfvd.net; rm -rf /'));
  assert.throws(() => requireDomain(''));
  assert.equal(requireDomain('preview.nfvd.net'), 'preview.nfvd.net');
});

test('the cache probe names the dependency directory and answers unambiguously', () => {
  const key = depsKeyFromEntries(SAMPLE_TREE);
  const command = depsProbeCommand(key);
  assert.ok(command.includes(`/srv/nb3-preview/deps/${key}/node_modules`));
  assert.equal(command, command.trim());
  // The caller compares the answer to this literal, so any other output — a
  // partial line, or nothing at all from a failed connection — is a miss.
  assert.match(command, /echo present \|\| echo absent$/);
  assert.throws(() => depsProbeCommand('not-a-key'));
});

test('only a delivered task has a deployable build', () => {
  const artifacts = [
    { name: 'factory-agent-7', expired: false, id: 1 },
    { name: 'factory-dist-7', expired: false, id: 2 },
  ];
  const selected = selectDistArtifact(
    run(),
    deliveredJobs(),
    artifacts,
    'gchust/nb3-factory',
  );
  assert.equal(selected.name, 'factory-dist-7');
});

test('a task that was not delivered selects nothing', () => {
  const artifacts = [{ name: 'factory-dist-7', expired: false, id: 2 }];
  // A five-hour handoff completes successfully but reaches neither job.
  const handoff = [
    { name: 'prepare', conclusion: 'success' },
    { name: 'agent', conclusion: 'success' },
  ];
  assert.equal(
    selectDistArtifact(run(), handoff, artifacts, 'gchust/nb3-factory'),
    null,
  );
  assert.equal(
    selectDistArtifact(
      run({ conclusion: 'failure' }),
      deliveredJobs(),
      artifacts,
      'gchust/nb3-factory',
    ),
    null,
  );
  const verifyFailed = deliveredJobs().map((job) =>
    job.name === 'verify-final'
      ? { name: job.name, conclusion: 'failure' }
      : job,
  );
  assert.equal(
    selectDistArtifact(run(), verifyFailed, artifacts, 'gchust/nb3-factory'),
    null,
  );
});

test('a run from another repository or workflow is refused', () => {
  const artifacts = [{ name: 'factory-dist-7', expired: false, id: 2 }];
  assert.throws(() =>
    selectDistArtifact(
      run({ head_repository: { full_name: 'attacker/fork' } }),
      deliveredJobs(),
      artifacts,
      'gchust/nb3-factory',
    ),
  );
  assert.throws(() =>
    selectDistArtifact(
      run({ path: '.github/workflows/other.yml' }),
      deliveredJobs(),
      artifacts,
      'gchust/nb3-factory',
    ),
  );
  assert.throws(() =>
    selectDistArtifact(
      run({ event: 'pull_request' }),
      deliveredJobs(),
      artifacts,
      'gchust/nb3-factory',
    ),
  );
});

test('an expired or ambiguous build is refused rather than guessed', () => {
  assert.throws(() =>
    selectDistArtifact(
      run(),
      deliveredJobs(),
      [{ name: 'factory-dist-7', expired: true, id: 2 }],
      'gchust/nb3-factory',
    ),
  );
  assert.throws(() =>
    selectDistArtifact(
      run(),
      deliveredJobs(),
      [
        { name: 'factory-dist-7', expired: false, id: 2 },
        { name: 'factory-dist-7', expired: false, id: 3 },
      ],
      'gchust/nb3-factory',
    ),
  );
});

test('the plan records the pull request head as the deployed commit', () => {
  const source = {
    repository: 'gchust/nb3-factory',
    runId: 99,
    runUrl: 'https://github.com/gchust/nb3-factory/actions/runs/99',
    runAttempt: 1,
    artifact: { name: 'factory-dist-7', id: 2, expired: false },
  };
  const metadata = { issue: { number: 7 } };
  const plan = planFrom({
    metadata,
    source,
    domain: 'preview.nfvd.net',
    pr: { number: 12, head: { sha: 'a'.repeat(40) } },
  });
  assert.equal(plan.headSha, 'a'.repeat(40));
  assert.equal(plan.prNumber, 12);
  assert.equal(plan.url, 'https://pr-12.preview.nfvd.net/main/');
  assert.equal(plan.container, 'preview-pr-12');
});

test('a build belonging to another task is refused', () => {
  assert.throws(() =>
    planFrom({
      metadata: { issue: { number: 7 } },
      source: {
        repository: 'gchust/nb3-factory',
        runId: 99,
        runUrl: 'https://github.com/gchust/nb3-factory/actions/runs/99',
        runAttempt: 1,
        artifact: { name: 'factory-dist-8', id: 2, expired: false },
      },
      domain: 'preview.nfvd.net',
      pr: { number: 12, head: { sha: 'a'.repeat(40) } },
    }),
  );
});

test('the slim payload is derived from the build without the dependency tree', () => {
  const entries = slimEntries(
    ['config.example.yml', 'dist'],
    [
      '.npmrc',
      'cli',
      'client',
      'database',
      'node_modules',
      'package.json',
      'pnpm-workspace.yaml',
      'server',
    ],
  );
  // The migrator lives in dist/cli; leaving it out produced a preview that
  // failed at migration rather than at startup.
  assert.ok(entries.includes('dist/cli'));
  assert.ok(entries.includes('dist/database'));
  assert.ok(entries.includes('config.example.yml'));
  assert.equal(
    entries.some((entry) => entry.includes('node_modules')),
    false,
  );
  assert.equal(entries.length, 8);
});

test('the published comment carries the marker, the URL and the public warning', () => {
  const body = renderPreviewComment({
    runId: 99,
    runAttempt: 3,
    url: 'https://pr-12.preview.nfvd.net/main/',
    headSha: 'a'.repeat(40),
    runUrl: 'https://github.com/gchust/nb3-factory/actions/runs/99',
  });
  assert.match(body, /^<!-- factory-preview:99:3 -->/);
  assert.ok(body.includes('https://pr-12.preview.nfvd.net/main/'));
  assert.ok(body.includes('a'.repeat(40)));
  assert.ok(body.includes('公开地址'));
});

test('a failed deployment is reported without a working link', () => {
  const body = renderPreviewComment(
    {
      runId: 99,
      runAttempt: 1,
      url: 'https://pr-12.preview.nfvd.net/main/',
      headSha: 'a'.repeat(40),
      runUrl: 'https://github.com/gchust/nb3-factory/actions/runs/99',
    },
    '本次预览部署失败，没有可用地址。',
  );
  assert.ok(body.includes('本次预览部署失败'));
});
