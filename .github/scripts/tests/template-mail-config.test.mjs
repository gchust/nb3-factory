import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { configureTemplateMail } from '../template-mail-config.mjs';

// The public default-template config composition shape, with two unrelated
// factories retained to check that Mail integration preserves their wiring.
const config = `import {
  defaultAppConfigs,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import auth from './auth.js';
import workflow from './workflow.js';

const defaultConfigs: AppConfigFactory<{
  auth: ReturnType<typeof auth>;
  workflow: ReturnType<typeof workflow>;
}> = defaultAppConfigs({
  auth,
  workflow,
});

export default defaultConfigs;
`;

function fixture(t, source = config) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'template-mail-config-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'server/config'), { recursive: true });
  const indexFile = path.join(root, 'server/config/index.ts');
  const mailFile = path.join(root, 'server/config/mail.ts');
  writeFileSync(indexFile, source);
  return { root, indexFile, mailFile };
}

test('Mail uses the installed public factory in both the config type and runtime composition', (t) => {
  const f = fixture(t);
  assert.equal(configureTemplateMail(f.root), true);
  const updated = readFileSync(f.indexFile, 'utf8');
  assert.match(updated, /^import mail from '\.\/mail\.js';$/m);
  assert.match(updated, /AppConfigFactory<\{\n  mail: ReturnType<typeof mail>;/);
  assert.match(updated, /defaultAppConfigs\(\{\n  mail,/);
  assert.equal(
    updated.replace("import mail from './mail.js';\n\n", '')
      .replace('  mail: ReturnType<typeof mail>;\n', '').replace('  mail,\n', ''),
    config,
  );
  assert.equal(readFileSync(f.mailFile, 'utf8'),
    "import { mailConfig } from '@nocobase/app-plugin-mail/server';\n\nexport default mailConfig;\n");
  assert.equal(existsSync(path.join(f.root, 'config.yml')), false);
});

test('repeated wiring preserves the application-owned Mail configuration', (t) => {
  const f = fixture(t);
  configureTemplateMail(f.root);
  const index = readFileSync(f.indexFile, 'utf8');
  const custom = '// App-owned overrides must survive\nexport default customMail;\n';
  writeFileSync(f.mailFile, custom);
  assert.equal(configureTemplateMail(f.root), false);
  assert.equal(readFileSync(f.indexFile, 'utf8'), index);
  assert.equal(readFileSync(f.mailFile, 'utf8'), custom);
});

for (const [name, source] of [
  ['unknown declaration', config.replace('const defaultConfigs:', 'const defaults:')],
  ['unknown config composition', config.replace('defaultAppConfigs({', 'otherConfigs({')],
  ['duplicate composition', config + config],
  ['partial import', "import mail from './mail.js';\n" + config],
  ['partial type', config.replace('  auth: ReturnType', '  mail: ReturnType<typeof mail>;\n  auth: ReturnType')],
  ['partial runtime entry', config.replace('  auth,', '  mail,\n  auth,')],
  ['conflicting binding', "import mail from './custom.js';\n" + config],
]) {
  test(`rejects ${name} before changing either config file`, (t) => {
    const f = fixture(t, source);
    assert.throws(() => configureTemplateMail(f.root));
    assert.equal(readFileSync(f.indexFile, 'utf8'), source);
    assert.equal(existsSync(f.mailFile), false);
  });
}

test('does not overwrite an existing unregistered Mail configuration', (t) => {
  const f = fixture(t);
  writeFileSync(f.mailFile, 'application-owned\n');
  assert.throws(() => configureTemplateMail(f.root), /refusing to overwrite/);
  assert.equal(readFileSync(f.mailFile, 'utf8'), 'application-owned\n');
  assert.equal(readFileSync(f.indexFile, 'utf8'), config);
});

test('a registered but missing Mail config module is a failure, not a successful no-op', (t) => {
  const f = fixture(t);
  configureTemplateMail(f.root);
  rmSync(f.mailFile);
  assert.throws(() => configureTemplateMail(f.root), /mail.ts is missing/);
  assert.equal(existsSync(f.mailFile), false);
});
