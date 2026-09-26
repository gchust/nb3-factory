import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { captureBaseline, freezeBaseline } from '../baseline-record.mjs';

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'baseline-record-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (name, data) => {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(
      path.join(root, name),
      typeof data === 'string' ? data : JSON.stringify(data),
    );
  };
  put('package.json', {
    dependencies: { '@nocobase/app-cli': '^1.0.0', '@nocobase/db': '^1.0.0' },
  });
  put(
    'pnpm-lock.yaml',
    'lockfileVersion: 9.0\npackages:\n  example:\n    resolution: {integrity: sha512-test}',
  );
  put('factory-template.json', {
    templateVersion: '1.0.0-beta.38',
    creator: '@nocobase/create-app@latest',
  });
  put('AGENTS.md', 'Read the relevant Skills');
  put('skills/example/SKILL.md', 'Actual linked Skill');
  put('node_modules/@nocobase/app-cli/package.json', {
    name: '@nocobase/app-cli',
    version: '1.0.1',
  });
  mkdirSync(path.join(root, '.agents/skills'), { recursive: true });
  symlinkSync(
    path.join(root, 'skills/example'),
    path.join(root, '.agents/skills/example'),
  );
  return { root, put };
}

test('records actual installed version, explicit missing package and safely linked Skills', (t) => {
  const { root, put } = fixture(t);
  put('config.yml', 'PASSWORD=never-publish');
  symlinkSync(root, path.join(root, '.agents/skills/loop'));
  const record = captureBaseline(root);
  assert.equal(record.kind, 'installed-packages');
  assert.equal(
    record.creatorVersion,
    null,
    'latest is not an actual creator version',
  );
  assert.equal(
    record.source,
    null,
    'published version is not an inferred source commit',
  );
  assert.equal(record.packages[0].version, '1.0.1');
  assert.equal(record.packages[1].version, null);
  assert.ok(
    record.files.some(
      (f) =>
        f.path === '.agents/skills/example/SKILL.md' &&
        f.target === 'skills/example/SKILL.md',
    ),
  );
  assert.ok(record.omissions.some((o) => o.reason === 'not_a_skill_link'));
  assert.ok(record.files.every((f) => !f.path.includes('config.yml')));
  assert.doesNotMatch(
    JSON.stringify(record),
    /never-publish|Actual linked Skill/,
  );
});

test('frozen same baseline is idempotent, changed Skill or package cannot replace provenance', (t) => {
  const { root, put } = fixture(t);
  const output = path.join(root, 'evidence/baseline.json');
  const one = captureBaseline(root);
  freezeBaseline(output, one);
  freezeBaseline(output, captureBaseline(root));
  put('skills/example/SKILL.md', 'Changed');
  assert.throws(
    () => freezeBaseline(output, captureBaseline(root)),
    /Baseline changed/,
  );
  assert.equal(JSON.parse(readFileSync(output)).fingerprint, one.fingerprint);
  put('node_modules/@nocobase/app-cli/package.json', {
    name: '@nocobase/app-cli',
    version: '1.0.1',
    changed: true,
  });
  assert.notEqual(
    captureBaseline(root).packages[0].manifestSha256,
    one.packages[0].manifestSha256,
  );
});

test('unpublished source uses an exact explicit commit, never a moving latest/develop', (t) => {
  const { root } = fixture(t);
  assert.throws(
    () => captureBaseline(root, { sourceSha: 'develop' }),
    /exact source SHA/,
  );
  const r = captureBaseline(root, {
    sourceSha: 'a'.repeat(40),
    creatorVersion: '1.0.0',
    controlSha: 'b'.repeat(40),
  });
  assert.equal(r.source.sha, 'a'.repeat(40));
  assert.equal(r.creatorVersion, '1.0.0');
  assert.equal(r.controlSha, 'b'.repeat(40));
});

test('outside-workspace Skill links are reported but never read', (t) => {
  const { root } = fixture(t);
  symlinkSync('/etc', path.join(root, '.agents/skills/outside'));
  const r = captureBaseline(root);
  assert.ok(r.omissions.some((o) => o.reason === 'external_link'));
  assert.ok(r.files.every((f) => !f.path.includes('outside')));
});

test('source workflow stays isolated from default baseline replacement and model credentials', () => {
  const workflow = readFileSync(
    path.resolve(import.meta.dirname, '../../workflows/source-baseline.yml'),
    'utf8',
  );
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /unreleased:prepare/);
  assert.match(workflow, /unreleased:smoke/);
  assert.match(workflow, /unreleased:clean/);
  assert.doesNotMatch(workflow, /local-registry:|scripts\/local-registry/);
  assert.match(workflow, /source-config-check.mjs/);
  assert.doesNotMatch(
    workflow,
    /git push|secrets\.|CODE_AGENT_API_KEY|HUB_API_KEY/,
  );
});
