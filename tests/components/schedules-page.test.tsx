// The Scheduler management page: the plan's name and enabled state, and the way into its execution records. The
// schedule itself is registered in server code; this page only reads and switches it.
import { ApiClientError } from '@nocobase/app-client';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, type ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import SchedulesPage from '../../client/pages/schedules/index.js';
import ScheduleOccurrencesPage from '../../client/pages/schedules/occurrences.js';
import type {
  Occurrence,
  Schedule,
} from '../../client/pages/schedules/types.js';

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
  application: { namespace: 'nb3-factory', resources: enUS },
});

function I18n({ children }: { readonly children: ReactNode }): ReactElement {
  return <TestI18nProvider runtime={runtime}>{children}</TestI18nProvider>;
}

const schedule: Schedule = {
  id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  appName: 'main',
  key: 'todos.expire-due',
  title: '检查过期待办',
  description: 'Mark overdue todos as expired.',
  cron: '* * * * *',
  timezone: 'UTC',
  enabled: true,
  targetType: 'app.expire-todos',
  lifecycleState: 'active',
  definitionHash: 'hash',
  runCount: 2,
  completedCount: 2,
  nextRunAt: '2026-10-17T21:12:00.000Z',
  lastRunAt: '2026-10-17T21:11:00.000Z',
  scheduleStatus: 'active',
  targetState: 'ready',
  targetSummary: { targetLabel: 'Expire overdue todos' },
};

const occurrence: Occurrence = {
  id: `${schedule.id}:1`,
  scheduleId: schedule.id,
  status: 'succeeded',
  executionCount: 1,
  startedAt: '2026-10-17T21:11:00.002Z',
  finishedAt: '2026-10-17T21:11:00.011Z',
  resultSummary: { expiredCount: 1 },
  target: { type: 'app.expire-todos' },
};

function requestPath(request: unknown): string {
  return (request as { path: string }).path;
}

function serve(input: {
  readonly schedules?: readonly Schedule[];
  readonly schedule?: Schedule;
  readonly occurrences?: readonly Occurrence[];
}) {
  api.request.mockImplementation((request: unknown) => {
    const path = requestPath(request);
    if (path === 'scheduler/schedules') {
      return Promise.resolve({
        data: input.schedules ?? [schedule],
        meta: { page: 1, pageSize: 100, total: 1 },
      });
    }
    if (path.endsWith('/occurrences')) {
      return Promise.resolve({
        data: input.occurrences ?? [occurrence],
        meta: {},
      });
    }
    if (path.endsWith('/enable') || path.endsWith('/disable')) {
      const enabled = path.endsWith('/enable');
      return Promise.resolve({
        data: {
          ...(input.schedule ?? schedule),
          enabled,
          scheduleStatus: enabled ? 'active' : 'paused',
        },
      });
    }
    return Promise.resolve({ data: input.schedule ?? schedule });
  });
}

function renderPage(url = '/schedules') {
  const router = createMemoryRouter(
    [
      {
        path: '/schedules',
        element: <SchedulesPage />,
        children: [
          {
            path: ':scheduleId/occurrences',
            element: <ScheduleOccurrencesPage />,
          },
        ],
      },
    ],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />, { wrapper: I18n });
  return router;
}

describe('schedules page', () => {
  beforeEach(() => {
    api.request.mockReset();
    toaster.show.mockReset();
  });

  it('shows the plan name, its enabled state and when it runs next', async () => {
    serve({});
    renderPage();

    expect(await screen.findByText(schedule.title)).toBeInTheDocument();
    expect(screen.getByText(enUS.schedules.status.active)).toBeInTheDocument();
    expect(screen.getByText('* * * * * · UTC')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: enUS.schedules.occurrences.open }),
    ).toHaveAttribute('href', `/schedules/${schedule.id}/occurrences`);
  });

  it('opens the execution records of the schedule, with what each run did', async () => {
    serve({});
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole('link', {
        name: enUS.schedules.occurrences.open,
      }),
    );

    const drawer = await screen.findByRole('dialog');
    expect(
      within(drawer).getByText(enUS.schedules.occurrences.title),
    ).toBeInTheDocument();
    expect(await within(drawer).findByText(schedule.title)).toBeInTheDocument();
    await waitFor(() => {
      expect(
        within(drawer).getByText(
          enUS.schedules.occurrence.expiredCount_one.replace('{{count}}', '1'),
        ),
      ).toBeInTheDocument();
    });
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `scheduler/schedules/${schedule.id}/occurrences`,
      }),
    );
  });

  it('switches the schedule off after a confirmation and shows the paused state', async () => {
    serve({});
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole('button', { name: enUS.schedules.disable }),
    );
    const confirm = await screen.findByRole('alertdialog');
    expect(
      within(confirm).getByText(
        enUS.schedules.disableConfirm.title.replace(
          '{{title}}',
          schedule.title,
        ),
      ),
    ).toBeInTheDocument();
    await user.click(
      within(confirm).getByRole('button', {
        name: enUS.schedules.disableConfirm.confirm,
      }),
    );

    await waitFor(() => {
      expect(api.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: `scheduler/schedules/${schedule.id}/disable`,
          method: 'POST',
        }),
      );
    });
    expect(await screen.findByText(enUS.schedules.status.paused)).toBeVisible();
    expect(toaster.show).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
        title: enUS.schedules.disabled.replace('{{title}}', schedule.title),
      }),
    );
  });

  it('explains a 403 without offering a retry', async () => {
    api.request.mockRejectedValue(
      new ApiClientError('Forbidden', {
        status: 403,
        method: 'GET',
        url: '/api/scheduler/schedules',
      }),
    );
    renderPage();

    expect(
      await screen.findByText(enUS.schedules.error.forbidden),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: enUS.schedules.error.retry }),
    ).not.toBeInTheDocument();
  });
});
