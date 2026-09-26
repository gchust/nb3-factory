import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';

test('first setup probes default configuration, not an explicit nonexistent override', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'first-config-env-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, 'app'),
    bin = path.join(root, 'bin'),
    out = path.join(root, 'out');
  mkdirSync(app);
  mkdirSync(bin);
  const dist = path.join(app, 'dist');
  mkdirSync(dist);
  mkdirSync(path.join(app, 'storage/exports'), { recursive: true });
  writeFileSync(
    path.join(dist, 'package.json'),
    JSON.stringify({
      nocobase: {
        buildTarget: {
          platform: process.platform,
          arch: process.arch,
          nodeMajor: Number(process.versions.node.split('.')[0]),
        },
      },
    }),
  );
  assert.equal(
    spawnSync('tar', [
      '-czf',
      path.join(app, 'storage/exports/dist.tar.gz'),
      '-C',
      app,
      'dist',
    ]).status,
    0,
  );
  const original = 'auth:\n  secret: original-test-value\n';
  writeFileSync(path.join(app, 'config.yml'), original);
  writeFileSync(
    path.join(bin, 'pnpm'),
    `#!/usr/bin/env node
const fs=require('node:fs');
const args=process.argv.slice(2); if(args.shift()!=='--silent') process.exit(9);
fs.appendFileSync(process.env.CALL_LOG, JSON.stringify({args,override:process.env.APP_CONFIG_FILE??null,auth:process.env.AUTH_SECRET??null})+'\\n');
if(args[0]==='start'){if(process.env.APP_CONFIG_FILE||process.env.AUTH_SECRET) process.exit(8); console.error('Run pnpm nocobase config init');process.exit(1);}
if(args[0]!=='exec'||args[1]!=='nocobase'||args[2]!=='config')process.exit(9);
if(args[3]==='init'){if(!args.includes('sqlite'))process.exit(7); if(!fs.existsSync('config.yml'))fs.writeFileSync('config.yml','auth: {secret: configured}'); console.log(JSON.stringify({ok:true}));}
else if(args[3]==='check')console.log(JSON.stringify({ok:true}));
else {console.error('intentional fixture stop before login');process.exit(6);}
`,
    { mode: 0o755 },
  );
  const result = spawnSync(
    process.execPath,
    [
      path.resolve(import.meta.dirname, '../source-config-check.mjs'),
      app,
      out,
      'a'.repeat(40),
    ],
    {
      encoding: 'utf8',
      timeout: 10000,
      env: {
        ...process.env,
        RUNNER_TEMP: root,
        PATH: `${bin}:${process.env.PATH}`,
        APP_CONFIG_FILE: '/invalid/inherited',
        AUTH_SECRET: 'inherited-test',
        CALL_LOG: path.join(root, 'calls.jsonl'),
      },
    },
  );
  assert.equal(
    result.status,
    1,
    'fixture must stop before claiming a real login',
  );
  const checks = JSON.parse(
    readFileSync(path.join(out, 'configuration-checks.json')),
  ).checks;
  assert.deepEqual(
    checks
      .filter((c) => c.id !== 'CONFIG-NATIVE')
      .slice(0, 2)
      .map((c) => [c.id, c.status]),
    [
      ['CONFIG-01', 'passed'],
      ['CONFIG-02', 'passed'],
    ],
  );
  assert.match(checks.at(-1).observation, /intentional fixture stop/);
  assert.equal(
    readFileSync(path.join(app, 'config.yml'), 'utf8'),
    original,
    'failed probe restores original configuration',
  );
  const calls = readFileSync(path.join(root, 'calls.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);
  assert.equal(calls[0].override, null);
  assert.equal(calls[0].auth, null);
  assert.equal(calls[1].override, path.join(app, 'config.yml'));
  assert.deepEqual(
    calls.slice(1).map((c) => c.args.slice(0, 4)),
    [
      ['exec', 'nocobase', 'config', 'init'],
      ['exec', 'nocobase', 'config', 'check'],
      ['exec', 'nocobase', 'config', 'init'],
      ['exec', 'nocobase', 'config', 'set'],
    ],
  );
});
