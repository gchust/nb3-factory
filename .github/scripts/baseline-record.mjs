import { validateDescriptor } from './source-snapshot.mjs';
// Observable package/Skill baseline, not a claim that npm latest equals a source
// checkout. Never publish configuration, credentials or complete node_modules.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync, realpathSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const isSha = value => /^[a-f0-9]{40}$/u.test(value ?? '');
const within = (root, file) => { const relative = path.relative(root, file); return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)); };
function jsonSkillDirectory(root) { try { return statSync(path.join(root, 'SKILL.md')).isFile(); } catch { return false; } }
function json(file) { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } }

export function captureBaseline(workspace, { controlSha = null, sourceSha = null, creatorVersion = null } = {}) {
  const root = realpathSync(workspace);
  let sourceSnapshot;
  try { sourceSnapshot = JSON.parse(readFileSync(path.join(root, 'factory-source.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (sourceSnapshot) {
    validateDescriptor(sourceSnapshot, process.env.GITHUB_REPOSITORY ?? sourceSnapshot.repository);
    if (sourceSha && sourceSha !== sourceSnapshot.sourceSha) throw new Error('Source SHA conflicts with frozen snapshot');
    sourceSha ??= sourceSnapshot.sourceSha;
  }
  if (sourceSha !== null && !isSha(sourceSha)) throw new Error('An unpublished baseline requires an exact source SHA');
  const files = [], omissions = [];
  const ancestors = new Set();
  function collect(relative, depth = 0) {
    const file = path.join(root, relative);
    let real, stat, link;
    try { link = lstatSync(file).isSymbolicLink(); real = realpathSync(file); stat = statSync(real); }
    catch (error) { if (error.code === 'ENOENT') { omissions.push({ path: relative, reason: 'missing' }); return; } throw error; }
    if (!within(root, real)) { omissions.push({ path: relative, reason: 'external_link' }); return; }
    if (link && stat.isDirectory() && !(relative === '.agents/skills' && path.basename(real) === 'skills') && !jsonSkillDirectory(real)) {
      omissions.push({ path: relative, reason: 'not_a_skill_link' }); return;
    }
    if (depth > 12 || files.length >= 10000 || ancestors.has(real)) { omissions.push({ path: relative, reason: 'bounded_or_cyclic' }); return; }
    if (stat.isDirectory()) {
      ancestors.add(real);
      for (const name of readdirSync(real).sort()) collect(path.join(relative, name), depth + 1);
      ancestors.delete(real);
    } else if (stat.isFile() && stat.size <= 16 * 1024 * 1024) {
      files.push({ path: relative.split(path.sep).join('/'), sha256: sha256(readFileSync(real)),
        ...(real !== file ? { target: path.relative(root, real).split(path.sep).join('/') } : {}) });
    } else omissions.push({ path: relative, reason: 'not_a_bounded_file' });
  }
  for (const name of ['package.json', 'pnpm-lock.yaml', 'factory-template.json', ...(sourceSnapshot ? ['factory-source.json'] : []), 'AGENTS.md', '.agents/skills']) collect(name);
  const pkg = json(path.join(root, 'package.json'));
  const template = json(path.join(root, 'factory-template.json'));
  creatorVersion ??= /^@nocobase\/create-app@([0-9][\w.+-]*)$/u.exec(template?.creator ?? '')?.[1] ?? null;
  const packages = [];
  for (const name of Object.keys({ ...pkg?.dependencies, ...pkg?.devDependencies }).filter(n => /^@nocobase\/[a-z0-9-]+$/u.test(n)).sort()) {
    const file = path.join(root, 'node_modules', name, 'package.json');
    let real;
    try { real = realpathSync(file); } catch { packages.push({ name, version: null, reason: 'not_installed' }); continue; }
    if (!within(root, real)) { packages.push({ name, version: null, reason: 'external_link' }); continue; }
    const installed = json(real);
    packages.push(installed?.name === name && typeof installed.version === 'string'
      ? { name, version: installed.version, manifestSha256: sha256(readFileSync(real)) }
      : { name, version: null, reason: 'invalid_manifest' });
  }
  let workspaceSha = null;
  try { const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); if (isSha(sha)) workspaceSha = sha; } catch { /* Generated projects need not be Git repositories. */ }
  const facts = { version: 1, kind: sourceSha ? 'source-snapshot' : 'installed-packages',
    controlSha: isSha(controlSha) ? controlSha : null, workspaceSha,
    source: sourceSha ? { repository: 'nocobase/nocobase3', sha: sourceSha } : null,
    ...(sourceSnapshot ? { sourceSnapshot } : {}),
    template: typeof template?.template === 'string' ? template.template : null,
    creatorVersion, templateVersion: template?.templateVersion ?? pkg?.nocobase?.defaultTemplateVersion ?? null,
    lockSha256: files.find(f => f.path === 'pnpm-lock.yaml')?.sha256 ?? null,
    packages, files, omissions };
  return { ...facts, fingerprint: sha256(JSON.stringify(facts)),
    boundary: 'Installed manifest versions and file hashes; lockfile pins include package integrity. No inferred upstream SHA, no proof of Skill reading or correct use.' };
}

export function freezeBaseline(file, baseline) {
  const prior = json(file);
  if (prior) {
    if (prior.fingerprint !== baseline.fingerprint) throw new Error('Baseline changed after capture; create a new sample instead of overwriting provenance');
    return prior;
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(baseline, null, 2)}\n`, { flag: 'wx' });
  return baseline;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [workspace, output, sourceSha] = process.argv.slice(2);
  if (!workspace || !output) throw new Error('Usage: baseline-record.mjs <workspace> <output> [source-sha]');
  freezeBaseline(output, captureBaseline(workspace, { controlSha: process.env.FACTORY_CONTROL_SHA ?? null,
    sourceSha: sourceSha || null, creatorVersion: process.env.FACTORY_CREATOR_VERSION || null }));
}
