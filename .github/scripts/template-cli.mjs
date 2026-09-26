import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// beta.47 replaced local build wrappers and script aliases with the app-cli bin.
// Older templates already depended on app-cli, so the dependency alone is not
// evidence that they implement the new command tree.
export function hasPackageCli(app) {
  return Boolean(
    (app.dependencies?.['@nocobase/app-cli'] ||
      app.devDependencies?.['@nocobase/app-cli']) &&
    app.scripts?.build === 'nocobase build',
  );
}

export function templateCommand(app, operation) {
  const commands = {
    'plugin:register': ['plugin', 'register'],
    'plugin:inspect': ['plugin', 'inspect'],
    'skills:sync': ['skills', 'sync'],
  };
  assert.ok(
    Object.hasOwn(commands, operation),
    `Unsupported template command: ${operation}`,
  );
  if (app.scripts?.[operation]) return [operation];
  assert.ok(
    hasPackageCli(app),
    `Template does not declare ${operation} or the package CLI`,
  );
  return ['exec', 'nocobase', ...commands[operation]];
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [operation, root, ...extra] = process.argv.slice(2);
  assert.ok(
    operation && root && extra.length === 0,
    'Usage: template-cli.mjs OPERATION APP_ROOT',
  );
  const cwd = path.resolve(root);
  const app = JSON.parse(readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  const result = spawnSync('pnpm', templateCommand(app, operation), {
    cwd,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
