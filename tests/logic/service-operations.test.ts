// @vitest-environment node

// The after-sales service operations file once failed verification with
// `SyntaxError: '}' expected` because a chunked write was cut off mid-method.
// Importing the module and exercising its pure helpers keeps a broken tail from
// reaching the build again, and pins the value-normalization contract the rest
// of the service relies on (`num` distinguishing "missing" from zero, `str`
// never rendering an object as `[object Object]`).
import { describe, expect, it } from 'vitest';

import {
  acceptanceNote,
  ATTACHMENT_EXTENSIONS,
  ServiceOperations,
} from '../../server/providers/service/operations.js';
import {
  bool,
  firstRole,
  isoDate,
  num,
  recordId,
  str,
  toDate,
  WORK_ORDER_STATUSES,
} from '../../server/providers/service/types.js';

describe('service value helpers', () => {
  it('treats missing ids as unknown rather than zero', () => {
    expect(num(undefined)).toBeNull();
    expect(num(null)).toBeNull();
    expect(num('')).toBeNull();
    expect(num('not-a-number')).toBeNull();
    expect(num(Number.NaN)).toBeNull();
    expect(num(Number.POSITIVE_INFINITY)).toBeNull();
    expect(num('0')).toBe(0);
    expect(num(0)).toBe(0);
    expect(num('12')).toBe(12);
  });

  it('never stringifies a structured value into an object placeholder', () => {
    expect(str(null)).toBe('');
    expect(str(undefined)).toBe('');
    expect(str('value')).toBe('value');
    expect(str(7)).toBe('7');
    expect(str(true)).toBe('true');
    expect(str(10n)).toBe('10');
    expect(str(new Date('2026-01-02T03:04:05.000Z'))).toBe(
      '2026-01-02T03:04:05.000Z',
    );
    expect(str({ name: 'acme' })).toBe('');
    expect(str(['a'])).toBe('');
  });

  it('reads a foreign id from a number, a numeric string or an { id } object', () => {
    expect(recordId(3)).toBe(3);
    expect(recordId('4')).toBe(4);
    expect(recordId({ id: 5 })).toBe(5);
    expect(recordId({ id: '6' })).toBe(6);
    expect(recordId({})).toBeNull();
    expect(recordId(null)).toBeNull();
  });

  it('normalizes booleans from the shapes a database may return', () => {
    expect(bool(true)).toBe(true);
    expect(bool(1)).toBe(true);
    expect(bool('1')).toBe(true);
    expect(bool(false)).toBe(false);
    expect(bool(0)).toBe(false);
    expect(bool('true')).toBe(false);
  });

  it('parses dates and serializes them to ISO, returning null when invalid', () => {
    const date = new Date('2026-01-02T03:04:05.000Z');
    expect(toDate(date)).toBe(date);
    expect(toDate('2026-01-02T03:04:05.000Z')?.getTime()).toBe(date.getTime());
    expect(toDate('nope')).toBeNull();
    expect(toDate(null)).toBeNull();
    expect(isoDate(date)).toBe('2026-01-02T03:04:05.000Z');
    expect(isoDate('nope')).toBeNull();
  });

  it('derives the effective role by precedence', () => {
    expect(firstRole(['engineer', 'manager'])).toBe('manager');
    expect(firstRole(['observer'])).toBe('observer');
    expect(firstRole([])).toBe('integrator');
  });
});

describe('service domain constants', () => {
  it('declares the closed work-order lifecycle', () => {
    expect([...WORK_ORDER_STATUSES]).toEqual([
      'pending_acceptance',
      'pending_processing',
      'processing',
      'pending_confirmation',
      'closed',
    ]);
  });

  it('limits attachments to the two documented categories', () => {
    expect(ATTACHMENT_EXTENSIONS.photo).toEqual(['png', 'jpg', 'jpeg']);
    expect(ATTACHMENT_EXTENSIONS.report).toEqual(['docx']);
  });

  it('loads the operations class the routes bind to', () => {
    expect(typeof ServiceOperations).toBe('function');
  });

  it('writes a priority-specific acceptance note from the event payload', () => {
    const input = {
      workOrderId: 7,
      orderNo: 'WO-7',
      assigneeName: 'Ada',
      customerName: 'Acme',
      equipmentName: 'Pump',
    };
    expect(acceptanceNote('urgent', input)).toContain('4 小时内响应');
    expect(acceptanceNote('urgent', input)).toContain('WO-7');
    expect(acceptanceNote('normal', input)).toContain('24 小时内响应');
    expect(acceptanceNote('normal', input)).not.toContain('加急');
  });

  it('falls back to placeholders when the event payload is incomplete', () => {
    const note = acceptanceNote('normal', { workOrderId: 12 });
    expect(note).toContain('#12');
    expect(note).toContain('负责工程师');
  });
});
