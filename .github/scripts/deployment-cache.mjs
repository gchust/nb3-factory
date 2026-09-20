import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const receiptName = '.factory-dependencies.json';
function cacheDirectory(root) {
  const value = process.env.FACTORY_DEPENDENCY_CACHE;
  if (!value || process.env.FACTORY_DISABLE_DEPENDENCY_CACHE === '1')
    return null;
  const directory = path.resolve(value);
  const dist = path.join(root, 'dist');
  if (directory === dist || directory.startsWith(`${dist}${path.sep}`))
    throw new Error('Dependency cache must be outside dist');
  return directory;
}

// Move, never copy: tens of thousands of file copies can cost more than installation.
// A receipt is written only after a successful build. The next build parks that tree
// before clearing dist. This cache is private to one job and one application workspace.
export function preserveDeploymentDependencies(root) {
  const directory = cacheDirectory(root);
  const receipt = path.join(root, 'dist', receiptName);
  const modules = path.join(root, 'dist/node_modules');
  if (!directory || !fs.existsSync(receipt) || !fs.existsSync(modules)) return;
  try {
    const data = JSON.parse(fs.readFileSync(receipt, 'utf8'));
    if (!/^[a-f0-9]{64}$/.test(data.key)) return;
    const entry = path.join(directory, data.key);
    fs.rmSync(entry, { recursive: true, force: true });
    fs.mkdirSync(entry, { recursive: true });
    fs.renameSync(modules, path.join(entry, 'node_modules'));
    fs.writeFileSync(path.join(entry, 'receipt.json'), JSON.stringify(data));
  } catch {
    // Cross-device caches are unsupported; a cold install remains correct.
    console.error(
      'Deployment dependencies could not be preserved; using a cold install.',
    );
  }
}

export function deploymentCache(root, targetArgs) {
  const directory = cacheDirectory(root);
  if (!directory) return null;
  const hash = createHash('sha256');
  hash.update(
    JSON.stringify([
      3,
      root,
      process.platform,
      process.platform === 'linux'
        ? (process.report.getReport().header.glibcVersionRuntime ?? 'musl')
        : null,
      process.arch,
      process.versions.modules,
      process.version,
      targetArgs,
      execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim(),
    ]),
  );
  function add(file) {
    hash.update(path.relative(root, file));
    if (!fs.existsSync(file)) {
      hash.update('missing');
      return;
    }
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink())
      throw new Error(`Unsupported cache input symlink: ${file}`);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(file).sort())
        add(path.join(file, name));
    } else hash.update(fs.readFileSync(file));
  }
  for (const file of [
    'pnpm-lock.yaml',
    '.npmrc',
    'dist/package.json',
    'dist/pnpm-workspace.yaml',
    'dist/vendor',
    'scripts',
    '.github/scripts/deployment-cache.mjs',
  ])
    add(path.join(root, file));
  const key = hash.digest('hex');
  const entry = path.join(directory, key);
  const manifest = path.join(root, 'dist/package.json');
  return {
    restore() {
      if (!fs.existsSync(path.join(entry, 'receipt.json'))) return false;
      try {
        const saved = JSON.parse(
          fs.readFileSync(path.join(entry, 'receipt.json'), 'utf8'),
        );
        if (saved.key !== key || !saved.buildTarget) return false;
        fs.renameSync(
          path.join(entry, 'node_modules'),
          path.join(root, 'dist/node_modules'),
        );
        const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
        pkg.nocobase = { ...pkg.nocobase, buildTarget: saved.buildTarget };
        fs.writeFileSync(manifest, `${JSON.stringify(pkg, null, 2)}\n`);
        console.log('Deployment dependency cache hit');
        return true;
      } catch {
        fs.rmSync(path.join(root, 'dist/node_modules'), {
          recursive: true,
          force: true,
        });
        return false;
      }
    },
    save() {
      const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      if (!pkg.nocobase?.buildTarget) return;
      fs.writeFileSync(
        path.join(root, 'dist', receiptName),
        JSON.stringify({ key, buildTarget: pkg.nocobase.buildTarget }),
      );
    },
  };
}
