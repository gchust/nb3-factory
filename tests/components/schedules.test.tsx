import { answerApi, renderWithApp } from '@nocobase/app-testing/client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import SchedulesPage from '../../client/pages/settings/schedules.js';
import enUS from '../../client/locales/en-US.js';
import zhCN from '../../client/locales/zh-CN.js';

const namespace = '@nocobase/schedules-test';
const namespaces = {
  [namespace]: {
    'en-US': async () => ({ default: enUS }),
    'zh-CN': async () => ({ default: zhCN }),
  },
};

const schedule = {
  id: 'schedule-1',
  appName: 'app-template-default',
  key: 'todos.mark-overdue',
  title: 'Mark overdue todos as expired',
  cron: '*/5 * * * *',
  timezone: 'UTC',
  enabled: true,
  targetType: 'app.todo.overdue',
  lifecycleState: 'active' as const,
  definitionHash: 'hash',
  runCount: 4,
  completedCount: 4,
  nextRunAt: new Date(Date.now() + 300_000).toISOString(),
  lastRunAt: new Date(Date.now() - 300_000).toISOString(),
  scheduleStatus: 'active' as const,
  targetState: 'ready' as const,
  targetSummary: {
    targetLabel: 'Mark overdue todos as expired',
    state: 'ready' as const,
  },
};

describe('schedules page', () => {
  it('shows a schedule, pages through its execution history and pauses it', async () => {
    const user = userEvent.setup();
    let enabled = true;
    const calls = vi.fn(
      ({
        method,
        path,
        query,
      }: {
        method: string;
        path: string;
        query?: Record<string, string>;
      }) => {
        if (method === 'GET' && path === 'scheduler/schedules') {
          return {
            data: [
              {
                ...schedule,
                enabled,
                scheduleStatus: enabled ? 'active' : 'paused',
              },
            ],
            meta: { page: 1, pageSize: 20, total: 1 },
          };
        }
        if (
          method === 'GET' &&
          path === 'scheduler/schedules/schedule-1/occurrences'
        ) {
          if (query?.pageToken) {
            return {
              data: [
                {
                  id: 'occurrence-2',
                  scheduleId: 'schedule-1',
                  status: 'succeeded',
                  executionCount: 1,
                  startedAt: new Date(Date.now() - 600_000).toISOString(),
                  finishedAt: new Date(Date.now() - 599_000).toISOString(),
                  resultSummary: { expiredCount: 1 },
                  target: { type: 'app.todo.overdue' },
                },
              ],
              meta: {},
            };
          }
          return {
            data: [
              {
                id: 'occurrence-1',
                scheduleId: 'schedule-1',
                status: 'succeeded',
                executionCount: 1,
                startedAt: new Date(Date.now() - 300_000).toISOString(),
                finishedAt: new Date(Date.now() - 299_000).toISOString(),
                resultSummary: { expiredCount: 2 },
                target: { type: 'app.todo.overdue' },
              },
            ],
            meta: { nextPageToken: 'occurrences:1' },
          };
        }
        if (
          method === 'POST' &&
          path === 'scheduler/schedules/schedule-1/disable'
        ) {
          enabled = false;
          return {
            data: {
              ...schedule,
              enabled: false,
              scheduleStatus: 'paused',
              nextRunAt: undefined,
            },
          };
        }
        throw new Error(`Unanswered ${method} ${path}`);
      },
    );
    await renderWithApp(<SchedulesPage />, {
      namespace,
      namespaces,
      fetch: answerApi(calls),
    });

    expect(
      (await screen.findAllByText('Mark overdue todos as expired'))[0],
    ).toBeVisible();
    expect(screen.getByText(enUS.schedulerAdmin.statusActive)).toBeVisible();
    expect(screen.getByText('*/5 * * * *')).toBeVisible();

    await user.click(
      screen.getByRole('button', { name: enUS.schedulerAdmin.history }),
    );
    expect(await screen.findByText('{"expiredCount":2}')).toBeVisible();
    expect(
      screen.getByText(enUS.schedulerAdmin.occurrenceStatuses.succeeded),
    ).toBeVisible();

    await user.click(
      screen.getByRole('button', { name: enUS.schedulerAdmin.next }),
    );
    expect(await screen.findByText('{"expiredCount":1}')).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: enUS.schedulerAdmin.historyFirst }),
    );
    expect(await screen.findByText('{"expiredCount":2}')).toBeVisible();
    await user.click(
      screen.getAllByRole('button', {
        name: enUS.schedulerAdmin.historyClose,
      })[0]!,
    );
    await waitFor(() =>
      expect(
        screen.queryByText(enUS.schedulerAdmin.historyStatus),
      ).not.toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole('button', { name: enUS.schedulerAdmin.disable }),
    );
    await waitFor(() =>
      expect(calls).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: 'scheduler/schedules/schedule-1/disable',
        }),
      ),
    );
    expect(
      await screen.findByText(enUS.schedulerAdmin.statusPaused),
    ).toBeVisible();
  });
});
