// Portable, read-only npm snapshot for explicitly selected source baselines.
// Only package bytes/metadata are exported; registry auth and live app config are not.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { createReadStream, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sha = v => /^[a-f0-9]{40}$/u.test(v ?? '');
const hex = v => /^[a-f0-9]{64}$/u.test(v ?? '');
const pkgName = v => /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/u.test(v ?? '');
const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const PORT = 4873;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const json = (response, code, data) => {
  response.writeHead(code, { 'content-type': 'application/json' });
  response.end(JSON.stringify(data));
};

export function verifyIntegrity(bytes, dist) {
  const candidates = String(dist.integrity ?? '').split(/\s+/u);
  const strongest = candidates.find(x => x.startsWith('sha512-')) ?? candidates.find(x => x.startsWith('sha256-'));
  if (strongest) {
    const [algorithm, value] = strongest.split('-');
    assert.equal(createHash(algorithm).update(bytes).digest('base64'), value, 'Package integrity mismatch');
  } else {
    assert.match(dist.shasum ?? '', /^[a-f0-9]{40}$/u, 'Package integrity is required');
    assert.equal(createHash('sha1').update(bytes).digest('hex'), dist.shasum, 'Package shasum mismatch');
  }
}
export function validateSnapshot(value) {
  assert.equal(value.version, 1);
  assert.equal(value.source?.repository, 'nocobase/nocobase3');
  assert.ok(sha(value.source.sha) && Array.isArray(value.packages) && value.packages.length > 0 && value.packages.length < 1000);
  const names = new Set();
  for (const item of value.packages) {
    assert.ok(pkgName(item.name) && !names.has(item.name)); names.add(item.name);
    assert.ok(typeof item.version === 'string' && /^[0-9][\w.+-]*$/u.test(item.version));
    assert.ok(hex(item.sha256) && item.file === `packages/${item.sha256}.tgz`);
    assert.equal(item.manifest.name, item.name); assert.equal(item.manifest.version, item.version);
  }
  assert.ok(names.has('@nocobase/create-app') && names.has('@nocobase/app-template-default'));
  return value;
}
export function installedScopedVersions(application, workspaceVersions) {
  const versions = { ...workspaceVersions };
  const root = path.join(application, 'node_modules', '.pnpm');
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const scope = path.join(root, entry.name, 'node_modules', '@nocobase');
    if (!existsSync(scope)) continue;
    for (const name of readdirSync(scope)) {
      const manifest = path.join(scope, name, 'package.json');
      if (!existsSync(manifest)) continue;
      const pkg = readJson(manifest);
      assert.equal(pkg.name, `@nocobase/${name}`);
      if (versions[pkg.name]) assert.equal(versions[pkg.name], pkg.version, `Multiple installed versions for ${pkg.name}`);
      versions[pkg.name] = pkg.version;
    }
  }
  return versions;
}
export async function exportSnapshot(repo, output, sourceSha, application, fetcher = fetch) {
  assert.ok(sha(sourceSha));
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(), sourceSha);
  const stateDir = path.join(os.tmpdir(), `nocobase-local-registry-${hash(path.resolve(repo)).slice(0, 12)}`);
  const state = readJson(path.join(stateDir, 'state.json'));
  assert.equal(state.repo, path.resolve(repo)); assert.equal(state.ready, true);
  assert.equal(new URL(state.registry).origin, ORIGIN);
  const result = { version: 1, source: { repository: 'nocobase/nocobase3', sha: sourceSha }, packages: [] };
  mkdirSync(path.join(output, 'packages'), { recursive: true });
  for (const [name, version] of Object.entries(installedScopedVersions(application, state.versions)).sort(([a], [b]) => a.localeCompare(b))) {
    assert.ok(pkgName(name));
    const response = await fetcher(`${ORIGIN}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`, { signal: AbortSignal.timeout(30000) });
    assert.ok(response.ok, `No published snapshot metadata for ${name}`);
    const manifest = await response.json();
    assert.equal(manifest.name, name); assert.equal(manifest.version, version);
    const tarball = new URL(manifest.dist.tarball); assert.equal(tarball.origin, ORIGIN);
    const downloaded = await fetcher(tarball, { signal: AbortSignal.timeout(120000), redirect: 'error' });
    assert.ok(downloaded.ok, `Missing source tarball for ${name}`);
    const bytes = Buffer.from(await downloaded.arrayBuffer());
    assert.ok(bytes.length > 0 && bytes.length <= 256 * 1024 * 1024);
    verifyIntegrity(bytes, manifest.dist);
    const digest = hash(bytes), file = `packages/${digest}.tgz`;
    writeFileSync(path.join(output, file), bytes);
    // npm resolution fields only, not the registry's internal users, auth or storage state.
    const fields = ['name', 'version', 'dependencies', 'bundleDependencies', 'bundledDependencies', 'optionalDependencies', 'peerDependencies', 'peerDependenciesMeta', 'engines', 'os', 'cpu', 'libc', 'bin', 'type', 'main', 'module', 'exports', 'imports', 'scripts', 'deprecated'];
    const metadata = Object.fromEntries(fields.filter(k => manifest[k] !== undefined).map(k => [k, manifest[k]]));
    metadata.dist = { integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`, shasum: createHash('sha1').update(bytes).digest('hex') };
    result.packages.push({ name, version, origin: state.versions[name] ? 'source' : 'published-dependency', file, sha256: digest, manifest: metadata });
  }
  validateSnapshot(result);
  writeJson(path.join(output, 'manifest.json'), result);
  return result;
}
export function loadSnapshot(directory) {
  assert.ok(!lstatSync(directory).isSymbolicLink());
  const snapshot = validateSnapshot(readJson(path.join(directory, 'manifest.json')));
  for (const item of snapshot.packages) {
    const file = path.join(directory, item.file);
    assert.ok(!lstatSync(path.dirname(file)).isSymbolicLink() && !lstatSync(file).isSymbolicLink() && lstatSync(file).isFile());
    assert.equal(hash(readFileSync(file)), item.sha256, `Corrupt source package ${item.name}`);
  }
  return snapshot;
}
export function snapshotServer(directory, snapshot = loadSnapshot(directory)) {
  const packages = new Map(snapshot.packages.map(item => [item.name, item]));
  const tarballs = new Map(snapshot.packages.map(item => [`/snapshot/${item.sha256}.tgz`, item]));
  const fingerprint = hash(JSON.stringify(snapshot));
  return createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) return json(response, 405, { error: 'Read-only source snapshot' });
    const url = new URL(request.url, ORIGIN);
    if (url.pathname === '/-/ping') return json(response, 200, { snapshot: fingerprint, sourceSha: snapshot.source.sha });
    const item = tarballs.get(url.pathname);
    if (item) {
      response.writeHead(200, { 'content-type': 'application/octet-stream' });
      if (request.method === 'HEAD') return response.end();
      return createReadStream(path.join(directory, item.file)).pipe(response);
    }
    let route;
    try { route = decodeURIComponent(url.pathname).slice(1); } catch { return json(response, 400, { error: 'Invalid package path' }); }
    const entry = [...packages.values()].find(p => route === p.name || route.startsWith(`${p.name}/`));
    if (entry) {
      const manifest = { ...entry.manifest, dist: { ...entry.manifest.dist, tarball: `${ORIGIN}/snapshot/${entry.sha256}.tgz` } };
      if (route === entry.name) return json(response, 200, { name: entry.name, 'dist-tags': { latest: entry.version }, versions: { [entry.version]: manifest } });
      if ([`${entry.name}/${entry.version}`, `${entry.name}/latest`].includes(route)) return json(response, 200, manifest);
      // Existing lockfiles from Verdaccio retain their canonical package tarball paths.
      if (route.startsWith(`${entry.name}/-/`) && route.endsWith('.tgz')) {
        const expected = `${entry.name.split('/').at(-1)}-${entry.version}.tgz`;
        if (route.split('/').at(-1) === expected) {
          response.writeHead(302, { location: `${ORIGIN}/snapshot/${entry.sha256}.tgz` }); return response.end();
        }
      }
      return json(response, 404, { error: 'Version absent from frozen source snapshot' });
    }
    if (route.startsWith('@nocobase/') || route.startsWith('snapshot/') || route.startsWith('-/')) return json(response, 404, { error: 'Not in source snapshot' });
    // Third-party dependencies still use their public registry; the lockfile retains their integrity pins.
    if (!/^(@[^/]+\/)?[^/]+(?:\/.*)?$/u.test(route) || url.search) return json(response, 400, { error: 'Invalid registry request' });
    response.writeHead(302, { location: `https://registry.npmjs.org/${url.pathname.slice(1)}` }); response.end();
  });
}
export function validateDescriptor(value, repository) {
  assert.match(repository ?? '', /^[\w.-]+\/[\w.-]+$/u);
  assert.equal(value.version, 1); assert.equal(value.repository, repository);
  assert.ok(sha(value.sourceSha) && hex(value.sha256));
  assert.ok(Number.isSafeInteger(value.runId) && value.runId > 0 && Number.isSafeInteger(value.attempt) && value.attempt > 0);
  const tag = `source-baseline-${value.sourceSha.slice(0, 12)}-${value.runId}-${value.attempt}`;
  assert.equal(value.tag, tag);
  assert.equal(value.url, `https://github.com/${repository}/releases/download/${tag}/packages.tar.gz`);
  return value;
}
export function unpackPackages(archive, output, expectedHash) {
  assert.equal(hash(readFileSync(archive)), expectedHash, 'Source archive checksum mismatch');
  const listing = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8', maxBuffer: 1024 * 1024 }).trim().split('\n');
  for (const name of listing) assert.match(name, /^(?:\.\/)?(?:manifest\.json|packages\/?|packages\/[a-f0-9]{64}\.tgz)$/u, 'Unexpected source archive entry');
  const types = execFileSync('tar', ['-tvzf', archive], { encoding: 'utf8', maxBuffer: 1024 * 1024 }).trim().split('\n');
  assert.ok(types.every(line => /^[-d]/u.test(line)), 'Source archive links are not allowed');
  mkdirSync(output, { recursive: true });
  assert.equal(readdirSync(output).length, 0, 'Use a new snapshot directory');
  execFileSync('tar', ['-xzf', archive, '--no-same-owner', '-C', output]);
  return loadSnapshot(output);
}
async function start(directory) {
  const snapshot = loadSnapshot(directory), fingerprint = hash(JSON.stringify(snapshot));
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'serve', directory], { detached: true, stdio: 'ignore' });
  let failed; child.once('error', e => { failed = e; });
  for (let i = 0; i < 50; i++) {
    if (failed) throw failed;
    if (child.exitCode !== null) throw new Error('Snapshot registry could not bind to its reserved port');
    try {
      const response = await fetch(`${ORIGIN}/-/ping`, { signal: AbortSignal.timeout(1000) });
      if (response.ok && (await response.json()).snapshot === fingerprint) {
        child.unref(); writeFileSync(path.join(directory, 'server.pid'), String(child.pid)); return snapshot;
      }
    } catch { /* Only startup is retried; no fallback to published NocoBase packages. */ }
    await delay(100);
  }
  child.kill(); throw new Error('Source registry readiness failed');
}
function configure(workspace, temporary) {
  const contents = `registry=${ORIGIN}/\n@nocobase:registry=${ORIGIN}/\nminimum-release-age=0\n`;
  const npmrc = path.join(temporary, 'source.npmrc'); writeFileSync(npmrc, contents, { mode: 0o600 });
  writeFileSync(path.join(workspace, '.npmrc'), contents);
  // Disposable runner only. Covers app-tools' nested/dist pnpm roots too.
  writeFileSync(path.join(os.homedir(), '.npmrc'), contents, { mode: 0o600 });
  const overrides = { NPM_CONFIG_USERCONFIG: npmrc, PNPM_CONFIG_USERCONFIG: npmrc,
    XDG_CONFIG_HOME: path.join(temporary, 'config'), NPM_CONFIG_REGISTRY: `${ORIGIN}/`, PNPM_CONFIG_REGISTRY: `${ORIGIN}/`,
    NOCOBASE_REGISTRY: `${ORIGIN}/`, PNPM_CONFIG_STORE_DIR: path.join(temporary, 'store'), PNPM_CONFIG_CACHE_DIR: path.join(temporary, 'cache') };
  if (process.env.GITHUB_ENV) for (const [key, value] of Object.entries(overrides)) {
    assert.ok(!/[\r\n]/u.test(value));
    execFileSync(process.execPath, ['-e', 'require("node:fs").appendFileSync(process.argv[1],process.argv[2])', process.env.GITHUB_ENV, `${key}=${value}\n`]);
  }
  return overrides;
}
async function restore(workspace, metadataFile) {
  const file = path.join(workspace, 'factory-source.json');
  if (!existsSync(file)) {
    const target = metadataFile ? readJson(metadataFile).task?.targetBranch : null;
    assert.ok(!String(target ?? '').startsWith('factory-baseline/source-'), 'Source baseline descriptor is missing');
    return; // The normal published-template path is unchanged.
  }
  const value = validateDescriptor(readJson(file), process.env.GITHUB_REPOSITORY);
  assert.ok(process.env.RUNNER_TEMP, 'Source snapshots require an isolated runner');
  const temporary = path.join(process.env.RUNNER_TEMP, `factory-source-${value.sha256.slice(0, 16)}`);
  mkdirSync(temporary, { recursive: true });
  const archive = path.join(temporary, 'packages.tar.gz');
  const response = await fetch(value.url, { signal: AbortSignal.timeout(180000) });
  assert.ok(response.ok, 'Pinned source snapshot is unavailable; do not silently use latest');
  const bytes = Buffer.from(await response.arrayBuffer()); assert.ok(bytes.length <= 512 * 1024 * 1024);
  writeFileSync(archive, bytes);
  const directory = path.join(temporary, 'registry');
  const snapshot = unpackPackages(archive, directory, value.sha256);
  assert.equal(snapshot.source.sha, value.sourceSha);
  await start(directory); configure(workspace, temporary);
  console.log(`Restored ${snapshot.packages.length} packages from source ${value.sourceSha}`);
}
async function main() {
  const [mode, first, second, third, fourth] = process.argv.slice(2);
  if (mode === 'export') await exportSnapshot(path.resolve(first), path.resolve(second), third, path.resolve(fourth));
  else if (mode === 'serve') {
    const server = snapshotServer(first);
    server.listen(PORT, '127.0.0.1');
    process.once('SIGTERM', () => server.close(() => process.exit(0)));
  } else if (mode === 'start') { await start(first); if (second) configure(second, path.dirname(first)); }
  else if (mode === 'restore') await restore(path.resolve(first), second);
  else if (mode === 'stop') {
    const root = process.env.RUNNER_TEMP;
    if (root) for (const name of readdirSync(root).filter(n => /^factory-source-[a-f0-9]{16}$/u.test(n))) {
      const pidFile = path.join(root, name, 'registry/server.pid');
      if (!existsSync(pidFile)) continue;
      const pid = Number(readFileSync(pidFile, 'utf8'));
      if (Number.isSafeInteger(pid) && pid > 1) try { process.kill(pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  }
  else throw new Error('Usage: source-snapshot.mjs export REPO OUT SHA APP | serve DIR | start DIR [APP] | restore APP');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
