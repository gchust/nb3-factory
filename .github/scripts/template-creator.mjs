import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function exactCreatorVersion(value) {
  assert.ok(typeof value === 'string' && /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(value), 'An actual creator version is required');
  return value;
}
export function recordCreator(file, version) {
  const template = JSON.parse(readFileSync(file, 'utf8'));
  template.creator = `@nocobase/create-app@${exactCreatorVersion(version)}`;
  writeFileSync(file, `${JSON.stringify(template, null, 2)}\n`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, target] = process.argv.slice(2);
  if (mode === 'pin') {
    const output = execFileSync('pnpm', ['view', '@nocobase/create-app@latest', 'version', '--json'], { cwd: path.resolve(target), encoding: 'utf8', timeout: 60000 });
    const version = exactCreatorVersion(JSON.parse(output));
    appendFileSync(process.env.GITHUB_ENV, `FACTORY_CREATOR_VERSION=${version}\n`);
  } else if (mode === 'record') recordCreator(target, process.env.FACTORY_CREATOR_VERSION);
  else throw new Error('Usage: template-creator.mjs pin CONTROL | record TEMPLATE_JSON');
}
