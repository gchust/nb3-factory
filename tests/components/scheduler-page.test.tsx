import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import SchedulerPage from '../../client/pages/scheduler/index.js';

const { api, toaster } = vi.hoisted(() => ({
  api: { request: vi.fn() },
  toaster: { show: vi.fn(), close: vi.fn() },
}));

vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
  useToaster: () => toaster,
}));

const runtime = await createTestI18nRuntime({
  application: {
    namespace: '@nocobase/app-template-default',
    resources: enUS,
  },
});

function I18n({ children }: { readonly children: ReactNode }): ReactElement {
  return <TestI18nProvider runtime={runtime}>{children}</TestI18nProvider>;
}

const schedule = {
  id: 'schedule-1',
  key: 'todos.check-overdue',
  title: '检查过期待办',
  description: '将已过截止时间且未完成的待办标记为已过期。',
  cron: '*/10 * * * * *',
  timezone: 'Asia/Shanghai',
  enabled: true,
  scheduleStatus: 'active' as const,
  targetState: 'ready' as const,
  runCount: 2,
  completedCount: 2,
  nextRunAt: '2026-10-18T21:40:00.000Z',
};

const occurrence = {
  id: 'occurrence-1',
  status: 'succeeded',
  startedAt: '2026-10-18T21:39:10.002Z',
  finishedAt: '2026-10-18T21:39:10.018Z',
  resultSummary: { updatedCount: 1 },
};

function renderPage() {
  render(<SchedulerPage />, { wrapper: I18n });
}

describe('scheduler page', () => {
  beforeEach(() => {
    api.request.mockReset();
    toaster.show.mockReset();
  });

  it('lists the registered plan with its state and next run', async () => {
    api.request.mockResolvedValue({ data: [schedule] });

    renderPage();

    expect(await screen.findByText(schedule.title)).toBeInTheDocument();
    expect(screen.getByText(schedule.cron)).toBeInTheDocument();
    expect(screen.getByText(schedule.timezone)).toBeInTheDocument();
    expect(screen.getByText(enUS.scheduler.status.enabled)).toBeInTheDocument();
    expect(screen.getByText('2 runs · 2 succeeded')).toBeInTheDocument();
  });

  it('shows execution records fetched from the scheduler', async () => {
    api.request.mockImplementation(({ path }: { path: string }) =>
      Promise.resolve(
        path.endsWith('/occurrences')
          ? { data: [occurrence] }
          : { data: [schedule] },
      ),
    );
    renderPage();

    await screen.findByText(schedule.title);
    await userEvent.click(
      screen.getByRole('button', { name: enUS.scheduler.records.action }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Succeeded')).toBeInTheDocument();
    expect(
      within(dialog).getByText(JSON.stringify({ updatedCount: 1 })),
    ).toBeInTheDocument();
    expect(api.request).toHaveBeenCalledWith({
      path: `/scheduler/schedules/${schedule.id}/occurrences`,
      query: { pageSize: 20 },
    });
  });

  it('enables and disables the plan through the scheduler API', async () => {
    api.request.mockImplementation(
      ({ path, method }: { path: string; method?: string }) => {
        if (path === '/scheduler/schedules') {
          return Promise.resolve({ data: [schedule] });
        }
        if (method === 'POST' && path.endsWith('/disable')) {
          return Promise.resolve({
            data: { ...schedule, enabled: false, scheduleStatus: 'paused' },
          });
        }
        return Promise.reject(new Error(`Unexpected request: ${path}`));
      },
    );
    renderPage();

    await screen.findByText(schedule.title);
    await userEvent.click(
      screen.getByRole('button', { name: enUS.scheduler.actions.disable }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(enUS.scheduler.status.disabled),
      ).toBeInTheDocument();
    });
    expect(api.request).toHaveBeenCalledWith({
      method: 'POST',
      path: `/scheduler/schedules/${schedule.id}/disable`,
    });
  });
});
