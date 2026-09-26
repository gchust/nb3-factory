import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { exportSnapshot, hash, loadSnapshot } from '../source-snapshot.mjs';

function fixture(t, prefix = 'nocobase-unreleased-') {
  const root = mkdtempSync(path.join(os.tmpdir(), 'snapshot-unreleased-test-'));
  const repo = path.join(root, 'source');
  const application = path.join(root, 'application');
  const output = path.join(root, 'snapshot');
  mkdirSync(repo);
  mkdirSync(path.join(application, 'node_modules/.pnpm'), { recursive: true });
  execFileSync('git', ['init', '--quiet', '-b', 'main'], { cwd: repo });
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Snapshot Test',
      '-c',
      'user.email=snapshot@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '--allow-empty',
      '--no-verify',
      '-m',
      'Create snapshot fixture',
    ],
    { cwd: repo },
  );
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repo,
    encoding: 'utf8',
  }).trim();
  const stateDir = path.join(
    os.tmpdir(),
    prefix + hash(path.resolve(repo)).slice(0, 12),
  );
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(stateDir, { recursive: true, force: true });
  });
  const versions = {
    '@nocobase/create-app': '0.1.0-beta.24',
    '@nocobase/app-template-default': '1.0.0-beta.47',
  };
  mkdirSync(stateDir);
  writeFileSync(
    path.join(stateDir, 'state.json'),
    JSON.stringify({
      repo: path.resolve(repo),
      registry: 'http://127.0.0.1:4873/',
      ready: true,
      versions,
      npmrc: '/private/registry/credentials.npmrc',
      token: 'fixture-private-token',
    }),
  );
  return { repo, application, output, sourceSha, versions };
}

test('exports verified package bytes from the current unreleased session without its credentials', async (t) => {
  const { repo, application, output, sourceSha, versions } = fixture(t);
  const requests = [];
  const packages = new Map(
    Object.entries(versions).map(([name, version]) => {
      const bytes = Buffer.from(name + '@' + version);
      const tarball =
        'http://127.0.0.1:4873/tarballs/' + encodeURIComponent(name) + '.tgz';
      return [
        name,
        {
          bytes,
          tarball,
          manifest: {
            name,
            version,
            dist: {
              tarball,
              integrity:
                'sha512-' + createHash('sha512').update(bytes).digest('base64'),
            },
            _authToken: 'fixture-registry-token',
            _npmUser: { name: 'fixture-registry-user' },
          },
        },
      ];
    }),
  );
  const fetcher = async (input) => {
    const url = String(input);
    requests.push(url);
    for (const [name, entry] of packages) {
      if (
        url ===
        'http://127.0.0.1:4873/' +
          encodeURIComponent(name) +
          '/' +
          encodeURIComponent(versions[name])
      ) {
        return { ok: true, json: async () => entry.manifest };
      }
      if (url === entry.tarball) {
        return { ok: true, arrayBuffer: async () => entry.bytes };
      }
    }
    assert.fail('Unexpected snapshot request: ' + url);
  };
  const result = await exportSnapshot(
    repo,
    output,
    sourceSha,
    application,
    fetcher,
  );
  assert.deepEqual(result.source, {
    repository: 'nocobase/nocobase3',
    sha: sourceSha,
  });
  assert.equal(requests.length, 4);
  assert.deepEqual(
    Object.fromEntries(result.packages.map((p) => [p.name, p.version])),
    versions,
  );
  for (const item of result.packages) {
    const expected = packages.get(item.name);
    assert.equal(item.origin, 'source');
    assert.equal(item.sha256, hash(expected.bytes));
    assert.equal(
      item.manifest.dist.integrity,
      expected.manifest.dist.integrity,
    );
    assert.deepEqual(
      readFileSync(path.join(output, item.file)),
      expected.bytes,
    );
  }
  assert.deepEqual(loadSnapshot(output), result);
  assert.deepEqual(readdirSync(output).sort(), ['manifest.json', 'packages']);
  assert.doesNotMatch(
    readFileSync(path.join(output, 'manifest.json'), 'utf8'),
    /npmrc|_authToken|_npmUser|fixture-private-token|fixture-registry-token|fixture-registry-user/u,
  );
});

test('rejects a legacy local-registry session instead of falling back to it', async (t) => {
  const { repo, application, output, sourceSha } = fixture(
    t,
    'nocobase-local-registry-',
  );
  let requested = false;
  await assert.rejects(
    exportSnapshot(repo, output, sourceSha, application, async () => {
      requested = true;
      assert.fail('Legacy sessions must not be downloaded');
    }),
    (error) =>
      error.code === 'ENOENT' && error.path.includes('nocobase-unreleased-'),
  );
  assert.equal(requested, false);
});
