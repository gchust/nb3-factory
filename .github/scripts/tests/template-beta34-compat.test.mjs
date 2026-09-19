import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { applyBeta34Compatibility } from '../template-beta34-compat.mjs';

test('beta.34 compatibility never touches other versions or template packages', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'beta34-guard-'));
  try {
    for (const [templatePackage, defaultTemplateVersion] of [
      ['@nocobase/app-template-default', '1.0.0-beta.35'],
      ['@nocobase/app-template-default', '1.0.0-beta.15'],
      ['@nocobase/app-template-examples', '1.0.0-beta.34'],
    ]) {
      assert.deepEqual(
        applyBeta34Compatibility(root, {
          nocobase: { templatePackage, defaultTemplateVersion },
        }),
        [],
      );
      assert.deepEqual(readdirSync(root), []);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('beta.34 compatibility refuses changed published tests instead of hiding failures', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'beta34-hash-'));
  try {
    mkdirSync(path.join(root, 'tests/logic'), { recursive: true });
    const file = path.join(root, 'tests/logic/account-permissions.test.tsx');
    const original = 'changed upstream permissions test\n';
    writeFileSync(file, original);
    assert.throws(
      () =>
        applyBeta34Compatibility(root, {
          name: 'generated-app',
          nocobase: {
            templatePackage: '@nocobase/app-template-default',
            defaultTemplateVersion: '1.0.0-beta.34',
          },
        }),
      /unexpected contents in account-permissions/,
    );
    assert.equal(readFileSync(file, 'utf8'), original);
    assert.deepEqual(readdirSync(root), ['tests']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
