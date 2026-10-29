// Page tests for the two pages this application adds. They render the real components with the real i18n runtime and
// a mocked API client, so the assertions are about what a user sees: the seeded list, the completed toggle, and the
// schedule's execution results.
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import SchedulesPage from '../../client/pages/schedules/index.js';
import TodosPage from '../../client/pages/todos/index.js';

// `vi.mock` factories run before this file's imports, so the API client is created here.
const { api } = vi.hoisted(() => ({ api: { request: vi.fn() } }));

vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
}));

// The real runtime, strict: a missing key fails the test instead of rendering as the key.
const runtime = await createTestI18nRuntime({
  application: {
    namespace: '@nocobase/app-template-default',
    resources: enUS,
  },
});

function I18n({ children }: { readonly children: ReactNode }): ReactElement {
  return <TestI18nProvider runtime={runtime}>{children}</TestI18nProvider>;
}

function renderPage(page: ReactElement): void {
  render(page, { wrapper: I18n });
}

interface Todo {
  readonly id: number;
  readonly title: string;
  readonly dueAt: string;
  readonly completed: boolean;
  readonly expired: boolean;
}

const todos: readonly Todo[] = [
  {
    id: 1,
    title: 'Send the quarterly report',
    dueAt: '2026-01-01T00:00:00Z',
    completed: false,
    expired: true,
  },
  {
    id: 2,
    title: 'Renew the domain',
    dueAt: '2030-01-01T00:00:00Z',
    completed: false,
    expired: false,
  },
  {
    id: 3,
    title: 'Book the venue',
    dueAt: '2025-12-01T00:00:00Z',
    completed: true,
    expired: false,
  },
];

describe('TodosPage', () => {
  beforeEach(() => {
    api.request.mockReset();
  });

  it('lists every todo and marks the overdue one', async () => {
    api.request.mockResolvedValue({ data: todos });
    renderPage(<TodosPage />);

    expect(screen.getByRole('status')).toHaveTextContent(
      enUS['status.loading'],
    );
    expect(await screen.findByText('Send the quarterly report')).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText(enUS.todos.status.expired)).toBeVisible();
    expect(screen.getByText(enUS.todos.status.completed)).toBeVisible();
    await expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'todos' }),
    );
  });

  it('completes a todo through the API and shows the new state', async () => {
    api.request.mockImplementation(({ path }: { readonly path: string }) =>
      path === 'todos/1'
        ? Promise.resolve({
            data: { ...todos[0], completed: true },
          })
        : Promise.resolve({ data: todos }),
    );
    renderPage(<TodosPage />);

    const row = (await screen.findByText('Send the quarterly report')).closest(
      'li',
    );
    expect(row).not.toBeNull();
    await userEvent.click(
      within(row!).getByRole('button', {
        name: enUS.todos.action.markCompleted,
      }),
    );

    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'todos/1',
          method: 'PATCH',
          json: { completed: true },
        }),
      ),
    );
    expect(
      await within(row!).findByRole('button', {
        name: enUS.todos.action.markPending,
      }),
    ).toBeVisible();
  });

  it('offers a retry when the list cannot load', async () => {
    api.request
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ data: todos });
    renderPage(<TodosPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      enUS.todos.error.failed,
    );
    await userEvent.click(
      screen.getByRole('button', { name: enUS['status.retry'] }),
    );
    expect(await screen.findByText('Renew the domain')).toBeVisible();
  });
});

interface Schedule {
  readonly id: string;
  readonly key: string;
  readonly title: string;
  readonly cron: string;
  readonly timezone: string;
  readonly enabled: boolean;
  readonly lifecycleState: 'active' | 'inactive';
  readonly runCount: number;
  readonly completedCount: number;
  readonly nextRunAt?: string;
  readonly lastRunAt?: string;
  readonly scheduleStatus: 'active' | 'paused';
  readonly targetState: 'ready' | 'disabled' | 'missing' | 'invalid';
  readonly targetSummary: { readonly targetLabel: string };
}

const schedule: Schedule = {
  id: 'schedule-1',
  key: 'todos.check-overdue',
  title: 'Check overdue todos',
  cron: '*/30 * * * * *',
  timezone: 'Asia/Shanghai',
  enabled: true,
  lifecycleState: 'active',
  runCount: 2,
  completedCount: 2,
  nextRunAt: '2030-01-01T00:00:00Z',
  lastRunAt: '2026-01-01T00:00:00Z',
  scheduleStatus: 'active',
  targetState: 'ready',
  targetSummary: { targetLabel: 'check-overdue-todos' },
};

describe('SchedulesPage', () => {
  beforeEach(() => {
    api.request.mockReset();
  });

  it('shows the schedule and its execution results', async () => {
    api.request.mockImplementation(
      ({
        path,
        method,
      }: {
        readonly path: string;
        readonly method?: string;
      }) => {
        if (path.endsWith('/occurrences')) {
          return Promise.resolve({
            data: [
              {
                id: 'occurrence-1',
                status: 'succeeded',
                startedAt: '2026-01-01T00:00:00Z',
                resultSummary: { marked: 1 },
              },
              {
                id: 'occurrence-2',
                status: 'failed',
                startedAt: '2026-01-01T00:05:00Z',
                reason: 'target threw',
              },
            ],
          });
        }
        if (method === 'POST') {
          return Promise.resolve({ data: { ...schedule, enabled: false } });
        }
        return Promise.resolve({ data: [schedule], meta: { total: 1 } });
      },
    );
    renderPage(<SchedulesPage />);

    expect(
      await screen.findByRole('heading', { name: 'Check overdue todos' }),
    ).toBeVisible();
    expect(screen.getByText(enUS.schedules.status.enabled)).toBeVisible();
    expect(screen.getByText('*/30 * * * * * · Asia/Shanghai')).toBeVisible();
    expect(screen.getByText('2 total, 2 succeeded')).toBeVisible();

    await userEvent.click(
      screen.getByRole('button', {
        name: enUS.schedules.action.showOccurrences,
      }),
    );

    expect(await screen.findByText('Marked 1 overdue')).toBeVisible();
    expect(
      screen.getByText(enUS.schedules.occurrenceStatus.failed),
    ).toBeVisible();
    expect(screen.getByText('target threw')).toBeVisible();
  });

  it('switches the schedule off through the scheduler API', async () => {
    api.request.mockImplementation(
      ({ method }: { readonly method?: string }) => {
        if (method === 'POST') {
          return Promise.resolve({ data: { ...schedule, enabled: false } });
        }
        return Promise.resolve({ data: [schedule], meta: { total: 1 } });
      },
    );
    renderPage(<SchedulesPage />);

    await userEvent.click(
      await screen.findByRole('button', {
        name: enUS.schedules.action.disable,
      }),
    );

    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'scheduler/schedules/schedule-1/disable',
          method: 'POST',
        }),
      ),
    );
    expect(
      await screen.findByText(enUS.schedules.status.disabled),
    ).toBeVisible();
  });
});
