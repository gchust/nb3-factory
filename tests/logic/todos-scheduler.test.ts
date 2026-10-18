// @vitest-environment node
import type {
  ScheduleDefinition,
  ScheduleTargetType,
} from '@nocobase/app-plugin-scheduler/server';
import {
  schedulerServiceToken,
  type SchedulerService,
} from '@nocobase/app-plugin-scheduler/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it, vi } from 'vitest';

import {
  overdueScheduleKey,
  overdueTargetType,
  TodosProvider,
  todosServiceToken,
  type TodosService,
} from '../../server/providers/todos/index.js';

function createProvider(): {
  readonly definitions: ScheduleDefinition[];
  readonly targets: ScheduleTargetType[];
  readonly markOverdue: ReturnType<typeof vi.fn>;
  readonly provider: TodosProvider;
} {
  const markOverdue = vi.fn().mockResolvedValue({
    updatedCount: 2,
    todos: [],
  });
  const container = new ServiceContainer();
  container.instance(todosServiceToken, {
    markOverdue,
  } as unknown as TodosService);

  const definitions: ScheduleDefinition[] = [];
  const targets: ScheduleTargetType[] = [];
  container.instance(schedulerServiceToken, {
    registerTarget(target: ScheduleTargetType) {
      targets.push(target);
      return {
        type: target.type,
        reportCompletion: async () => {},
      };
    },
    defineSchedule(definition: ScheduleDefinition) {
      definitions.push(definition);
    },
  } as unknown as SchedulerService);

  const provider = new TodosProvider({
    container,
  } as unknown as Application);

  return { definitions, targets, markOverdue, provider };
}

describe('todos scheduler integration', () => {
  it('registers one overdue target and one enabled-checkable schedule', async () => {
    const { definitions, provider, targets } = createProvider();

    await provider.boot();

    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      type: overdueTargetType,
      title: '检查过期待办',
    });
    expect(targets[0]?.validate({})).toEqual({ valid: true });
    expect(targets[0]?.validate({ unexpected: true })).toMatchObject({
      valid: false,
    });

    expect(definitions).toEqual([
      expect.objectContaining({
        key: overdueScheduleKey,
        title: '检查过期待办',
        schedule: expect.objectContaining({
          cron: '*/10 * * * * *',
          timezone: 'Asia/Shanghai',
        }),
        target: { type: overdueTargetType, config: {} },
      }),
    ]);
  });

  it('runs the same domain check the todo list uses and records the count', async () => {
    const { markOverdue, provider, targets } = createProvider();
    await provider.boot();

    const result = await targets[0]?.start(
      {},
      { scheduleId: 'schedule-1', occurrenceId: 'occurrence-1' },
    );

    expect(markOverdue).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      state: 'completed',
      outcome: 'succeeded',
      result: { updatedCount: 2 },
    });
  });
});
