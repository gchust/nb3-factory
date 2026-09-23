// The upstream smoke ends by retargeting crm/dist for a foreign CPU. Restore
// ONLY the earlier, already smoke-tested native build; never copy runtime data.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';

export function restoreSourceDist(workspace, temporaryRoot = process.env.RUNNER_TEMP) {
  assert.ok(temporaryRoot, 'Runner temporary root is required');
  const app = realpathSync(workspace), root = realpathSync(temporaryRoot);
  const relative = path.relative(root, app);
  assert.ok(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), 'Only a runner temporary app may be restored');
  const staging = mkdtempSync(path.join(root, 'native-source-dist-'));
  try {
    execFileSync('tar', ['-xzf', path.join(app, 'storage/exports/dist.tar.gz'), '-C', staging], { timeout: 90000, stdio: 'pipe' });
    const dist = path.join(staging, 'dist');
    const target = JSON.parse(readFileSync(path.join(dist, 'package.json'), 'utf8')).nocobase?.buildTarget;
    assert.equal(target?.platform, process.platform, 'Archive must target this runner platform');
    assert.equal(target?.arch, process.arch, 'Archive must target this runner architecture');
    assert.equal(target?.nodeMajor, Number(process.versions.node.split('.')[0]), 'Archive must target this Node major');
    rmSync(path.join(app, 'dist'), { recursive: true, force: true });
    renameSync(dist, path.join(app, 'dist'));
    return target;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
