import { describe, expect, it } from 'vitest';

import {
  HrError,
  computeLeaveDays,
  evaluateLeaveRequest,
  isIsoDate,
  parseHours,
} from '../../server/providers/hr.js';

describe('HR leave rules', () => {
  it('counts natural calendar days inclusively', () => {
    expect(computeLeaveDays('2026-09-01', '2026-09-03')).toBe(3);
    expect(computeLeaveDays('2026-09-01', '2026-09-01')).toBe(1);
    expect(computeLeaveDays('2026-09-28', '2026-10-01')).toBe(4);
  });

  it('validates ISO dates', () => {
    expect(isIsoDate('2026-09-01')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('01/09/2026')).toBe(false);
  });

  it('rejects a start date later than the end date', () => {
    expect(() =>
      evaluateLeaveRequest({
        type: 'annual',
        startDate: '2026-09-10',
        endDate: '2026-09-08',
        annualLeaveDays: 10,
        usedAnnualLeaveDays: 0,
      }),
    ).toThrowError(expect.objectContaining({ code: 'HR_INVALID_DATE_RANGE' }));
  });

  it('rejects annual leave beyond the remaining balance', () => {
    try {
      evaluateLeaveRequest({
        type: 'annual',
        startDate: '2026-09-01',
        endDate: '2026-09-10',
        annualLeaveDays: 5,
        usedAnnualLeaveDays: 0,
      });
      throw new Error('expected the annual rule to reject the request');
    } catch (error) {
      expect(error).toBeInstanceOf(HrError);
      expect((error as HrError).code).toBe('HR_ANNUAL_LEAVE_EXCEEDED');
      expect((error as HrError).details.remainingAnnualLeaveDays).toBe(5);
    }
  });

  it('allows annual leave within the remaining balance', () => {
    const result = evaluateLeaveRequest({
      type: 'annual',
      startDate: '2026-09-01',
      endDate: '2026-09-03',
      annualLeaveDays: 5,
      usedAnnualLeaveDays: 0,
    });
    expect(result.days).toBe(3);
    expect(result.remainingAnnualLeaveDays).toBe(5);
  });

  it('does not apply the annual balance to sick or personal leave', () => {
    const result = evaluateLeaveRequest({
      type: 'sick',
      startDate: '2026-09-01',
      endDate: '2026-09-10',
      annualLeaveDays: 0,
      usedAnnualLeaveDays: 0,
    });
    expect(result.days).toBe(10);
  });
});

describe('overtime hours', () => {
  it('accepts positive hours and rounds to two decimals', () => {
    expect(parseHours(2.5)).toBe(2.5);
    expect(parseHours('3')).toBe(3);
    expect(parseHours(1.239)).toBe(1.24);
  });

  it('rejects non-positive and excessive hours', () => {
    expect(() => parseHours(0)).toThrowError(
      expect.objectContaining({ code: 'HR_INVALID_INPUT' }),
    );
    expect(() => parseHours(25)).toThrowError(
      expect.objectContaining({ code: 'HR_INVALID_INPUT' }),
    );
  });
});
