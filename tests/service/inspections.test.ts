import { describe, expect, it } from 'vitest';

import { todayInShanghai } from '../../server/services/inspections.js';

describe('todayInShanghai', () => {
  it('uses the Shanghai calendar day rather than UTC', () => {
    // 16:00 UTC is midnight in Shanghai, so the day has already advanced.
    expect(todayInShanghai(new Date('2026-09-21T16:00:00.000Z'))).toBe(
      '2026-09-22',
    );
  });

  it('stays on the same day just before the Shanghai midnight boundary', () => {
    expect(todayInShanghai(new Date('2026-09-22T15:59:59.000Z'))).toBe(
      '2026-09-22',
    );
  });

  it('advances when Shanghai crosses midnight', () => {
    expect(todayInShanghai(new Date('2026-09-22T16:00:00.000Z'))).toBe(
      '2026-09-23',
    );
  });

  it('returns an ISO calendar date', () => {
    expect(todayInShanghai(new Date('2026-01-02T03:04:05.000Z'))).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });
});
