// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import enUS from '../../client/locales/en-US.ts';
import zhCN from '../../client/locales/zh-CN.ts';

const clientDirectory = fileURLToPath(new URL('../../client', import.meta.url));

/**
 * The CRM pages and the shared helpers beside them. Every user-visible string in these files comes from a
 * translation key, so a key that is missing from either locale is a page that silently falls back to English
 * (or to the raw key) for Chinese readers. The reference-page scan does not see these files, and `t()` accepts
 * any string at compile time, so this is the check that keeps the wording honest.
 */
const crmDirectories = [
  'pages/crm',
  'pages/customers',
  'pages/contacts',
  'pages/opportunities',
];

/** Every addressable key of a locale, as the dot-separated path `t()` is called with. */
function translationKeys(
  resource: Record<string, unknown>,
  prefix = '',
): string[] {
  return Object.entries(resource).flatMap(([key, value]) => {
    const keyPath = prefix ? prefix + '.' + key : key;
    return value && typeof value === 'object'
      ? translationKeys(value as Record<string, unknown>, keyPath)
      : [keyPath];
  });
}

function sourceFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.tsx?$/u.test(entry.name) ? [entryPath] : [];
  });
}

/** The namespaces these pages are allowed to name, so a dotted string that is none of them is not a key. */
const namespaces = new Set(['crm', 'actions', 'status', 'navigation']);

/** A dotted string literal, which is how a page spells a key whether it hands it to `t()` or holds it in data. */
const quotedKey = /'([a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+)'/gu;

/** A key whose last segment is completed at runtime, such as `crm.stage.${stage}`. */
const interpolatedKey = /\bt\(\s*`([^`]*?)\$\{/gu;

interface References {
  readonly file: string;
  readonly keys: readonly string[];
  readonly prefixes: readonly string[];
}

function referencedKeys(): References[] {
  const files = crmDirectories.flatMap((directory) =>
    sourceFiles(path.join(clientDirectory, directory)),
  );
  return files.map((file) => {
    const keys = new Set<string>();
    const prefixes = new Set<string>();
    const lines = fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => !/^\s*\/\//u.test(line));
    for (const line of lines) {
      for (const match of line.matchAll(quotedKey)) {
        if (namespaces.has(match[1].split('.')[0])) keys.add(match[1]);
      }
      for (const match of line.matchAll(interpolatedKey)) {
        if (namespaces.has(match[1].split('.')[0])) prefixes.add(match[1]);
      }
    }
    return {
      file: path.relative(clientDirectory, file),
      keys: [...keys].sort(),
      prefixes: [...prefixes].sort(),
    };
  });
}

describe('CRM translations', () => {
  const references = referencedKeys();
  const english = new Set(translationKeys(enUS));
  const chinese = new Set(translationKeys(zhCN));

  it('reads the keys of every CRM page', () => {
    const named = references.reduce(
      (total, { keys }) => total + keys.length,
      0,
    );
    expect(named).toBeGreaterThan(60);
    expect(references.length).toBeGreaterThan(10);
  });

  it('translates every CRM key into English', () => {
    const missing = references.flatMap(({ file, keys }) =>
      keys.filter((key) => !english.has(key)).map((key) => `${key} (${file})`),
    );
    expect(missing).toEqual([]);
  });

  it('translates every CRM key into Chinese', () => {
    const missing = references.flatMap(({ file, keys }) =>
      keys.filter((key) => !chinese.has(key)).map((key) => `${key} (${file})`),
    );
    expect(missing).toEqual([]);
  });

  it('translates the keys the CRM pages complete at runtime', () => {
    const prefixes = references.flatMap(({ prefixes: family }) => family);
    expect(prefixes.length).toBeGreaterThan(0);
    for (const written of [english, chinese]) {
      const missing = prefixes.filter(
        (prefix) => ![...written].some((key) => key.startsWith(prefix)),
      );
      expect(missing).toEqual([]);
    }
  });
});
