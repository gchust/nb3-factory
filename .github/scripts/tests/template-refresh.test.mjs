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

test('the checked-in issue baseline uses the current CLI without old wrappers', () => {
  const root = path.resolve(scripts, '../..');
  const app = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const baseline = JSON.parse(
    readFileSync(path.join(root, 'factory-template.json'), 'utf8'),
  );
  assert.equal(app.scripts.build, 'nocobase build');
  assert.equal(app.scripts.postinstall, 'nocobase skills sync');
  assert.ok(app.dependencies['@nocobase/app-cli']);
  assert.equal(app.nocobase.defaultTemplateVersion, baseline.templateVersion);
  for (const alias of [
    'db:apply',
    'migrate',
    'seed',
    'skills:sync',
    'plugin:register',
    'plugin:inspect',
  ]) {
    assert.equal(app.scripts[alias], undefined, alias);
  }
  for (const file of [
    'scripts/build.mjs',
    'cli/index.ts',
    'client/plugin-dev-authz.ts',
  ]) {
    assert.equal(existsSync(path.join(root, file)), false, file);
  }
});
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
      scripts: { dev: 'new-dev', build: 'nocobase build' },
      dependencies: {
        'new-framework': '2.0.0',
        '@nocobase/app-cli': '^1.0.0-beta.6',
      },
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
    '.github/workflows/upstream.yml',
    'must not enter factory control plane\n',
  );
  write(fresh, '.gitignore', generatedGitignore);
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
    assert.doesNotMatch(
      guide,
      /factory:boundary|Factory boundary|Old upstream/,
    );
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
    assert.equal(existsSync(path.join(fresh, 'scripts')), false);
    assert.equal(metadata.tooling, '@nocobase/app-cli');
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

for (const [name, appScripts, dependencies] of [
  ['inline build', { build: 'node scripts/build.mjs' }, {}],
  [
    'app-tools wrapper',
    { build: 'node scripts/build.mjs' },
    { '@nocobase/app-tools': '^0.1.0' },
  ],
  [
    'old app-cli wrapper',
    { build: 'node scripts/build.mjs' },
    { '@nocobase/app-cli': '^1.0.0-beta.5' },
  ],
  ['missing official CLI', { build: 'nocobase build' }, {}],
]) {
  test(
    'refresh rejects ' + name + ' before changing any template files',
    (t) => {
      const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-old-template-'));
      t.after(() => rmSync(root, { recursive: true, force: true }));
      const { control, fresh } = overlayFixture(root);
      const manifestPath = path.join(fresh, 'package.json');
      const app = JSON.parse(readFileSync(manifestPath, 'utf8'));
      Object.assign(app, { scripts: appScripts, dependencies });
      writeFileSync(manifestPath, JSON.stringify(app));
      const before = readFileSync(manifestPath);
      assert.throws(
        () =>
          execFileSync(
            process.execPath,
            [path.join(scripts, 'overlay-factory.mjs'), control, fresh, sha],
            { stdio: 'pipe' },
          ),
        /Unsupported legacy template/,
      );
      assert.deepEqual(readFileSync(manifestPath), before);
      assert.equal(
        existsSync(path.join(fresh, '.github/workflows/upstream.yml')),
        true,
      );
      assert.equal(
        existsSync(path.join(fresh, 'factory-template.json')),
        false,
      );
    },
  );
}

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

test('publish adds the verified baseline on top of develop and atomically backs up the prior baseline', () => {
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
    const published = git(f.remote, 'rev-parse', 'develop');
    // History is kept: the generated tree lands as one commit whose parent is
    // the develop it was generated from, so older branches still share history.
    assert.equal(git(f.remote, 'rev-parse', `${published}^`), f.base);
    assert.equal(git(f.remote, 'rev-list', '--count', 'develop'), '2');
    assert.equal(
      git(f.remote, 'rev-parse', `${published}^{tree}`),
      git(f.candidate, 'rev-parse', `${f.next}^{tree}`),
    );
    assert.equal(
      git(f.remote, 'log', '-1', '--format=%s%n%an', published),
      git(f.candidate, 'log', '-1', '--format=%s%n%an', f.next),
    );
    assert.equal(
      git(f.remote, 'merge-base', 'develop', 'apps/existing'),
      f.base,
    );
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
  assert.match(workflow, /template-creator.mjs pin control/);
  assert.match(
    workflow,
    /pnpm create "@nocobase\/app@\$FACTORY_CREATOR_VERSION" nb3-factory/,
  );
  assert.match(workflow, /template-creator.mjs record/);
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
    'task verify-final': task
      .split('\n  verify-final:')[1]
      .split('\n  publish:')[0],
  };
  for (const [name, job] of Object.entries(jobs)) {
    const expose = job.indexOf('cat control/.npmrc >> ~/.npmrc');
    assert.ok(expose > 0, name);
    assert.ok(expose < job.search(/pnpm (create|install)/), name);
  }
});

test('task and replay reject old baselines before installing application dependencies', () => {
  for (const file of ['code-agent-task.yml', 'replay-build-review.yml']) {
    const workflow = readFileSync(
      path.resolve(scripts, '../workflows', file),
      'utf8',
    );
    const guard = workflow.indexOf(
      'node ../control/.github/scripts/assert-current-template.mjs .',
    );
    const install = workflow.indexOf('pnpm install --frozen-lockfile');
    assert.ok(guard >= 0 && install > guard, file);
  }
});

test('source verification rejects retired templates before building source packages', () => {
  const workflow = readFileSync(
    path.resolve(scripts, '../workflows/source-baseline.yml'),
    'utf8',
  );
  const guard = workflow.indexOf(
    'assert-current-template.mjs packages/templates/app-template-default',
  );
  assert.ok(
    guard >= 0 && guard < workflow.indexOf('pnpm install --frozen-lockfile'),
  );
  const pins = [
    ...workflow.matchAll(
      /(?:default: |REQUESTED_SHA:.*?'|\|\| ')([a-f0-9]{40})/g,
    ),
  ].map((match) => match[1]);
  assert.equal(pins.length, 2);
  assert.equal(pins[0], pins[1]);
});

test('factory workflows use only the current package CLI for Skills sync', () => {
  for (const file of [
    'workflows/refresh-template.yml',
    'workflows/code-agent-task.yml',
    'workflows/replay-build-review.yml',
    'workflows/source-baseline.yml',
  ]) {
    const source = readFileSync(path.resolve(scripts, '..', file), 'utf8');
    assert.match(
      source,
      /pnpm(?: --dir "\$APP_ROOT")? exec nocobase skills sync\b/,
      file,
    );
    assert.doesNotMatch(
      source,
      /template-cli\.mjs|pnpm (?:plugin:)?skills:sync\b/,
      file,
    );
  }
  const workflow = readFileSync(
    path.resolve(scripts, '..', 'workflows/refresh-template.yml'),
    'utf8',
  );
  assert.ok(
    workflow.indexOf('exec nocobase skills sync') >
      workflow.indexOf('pnpm install --no-frozen-lockfile'),
  );
  assert.doesNotMatch(workflow, /prettier[^\n]*\bAGENTS\.md\b/);
  const prompt = readFileSync(
    path.resolve(scripts, '../prompts/implement.md'),
    'utf8',
  );
  assert.match(prompt, /pnpm exec nocobase skills sync/);
});
