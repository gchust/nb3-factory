import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createReviewSnapshot, runBuildReview } from '../run-build-review.mjs';
import { loadBuildReview } from '../build-review.mjs';
import { preserveReviewHistory } from '../review-history.mjs';
import { collectUsage } from '../task-usage.mjs';

const put = (root, name, value) => {
  const file = path.join(root, name); mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); return file;
};
function fixture(t) {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'review-history-integration-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'workspace'), artifacts = path.join(root, 'artifacts');
  put(workspace, 'package.json', { name: 'history-fixture' });
  put(workspace, 'server/files.ts', 'export const files = true;\n');
  put(workspace, '.agents/skills/files/SKILL.md', '# File API guidance\n');
  execFileSync('git', ['init', '-q'], { cwd: workspace });
  execFileSync('git', ['add', '.'], { cwd: workspace });
  execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@localhost', 'commit', '-qm', 'fixture'], { cwd: workspace });
  const baseSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspace, encoding: 'utf8' }).trim();
  const metadata = { repository: 'owner/factory', issue: { number: 7 }, run: { id: 101, attempt: 1 },
    controlSha: 'a'.repeat(40), applicationBase: { sha: baseSha }, task: { requirements: 'Manage files', acceptanceCriteria: 'Respect file permissions' } };
  put(artifacts, 'task-metadata.json', metadata);
  put(artifacts, 'agent.patch', 'sealed patch\n');
  put(artifacts, 'agent-implement.jsonl', '{"type":"tool_result","content":"Original failed file API attempt"}\n');
  put(artifacts, 'agent-implement.jsonl.prompt.md', 'Original business prompt; opaque-fixture-password\n');
  put(artifacts, 'agent-implement.jsonl.invocation.json', { version: 1, invoked: true, status: 'finished' });
  put(artifacts, 'agent-implement.jsonl.result.json', { status: 'completed' });
  return { root, workspace, artifacts, metadata };
}

test('raw history and framework source coexist in the production snapshot without a retro file', t => {
  const f = fixture(t), snapshot = path.join(f.root, 'snapshot');
  const captured = createReviewSnapshot(f.workspace, f.artifacts, snapshot, text => text.replaceAll('opaque-fixture-password', '[REDACTED]'));
  assert.ok(captured.files.some(file => file.path === 'app/server/files.ts'));
  assert.ok(captured.files.some(file => file.path === 'app/.agents/skills/files/SKILL.md'));
  assert.equal(captured.history.input.coverage, 'available');
  assert.ok(captured.files.some(file => file.source?.path === 'agent-implement.jsonl'));
  assert.ok(!captured.files.some(file => file.path === 'artifacts/retro.json'));
});

test('fresh mock CLI reads original history, runs the real draft checker and produces bound evidence', async t => {
  const f = fixture(t), bin = path.join(f.root, 'bin');
  put(bin, 'pi', `#!/usr/bin/env node
const fs = require('node:fs');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const input = JSON.parse(fs.readFileSync('review-input.json', 'utf8'));
const index = JSON.parse(fs.readFileSync(input.history.path, 'utf8'));
const entry = index.files.find(file => file.source === 'agent-implement.jsonl');
const file = entry.chunks[0].path;
assert.match(fs.readFileSync(file, 'utf8'), /Original failed file API attempt/);
const prompt = fs.readFileSync('review-prompt.md', 'utf8');
assert.match(prompt, /原始交互证据优先/);
for (const entry of index.files) for (const chunk of entry.chunks) assert.ok(!fs.readFileSync(chunk.path, 'utf8').includes('opaque-fixture-password'));
assert.equal(process.env.FACTORY_ADMIN_PASSWORD, undefined);
fs.writeFileSync('assessment.json', JSON.stringify({version:2,inputHash:input.basis.inputHash,
  progress:{complete:true,pendingModules:[]},summary:'Fixture tests original evidence; no framework score claimed.',
  historyReview:[{log:'agent-implement.jsonl',status:'reviewed',reason:'Read original tool event',evidence:['E1'],errors:[]}],
  modules:[],findings:[],limitations:[],ui:{status:'not-reviewed',score:null,reason:'No image review',evidence:[]},
  evidence:[{id:'E1',kind:'log',path:file,lines:[1,1],observation:'Original tool output, not a generated summary'}]}));
const check = spawnSync(process.execPath, ['.review-tools/check-review-draft.mjs'], {encoding:'utf8'});
assert.equal(check.status, 0, check.stderr);
console.log(JSON.stringify({type:'message_end',message:{role:'assistant',stopReason:'stop',usage:{input:100,output:20,cacheRead:0,cacheWrite:0,totalTokens:120}}}));
console.log(JSON.stringify({type:'agent_end'}));
`);
  chmodSync(path.join(bin, 'pi'), 0o755);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_RUN_ID: '101', GITHUB_RUN_ATTEMPT: '1',
    FACTORY_CONTROL_SHA: f.metadata.controlSha, FACTORY_BUILD_REVIEW: 'full', FACTORY_ADMIN_PASSWORD: 'opaque-fixture-password',
    CODE_AGENT_ENGINE: 'pi', CODE_AGENT_API_KEY: 'fixture-key', CODE_AGENT_API_ENDPOINT: 'https://fixture.invalid/v1', CODE_AGENT_MODEL: 'fixture-model' };
  for (const key of ['FACTORY_RUN_DEADLINE_EPOCH_SECONDS', 'FACTORY_AGENT_INSTALL_RECORD', 'FACTORY_BUILD_REVIEW_IDLE_TIMEOUT_SECONDS']) delete env[key];
  const report = await runBuildReview(f.workspace, f.artifacts, env);
  assert.equal(report.state, 'completed', report.reason);
  assert.match(report.evaluation.evidence[0].excerpt, /Original failed file API attempt/);
  assert.match(report.basis.historyHash, /^[a-f0-9]{64}$/);
  const identity = { repository: 'owner/factory', issue: 7, runId: 101, attempt: 1 };
  assert.equal(loadBuildReview(f.artifacts, identity).state, 'completed');
  put(f.artifacts, 'agent-implement.jsonl', 'changed after assessment');
  assert.equal(loadBuildReview(f.artifacts, identity).state, 'failed');
  delete report.basis.historyHash; put(f.artifacts, 'build-review.json', report);
  assert.equal(loadBuildReview(f.artifacts, identity).state, 'completed', 'legacy reports keep their previous binding');
});

test('preserved ancestor usage is not billed as a new invocation', async t => {
  const f = fixture(t), previous = path.join(f.root, 'previous');
  put(previous, 'task-metadata.json', { ...f.metadata, run: { id: 100, attempt: 1 } });
  const log = input => `${JSON.stringify({type:'message_end',message:{role:'assistant',usage:{input,output:2,cacheRead:0,cacheWrite:0}}})}\n{"type":"agent_end"}\n`;
  put(previous, 'agent-implement.jsonl', log(1000));
  put(f.artifacts, 'agent-implement.jsonl', log(10));
  rmSync(path.join(f.artifacts, 'agent-implement.jsonl.result.json'));
  const before = await collectUsage(f.artifacts);
  preserveReviewHistory(previous, f.artifacts, f.metadata);
  const after = await collectUsage(f.artifacts);
  assert.equal(after.phases.implementation.totalTokens, 12);
  assert.deepEqual(after, before);
});
