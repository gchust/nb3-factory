import { describe, expect, it } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import zhCN from '../../client/locales/zh-CN.js';

type LocaleValue = string | { readonly [key: string]: LocaleValue };

function keysOf(value: LocaleValue, prefix = ''): string[] {
  if (typeof value === 'string') return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keysOf(child, prefix ? `${prefix}.${key}` : key),
  );
}

function leavesOf(
  value: LocaleValue,
  prefix = '',
): readonly { key: string; text: string }[] {
  if (typeof value === 'string') return [{ key: prefix, text: value }];
  return Object.entries(value).flatMap(([key, child]) =>
    leavesOf(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('application locales', () => {
  it('declares exactly the same keys in every language', () => {
    const english = keysOf(enUS as unknown as LocaleValue).sort();
    const chinese = keysOf(zhCN as unknown as LocaleValue).sort();
    expect(chinese).toEqual(english);
  });

  it('translates every expense string instead of falling back to English', () => {
    const english = new Map(
      leavesOf(enUS as unknown as LocaleValue).map(({ key, text }) => [
        key,
        text,
      ]),
    );
    const chinese = new Map(
      leavesOf(zhCN as unknown as LocaleValue).map(({ key, text }) => [
        key,
        text,
      ]),
    );
    const expenseKeys = [...english.keys()].filter((key) =>
      key.startsWith('expense.'),
    );
    expect(expenseKeys.length).toBeGreaterThan(0);
    for (const key of expenseKeys) {
      expect(chinese.has(key), `missing zh-CN translation for ${key}`).toBe(
        true,
      );
      expect(chinese.get(key)?.trim().length).toBeGreaterThan(0);
      expect(chinese.get(key)).not.toBe(english.get(key));
    }
  });
});
