import { describe, expect, it } from 'vitest';

import {
  assertMemberTaskUpdate,
  assertTaskStatusChangeAllowed,
  classifyDeliveryRole,
  completionRate,
  DELIVERY_DUPLICATE_TIMESHEET,
  DeliveryRuleError,
  isTaskOverdue,
  parseDate,
  parseHours,
  taskTimeliness,
} from '../../server/providers/delivery-rules';

describe('hours rules', () => {
  it('accepts half-hour multiples up to 24', () => {
    expect(parseHours(0.5)).toBe(0.5);
    expect(parseHours(2)).toBe(2);
    expect(parseHours('7.5')).toBe(7.5);
    expect(parseHours(24)).toBe(24);
  });

  it('rejects zero, negative, non-multiples and more than 24', () => {
    for (const value of [0, -2, 0.3, 25, 24.5]) {
      expect(() => parseHours(value)).toThrow();
    }
    try {
      parseHours(25);
    } catch (error) {
      expect(error).toBeInstanceOf(DeliveryRuleError);
      expect((error as DeliveryRuleError).status).toBe(400);
    }
  });
});

describe('task timeliness', () => {
  const now = new Date('2026-09-20T10:00:00.000Z');

  it('marks a completed task past its planned date as overdue', () => {
    const task = {
      status: 'completed',
      plannedDate: '2026-09-10T00:00:00.000Z',
      actualDate: '2026-09-15T00:00:00.000Z',
    };
    expect(taskTimeliness(task, now)).toBe('overdue');
    expect(isTaskOverdue(task, now)).toBe(true);
  });

  it('marks a completed task within its planned date as on time', () => {
    const task = {
      status: 'completed',
      plannedDate: '2026-09-30T00:00:00.000Z',
      actualDate: '2026-09-15T00:00:00.000Z',
    };
    expect(taskTimeliness(task, now)).toBe('on_time');
    expect(isTaskOverdue(task, now)).toBe(false);
  });

  it('leaves a future unfinished task without a verdict', () => {
    expect(
      taskTimeliness(
        { status: 'in_progress', plannedDate: '2026-09-30T00:00:00.000Z' },
        now,
      ),
    ).toBeNull();
  });

  it('marks an unfinished task past its planned date as overdue', () => {
    expect(
      taskTimeliness(
        { status: 'in_progress', plannedDate: '2026-09-01T00:00:00.000Z' },
        now,
      ),
    ).toBe('overdue');
  });
});

describe('completed task status lock', () => {
  it('rejects changing a completed task status', () => {
    try {
      assertTaskStatusChangeAllowed('completed', 'in_progress');
      throw new Error('expected a rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(DeliveryRuleError);
      expect((error as DeliveryRuleError).code).toBe('DELIVERY_TASK_LOCKED');
      expect((error as DeliveryRuleError).status).toBe(409);
    }
  });

  it('allows editing other fields or resending the same status', () => {
    expect(() =>
      assertTaskStatusChangeAllowed('completed', undefined),
    ).not.toThrow();
    expect(() =>
      assertTaskStatusChangeAllowed('completed', 'completed'),
    ).not.toThrow();
    expect(() =>
      assertTaskStatusChangeAllowed('todo', 'in_progress'),
    ).not.toThrow();
  });
});

describe('member task updates', () => {
  it('lets a member update the status of their own task', () => {
    expect(() =>
      assertMemberTaskUpdate('member', 'u1', { assigneeId: 'u1' }, ['status']),
    ).not.toThrow();
  });

  it('rejects a member editing any other field', () => {
    expect(() =>
      assertMemberTaskUpdate('member', 'u1', { assigneeId: 'u1' }, [
        'status',
        'name',
      ]),
    ).toThrow(/only update their own task status/i);
  });

  it('rejects a member updating a task assigned to someone else', () => {
    expect(() =>
      assertMemberTaskUpdate('member', 'u1', { assigneeId: 'u2' }, ['status']),
    ).toThrow(/their own tasks/i);
  });

  it('lets a manager update any field', () => {
    expect(() =>
      assertMemberTaskUpdate('manager', 'm1', { assigneeId: 'u2' }, ['name']),
    ).not.toThrow();
  });
});

describe('role classification', () => {
  it('prefers the administrator role', () => {
    expect(
      classifyDeliveryRole(['project-member', 'system-administrator']),
    ).toBe('administrator');
    expect(classifyDeliveryRole(['project-member', 'project-manager'])).toBe(
      'manager',
    );
    expect(classifyDeliveryRole(['project-member'])).toBe('member');
    expect(classifyDeliveryRole([])).toBe('member');
  });
});

describe('date and rate helpers', () => {
  it('parses a date-only string as UTC midnight', () => {
    const parsed = parseDate('2026-09-13', 'date');
    expect(parsed?.toISOString()).toBe('2026-09-13T00:00:00.000Z');
  });

  it('rejects an invalid date', () => {
    expect(() => parseDate('not-a-date', 'date')).toThrow();
  });

  it('computes a completion rate and guards division by zero', () => {
    expect(completionRate(1, 2)).toBe(0.5);
    expect(completionRate(0, 0)).toBe(0);
  });
});

describe('duplicate code is stable', () => {
  it('exposes the duplicate timesheet code', () => {
    expect(DELIVERY_DUPLICATE_TIMESHEET).toBe('DELIVERY_DUPLICATE_TIMESHEET');
  });
});
