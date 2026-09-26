import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../../..');
const workflow = readFileSync(path.join(root, '.github/workflows/code-agent-task.yml'), 'utf8');

for (const job of ['prepare', 'agent']) {
  test(`${job} bootstrap checkout includes recovery's transitive runtime dependencies`, t => {
    const block = workflow.split(`  ${job}:`)[1].split(/\n  [a-z-]+:\n/u)[0];
    const match = /^\s+sparse-checkout: \|\n((?:[ \t]+\/[^\n]+\n)+)/m.exec(block);
    assert.ok(match, 'Exercise the actual workflow sparse-checkout list');
    const files = match[1].trim().split('\n').map(line => line.trim().slice(1));
    const checkout = mkdtempSync(path.join(os.tmpdir(), 'factory-bootstrap-'));
    t.after(() => rmSync(checkout, { recursive: true, force: true }));
    for (const file of files) {
      assert.match(file, /^\.github\/scripts\/[a-z-]+\.mjs$/);
      mkdirSync(path.dirname(path.join(checkout, file)), { recursive: true });
      copyFileSync(path.join(root, file), path.join(checkout, file));
    }
    // Import the real recovery entry point from only those files. Do not mock
    // its dependency graph or borrow modules from the full control checkout.
    const output = execFileSync(process.execPath, ['--input-type=module', '--eval', `
      const recovery = await import('./.github/scripts/handoff-recovery.mjs');
      if (typeof recovery.validateRecovery !== 'function') process.exit(1);
      console.log('recovery-ready');
    `], { cwd: checkout, encoding: 'utf8', stdio: 'pipe' });
    assert.equal(output.trim(), 'recovery-ready');
  });
}
