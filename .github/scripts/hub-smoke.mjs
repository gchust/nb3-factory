// An isolated Hub/Host test of an existing verified business artifact. No model,
// existing deployment, application rebuild or published credential is involved.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { selectDistArtifact } from './preview-host.mjs';
import { matchesTaskPR } from './visual-report.mjs';
import { scrubHistoryFile } from './history-redaction.mjs';

export function scrubHubLog(name, text, secrets = []) {
  return scrubHistoryFile(text, name, value => secrets.filter(Boolean).reduce((out, secret) => out.replaceAll(secret, '[REDACTED]'), value));
}

const positive = n => Number.isSafeInteger(n) && n > 0;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function selectHubArtifact(run, jobs, artifacts, repository, issue, attempt) {
  assert.ok(positive(issue) && positive(attempt));
  assert.equal(run.run_attempt, attempt);
  const job = jobs.find(j => j.name === 'verify-final' && j.conclusion === 'success');
  const candidates = artifacts.filter(a => a.name === `factory-dist-${issue}` && job &&
    Date.parse(a.created_at) >= Date.parse(job.started_at) && Date.parse(a.created_at) <= Date.parse(job.completed_at));
  const artifact = selectDistArtifact(run, jobs, candidates, repository);
  assert.ok(artifact && positive(artifact.id), 'An exact, successful deployment artifact is required');
  return { repository, issue, runId: run.id, attempt, artifactId: artifact.id, artifactName: artifact.name,
    runUrl: `https://github.com/${repository}/actions/runs/${run.id}` };
}
export function bindHubArtifact(source, metadata, pull) {
  assert.equal(metadata.repository, source.repository);
  assert.equal(metadata.issue?.number, source.issue);
  assert.equal(Number(metadata.run?.id), source.runId);
  assert.equal(Number(metadata.run?.attempt), source.attempt);
  assert.ok(matchesTaskPR(pull, metadata, source), 'Artifact and delivered PR must match');
  assert.match(pull.head?.sha ?? '', /^[a-f0-9]{40}$/u);
  assert.ok(pull.body.includes(`<!-- agent-head-sha: ${pull.head.sha} -->`));
  return { ...source, pr: pull.number, headSha: pull.head.sha };
}
export function assertDeployed(status, detail, releaseId) {
  assert.equal(status.status, 'succeeded', 'Accepted/queued is not deployed');
  assert.equal(status.releaseId, releaseId);
  assert.equal(detail.deployment.observedReleaseId, releaseId);
  assert.equal(detail.runtime.hostAvailable, true);
  assert.equal(detail.runtime.state, 'running');
}
function loopback(value) {
  const url = new URL(value);
  assert.ok(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Only an isolated loopback Hub may be tested');
  assert.ok(!url.username && !url.password);
  return url;
}
// Hub exposes a Host origin, not an application's entry URL. Match its client
// applicationUrl contract by resolving the deployed basePath beneath that origin.
export function hostedApplicationUrl(detail, origin) {
  assert.ok(typeof detail.hostUrl === 'string' && detail.hostUrl, 'Hub must publish a host URL');
  const basePath = detail.deployment?.basePath;
  assert.ok(typeof basePath === 'string' && /^\/?[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\/?$/u.test(basePath), 'A deployed application basePath is required');
  const host = loopback(new URL(detail.hostUrl, origin).href);
  assert.equal(host.origin, loopback(origin).origin, 'Hosted app must use the same isolated Hub proxy');
  assert.ok(!host.search && !host.hash);
  if (!host.pathname.endsWith('/')) host.pathname += '/';
  return new URL(`${basePath.replace(/^\/+|\/+$/gu, '')}/`, host);
}
async function api(route) {
  const repo = process.env.GITHUB_REPOSITORY;
  assert.match(repo ?? '', /^[\w.-]+\/[\w.-]+$/u);
  const r = await fetch(`https://api.github.com/repos/${repo}${route}`, { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`GitHub ${route.split('?')[0]}: ${r.status}`);
  return r.json();
}
async function list(route, key) {
  const out = [];
  for (let page = 1; page <= 30; page++) {
    const r = await api(`${route}${route.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    const batch = key ? r[key] : r; assert.ok(Array.isArray(batch)); out.push(...batch);
    if (batch.length < 100) return out;
  }
  throw new Error('GitHub pagination limit');
}
async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  return port;
}
async function login(page, url, password = 'admin123') {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByLabel(/^(?:Username or email|用户名或邮箱|用户名或电子邮箱)$/u).fill('nocobase');
  await page.getByLabel(/^(?:Password|密码)$/u).fill(password);
  const response = page.waitForResponse(r => r.request().method() === 'POST' && /\/sign-in\//u.test(r.url()), { timeout: 30000 });
  await page.getByRole('button', { name: /^(?:Sign in|登录)$/u }).click();
  const authenticated = await response;
  assert.ok(authenticated.ok(), 'Test account login failed');
  await page.waitForFunction(() => !/\/(?:login|register)\/?$/u.test(location.pathname), undefined, { timeout: 30000 });
  await page.locator('main').waitFor({ state: 'visible', timeout: 30000 });
  return authenticated.url().split('/auth/')[0];
}
async function runHub(workspace, artifactDir, evidence) {
  const app = path.resolve(workspace), out = path.resolve(evidence);
  const temporary = process.env.RUNNER_TEMP;
  assert.ok(temporary && app.startsWith(`${path.resolve(temporary)}${path.sep}`), 'Use a temporary Hub only');
  mkdirSync(out, { recursive: true });
  const binding = JSON.parse(readFileSync(path.join(artifactDir, 'hub-source.json')));
  const archive = readFileSync(path.join(artifactDir, 'dist.tar.gz'));
  assert.ok(archive.length > 0 && archive.length <= 256 * 1024 * 1024);
  const receipt = { version: 1, binding, sourceSha: process.env.SOURCE_SHA, artifactSha256: digest(archive), checks: [], status: 'failed' };
  const { restoreSourceDist } = await import('./restore-source-dist.mjs');
  restoreSourceDist(app);
  const set = spawnSync('pnpm', ['--silent', 'config:set', 'i18n.defaultLocale=en-US', '--json'], { cwd: app, encoding: 'utf8', timeout: 90000 });
  assert.equal(set.status, 0, 'Hub locale configuration failed');
  const port = await freePort(), origin = `http://127.0.0.1:${port}`;
  const logFile = path.join(out, 'hub-start.log'), stream = createWriteStream(logFile);
  const child = spawn('pnpm', ['start'], { cwd: app, detached: true,
    env: { ...process.env, APP_NAME: 'hub', APP_BASE_PATH: '/hub', NODE_ENV: 'production', NOCOBASE_STRICT_STARTUP: 'true', APP_CONFIG_FILE: path.join(app, 'config.yml'), APP_SERVER_HOST: '127.0.0.1', APP_SERVER_PORT: String(port), APP_PUBLIC_ORIGIN: origin },
    stdio: ['ignore', 'pipe', 'pipe'] });
  let spawnError; child.once('error', e => { spawnError = e; });
  child.stdout.pipe(stream, { end: false }); child.stderr.pipe(stream, { end: false });
  let browser, counter;
  const browserEvents = [];
  const secret = randomBytes(32).toString('hex'), password = `Factory-QA-${randomBytes(12).toString('hex')}`;
  try {
    let ready = false, lastProbe = 'not_probed';
    for (let i = 0; i < 120; i++) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error('Hub exited before becoming ready');
      try { const response = await fetch(`${origin}/hub/`, { signal: AbortSignal.timeout(1500) }); lastProbe = `HTTP ${response.status}`; if (response.ok) { ready = true; break; } } catch (error) { lastProbe = error.cause?.code ?? error.name; }
      await delay(1000);
    }
    assert.ok(ready, `Hub startup timeout (${lastProbe}); see hub-start.log`);
    assert.ok(process.env.FACTORY_HUB_BROWSER_DIR, 'Isolated browser dependency directory required');
    const { chromium } = createRequire(path.join(process.env.FACTORY_HUB_BROWSER_DIR, 'package.json'))('playwright');
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();
    const apiRoot = await login(page, `${origin}/hub/`);
    assert.equal(loopback(apiRoot).origin, origin);
    async function request(route, options = {}) {
      const response = await context.request.fetch(`${apiRoot}/hub${route}`, { ...options, headers: { ...options.headers, origin, referer: `${origin}/hub/` }, maxRedirects: 0, timeout: 120000 });
      const json = await response.json();
      assert.ok(response.ok(), `Hub ${route}: HTTP ${response.status()} ${json.error?.code ?? json.code ?? ''} ${json.error?.message ?? json.message ?? ''}`);
      return json.data;
    }
    const appId = `factory-${binding.issue}-${process.env.GITHUB_RUN_ID ?? Date.now()}`;
    await request('/apps', { method: 'POST', data: { id: appId, name: 'Factory counter smoke' } });
    await request(`/apps/${appId}/settings`, { method: 'PUT', data: { activation: 'eager' } });
    const release = await request(`/apps/${appId}/releases`, { method: 'POST', headers: { 'content-type': 'application/gzip', 'x-artifact-sha256': receipt.artifactSha256 }, data: archive });
    assert.equal(release.checksum, receipt.artifactSha256);
    const automatic = { autoRun: true };
    // Runtime-only configuration for an empty, private test volume; never saved in evidence.
    const config = JSON.stringify({ i18n: { defaultLocale: 'en-US' }, users: { initialAdmin: { username: 'nocobase', password } }, auth: { secret, emailAndPassword: { enabled: true, autoSignIn: false }, session: { storeSessionInDatabase: true } }, session: { secret }, database: { default: 'main', connections: { main: { dialect: 'sqlite', database: path.join(temporary, `${appId}.sqlite`), schemaManagement: 'managed', migrations: automatic, seeds: automatic } }, migrations: automatic, seeds: automatic }, logging: { level: 'info', file: { enabled: true } }, snowflake: { workerId: 1, epoch: 1605024000 } });
    const deployment = await request(`/apps/${appId}/deploy`, { method: 'POST', data: { releaseId: release.id, config: { mode: 'file', content: config } } });
    let status;
    for (let i = 0; i < 150; i++) {
      status = await request(`/apps/${appId}/deployments/${deployment.id}/status`);
      if (['succeeded', 'failed', 'cancelled'].includes(status.status)) break;
      await delay(2000);
    }
    let detail = await request(`/apps/${appId}`);
    assertDeployed(status, detail, release.id);
    receipt.checks.push({ id: 'HUB-01', status: 'passed', appId, releaseId: release.id, deploymentId: deployment.id, observed: status, runtime: detail.runtime });
    const logs = await request(`/apps/${appId}/deployments/${deployment.id}/logs`);
    assert.equal(logs.enabled, true);
    const entries = logs.entries;
    assert.ok(Array.isArray(entries) && entries.length > 0, 'Actual deployment log entries required');
    writeFileSync(path.join(out, 'deployment-log.json'), scrubHubLog('deployment-log.json', JSON.stringify(logs), [secret, password]));
    receipt.checks.push({ id: 'HUB-03', status: 'passed', observation: `${entries.length} actual deployment log entries`, evidence: 'deployment-log.json' });
    const target = hostedApplicationUrl(detail, origin);
    receipt.deploymentBasePath = detail.deployment.basePath;
    const business = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    counter = await business.newPage();
    receipt.hostUrl = target.href;
    counter.on('pageerror', error => browserEvents.push({ kind: 'pageerror', message: error.message.slice(0, 1500) }));
    counter.on('response', response => { if (response.status() >= 400) browserEvents.push({ kind: 'http', path: new URL(response.url()).pathname, status: response.status() }); });
    await login(counter, target.href, password);
    await counter.getByRole('link', { name: /Pipeline Smoke|流程冒烟/u }).click();
    await counter.locator('[aria-label="Count"], [aria-label="计数"]').waitFor({ state: 'visible' });
    assert.equal((await counter.locator('[aria-label="Count"], [aria-label="计数"]').innerText()).trim(), '0');
    await counter.screenshot({ path: path.join(out, 'counter-0.png') });
    await counter.getByRole('button', { name: '+1', exact: true }).click();
    await counter.waitForFunction(() => document.querySelector('[aria-label="Count"], [aria-label="计数"]')?.textContent?.trim() === '1');
    await counter.screenshot({ path: path.join(out, 'counter-1.png') });
    receipt.checks.push({ id: 'HUB-02', status: 'passed', observation: 'The original verified counter runs through the real Hub/Host, 0 -> 1', evidence: ['counter-0.png', 'counter-1.png'] });
    receipt.status = 'passed';
  } catch (error) {
    receipt.error = error.message.replaceAll(secret, '[REDACTED]').replaceAll(password, '[REDACTED]');
    throw new Error(receipt.error);
  } finally {
    if (counter && receipt.status !== 'passed') {
      receipt.browser = { url: counter.url(), events: browserEvents };
      try { receipt.browser.text = (await counter.locator('body').innerText({ timeout: 2000 })).slice(0, 2500); await counter.screenshot({ path: path.join(out, 'counter-failure.png'), timeout: 5000 }); }
      catch { receipt.browser.capture = 'unavailable'; }
    }
    await browser?.close();
    if (child.pid) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch (e) { if (e.code !== 'ESRCH') throw e; }
      await delay(1000);
      try { process.kill(-child.pid, 'SIGKILL'); } catch (e) { if (e.code !== 'ESRCH') throw e; }
    }
    await new Promise(resolve => stream.end(resolve));
    writeFileSync(logFile, scrubHubLog('hub-start.log', readFileSync(logFile, 'utf8'), [secret, password]));
    writeFileSync(path.join(out, 'hub-checks.json'), scrubHubLog('hub-checks.json', JSON.stringify(receipt, null, 2), [secret, password]));
  }
}
async function main() {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === 'run') return runHub(...rest);
  const [directory] = rest; mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'hub-source.json');
  if (mode === 'select') {
    const issue = Number(process.env.TASK_ISSUE), runId = Number(process.env.TASK_RUN), attempt = Number(process.env.TASK_ATTEMPT);
    assert.ok([issue, runId, attempt].every(positive));
    const run = await api(`/actions/runs/${runId}/attempts/${attempt}`);
    const source = selectHubArtifact(run, await list(`/actions/runs/${runId}/attempts/${attempt}/jobs`, 'jobs'), await list(`/actions/runs/${runId}/artifacts`, 'artifacts'), process.env.GITHUB_REPOSITORY, issue, attempt);
    writeFileSync(file, JSON.stringify(source, null, 2));
    appendFileSync(process.env.GITHUB_OUTPUT, `artifact_id=${source.artifactId}\n`);
  } else if (mode === 'bind') {
    const source = JSON.parse(readFileSync(file));
    const metadata = JSON.parse(readFileSync(path.join(directory, 'task-metadata.json')));
    const pulls = await list(`/pulls?state=all&head=${encodeURIComponent(`${source.repository.split('/')[0]}:${metadata.workBranch}`)}`);
    const matches = pulls.filter(p => matchesTaskPR(p, metadata, source));
    assert.equal(matches.length, 1, 'Exactly one matching delivered PR required');
    writeFileSync(file, JSON.stringify(bindHubArtifact(source, metadata, matches[0]), null, 2));
  } else throw new Error('Usage: hub-smoke.mjs select|bind DIR, or run APP ARTIFACTS EVIDENCE');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exitCode = 1; });
