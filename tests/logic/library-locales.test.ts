import { describe, expect, it } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import zhCN from '../../client/locales/zh-CN.js';

/** Collects every user-visible string in a locale resource, including nested namespaces. */
function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, out);
  }
  return out;
}

describe('library locale copy', () => {
  it('never ships a bare generic failure page string', () => {
    // The acceptance guard treats a required flow that shows "Something went wrong" as a
    // failure, so the application must not put that phrase in front of a user. A specific,
    // actionable message is required instead; see the issue's explicit-error requirement.
    const banned = /something went wrong/i;
    for (const [locale, resource] of [
      ['en-US', enUS],
      ['zh-CN', zhCN],
    ] as const) {
      for (const text of collectStrings(resource)) {
        expect(
          text,
          `${locale} must not ship a generic failure string`,
        ).not.toMatch(banned);
      }
    }
  });

  it('defines the borrowing error copy in both languages', () => {
    for (const resource of [enUS, zhCN] as const) {
      const library = resource.library;
      expect(library.error.generic.length).toBeGreaterThan(0);
      expect(library.error.outOfStock.length).toBeGreaterThan(0);
      expect(library.noStockHint.length).toBeGreaterThan(0);
    }
  });
});
