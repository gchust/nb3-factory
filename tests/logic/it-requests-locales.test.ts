// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import zhCN from '../../client/locales/zh-CN.js';
import {
  IT_CATEGORY_LABEL_KEYS,
  IT_STATUS_LABEL_KEYS,
} from '../../client/pages/it-requests/types.js';

const root = fileURLToPath(new URL('../../', import.meta.url));

/** Every addressable key of a locale, as the dot-separated path `t()` uses. */
function translationKeys(
  resource: Record<string, unknown>,
  prefix = '',
): string[] {
  return Object.entries(resource).flatMap(([key, value]) => {
    const keyPath = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === 'object'
      ? translationKeys(value as Record<string, unknown>, keyPath)
      : [keyPath];
  });
}

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.tsx?$/u.test(entry.name) ? [entryPath] : [];
  });
}

/**
 * The translation keys the IT feature reads, gathered from the three places it
 * names them: `t('...')` in its pages, `itTitle('...')` in the server resource
 * declarations, and the enumerated labels the pages look up at runtime.
 */
function referencedKeys(): string[] {
  const keys = new Set<string>();
  const literal = /\bt\(\s*'([^']+)'/gu;
  const title = /\bitTitle\(\s*'([^']+)'/gu;

  for (const file of sourceFiles(
    path.join(root, 'client', 'pages', 'it-requests'),
  )) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(literal)) {
      keys.add(match[1]);
    }
  }
  for (const file of sourceFiles(path.join(root, 'server', 'it'))) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(title)) {
      keys.add(match[1]);
    }
  }
  keys.add('it.set.employee');
  keys.add('it.set.handler');
  for (const key of [
    ...Object.values(IT_STATUS_LABEL_KEYS),
    ...Object.values(IT_CATEGORY_LABEL_KEYS),
  ]) {
    keys.add(key);
  }
  return [...keys].sort();
}

describe('IT request translations', () => {
  const keys = referencedKeys();
  const english = new Set(translationKeys(enUS as Record<string, unknown>));
  const chinese = new Set(translationKeys(zhCN as Record<string, unknown>));

  it('reads a meaningful number of keys', () => {
    // A regex that quietly stops matching would turn this into a no-op.
    expect(keys.length).toBeGreaterThan(40);
  });

  it('defines every key the IT feature uses in both locales', () => {
    expect(keys.filter((key) => !english.has(key))).toEqual([]);
    expect(keys.filter((key) => !chinese.has(key))).toEqual([]);
  });
});
