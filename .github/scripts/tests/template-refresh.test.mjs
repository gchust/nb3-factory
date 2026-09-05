import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const scripts = path.resolve(import.meta.dirname, '..');
const sha = 'a'.repeat(40);
const git = (cwd, ...args) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
const write = (root, file, value) => {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), value);
};
const init = (root, branch) => {
  git(root, 'init', `--initial-branch=${branch}`);
  git(root, 'config', 'user.name', 'Factory Test');
  git(root, 'config', 'user.email', 'test@example.invalid');
};
const commit = (root) => {
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'fixture');
  return git(root, 'rev-parse', 'HEAD');
};

function overlayFixture(root) {
  const control = path.join(root, 'control');
  const fresh = path.join(root, 'fresh');
  write(
    control,
    '.github/workflows/refresh-template.yml',
    'factory-workflow\n',
  );
  write(control, '.npmrc', '@nocobase:registry=https://npm.nocobase.ai/\n');
  write(control, 'client/old-business.ts', 'must not survive refresh');
  write(
    control,
    'README.MD',
    '<!-- factory:readme:start -->\n# Factory\n<!-- factory:readme:end -->\nOld upstream README',
  );
  write(
    control,
    'AGENTS.md',
    '# Old guide\n<!-- factory:boundary:start -->\nFactory boundary\n<!-- factory:boundary:end -->\nOld upstream guide',
  );
  write(
    control,
    'package.json',
    JSON.stringify({
      scripts: {
        'factory:test': 'node --test .github/scripts/tests/*.test.mjs',
      },
      devDependencies: { '@playwright/test': '1.62.1', 'old-only': '1.0.0' },
    }),
  );
  write(
    fresh,
    'package.json',
    JSON.stringify({
      name: 'nb3-factory',
      nocobase: { templateKind: 'app', defaultTemplateVersion: '2.0.0' },
      scripts: { dev: 'new-dev' },
      dependencies: { 'new-framework': '2.0.0' },
    }),
  );
  write(fresh, 'README.MD', '# New application README\n');
  write(fresh, 'AGENTS.md', '# New application guide\n\nLatest guidance.\n');
  write(fresh, 'skills/current.md', 'Latest skill\n');
  write(
    fresh,
    'eslint.config.js',
    'export default [{ rules: { "new-upstream-rule": "error" } }];\n',
  );
  write(fresh, 'client/fresh.ts', 'new template\n');
  write(
    fresh,
    'scripts/build.mjs',
    `import fs from 'node:fs';
import path from 'node:path';
const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');
fs.mkdirSync(distDir, { recursive: true });
function run() {
  if (!fs.readFileSync(path.join(distDir, '.npmrc'), 'utf8').includes('npm.nocobase.ai')) throw new Error('Missing production registry');
}
run(
  'Install server production dependencies',
);
`,
  );
  write(
    fresh,
    '.github/workflows/upstream.yml',
    'must not enter factory control plane\n',
  );
  write(fresh, '.gitignore', 'node_modules/\n');
  write(fresh, 'config.yml', 'auth: fixture-secret\n');
  write(fresh, '.env', 'SECRET=fixture\n');
  return { control, fresh };
}

test('refresh keeps current controls and latest application guidance, excluding runtime secrets', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-template-overlay-'));
  try {
    const { control, fresh } = overlayFixture(root);
    execFileSync(process.execPath, [
      path.join(scripts, 'overlay-factory.mjs'),
      control,
      fresh,
      sha,
    ]);
    assert.equal(
      readFileSync(
        path.join(fresh, '.github/workflows/refresh-template.yml'),
        'utf8',
      ),
      'factory-workflow\n',
    );
    assert.equal(
      existsSync(path.join(fresh, '.github/workflows/upstream.yml')),
      false,
    );
    assert.equal(existsSync(path.join(fresh, 'client/old-business.ts')), false);
    assert.equal(
      readFileSync(path.join(fresh, 'skills/current.md'), 'utf8'),
      'Latest skill\n',
    );
    const guide = readFileSync(path.join(fresh, 'AGENTS.md'), 'utf8');
    assert.match(guide, /Factory boundary/);
    assert.match(guide, /Latest guidance/);
    assert.doesNotMatch(guide, /Old upstream/);
    const manifest = JSON.parse(readFileSync(path.join(fresh, 'package.json')));
    assert.equal(manifest.dependencies['new-framework'], '2.0.0');
    assert.equal(manifest.devDependencies['old-only'], undefined);
    assert.equal(manifest.devDependencies['@playwright/test'], '1.62.1');
    assert.equal(manifest.scripts.dev, 'new-dev');
    const lint = readFileSync(path.join(fresh, 'eslint.config.js'), 'utf8');
    assert.match(lint, /new-upstream-rule/);
    assert.match(lint, /factory-eslint.mjs/);
    const metadata = JSON.parse(
      readFileSync(path.join(fresh, 'factory-template.json')),
    );
    assert.equal(metadata.templateVersion, '2.0.0');
    assert.equal(metadata.controlSha, sha);
    init(fresh, 'template');
    commit(fresh);
    const files = git(fresh, 'ls-files');
    assert.doesNotMatch(files, /config\.yml|\.env/);
    assert.match(files, /client\/fresh\.ts/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('overlay refuses to replace the control checkout or a directory with Git history', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-template-boundary-'));
  try {
    const { control, fresh } = overlayFixture(root);
    assert.throws(
      () =>
        execFileSync(
          process.execPath,
          [path.join(scripts, 'overlay-factory.mjs'), control, control, sha],
          { stdio: 'pipe' },
        ),
      /separate directories/,
    );
    init(fresh, 'template');
    assert.throws(
      () =>
        execFileSync(
          process.execPath,
          [path.join(scripts, 'overlay-factory.mjs'), control, fresh, sha],
          { stdio: 'pipe' },
        ),
      /without Git history/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('beta.15 compatibility fixes preserve upstream dependencies and configure production installation', () => {
  const root = mkdtempSync(
    path.join(os.tmpdir(), 'nb3-template-compatibility-'),
  );
  try {
    for (const [index, version, sonner] of [
      [0, '1.0.0-beta.15', null],
      [1, '1.0.0-beta.15', '3.0.0'],
      [2, '1.0.0-beta.16', null],
    ]) {
      const { control, fresh } = overlayFixture(path.join(root, String(index)));
      const manifestPath = path.join(fresh, 'package.json');
      const app = JSON.parse(readFileSync(manifestPath, 'utf8'));
      app.nocobase.defaultTemplateVersion = version;
      app.devDependencies = {
        '@nocobase/app-plugin-notification-provider': '^0.1.0-beta.6',
        '@nocobase/app-plugin-workflow': '^0.1.0-beta.7',
        ...(sonner ? { sonner, '@xyflow/react': '13.0.0' } : {}),
      };
      writeFileSync(manifestPath, JSON.stringify(app));
      execFileSync(process.execPath, [
        path.join(scripts, 'overlay-factory.mjs'),
        control,
        fresh,
        sha,
      ]);
      const updated = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const metadata = JSON.parse(
        readFileSync(path.join(fresh, 'factory-template.json'), 'utf8'),
      );
      assert.equal(
        updated.devDependencies.sonner,
        index === 0 ? '2.0.8' : (sonner ?? undefined),
      );
      assert.equal(
        updated.devDependencies['@xyflow/react'],
        index === 0 ? '12.11.3' : index === 1 ? '13.0.0' : undefined,
      );
      assert.equal(
        metadata.compatibilityFixes.length,
        index === 0 ? 3 : index === 1 ? 1 : 0,
      );
      if (version === '1.0.0-beta.15') {
        execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: fresh });
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function publishFixture(root) {
  const remote = path.join(root, 'remote.git');
  const control = path.join(root, 'control');
  const candidate = path.join(root, 'candidate');
  const bundle = path.join(root, 'template.bundle');
  mkdirSync(remote);
  git(remote, 'init', '--bare');
  write(control, '.github/workflows/refresh-template.yml', 'trusted control\n');
  write(control, '.npmrc', 'trusted registry\n');
  write(control, 'app.txt', 'old baseline\n');
  init(control, 'develop');
  const base = commit(control);
  git(control, 'remote', 'add', 'origin', remote);
  git(control, 'push', 'origin', 'develop', 'develop:apps/existing');
  mkdirSync(candidate);
  cpSync(path.join(control, '.github'), path.join(candidate, '.github'), {
    recursive: true,
  });
  cpSync(path.join(control, '.npmrc'), path.join(candidate, '.npmrc'));
  write(candidate, 'app.txt', 'latest template\n');
  init(candidate, 'template');
  const next = commit(candidate);
  git(candidate, 'bundle', 'create', bundle, 'refs/heads/template');
  return { remote, control, candidate, bundle, base, next };
}

test('publish replaces develop with a root commit and atomically backs up the prior baseline', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-template-publish-'));
  try {
    const f = publishFixture(root);
    execFileSync(
      'bash',
      [
        path.join(scripts, 'publish-template.sh'),
        f.control,
        f.bundle,
        f.base,
        'factory-backup/develop-123-1',
      ],
      { stdio: 'pipe', env: { ...process.env, GITHUB_STEP_SUMMARY: '' } },
    );
    assert.equal(git(f.remote, 'rev-parse', 'develop'), f.next);
    assert.equal(git(f.remote, 'rev-list', '--count', 'develop'), '1');
    assert.equal(
      git(f.remote, 'rev-parse', 'factory-backup/develop-123-1'),
      f.base,
    );
    assert.equal(git(f.remote, 'rev-parse', 'apps/existing'), f.base);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('publish refuses a develop commit that changed after generation began', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-template-lease-'));
  try {
    const f = publishFixture(root);
    write(f.control, 'concurrent.txt', 'new user change\n');
    const changed = commit(f.control);
    git(f.control, 'push', 'origin', 'develop');
    const result = spawnSync(
      'bash',
      [
        path.join(scripts, 'publish-template.sh'),
        f.control,
        f.bundle,
        f.base,
        'factory-backup/develop-123-1',
      ],
      { encoding: 'utf8' },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /develop changed/);
    assert.equal(git(f.remote, 'rev-parse', 'develop'), changed);
    assert.equal(
      git(
        f.remote,
        'for-each-ref',
        '--format=%(refname)',
        'refs/heads/factory-backup',
      ),
      '',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('publish rejects a candidate that replaces trusted workflows', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-template-controls-'));
  try {
    const f = publishFixture(root);
    write(
      f.candidate,
      '.github/workflows/refresh-template.yml',
      'modified controls\n',
    );
    git(f.candidate, 'add', '.');
    git(f.candidate, 'commit', '--amend', '--no-edit');
    git(f.candidate, 'bundle', 'create', f.bundle, 'refs/heads/template');
    const result = spawnSync(
      'bash',
      [
        path.join(scripts, 'publish-template.sh'),
        f.control,
        f.bundle,
        f.base,
        'factory-backup/develop-123-1',
      ],
      { encoding: 'utf8' },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /changed .github/);
    assert.equal(git(f.remote, 'rev-parse', 'develop'), f.base);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('refresh workflow serializes with business tasks and isolates generated code from write permissions', () => {
  const workflow = readFileSync(
    path.resolve(scripts, '..', 'workflows/refresh-template.yml'),
    'utf8',
  );
  const task = readFileSync(
    path.resolve(scripts, '..', 'workflows/code-agent-task.yml'),
    'utf8',
  );
  const group = /group: ([^\n]+)/.exec(workflow)[1];
  assert.ok(task.includes(`group: ${group}`));
  const publisher = workflow.split('\n  publish:')[1];
  assert.match(workflow.split('\n  publish:')[0], /contents: read/);
  assert.match(workflow, /pnpm create @nocobase\/app@latest nb3-factory/);
  assert.match(workflow, /--template-tag=latest/);
  assert.match(workflow, /scripts\/verify.sh/);
  assert.match(publisher, /contents: write/);
  assert.doesNotMatch(publisher, /pnpm |npm |secrets\./);
  assert.match(publisher, /!inputs.dry_run/);
});
