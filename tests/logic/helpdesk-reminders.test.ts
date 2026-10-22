import { describe, expect, it, vi } from 'vitest';
import { LifecycleError } from '@nocobase/lifecycle';
import type { DatabaseManager } from '@nocobase/db';

import { fireOverdueReminders } from '../../server/helpdesk/reminders.js';

describe('helpdesk overdue reminders', () => {
  it('fires remind with the saved interval and a changed-before expectation', async () => {
    const findIdleRecords = vi
      .fn()
      .mockResolvedValue([
        { id: 'ticket-1', statusChangedAt: '2026-10-21T10:00:00.000Z' },
      ]);
    const fire = vi.fn().mockResolvedValue({});
    const result = await fireOverdueReminders({
      database: {} as DatabaseManager,
      runtime: { fire },
      store: { findIdleRecords } as never,
      now: () => new Date('2026-10-21T12:00:00.000Z'),
      reminderHours: 12,
    });

    expect(result).toEqual({ candidates: 1, fired: 1 });
    expect(findIdleRecords).toHaveBeenCalledWith('helpdeskTickets', {
      stateField: 'status',
      states: ['processing'],
      changedAtField: 'statusChangedAt',
      changedBefore: '2026-10-21T00:00:00.000Z',
      limit: 100,
    });
    expect(fire).toHaveBeenCalledWith('helpdeskTicket', 'ticket-1', 'remind', {
      actor: { id: 'system', system: true },
      expect: { changedBefore: '2026-10-21T00:00:00.000Z' },
    });
  });

  it('keeps sweeping when a record moved on and surfaces a real failure', async () => {
    const findIdleRecords = vi
      .fn()
      .mockResolvedValue([{ id: 'ticket-1' }, { id: 'ticket-2' }]);
    const fire = vi
      .fn()
      .mockRejectedValueOnce(new LifecycleError('CONFLICT', 'moved'))
      .mockResolvedValueOnce({});
    await expect(
      fireOverdueReminders({
        database: {} as DatabaseManager,
        runtime: { fire },
        store: { findIdleRecords } as never,
        now: () => new Date('2026-10-21T12:00:00.000Z'),
        reminderHours: 12,
      }),
    ).resolves.toEqual({ candidates: 2, fired: 1 });

    fire.mockReset();
    fire.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(
      fireOverdueReminders({
        database: {} as DatabaseManager,
        runtime: { fire },
        store: { findIdleRecords } as never,
        now: () => new Date('2026-10-21T12:00:00.000Z'),
        reminderHours: 12,
      }),
    ).rejects.toThrow('database unavailable');
  });
});
