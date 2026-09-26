// Extra first-configuration assertions against a generated, already built app.
// The upstream source smoke owns package creation/build/dev/archive checks.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { captureBaseline, freezeBaseline } from './baseline-record.mjs';
import { restoreSourceDist } from './restore-source-dist.mjs';

const [workspace, output, sourceSha] = process.argv.slice(2);
if (!workspace || !output || !/^[a-f0-9]{40}$/u.test(sourceSha ?? ''))
  throw new Error(
    'Expected generated app, evidence directory, exact source SHA',
  );
const app = path.resolve(workspace),
  out = path.resolve(output);
if (
  !process.env.RUNNER_TEMP ||
  !app.startsWith(`${path.resolve(process.env.RUNNER_TEMP)}${path.sep}`)
)
  throw new Error('Only an isolated runner temporary application is accepted');
mkdirSync(out, { recursive: true });
const config = path.join(app, 'config.yml'),
  backup = path.join(app, 'factory-config-backup.yml');
const hash = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex');
const checks = [],
  original = hash(config);
const env = { ...process.env, APP_CONFIG_FILE: config };
function run(args, commandEnv = env) {
  const result = spawnSync('pnpm', ['--silent', ...args], {
    cwd: app,
    env: commandEnv,
    detached: true,
    encoding: 'utf8',
    timeout: 90000,
  });
  if (result.error) {
    try {
      if (result.pid) process.kill(-result.pid, 'SIGKILL');
    } catch (e) {
      if (e.code !== 'ESRCH') throw e;
    }
    throw result.error;
  }
  return result;
}
function command(args) {
  const r = run(['exec', 'nocobase', ...args]);
  assert.equal(r.status, 0, `pnpm ${args[0]} failed: ${r.stderr.slice(-2000)}`);
  const value = JSON.parse(r.stdout);
  assert.equal(value.ok, true, `${args[0]} did not report success`);
  return value;
}
let restored = false;
try {
  restoreSourceDist(app);
  checks.push({
    id: 'CONFIG-NATIVE',
    status: 'passed',
    observation:
      'Restored host-native dist from the archive verified before upstream retargeting',
  });
  assert.equal(existsSync(backup), false);
  renameSync(config, backup);
  // A nonexistent explicit override is an invalid file path, not first setup.
  // Exercise the default unconfigured path without any inherited auth source.
  const unconfiguredEnv = { ...process.env, NOCOBASE_STRICT_STARTUP: 'true' };
  for (const key of ['APP_CONFIG_FILE', 'AUTH_SECRET', 'SESSION_SECRET'])
    delete unconfiguredEnv[key];
  const missing = run(['start'], unconfiguredEnv);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stdout + missing.stderr, /config init/u);
  checks.push({
    id: 'CONFIG-01',
    status: 'passed',
    observation: 'Unconfigured production start stops and names config init',
  });
  command(['config', 'init', '--dialect', 'sqlite', '--json']);
  assert.ok(existsSync(config));
  command(['config', 'check', '--json']);
  const first = hash(config);
  command(['config', 'init', '--dialect', 'sqlite', '--json']);
  assert.equal(hash(config), first);
  checks.push({
    id: 'CONFIG-02',
    status: 'passed',
    observation:
      'First init creates valid configuration; repeated init leaves the file unchanged',
  });
  command(['config', 'set', 'i18n.defaultLocale=en-US', '--json']);
  command(['config', 'check', '--json']);
  assert.match(readFileSync(config, 'utf8'), /defaultLocale:\s*en-US/u);
  assert.equal(hash(backup), original);
  checks.push({
    id: 'CONFIG-03',
    status: 'passed',
    observation:
      'config set updates the effective locale; original configuration is untouched',
  });
  // Restore the upstream smoke's exact config/database before the login check.
  rmSync(config);
  renameSync(backup, config);
  restored = true;
  command(['config', 'set', 'i18n.defaultLocale=en-US', '--json']);
  const port = 13917,
    url = `http://127.0.0.1:${port}/main/`;
  const log = createWriteStream(path.join(out, 'login-start.log'));
  const child = spawn('pnpm', ['start'], {
    cwd: app,
    detached: true,
    env: {
      ...env,
      NODE_ENV: 'production',
      NOCOBASE_STRICT_STARTUP: 'true',
      APP_SERVER_HOST: '127.0.0.1',
      APP_SERVER_PORT: String(port),
      APP_PUBLIC_ORIGIN: `http://127.0.0.1:${port}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let spawnError;
  child.once('error', (error) => {
    spawnError = error;
  });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  let applicationError;
  try {
    let ready = false;
    for (let i = 0; i < 90; i++) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null)
        throw new Error('Configured application exited before login');
      try {
        if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) {
          ready = true;
          break;
        }
      } catch {
        /* Startup bounded below. */
      }
      await delay(1000);
    }
    assert.ok(ready, 'Configured app did not become ready');
    const result = spawnSync(
      process.execPath,
      [
        path.join(import.meta.dirname, 'browser-smoke.mjs'),
        '--workspace',
        app,
        '--url',
        url,
        '--screenshot',
        path.join(out, 'login.png'),
      ],
      {
        env: {
          ...env,
          FACTORY_SMOKE_USERNAME: 'nocobase',
          FACTORY_SMOKE_PASSWORD: 'admin123',
        },
        encoding: 'utf8',
        timeout: 120000,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    checks.push({
      id: 'CONFIG-04',
      status: 'passed',
      observation:
        'Configured production app starts and real browser login succeeds',
      evidence: 'login.png',
    });
  } catch (error) {
    applicationError = error;
  } finally {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch (e) {
      if (e.code !== 'ESRCH') applicationError ??= e;
    }
    await delay(1000);
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch (e) {
      if (e.code !== 'ESRCH') applicationError ??= e;
    }
    log.end();
  }
  // Cleanup errors must not replace the original verification failure.
  if (applicationError) throw applicationError;
  freezeBaseline(
    path.join(out, 'baseline.json'),
    captureBaseline(app, {
      sourceSha,
      controlSha: process.env.FACTORY_CONTROL_SHA ?? null,
      creatorVersion: process.env.FACTORY_CREATOR_VERSION ?? null,
    }),
  );
} catch (error) {
  checks.push({
    id: 'CONFIG-FAILURE',
    status: 'failed',
    observation: error.message,
  });
  process.exitCode = 1;
} finally {
  if (!restored && existsSync(backup)) {
    rmSync(config, { force: true });
    renameSync(backup, config);
  }
  writeFileSync(
    path.join(out, 'configuration-checks.json'),
    JSON.stringify({ sourceSha, checks }, null, 2),
  );
}
