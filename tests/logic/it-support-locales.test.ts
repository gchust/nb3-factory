// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import enUS from '../../client/locales/en-US.ts';
import zhCN from '../../client/locales/zh-CN.ts';

const applicationRoot = fileURLToPath(new URL('../..', import.meta.url));

/**
 * The directories whose `itSupport.*` keys the browser resolves at runtime.
 *
 * These are the authorization workspace titles the server and its Seeds persist: a Permission Set
 * title, a Collection title, the record access, and the composite resource and its actions. They
 * are not literal `t()` calls in a Client component, so the reference-page locale check never sees
 * them and a missing key would quietly render as its raw dotted path in the browser.
 */
const sourceDirectories = [
  path.join('server', 'it-support'),
  path.join('database', 'main', 'seeds'),
];

// Any single-quoted literal that is one of the application's own `itSupport.*` keys, whether it is
// a `key:`/`titleKey:` property or the argument of a `title(...)`/`localizedTitle(...)` helper.
const applicationKey = /'itSupport(?:\.[a-zA-Z0-9]+)+'/gu;

function flatten(resource: Record<string, unknown>, prefix = ''): Set<string> {
  const keys = new Set<string>();
  for (const [key, value] of Object.entries(resource)) {
    const keyPath = prefix ? prefix + '.' + key : key;
    if (value && typeof value === 'object') {
      for (const nested of flatten(value as Record<string, unknown>, keyPath)) {
        keys.add(nested);
      }
    } else {
      keys.add(keyPath);
    }
  }
  return keys;
}

function typescriptFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return typescriptFiles(entryPath);
    return /\.ts$/u.test(entry.name) ? [entryPath] : [];
  });
}

/** The `itSupport.*` keys the authorization server and Seeds refer to, with their file. */
function referencedKeys(): { key: string; file: string }[] {
  return sourceDirectories
    .flatMap((directory) =>
      typescriptFiles(path.join(applicationRoot, directory)),
    )
    .flatMap((file) => {
      const contents = fs.readFileSync(file, 'utf8');
      return [...contents.matchAll(applicationKey)].map((match) => ({
        key: match[0].slice(1, -1),
        file: path.relative(applicationRoot, file),
      }));
    });
}

describe('IT support authorization wording', () => {
  const references = referencedKeys();
  const english = flatten(enUS as unknown as Record<string, unknown>);
  const chinese = flatten(zhCN as unknown as Record<string, unknown>);

  it('finds the titles the server and seeds persist', () => {
    expect(references.length).toBeGreaterThan(0);
  });

  it('translates every key into English', () => {
    const missing = references
      .filter(({ key }) => !english.has(key))
      .map(({ key, file }) => `${key} (${file})`);
    expect(missing).toEqual([]);
  });

  it('translates every key into Chinese', () => {
    const missing = references
      .filter(({ key }) => !chinese.has(key))
      .map(({ key, file }) => `${key} (${file})`);
    expect(missing).toEqual([]);
  });
});
