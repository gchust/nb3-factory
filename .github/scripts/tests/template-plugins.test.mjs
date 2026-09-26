import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { templatePlugins, validateInspection } from '../template-plugins.mjs';

const script = path.resolve(import.meta.dirname, '../template-plugins.mjs');
const packageName = templatePlugins[0];
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const writeJson = (file, value) => writeFileSync(file, JSON.stringify(value));

function inspection(name = packageName) {
  const skill = name.replace('@nocobase/', 'nocobase-');
  return {
    schemaVersion: 1,
    command: 'plugin inspect',
    ok: true,
    status: 'success',
    result: {
      plugin: {
        packageName: name,
        installed: true,
        exports: { client: true, serverPlugin: true, cli: false },
      },
      dependency: { field: 'dependencies', range: '^1.2.3-beta.4' },
      registration: { enabled: true },
      composition: {
        client: { registered: true },
        server: { registered: true },
        cli: { registered: false },
      },
      skills: {
        checked: true,
        source: [skill],
        synchronized: [skill],
        missing: [],
        stale: [],
        contentMatches: true,
      },
      consistent: true,
      issues: [],
    },
  };
}

test('the explicit baseline contains AI Employee and the two NB3 Pro packages', () => {
  assert.deepEqual(templatePlugins, [
    '@nocobase/app-plugin-ai-employee',
    '@nocobase/app-plugin-ai-knowledge-base',
    '@nocobase/app-plugin-mail',
  ]);
});

test('inspection accepts registered plugins without inventing a CLI requirement', () => {
  validateInspection(inspection(), packageName);
  const response = inspection();
  response.result.plugin.exports.cli = true;
  response.result.composition.cli.registered = true;
  validateInspection(response, packageName);
});

for (const [name, change] of [
  [
    'uninstalled package',
    (r) => {
      r.plugin.installed = false;
    },
  ],
  [
    'unexpected package',
    (r) => {
      r.plugin.packageName = 'other';
    },
  ],
  [
    'development-only dependency',
    (r) => {
      r.dependency.field = 'devDependencies';
    },
  ],
  [
    'empty dependency range',
    (r) => {
      r.dependency.range = '';
    },
  ],
  [
    'disabled registration',
    (r) => {
      r.registration.enabled = false;
    },
  ],
  [
    'missing client registration despite consistent=true',
    (r) => {
      r.composition.client.registered = false;
    },
  ],
  [
    'missing server registration despite consistent=true',
    (r) => {
      r.composition.server.registered = false;
    },
  ],
  [
    'missing client export',
    (r) => {
      r.plugin.exports.client = false;
    },
  ],
  [
    'missing server export',
    (r) => {
      r.plugin.exports.serverPlugin = false;
    },
  ],
  [
    'unregistered exported CLI',
    (r) => {
      r.plugin.exports.cli = true;
    },
  ],
  [
    'unknown CLI export state',
    (r) => {
      delete r.plugin.exports.cli;
    },
  ],
  [
    'inconsistent inspection',
    (r) => {
      r.consistent = false;
    },
  ],
  [
    'reported warning',
    (r) => {
      r.issues.push({ severity: 'warning', code: 'SKILLS_OUT_OF_DATE' });
    },
  ],
  [
    'missing package-owned Skill',
    (r) => {
      r.skills.source = [];
      r.skills.synchronized = [];
    },
  ],
  [
    'missing synchronized Skill',
    (r) => {
      r.skills.missing = ['missing'];
    },
  ],
  [
    'stale Skill',
    (r) => {
      r.skills.stale = ['old'];
    },
  ],
  [
    'changed Skill content',
    (r) => {
      r.skills.contentMatches = false;
    },
  ],
  [
    'unchecked Skills',
    (r) => {
      r.skills.checked = false;
    },
  ],
]) {
  test(`inspection rejects ${name}`, () => {
    const response = inspection();
    change(response.result);
    assert.throws(() => validateInspection(response, packageName));
  });
}

test('inspection fails closed on an unknown schema, failure or incomplete envelope', () => {
  for (const response of [
    null,
    {},
    { ...inspection(), schemaVersion: 2 },
    { ...inspection(), ok: false },
    { ...inspection(), status: 'partial-success' },
    { ...inspection(), result: {} },
  ]) {
    assert.throws(() => validateInspection(response, packageName));
  }
});

function fixture(t, overrides = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'template-plugins-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, 'app');
  const bin = path.join(root, 'bin');
  mkdirSync(app);
  mkdirSync(bin);
  const metadata = {
    template: '@nocobase/app-template-default',
    templateVersion: 'template-version',
    controlSha: 'a'.repeat(40),
  };
  writeJson(path.join(app, 'factory-template.json'), metadata);
  writeJson(path.join(app, 'package.json'), {
    dependencies: { existing: '^1.0.0', '@nocobase/app-cli': '^1.0.0-beta.6' },
    scripts: { build: 'nocobase build' },
  });
  writeJson(path.join(bin, 'package.json'), { type: 'module' });
  const state = {
    plugins: templatePlugins,
    inspections: Object.fromEntries(
      templatePlugins.map((name) => [name, inspection(name)]),
    ),
    registerStatus: 'success',
    version: '1.2.3-beta.4',
    ...overrides,
  };
  writeJson(path.join(root, 'state.json'), state);
  const pnpm = path.join(bin, 'pnpm');
  writeFileSync(
    pnpm,
    `#!${process.execPath}
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const state = JSON.parse(readFileSync(process.env.FAKE_STATE, 'utf8'));
const commandArgs = args[0] === '--silent' ? args.slice(1) : args;
const modern = commandArgs[0] === 'exec' && commandArgs[1] === 'nocobase';
const command = modern ? commandArgs.slice(2, 4).join(' ') : commandArgs[0];
const name = commandArgs[modern ? 4 : 1];
appendFileSync(process.env.FAKE_LOG, JSON.stringify({ args, cwd: process.cwd() }) + '\\n');
if (command !== 'add' && !modern) { console.error('wrong template command style'); process.exit(9); }
if (state.fail === command) { console.error('fixture command failed'); process.exit(7); }
if (state.malformed === command) { console.log('not-json'); process.exit(0); }
if (command === 'add') {
  const app = JSON.parse(readFileSync('package.json', 'utf8'));
  for (const name of state.plugins) {
    app.dependencies[name] = '^' + state.version;
    const target = path.join('node_modules', name);
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, 'package.json'), JSON.stringify({ name, version: state.version }));
  }
  writeFileSync('package.json', JSON.stringify(app));
} else if (command === 'plugin register') {
  console.log(JSON.stringify({ schemaVersion: 1, command, ok: true, status: state.registerStatus, result: { packageName: name } }));
} else if (command === 'plugin inspect') {
  console.log(JSON.stringify(state.inspections[name]));
} else if (command !== 'skills sync') {
  console.error('unexpected command'); process.exit(8);
}
`,
  );
  chmodSync(pnpm, 0o755);
  const diagnostics = path.join(root, 'diagnostics');
  const summary = path.join(root, 'summary.md');
  const run = () =>
    spawnSync(
      'bash',
      [
        '-ec',
        `
    "$NODE" "$SCRIPT" install "$APP" "$DIAGNOSTICS"
    (cd "$APP" && pnpm exec nocobase skills sync)
    "$NODE" "$SCRIPT" inspect "$APP" "$DIAGNOSTICS"
  `,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE: process.execPath,
          SCRIPT: script,
          APP: app,
          DIAGNOSTICS: diagnostics,
          PATH: `${bin}${path.delimiter}${process.env.PATH}`,
          FAKE_STATE: path.join(root, 'state.json'),
          FAKE_LOG: path.join(root, 'commands.jsonl'),
          GITHUB_STEP_SUMMARY: summary,
        },
      },
    );
  const calls = () =>
    readFileSync(path.join(root, 'commands.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map(JSON.parse);
  return { root, app, diagnostics, summary, run, calls, metadata };
}

test('refresh batches latest installs, registers, syncs, inspects, and records installed versions', (t) => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const calls = f.calls();
  assert.equal(calls.length, 8);
  assert.deepEqual(calls[0].args, [
    'add',
    ...templatePlugins.map((name) => `${name}@latest`),
  ]);
  for (const [index, name] of templatePlugins.entries()) {
    assert.deepEqual(calls[index + 1].args, [
      '--silent',
      'exec',
      'nocobase',
      'plugin',
      'register',
      name,
      '--no-install',
      '--no-skills',
      '--json',
    ]);
    assert.deepEqual(calls[index + 5].args, [
      '--silent',
      'exec',
      'nocobase',
      'plugin',
      'inspect',
      name,
      '--json',
    ]);
  }
  assert.deepEqual(calls[4].args, ['exec', 'nocobase', 'skills', 'sync']);
  assert.ok(calls.every(({ cwd }) => cwd === f.app));
  const metadata = json(path.join(f.app, 'factory-template.json'));
  assert.deepEqual(
    { ...metadata, plugins: undefined },
    { ...f.metadata, plugins: undefined },
  );
  assert.deepEqual(
    metadata.plugins,
    templatePlugins.map((name) => ({
      packageName: name,
      version: '1.2.3-beta.4',
      registered: true,
      skillsSynchronized: true,
    })),
  );
  assert.deepEqual(
    json(path.join(f.diagnostics, 'template-plugins/inventory.json')),
    metadata.plugins,
  );
  assert.equal(
    json(path.join(f.app, 'package.json')).dependencies.existing,
    '^1.0.0',
  );
  assert.match(
    readFileSync(f.summary, 'utf8'),
    /verification still run before publication/,
  );
});

test('already-registered plugins still get a final Skills sync and inspection', (t) => {
  const f = fixture(t, { registerStatus: 'success-noop' });
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.calls().length, 8);
});

test('inspection rejects a wrong command and legacy operation envelopes', () => {
  const response = inspection();
  validateInspection(response, packageName);
  response.command = 'plugin register';
  assert.throws(() => validateInspection(response, packageName));
  delete response.command;
  response.operation = 'plugin:inspect';
  assert.throws(() => validateInspection(response, packageName));
});

for (const [name, overrides, count] of [
  ['installation failure', { fail: 'add' }, 1],
  ['registration failure', { fail: 'plugin register' }, 2],
  [
    'partial registration with exit zero',
    { registerStatus: 'partial-success' },
    2,
  ],
  ['malformed registration JSON', { malformed: 'plugin register' }, 2],
  ['Skills sync failure', { fail: 'skills sync' }, 5],
  ['inspection failure', { fail: 'plugin inspect' }, 6],
  ['malformed inspection JSON', { malformed: 'plugin inspect' }, 6],
  ['unusable installed version', { version: 'latest' }, 6],
]) {
  test(`${name} stops before stamping a successful inventory`, (t) => {
    const f = fixture(t, overrides);
    const result = f.run();
    assert.notEqual(result.status, 0);
    assert.equal(f.calls().length, count);
    assert.deepEqual(
      json(path.join(f.app, 'factory-template.json')),
      f.metadata,
    );
    assert.equal(
      existsSync(path.join(f.diagnostics, 'template-plugins/inventory.json')),
      false,
    );
    assert.equal(existsSync(f.summary), false);
    if (overrides.malformed) {
      const suffix = overrides.malformed.split(' ')[1];
      assert.equal(
        readFileSync(
          path.join(
            f.diagnostics,
            `template-plugins/app-plugin-ai-employee.${suffix}.json`,
          ),
          'utf8',
        ),
        'not-json\n',
      );
    }
  });
}

test('exit-zero inspection with a missing registration blocks inventory publication', (t) => {
  const invalid = inspection();
  invalid.result.composition.server.registered = false;
  const f = fixture(t, { inspections: { [packageName]: invalid } });
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /server is not registered/);
  assert.equal(f.calls().length, 6);
  assert.deepEqual(json(path.join(f.app, 'factory-template.json')), f.metadata);
});

test('workflow retains default-template generation and gates verification on plugin installation', () => {
  const workflow = readFileSync(
    path.resolve(import.meta.dirname, '../../workflows/refresh-template.yml'),
    'utf8',
  );
  const install = workflow.indexOf(
    'node control/.github/scripts/template-plugins.mjs',
  );
  assert.match(
    workflow,
    /--no-install --template=default --template-tag=latest/,
  );
  assert.ok(install > workflow.indexOf('pnpm install --no-frozen-lockfile'));
  assert.ok(
    install <
      workflow.indexOf(
        'Verify factory, application, clean database, and browser login',
      ),
  );
  assert.doesNotMatch(workflow, /app-template-pro-default|continue-on-error/);
  assert.match(
    workflow,
    /client\/plugins\.ts server\/plugins\.ts cli\/plugins\.ts/,
  );
});
