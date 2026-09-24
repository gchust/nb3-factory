import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash, validateDescriptor } from './source-snapshot.mjs';

export function copySourceApplication(from, to) {
  assert.ok(!existsSync(to), 'Use a fresh source application directory');
  const excluded = /^(?:\.git|node_modules|dist|storage|config\.yml|\.env(?:\..*)?)$/u;
  cpSync(from, to, { recursive: true, dereference: false, verbatimSymlinks: true, filter: file =>
    !path.relative(from, file).split(path.sep).some(part => (part !== '.env.example' && excluded.test(part)) || /\.(?:sqlite|sqlite-shm|sqlite-wal)$/u.test(part)) });
  writeFileSync(path.join(to, '.npmrc'), 'registry=http://127.0.0.1:4873/\n@nocobase:registry=http://127.0.0.1:4873/\n');
}
export function sourceDescriptor({ repository, sourceSha, runId, attempt }, bytes) {
  const tag = `source-baseline-${sourceSha.slice(0, 12)}-${runId}-${attempt}`;
  return validateDescriptor({ version: 1, repository, sourceSha, runId, attempt, tag,
    sha256: hash(bytes), url: `https://github.com/${repository}/releases/download/${tag}/packages.tar.gz` }, repository);
}
function git(root, ...args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim(); }
function main() {
  const [mode, appArg, outArg, packagesArg] = process.argv.slice(2);
  if (mode === 'copy') return copySourceApplication(appArg, outArg);
  const app = path.resolve(appArg), out = path.resolve(outArg);
  assert.ok(process.env.RUNNER_TEMP && app.startsWith(`${path.resolve(process.env.RUNNER_TEMP)}${path.sep}`));
  mkdirSync(out, { recursive: true });
  const descriptor = sourceDescriptor({ repository: process.env.GITHUB_REPOSITORY, sourceSha: process.env.SOURCE_SHA,
    runId: Number(process.env.GITHUB_RUN_ID), attempt: Number(process.env.GITHUB_RUN_ATTEMPT) }, readFileSync(packagesArg));
  if (mode === 'describe') {
    assert.match(process.env.FACTORY_CREATOR_VERSION ?? '', /^[0-9][\w.+-]*$/u, 'Actual creator version required');
    writeFileSync(path.join(app, 'factory-source.json'), `${JSON.stringify(descriptor, null, 2)}\n`);
    const template = JSON.parse(readFileSync(path.join(app, 'factory-template.json')));
    template.creator = `@nocobase/create-app@${process.env.FACTORY_CREATOR_VERSION}`;
    template.source = { repository: 'nocobase/nocobase3', sha: descriptor.sourceSha };
    writeFileSync(path.join(app, 'factory-template.json'), `${JSON.stringify(template, null, 2)}\n`);
    return;
  }
  assert.equal(mode, 'bundle');
  assert.ok(!existsSync(path.join(app, '.git')));
  rmSync(path.join(app, 'config.yml'), { force: true });
  for (const name of ['.env', '.env.local', '.env.production']) rmSync(path.join(app, name), { force: true });
  git(app, 'init', '--initial-branch=template');
  git(app, 'config', 'user.name', 'github-actions[bot]');
  git(app, 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com');
  git(app, 'add', '.');
  for (const file of git(app, 'diff', '--cached', '--name-only').split('\n')) {
    assert.ok(file === '.github/ISSUE_TEMPLATE/config.yml' || file === '.env.example' || !/(^|\/)(config\.yml|\.env(?:\.|$)|node_modules|dist|storage)(\/|$)/u.test(file), `Runtime file staged: ${file}`);
  }
  git(app, 'commit', '-m', `chore: verified source baseline ${descriptor.sourceSha}`);
  git(app, 'bundle', 'create', path.join(out, 'application.bundle'), 'refs/heads/template');
  writeFileSync(path.join(out, 'factory-source.json'), `${JSON.stringify(descriptor, null, 2)}\n`);
  writeFileSync(path.join(out, 'candidate.json'), `${JSON.stringify({ version: 1, descriptor,
    candidateSha: git(app, 'rev-parse', 'HEAD'), treeSha: git(app, 'rev-parse', 'HEAD^{tree}'),
    controlSha: process.env.FACTORY_CONTROL_SHA }, null, 2)}\n`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
