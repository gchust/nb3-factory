import { describe, expect, it } from 'vitest';

import { parseMemoTimestamp } from '../../client/pages/customer-memos/timestamp.js';

// The application stores UTC, but SQLite drops the trailing `Z` when it hands
// the value back. Reading it as local time would shift the record's hour
// whenever the browser is not on UTC, so the helper restores the zone.
describe('parseMemoTimestamp', () => {
  it('reads the zone-less text SQLite returns as UTC', () => {
    // The result is compared by its instant, so the assertion holds in any timezone the suite runs in.
    expect(parseMemoTimestamp('2026-01-22T11:05:00.000').toISOString()).toBe(
      '2026-01-22T11:05:00.000Z',
    );
  });

  it('keeps a timestamp that already carries a zone', () => {
    expect(parseMemoTimestamp('2026-01-22T11:05:00.000Z').toISOString()).toBe(
      '2026-01-22T11:05:00.000Z',
    );
    expect(
      parseMemoTimestamp('2026-01-22T19:05:00.000+08:00').toISOString(),
    ).toBe('2026-01-22T11:05:00.000Z');
  });
});
