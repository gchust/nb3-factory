// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  createInspectionGenerationTarget,
  createOverdueReminderTarget,
  createScheduleDefinitions,
  INSPECTION_GENERATION_TARGET,
  OVERDUE_REMINDER_TARGET,
} from '../../server/business/scheduled-tasks.js';
import {
  MaintenanceRunLog,
  readRunToken,
  type MaintenanceRunOutcome,
  type MaintenanceRunRecorder,
} from '../../server/services/maintenance-scheduler.js';
import type { ServiceDesk } from '../../server/services/service-desk.js';

interface RecordedCall {
  targetType: string;
  runToken: string | undefined;
  outcome: MaintenanceRunOutcome;
}

function recorder(): {
  recorder: MaintenanceRunRecorder;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  return {
    calls,
    recorder: {
      record: (targetType, runToken, outcome) => {
        calls.push({ targetType, runToken, outcome });
      },
    },
  };
}

function serviceStub(overrides: Record<string, unknown>): ServiceDesk {
  return overrides as unknown as ServiceDesk;
}

const CONTEXT = { scheduleId: 'schedule-1', occurrenceId: 'occurrence-1' };

describe('maintenance Scheduler targets', () => {
  it('reports the created count a controlled run produced', async () => {
    const spy = recorder();
    const target = createInspectionGenerationTarget(
      () =>
        serviceStub({
          generateDueInspections: async () => ({ created: 2 }),
        }),
      spy.recorder,
    );

    const result = await target.start({ runToken: 'tok-1' }, CONTEXT);

    expect(result).toEqual({
      state: 'completed',
      outcome: 'succeeded',
      result: { created: 2 },
    });
    expect(spy.calls).toEqual([
      {
        targetType: INSPECTION_GENERATION_TARGET,
        runToken: 'tok-1',
        outcome: { status: 'succeeded', created: 2 },
      },
    ]);
  });

  it('reports a real failure instead of a completed run', async () => {
    const spy = recorder();
    const target = createOverdueReminderTarget(
      () =>
        serviceStub({
          runOverdueReminders: async () => {
            throw new Error('notification provider unavailable');
          },
        }),
      spy.recorder,
    );

    const result = await target.start({ runToken: 'tok-2' }, CONTEXT);

    expect(result).toEqual({
      state: 'failed',
      reason: 'notification provider unavailable',
    });
    expect(spy.calls[0]?.outcome).toEqual({
      status: 'failed',
      created: 0,
      reason: 'notification provider unavailable',
    });
  });

  it('does not correlate a cron firing that carries no request token', async () => {
    const spy = recorder();
    const target = createInspectionGenerationTarget(
      () =>
        serviceStub({
          generateDueInspections: async () => ({ created: 1 }),
        }),
      spy.recorder,
    );

    await target.start({}, CONTEXT);

    expect(spy.calls[0]?.runToken).toBeUndefined();
  });
});

describe('MaintenanceRunLog', () => {
  it('hands a result back once and forgets it', () => {
    const log = new MaintenanceRunLog();
    log.record('t', 'a', { status: 'succeeded', created: 3 });

    expect(log.take('a')).toEqual({ status: 'succeeded', created: 3 });
    expect(log.take('a')).toBeUndefined();
  });

  it('ignores runs without a token', () => {
    const log = new MaintenanceRunLog();
    log.record('t', undefined, { status: 'succeeded', created: 1 });
    expect(log.take('missing')).toBeUndefined();
  });
});

describe('readRunToken', () => {
  it('reads only a non-empty string token', () => {
    expect(readRunToken({ runToken: 'abc' })).toBe('abc');
    expect(readRunToken({ runToken: '' })).toBeUndefined();
    expect(readRunToken({ runToken: 5 })).toBeUndefined();
    expect(readRunToken(null)).toBeUndefined();
    expect(readRunToken('nope')).toBeUndefined();
  });
});

describe('schedule definitions', () => {
  it('point the application plans at the registered targets', () => {
    const types = createScheduleDefinitions().map(
      (definition) => definition.target.type,
    );
    expect(types).toContain(INSPECTION_GENERATION_TARGET);
    expect(types).toContain(OVERDUE_REMINDER_TARGET);
  });
});
