import assert from 'node:assert/strict';
import {
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
import {
  checkCorePeers,
  recordTemplatePlugins,
  templatePlugins,
} from '../template-plugins.mjs';

const mail = '@nocobase/app-plugin-mail';
const scheduler = '@nocobase/app-plugin-scheduler';
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const writeJson = (file, value) => writeFileSync(file, JSON.stringify(value));

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'template-plugins-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, 'app');
  const diagnostics = path.join(root, 'diagnostics');
  mkdirSync(app);
  const metadata = {
    template: '@nocobase/app-template-default',
    templateVersion: '1.0.0-beta.61',
  };
  const manifest = {
    dependencies: {
      [mail]: '^1.0.0-beta.10',
      [scheduler]: '^1.0.0-beta.16',
      '@nocobase/app-server': '^2.0.0-beta.3',
    },
    devDependencies: {
      '@nocobase/app-client': '^3.0.0-beta.0',
      '@nocobase/app-plugin-template-print': '0.0.2-beta.1',
    },
  };
  writeJson(path.join(app, 'package.json'), manifest);
  writeJson(path.join(app, 'factory-template.json'), metadata);
  writeFileSync(path.join(app, 'pnpm-lock.yaml'), 'original lockfile\n');
  for (const [name, version] of [
    [mail, '1.0.0-beta.10'],
    [scheduler, '1.0.0-beta.16'],
  ]) {
    const directory = path.join(app, 'node_modules', name);
    mkdirSync(directory, { recursive: true });
    writeJson(path.join(directory, 'package.json'), {
      name,
      version,
      peerDependencies: { '@nocobase/app-client': '^3.0.0-beta.0' },
    });
  }
  return { app, diagnostics, manifest, metadata };
}

test('the template owns the production plugin set, without mandatory old AI plugins', () => {
  assert.deepEqual(
    templatePlugins({
      dependencies: {
        [mail]: '^1.0.0-beta.10',
        '@nocobase/app-server': '^2.0.0-beta.3',
      },
      devDependencies: { [scheduler]: '^1.0.0-beta.16' },
    }),
    [mail],
  );
  assert.deepEqual(templatePlugins({}), []);
});

test('records actual template dependency versions without changing manifests or lockfiles', (t) => {
  const f = fixture(t);
  const expected = [
    { packageName: mail, version: '1.0.0-beta.10' },
    { packageName: scheduler, version: '1.0.0-beta.16' },
  ];
  assert.deepEqual(recordTemplatePlugins(f.app, f.diagnostics), expected);
  assert.deepEqual(json(path.join(f.app, 'factory-template.json')), {
    ...f.metadata,
    plugins: expected,
  });
  assert.deepEqual(
    json(path.join(f.diagnostics, 'template-plugins/inventory.json')),
    expected,
  );
  assert.deepEqual(json(path.join(f.app, 'package.json')), f.manifest);
  assert.equal(
    readFileSync(path.join(f.app, 'pnpm-lock.yaml'), 'utf8'),
    'original lockfile\n',
  );
});

test('a template without Mail does not acquire a Mail or AI dependency', (t) => {
  const f = fixture(t);
  delete f.manifest.dependencies[mail];
  writeJson(path.join(f.app, 'package.json'), f.manifest);
  assert.deepEqual(recordTemplatePlugins(f.app, f.diagnostics), [
    { packageName: scheduler, version: '1.0.0-beta.16' },
  ]);
});

for (const [name, change] of [
  [
    'a missing package',
    (f) => rmSync(path.join(f.app, 'node_modules', mail), { recursive: true }),
  ],
  [
    'a wrong package identity',
    (p) => {
      p.name = 'another';
    },
  ],
  [
    'an unknown version',
    (p) => {
      p.version = 'beta';
    },
  ],
  [
    'an incompatible core',
    (p) => {
      p.peerDependencies['@nocobase/app-client'] = '^2.0.0-beta.2';
    },
  ],
]) {
  test(`${name} prevents successful inventory publication`, (t) => {
    const f = fixture(t);
    const file = path.join(f.app, 'node_modules', mail, 'package.json');
    if (name === 'a missing package') change(f);
    else {
      const installed = json(file);
      change(installed);
      writeJson(file, installed);
    }
    assert.throws(() => recordTemplatePlugins(f.app, f.diagnostics));
    assert.deepEqual(
      json(path.join(f.app, 'factory-template.json')),
      f.metadata,
    );
    assert.equal(
      existsSync(path.join(f.diagnostics, 'template-plugins/inventory.json')),
      false,
    );
  });
}

test('workflow synchronizes template Skills and checks dependencies without adding plugins or config', () => {
  const workflow = readFileSync(
    new URL('../../workflows/refresh-template.yml', import.meta.url),
    'utf8',
  );
  assert.match(workflow, /--no-install --template=default --template-tag=beta/);
  assert.doesNotMatch(
    workflow,
    /app-template-pro-default|template-plugins\.mjs install|template-mail-config\.mjs/,
  );
  const step = workflow
    .split('- name: Sync Skills and record the template plugin inventory\n')[1]
    .split(/\n {6}- (?=name:|uses:)/)[0];
  assert.match(step, /pnpm --dir "\$APP_ROOT" exec nocobase skills sync/);
  assert.match(step, /template-plugins\.mjs record/);
  assert.doesNotMatch(step, /continue-on-error/);
  assert.ok(
    workflow.indexOf('template-plugins.mjs record') >
      workflow.indexOf('pnpm install --no-frozen-lockfile'),
  );
  assert.ok(
    workflow.indexOf('template-plugins.mjs record') <
      workflow.indexOf(
        'Verify factory, application, clean database, and browser login',
      ),
  );
});

test('core peer check compares release lines with the template', () => {
  const app = {
    dependencies: { '@nocobase/app-server': '^2.0.0-beta.0' },
    devDependencies: { '@nocobase/app-client': '^2.0.0-beta.0' },
  };
  const plugin = (peerDependencies) => ({
    name: '@nocobase/app-plugin-mail',
    version: '0.1.0-beta.0',
    peerDependencies,
  });
  checkCorePeers(
    app,
    plugin({
      '@nocobase/app-server': '^2.0.0-beta.0',
      '@nocobase/app-client': '>=2.1.0 <3',
    }),
  );
  checkCorePeers(app, plugin({ react: '^19.0.0' }));
  assert.throws(
    () =>
      checkCorePeers(
        app,
        plugin({
          '@nocobase/app-server': '^1.0.0-beta.22',
          '@nocobase/app-client': '^1.0.0-beta.19',
        }),
      ),
    (error) =>
      /app-plugin-mail@0\.1\.0-beta\.0 is built for a different NocoBase core/.test(
        error.message,
      ) &&
      /app-server \^1\.0\.0-beta\.22, but the template declares \^2\.0\.0-beta\.0/.test(
        error.message,
      ) &&
      /app-client/.test(error.message),
  );
  assert.throws(
    () =>
      checkCorePeers(
        { dependencies: { '@nocobase/app-server': '^0.11.0' } },
        plugin({ '@nocobase/app-server': '^0.12.0' }),
      ),
    /different NocoBase core/,
  );
  assert.throws(
    () =>
      checkCorePeers(
        { dependencies: {} },
        plugin({ '@nocobase/app-server': '^2.0.0' }),
      ),
    /which the template does not declare/,
  );
});
