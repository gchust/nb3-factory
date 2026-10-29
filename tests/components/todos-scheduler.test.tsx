import { answerApi, renderWithApp } from '@nocobase/app-testing/client';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import SchedulerDetailPage from '../../client/pages/scheduler/detail.js';
import SchedulerPage from '../../client/pages/scheduler/index.js';
import type { Schedule } from '../../client/pages/scheduler/types.js';
import TodosPage from '../../client/pages/todos/index.js';

const namespace = '@nocobase/todos-test';
const namespaces = {
  [namespace]: {
    'en-US': async () => ({ default: enUS }),
    'zh-CN': async () => ({ default: enUS }),
  },
};

const todoRows = [
  {
    id: 'todo-overdue-incomplete',
    title: 'Prepare the production schedule',
    dueAt: '2020-01-01T08:00:00.000Z',
    completed: false,
    expired: false,
  },
  {
    id: 'todo-overdue-completed',
    title: 'Confirm the raw material stock',
    dueAt: '2020-02-01T08:00:00.000Z',
    completed: true,
    expired: false,
  },
  {
    id: 'todo-future',
    title: 'Inspect the new assembly line',
    dueAt: '2099-01-01T08:00:00.000Z',
    completed: false,
    expired: false,
  },
];

const schedule: Schedule = {
  id: 'schedule-1',
  key: 'app.check-overdue-todos',
  title: 'Check overdue todos',
  description: 'Marks past-due todos as expired.',
  cron: '*/30 * * * * *',
  timezone: 'UTC',
  enabled: true,
  targetType: 'app.check-overdue-todos',
  lifecycleState: 'active',
  runCount: 2,
  completedCount: 2,
  nextRunAt: '2026-01-01T00:00:30.000Z',
  lastRunAt: '2026-01-01T00:00:00.000Z',
  scheduleStatus: 'active',
  targetState: 'ready',
  targetSummary: { targetLabel: 'Check overdue todos', state: 'ready' },
};

describe('todo and scheduler pages', () => {
  it('shows each todo with its due time, completion and derived status', async () => {
    await renderWithApp(<TodosPage />, {
      namespace,
      namespaces,
      fetch: answerApi(({ path }) => {
        if (path === 'todos') return { data: todoRows };
        throw new Error(`Unexpected request: ${path}`);
      }),
    });

    expect(
      await screen.findByText('Prepare the production schedule'),
    ).toBeVisible();
    expect(screen.getByText('Confirm the raw material stock')).toBeVisible();
    expect(screen.getByText('Inspect the new assembly line')).toBeVisible();
    expect(screen.getByText('Overdue')).toBeVisible();
    expect(screen.getAllByText('Completed').length).toBeGreaterThan(1);
    expect(screen.getByText('Pending')).toBeVisible();
  });

  it('shows the overdue schedule under its friendly name and keeps it after toggling', async () => {
    const user = userEvent.setup();
    const calls = vi.fn(
      ({ path, method }: { path: string; method: string }) => {
        if (path === 'scheduler/schedules' && method === 'GET')
          return {
            data: [schedule],
            meta: { page: 1, pageSize: 100, total: 1 },
          };
        if (path === 'scheduler/schedules/schedule-1/disable')
          return { data: { ...schedule, enabled: false } };
        throw new Error(`Unexpected request: ${method} ${path}`);
      },
    );

    await renderWithApp(<SchedulerPage />, {
      namespace,
      namespaces,
      fetch: answerApi(calls),
    });

    expect(await screen.findByText('Check overdue todos')).toBeVisible();
    expect(
      screen.getByText(
        'Marks past-due todos as expired without changing completed todos.',
      ),
    ).toBeVisible();
    expect(screen.getByText('2 of 2 succeeded')).toBeVisible();

    await user.click(
      screen.getByRole('switch', { name: 'Disable Check overdue todos' }),
    );
    expect(
      await screen.findByRole('switch', {
        name: 'Enable Check overdue todos',
      }),
    ).toBeVisible();
    expect(calls).toHaveBeenCalledWith({
      method: 'POST',
      path: 'scheduler/schedules/schedule-1/disable',
    });
  });

  it('opens the execution history over the schedule list by its own route', async () => {
    await renderWithApp(
      <Routes>
        <Route path='/settings/scheduler' element={<SchedulerPage />}>
          <Route path=':scheduleId' element={<SchedulerDetailPage />} />
        </Route>
      </Routes>,
      {
        route: '/settings/scheduler/schedule-1',
        namespace,
        namespaces,
        fetch: answerApi(({ path }) => {
          if (path === 'scheduler/schedules')
            return {
              data: [schedule],
              meta: { page: 1, pageSize: 100, total: 1 },
            };
          if (path === 'scheduler/schedules/schedule-1')
            return { data: schedule };
          if (path === 'scheduler/schedules/schedule-1/occurrences')
            return {
              data: [
                {
                  id: 'occurrence-1',
                  scheduleId: schedule.id,
                  status: 'succeeded',
                  executionCount: 1,
                  startedAt: '2026-01-01T00:00:00.000Z',
                  finishedAt: '2026-01-01T00:00:01.000Z',
                  resultSummary: {
                    marked: 1,
                    checkedAt: '2026-01-01T00:00:00.000Z',
                  },
                  target: {
                    type: 'app.check-overdue-todos',
                    reference: {
                      type: 'app.check-overdue-todos',
                      id: 'todo-overdue-incomplete',
                    },
                  },
                },
              ],
              meta: {},
            };
          throw new Error(`Unexpected request: ${path}`);
        }),
      },
    );

    expect(await screen.findByText('Execution history')).toBeVisible();
    expect(screen.getByText('*/30 * * * * *')).toBeVisible();
    expect(screen.getByText('app.check-overdue-todos')).toBeVisible();
    expect(await screen.findByText('Succeeded')).toBeVisible();
    expect(
      screen.getByText('{"marked":1,"checkedAt":"2026-01-01T00:00:00.000Z"}'),
    ).toBeVisible();
    // The list stays mounted underneath, so the history can be dismissed back to it.
    expect(
      screen.getByRole('switch', { name: 'Disable Check overdue todos' }),
    ).toBeVisible();
  });
});
