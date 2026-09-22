import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createInvocation } from '../agents/codex.mjs';

for (const role of ['implementation', 'qa']) {
  test(`Codex ${role} accepts the factory's non-Git workspace without trusting project config`, (t) => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'factory-codex-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const workspace = path.join(root, 'browser-agent-workspace');
    const agentDir = path.join(root, 'agent');
    const prompt = path.join(root, 'prompt.md');
    mkdirSync(workspace);
    writeFileSync(prompt, 'Inspect the application in the browser.\n');
    assert.notEqual(spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: workspace }).status, 0);
    const invocation = createInvocation({ workspace, prompt, agentDir, env: {
      CODEX_API_KEY: 'fixture-key', CODEX_MODEL: 'fixture-model', FACTORY_AGENT_ROLE: role,
    } });
    assert.equal(invocation.cwd, workspace);
    assert.equal(invocation.args[0], 'exec');
    assert.equal(invocation.args.filter((arg) => arg === '--skip-git-repo-check').length, 1);
    assert.equal(invocation.args.includes('--dangerously-bypass-approvals-and-sandbox'), false);
    assert.equal(invocation.args.includes('--dangerously-bypass-hook-trust'), role === 'qa');
    assert.match(readFileSync(path.join(agentDir, 'config.toml'), 'utf8'), /trust_level = "untrusted"/);
    assert.equal(existsSync(path.join(workspace, '.git')), false);
  });
}
