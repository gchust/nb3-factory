import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { ApiClientError } from '@nocobase/app-client';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import SchedulesPage from '../../client/pages/schedules/index.js';
import type {
  ScheduleListItem,
  ScheduleOccurrence,
} from '../../client/pages/schedules/types.js';

const { request, toaster } = vi.hoisted(() => ({
  request: vi.fn(),
  toaster: { show: vi.fn(), close: vi.fn() },
}));

vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => ({ request }),
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

const SCHEDULE: ScheduleListItem = {
  id: 'schedule-1',
  key: 'todos.check-expired',
  title: 'Check expired todos',
  cron: '* * * * *',
  timezone: 'Asia/Shanghai',
  enabled: true,
  targetType: 'app.todo-expiry',
  lifecycleState: 'active',
  runCount: 4,
  completedCount: 4,
  nextRunAt: '2026-01-01T00:01:00.000Z',
  scheduleStatus: 'active',
  targetState: 'ready',
  targetSummary: { targetLabel: 'Overdue todo marking' },
};

const OCCURRENCE: ScheduleOccurrence = {
  id: 'occurrence-1',
  scheduleId: 'schedule-1',
  status: 'succeeded',
  executionCount: 1,
  startedAt: '2026-01-01T00:00:00.000Z',
  finishedAt: '2026-01-01T00:00:01.000Z',
  resultSummary: { expiredCount: 1 },
  target: { type: 'app.todo-expiry' },
};

/** Answers each request by path, the way the one Scheduler API does. */
function respond(): void {
  request.mockImplementation((options: { path: string }) => {
    if (options.path === '/scheduler/schedules') {
      return Promise.resolve({
        data: [SCHEDULE],
        meta: { page: 1, pageSize: 100, total: 1 },
      });
    }
    if (options.path.endsWith('/occurrences')) {
      return Promise.resolve({ data: [OCCURRENCE], meta: {} });
    }
    if (options.path.endsWith('/disable')) {
      return Promise.resolve({ data: { ...SCHEDULE, enabled: false } });
    }
    return Promise.reject(new Error(`Unexpected path ${options.path}`));
  });
}

describe('schedules page', () => {
  beforeEach(() => {
    request.mockReset();
    toaster.show.mockReset();
  });

  it('shows the expiry schedule and its execution record', async () => {
    respond();
    render(<SchedulesPage />, { wrapper: I18n });

    expect(await screen.findByText('Check expired todos')).toBeVisible();
    expect(screen.getByText('todos.check-expired')).toBeVisible();
    expect(screen.getByText('* * * * *')).toBeVisible();
    expect(screen.getByText('Asia/Shanghai')).toBeVisible();
    expect(screen.getByText(enUS.schedules.status.enabled)).toBeVisible();
    expect(
      screen.getByText(
        enUS.schedules.runs.value
          .replace('{{runCount}}', '4')
          .replace('{{completedCount}}', '4'),
      ),
    ).toBeVisible();

    // The default selection is this application's own schedule, and its history is read from the Scheduler.
    expect(
      await screen.findByText(enUS.schedules.occurrenceStatus.succeeded),
    ).toBeVisible();
    expect(
      screen.getByText(
        enUS.schedules.occurrences.expiredCount.replace('{{count}}', '1'),
      ),
    ).toBeVisible();
  });

  it('switches the schedule off through the Scheduler API', async () => {
    respond();
    render(<SchedulesPage />, { wrapper: I18n });

    const row = (await screen.findByText('Check expired todos')).closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(
      within(row!).getByRole('button', { name: enUS.schedules.action.disable }),
    );

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/scheduler/schedules/schedule-1/disable',
          method: 'POST',
        }),
      ),
    );
    expect(toaster.show).toHaveBeenCalledWith({
      type: 'success',
      title: enUS.schedules.toast.disabled.replace(
        '{{title}}',
        'Check expired todos',
      ),
    });
  });

  it('reports when the account may not read the Scheduler', async () => {
    request.mockRejectedValue(
      new ApiClientError('access required', {
        status: 403,
        reason: 'SCHEDULE_ACCESS_REQUIRED',
        domain: 'scheduler',
        method: 'GET',
        url: '/scheduler/schedules',
      }),
    );
    render(<SchedulesPage />, { wrapper: I18n });

    expect(
      await screen.findByText(enUS.schedules.error.deniedTitle),
    ).toBeVisible();
  });
});
