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
// What `pnpm create @nocobase/app` writes when the published template ships neither `gitignore` nor `.npmignore`.
const generatedGitignore = [
  'node_modules/',
  'dist/',
  'coverage/',
  '',
  '# Local configuration, including the generated AUTH_SECRET.',
  '/config.yml',
  '',
  '# Local application state.',
  '/storage/',
  '/.agents/',
  '/.agent-annotations/',
  '/.nocobase/',
  '*.log',
  '',
].join('\n');
// The lines the overlay patches the prune script through, as a template ships them.
const pruneScript = [
  "import { formatMegabytes } from './server-deps.mjs';",
  '',
  'const prune = (directory, treeRoot, removed) => {',
  '  for (const entry of entries) {',
  '    if (entry.isDirectory()) {',
  '      prune(entryPath, treeRoot, removed);',
  '      continue;',
  '    }',
  '  }',
  '};',
  '',
  'console.log(',
  '  `Removed ${removed.count} declaration, source map, and documentation files from the deployment tree (${formatMegabytes(removed.bytes)}).`,',
  ');',
  '',
].join('\n');
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
  for (const name of ['timing.mjs', 'deployment-cache.mjs']) {
    write(
      control,
      `.github/scripts/${name}`,
      readFileSync(path.join(scripts, name), 'utf8'),
    );
  }
  write(control, '.npmrc', '@nocobase:registry=https://npm.nocobase.ai/\n');
  write(control, '.agents/skills/custom/SKILL.md', 'custom guidance');
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
// const { default: spawn } = await import('cross-spawn');
fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });
function run() {
  /*
  const result = spawn.sync(command, args, {
  if (result.error) {
  */
  if (!fs.readFileSync(path.join(distDir, '.npmrc'), 'utf8').includes('npm.nocobase.ai')) throw new Error('Missing production registry');
}
run(
  'Install server production dependencies',
  'pnpm',
  [],
  { cwd: distDir },
);
// Removes type declarations, third-party source maps
const buildHooks = [];
function runHookStage() {}
runHookStage(buildHooks, 'afterBuild', run);
`,
  );
  write(
    fresh,
    '.github/workflows/upstream.yml',
    'must not enter factory control plane\n',
  );
  write(fresh, '.gitignore', generatedGitignore);
  write(fresh, 'scripts/utils/prune-dist-artifacts.mjs', pruneScript);
  write(fresh, 'config.yml', 'auth: fixture-secret\n');
  write(fresh, '.env', 'SECRET=fixture\n');
  return { control, fresh };
}

test('refresh preserves controls and the generated guide without inheriting old agent state', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-template-overlay-'));
  try {
    const { control, fresh } = overlayFixture(root);
    const generatedGuide = readFileSync(path.join(fresh, 'AGENTS.md'));
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
    assert.deepEqual(
      readFileSync(path.join(fresh, 'AGENTS.md')),
      generatedGuide,
    );
    assert.doesNotMatch(guide, /factory:boundary|Factory boundary|Old upstream/);
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
    // Preserve generated ignore rules; newly synchronized skills remain versioned.
    assert.ok(
      readFileSync(path.join(fresh, '.gitignore'), 'utf8').startsWith(
        generatedGitignore,
      ),
    );
    assert.equal(existsSync(path.join(fresh, '.agents')), false);
    // Pruning a superseded `database` directory is the one rule the template's script cannot express, so the
    // overlay injects the call into the walk and reports it as a compatibility fix.
    const prune = readFileSync(
      path.join(fresh, 'scripts/utils/prune-dist-artifacts.mjs'),
      'utf8',
    );
    assert.match(
      prune,
      /from '\.\.\/\.\.\/\.github\/scripts\/prune-superseded-sources\.mjs'/,
    );
    assert.match(
      prune,
      /if \(removeSupersededDatabaseDirectory\(entryPath, removed\)\) continue;/,
    );
    assert.match(prune, /superseded source files/);
    init(fresh, 'template');
    commit(fresh);
    const files = git(fresh, 'ls-files');
    // A runtime secret the generated rules do not cover is refused by the packaging guard rather than ignored
    // here; that guard has its own test below.
    assert.ok(files.split('\n').includes('config.yml'));
    assert.equal(
      readFileSync(path.join(fresh, 'config.yml'), 'utf8'),
      'auth: fixture-secret\n',
    );
    assert.match(files, /client\/fresh\.ts/);
    assert.doesNotMatch(files, /\.agents\//);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('overlay keeps fresh skills and ownership without requiring an old factory boundary', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-template-skills-'));
  try {
    const { control, fresh } = overlayFixture(root);
    // A refresh must work even when the control checkout has no AGENTS.md.
    rmSync(path.join(control, 'AGENTS.md'));
    const skill = '.agents/skills/nocobase-app-development/SKILL.md';
    const staleReference = '.agents/skills/nocobase-app-development/old.md';
    const ownership = '.agents/.skills-sync.json';
    write(control, skill, 'Old package skill\n');
    write(control, staleReference, 'Old reference\n');
    write(control, ownership, '{"old":"@nocobase/old"}\n');
    write(fresh, skill, 'New package skill\n');
    write(
      fresh,
      ownership,
      '{"nocobase-app-development":"@nocobase/app-skills"}\n',
    );
    const generatedGuide =
      'Official guidance without a heading.\n\nKeep spacing.  \n';
    write(fresh, 'AGENTS.md', generatedGuide);
    const generatedOwnership = readFileSync(path.join(fresh, ownership));
    execFileSync(process.execPath, [
      path.join(scripts, 'overlay-factory.mjs'),
      control,
      fresh,
      sha,
    ]);
    assert.equal(
      readFileSync(path.join(fresh, 'AGENTS.md'), 'utf8'),
      generatedGuide,
    );
    assert.equal(
      readFileSync(path.join(fresh, skill), 'utf8'),
      'New package skill\n',
    );
    assert.deepEqual(
      readFileSync(path.join(fresh, ownership)),
      generatedOwnership,
    );
    assert.equal(existsSync(path.join(fresh, staleReference)), false);
    assert.equal(existsSync(path.join(fresh, '.agents/skills/custom')), false);
    init(fresh, 'template');
    commit(fresh);
    const files = git(fresh, 'ls-files').split('\n');
    assert.ok(files.includes(skill));
    assert.ok(files.includes(ownership));
    assert.ok(!files.includes(staleReference));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Package-owned build entry shipped by the current upstream template.
// The factory must not search this wrapper for implementation-level anchors.
const appToolsBuild = `import path from 'node:path';
import { runAppTool } from '@nocobase/app-tools';
process.exitCode = await runAppTool('build', {
  rootDir: path.resolve(import.meta.dirname, '..'),
});
`;

test('refresh leaves app-tools entry points untouched without legacy build utilities', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-app-tools-overlay-'));
  try {
    const { control, fresh } = overlayFixture(root);
    const manifestPath = path.join(fresh, 'package.json');
    const app = JSON.parse(readFileSync(manifestPath, 'utf8'));
    app.devDependencies = { '@nocobase/app-tools': '^0.1.0' };
    writeFileSync(manifestPath, JSON.stringify(app));
    write(fresh, 'scripts/build.mjs', appToolsBuild);
    rmSync(path.join(fresh, 'scripts/utils'), { recursive: true });
    write(
      control,
      'skills/factory-performance/SKILL.md',
      'Legacy build hooks\n',
    );
    const guide = readFileSync(path.join(fresh, 'AGENTS.md'));
    execFileSync(process.execPath, [
      path.join(scripts, 'overlay-factory.mjs'),
      control,
      fresh,
      sha,
    ]);
    assert.equal(
      readFileSync(path.join(fresh, 'scripts/build.mjs'), 'utf8'),
      appToolsBuild,
    );
    assert.equal(existsSync(path.join(fresh, 'scripts/utils')), false);
    assert.equal(existsSync(path.join(fresh, 'skills/factory-performance')), false);
    assert.equal(existsSync(path.join(fresh, '.agents')), false);
    assert.deepEqual(readFileSync(path.join(fresh, 'AGENTS.md')), guide);
    assert.equal(
      readFileSync(
        path.join(fresh, '.github/workflows/refresh-template.yml'),
        'utf8',
      ),
      'factory-workflow\n',
    );
    assert.equal(
      readFileSync(path.join(fresh, '.npmrc'), 'utf8'),
      '@nocobase:registry=https://npm.nocobase.ai/\n',
    );
    const metadata = JSON.parse(
      readFileSync(path.join(fresh, 'factory-template.json')),
    );
    assert.deepEqual(metadata.compatibilityFixes, []);
    const updated = JSON.parse(readFileSync(manifestPath, 'utf8'));
    assert.equal(updated.devDependencies['@nocobase/app-tools'], '^0.1.0');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('legacy templates still fail when their build source no longer matches the patch', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-legacy-build-'));
  try {
    const { control, fresh } = overlayFixture(root);
    write(
      fresh,
      'scripts/build.mjs',
      'throw new Error("unsupported build");\n',
    );
    assert.throws(
      () =>
        execFileSync(
          process.execPath,
          [path.join(scripts, 'overlay-factory.mjs'), control, fresh, sha],
          { stdio: 'pipe' },
        ),
      /Unsupported template build hook/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('overlay refuses an unrecognised prune script instead of generating a deployment without its tables', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-template-prune-'));
  try {
    const { control, fresh } = overlayFixture(root);
    write(
      fresh,
      'scripts/utils/prune-dist-artifacts.mjs',
      'const prune = () => {};\n',
    );
    assert.throws(
      () =>
        execFileSync(
          process.execPath,
          [path.join(scripts, 'overlay-factory.mjs'), control, fresh, sha],
          { stdio: 'pipe' },
        ),
      /Cannot apply superseded-database pruning/,
    );
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
      [3, '1.0.0-beta.17', null],
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
      assert.equal(metadata.compatibilityFixes.length, index === 0 ? 5 : 3);
      execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: fresh });
      const buildBefore = readFileSync(
        path.join(fresh, 'scripts/build.mjs'),
        'utf8',
      );
      const pruneBefore = readFileSync(
        path.join(fresh, 'scripts/utils/prune-dist-artifacts.mjs'),
        'utf8',
      );
      execFileSync(process.execPath, [
        path.join(scripts, 'overlay-factory.mjs'),
        control,
        fresh,
        sha,
      ]);
      assert.equal(
        readFileSync(path.join(fresh, 'scripts/build.mjs'), 'utf8'),
        buildBefore,
      );
      assert.equal(
        readFileSync(
          path.join(fresh, 'scripts/utils/prune-dist-artifacts.mjs'),
          'utf8',
        ),
        pruneBefore,
      );
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

test('packaging allows GitHub issue settings but rejects staged runtime files', () => {
  const workflow = readFileSync(
    path.resolve(scripts, '..', 'workflows/refresh-template.yml'),
    'utf8',
  );
  const guard = workflow
    .match(/node --input-type=module <<'NODE'\n([\s\S]*?)\n {10}NODE/)[1]
    .replace(/^ {10}/gm, '');
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-package-guard-'));
  try {
    write(
      root,
      '.github/ISSUE_TEMPLATE/config.yml',
      'blank_issues_enabled: false',
    );
    write(root, 'config.yml', 'auth: fixture-secret');
    write(root, '.agents/skills/test.md', 'agent guidance');
    init(root, 'template');
    git(root, 'add', '.');
    const run = () =>
      spawnSync(process.execPath, ['--input-type=module', '-e', guard], {
        cwd: root,
        encoding: 'utf8',
      });
    assert.equal(run().status, 0);
    for (const file of [
      'nested/config.yml',
      '.env',
      'nested/.env.local',
      'node_modules/a/index.js',
      'dist/server.js',
      'storage/private.txt',
    ]) {
      write(root, file, 'runtime fixture');
      git(root, 'add', '-f', file);
      const result = run();
      assert.notEqual(result.status, 0, file);
      assert.ok(result.stderr.includes(file), result.stderr);
      git(root, 'rm', '--cached', file);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('refresh workflow has its own queue and isolates generated code from write permissions', () => {
  const workflow = readFileSync(
    path.resolve(scripts, '..', 'workflows/refresh-template.yml'),
    'utf8',
  );
  const task = readFileSync(
    path.resolve(scripts, '..', 'workflows/code-agent-task.yml'),
    'utf8',
  );
  const group = /group: ([^\n]+)/.exec(workflow)[1];
  assert.equal(group, 'template-refresh-global');
  assert.ok(!task.includes(`group: ${group}`));
  const publisher = workflow.split('\n  publish:')[1];
  assert.match(workflow.split('\n  publish:')[0], /contents: read/);
  assert.match(workflow, /pnpm create @nocobase\/app@latest nb3-factory/);
  assert.match(workflow, /--template-tag=latest/);
  assert.match(workflow, /scripts\/verify.sh/);
  assert.doesNotMatch(workflow, /rm -f config\.yml/);
  assert.match(publisher, /contents: write/);
  assert.doesNotMatch(publisher, /pnpm |npm |secrets\./);
  assert.match(publisher, /!inputs.dry_run/);
});

test('every building job exposes the factory registry to nested dist installs', () => {
  const read = (file) =>
    readFileSync(path.resolve(scripts, '..', 'workflows', file), 'utf8');
  const refresh = read('refresh-template.yml');
  const task = read('code-agent-task.yml');
  const jobs = {
    'refresh generate': refresh.split('\n  publish:')[0],
    'task agent': task.split('\n  agent:')[1].split('\n  verify-final:')[0],
    'task verify-final': task.split('\n  verify-final:')[1].split('\n  publish:')[0],
  };
  for (const [name, job] of Object.entries(jobs)) {
    const expose = job.indexOf('cat control/.npmrc >> ~/.npmrc');
    assert.ok(expose > 0, name);
    assert.ok(expose < job.search(/pnpm (create|install)/), name);
  }
});

test('factory workflows and implementation guidance use the canonical skills sync command', () => {
  for (const file of [
    'workflows/refresh-template.yml',
    'workflows/code-agent-task.yml',
    'prompts/implement.md',
  ]) {
    const source = readFileSync(path.resolve(scripts, '..', file), 'utf8');
    assert.match(source, /pnpm skills:sync\b/, file);
    assert.doesNotMatch(source, /pnpm plugin:skills:sync\b/, file);
  }
  const workflow = readFileSync(
    path.resolve(scripts, '..', 'workflows/refresh-template.yml'),
    'utf8',
  );
  assert.ok(
    workflow.indexOf('pnpm skills:sync') >
      workflow.indexOf('pnpm install --no-frozen-lockfile'),
  );
  assert.doesNotMatch(workflow, /prettier[^\n]*\bAGENTS\.md\b/);
});

test('beta.38 test adaptation retains behavior assertions and is repeatable', async () => {
  const { adaptTemplateTests } = await import('../adapt-template-tests.mjs');
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-test-adapter-'));
  try {
    write(
      root,
      'tests/logic/inspect-server.test.ts',
      "expect(inspection.app.packageName).toBe('@nocobase/app-template-default');\n",
    );
    write(
      root,
      'tests/logic/tailwind-sources.test.ts',
      'expect(file).not.toContain(`node_modules${path.sep}@nocobase${path.sep}`);',
    );
    write(root, 'vitest.config.ts', 'test: {\n    root,\n}');
    const app = {
      name: 'nb3-factory',
      nocobase: { defaultTemplateVersion: '1.0.0-beta.38' },
    };
    adaptTemplateTests(root, app);
    assert.equal(
      readFileSync(
        path.join(root, 'tests/logic/inspect-server.test.ts'),
        'utf8',
      ),
      "expect(inspection.app.packageName).toBe('nb3-factory');\n",
    );
    assert.equal(
      readFileSync(
        path.join(root, 'tests/logic/tailwind-sources.test.ts'),
        'utf8',
      ),
      'expect(file).toBe(realpathSync(file));',
    );
    const config = readFileSync(path.join(root, 'vitest.config.ts'), 'utf8');
    assert.ok(config.includes('app-plugin-authorization\\/dist\\/client'));
    adaptTemplateTests(root, app);
    assert.equal(
      readFileSync(path.join(root, 'vitest.config.ts'), 'utf8'),
      config,
    );
    assert.deepEqual(
      adaptTemplateTests(root, {
        ...app,
        nocobase: { defaultTemplateVersion: '1.0.0-beta.39' },
      }),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
