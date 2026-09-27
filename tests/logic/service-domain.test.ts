import { describe, expect, it } from 'vitest';

import { SERVICE_PAGES, SERVICE_ROLES } from '../../server/service/access.js';
import { slugify } from '../../server/service/assistant.js';
import { SUPPORTED_EVENT_TYPES } from '../../server/service/integration.js';
import {
  dateInTimeZone,
  inspectionDedupeKey,
  nextDailyRun,
  parseTime,
} from '../../server/service/inspections.js';
import { computeSlaDue } from '../../server/service/tickets.js';

/**
 * Domain behavior of the after-sales service module.
 *
 * These are the rules the HTTP layer and the scheduler both depend on: the
 * service-level deadline, the once-per-day inspection identity, time-zone
 * fencing and the platform event vocabulary. They are pure functions, so the
 * test supplies the values directly rather than standing up a database.
 */
describe('service ticket service level', () => {
  it('computes the deadline from the priority', () => {
    const from = '2026-01-01T00:00:00.000Z';
    expect(computeSlaDue('urgent', from)).toBe('2026-01-01T04:00:00.000Z');
    expect(computeSlaDue('high', from)).toBe('2026-01-01T08:00:00.000Z');
    expect(computeSlaDue('normal', from)).toBe('2026-01-02T00:00:00.000Z');
    expect(computeSlaDue('low', from)).toBe('2026-01-04T00:00:00.000Z');
  });

  it('falls back to the normal window for an unknown priority', () => {
    expect(computeSlaDue('unknown', '2026-01-01T00:00:00.000Z')).toBe(
      '2026-01-02T00:00:00.000Z',
    );
  });
});

describe('inspection scheduling', () => {
  it('identifies one task per plan and run date', () => {
    expect(inspectionDedupeKey(7, '2026-01-01')).toBe('7:2026-01-01');
    expect(inspectionDedupeKey(7, '2026-01-01')).toBe(
      inspectionDedupeKey(7, '2026-01-01'),
    );
    expect(inspectionDedupeKey(7, '2026-01-02')).not.toBe(
      inspectionDedupeKey(7, '2026-01-01'),
    );
  });

  it('dates a run in the plan time zone, not the server time zone', () => {
    const instant = new Date('2026-01-01T16:30:00.000Z');
    expect(dateInTimeZone(instant, 'Asia/Shanghai')).toBe('2026-01-02');
    expect(dateInTimeZone(instant, 'UTC')).toBe('2026-01-01');
  });

  it('finds the next 09:00 in Asia/Shanghai', () => {
    const next = nextDailyRun(
      '0 9 * * *',
      'Asia/Shanghai',
      new Date('2026-01-01T00:00:00.000Z'),
    );
    expect(next).toBe('2026-01-01T01:00:00.000Z');
  });

  it('returns null for a cron that is not a plain daily time', () => {
    expect(nextDailyRun('*/5 * * * *', 'Asia/Shanghai', new Date())).toBeNull();
    expect(nextDailyRun('0 9 * * 1', 'Asia/Shanghai', new Date())).toBeNull();
  });

  it('parses stored timestamps and rejects empty values', () => {
    expect(parseTime('2026-01-01 00:00:00')?.toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    );
    expect(parseTime(null)).toBeNull();
    expect(parseTime('')).toBeNull();
  });
});

describe('service vocabulary', () => {
  it('keeps the role keys distinct', () => {
    const keys = Object.values(SERVICE_ROLES);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps the page grant ids distinct', () => {
    expect(new Set(SERVICE_PAGES).size).toBe(SERVICE_PAGES.length);
  });

  it('accepts only the documented platform event types', () => {
    expect(SUPPORTED_EVENT_TYPES).toEqual([
      'device.fault.reported',
      'device.heartbeat',
      'ticket.status.changed',
    ]);
  });

  it('builds a URL-safe slug and never returns an empty one', () => {
    expect(slugify('Service Ticket 001')).toBe('service-ticket-001');
    expect(slugify('   ')).toBe('article');
  });
});
