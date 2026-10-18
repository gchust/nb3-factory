import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, type ReactNode } from 'react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import { ScheduleEnabledAction } from '../../client/pages/scheduler/actions.js';
import SchedulerPage from '../../client/pages/scheduler/index.js';
import type { Schedule } from '../../client/pages/scheduler/types.js';

// `vi.mock` factories run before this file's imports, so everything a factory uses is created here.
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
    namespace: 'nb3-factory',
    resources: enUS,
  },
});

function I18n({ children }: { readonly children: ReactNode }): ReactElement {
  return <TestI18nProvider runtime={runtime}>{children}</TestI18nProvider>;
}

function scheduleFixture(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: 'todos.check-overdue',
    key: 'todos.check-overdue',
    title: '检查过期待办',
    cron: '* * * * *',
    timezone: 'UTC',
    enabled: true,
    targetType: 'app',
    lifecycleState: 'active',
    runCount: 0,
    completedCount: 0,
    scheduleStatus: 'active',
    targetState: 'ready',
    targetSummary: { targetLabel: 'check-overdue' },
    ...overrides,
  };
}

/** The list answers a POST with the updated plan, so the mock distinguishes the two requests by method. */
function respondWithUpdate(updated: Schedule): void {
  api.request.mockImplementation(
    async ({ method }: { readonly method?: string }) =>
      method === 'POST' ? { data: updated } : { data: [scheduleFixture()] },
  );
}

function renderScheduler(): void {
  const router = createMemoryRouter(
    [{ path: '/scheduler', element: <SchedulerPage /> }],
    { initialEntries: ['/scheduler'] },
  );
  render(<RouterProvider router={router} />, { wrapper: I18n });
}

beforeEach(() => {
  api.request.mockReset();
  toaster.show.mockReset();
});

it('offers execution history and enable/disable behind one actions menu per plan', async () => {
  api.request.mockResolvedValue({ data: [scheduleFixture()] });
  renderScheduler();

  await userEvent.click(
    await screen.findByRole('button', { name: 'Actions for 检查过期待办' }),
  );

  const menu = await screen.findByRole('menu');
  expect(
    within(menu).getByRole('menuitem', { name: 'Execution records' }),
  ).toBeInTheDocument();
  expect(
    within(menu).getByRole('menuitem', { name: 'Disable' }),
  ).toBeInTheDocument();
});

it('confirms disabling a plan, posts to the plugin and reflects the new state', async () => {
  respondWithUpdate(
    scheduleFixture({ enabled: false, scheduleStatus: 'paused' }),
  );
  renderScheduler();

  await userEvent.click(
    await screen.findByRole('button', { name: 'Actions for 检查过期待办' }),
  );
  await userEvent.click(
    await screen.findByRole('menuitem', { name: 'Disable' }),
  );

  const dialog = await screen.findByRole('alertdialog');
  expect(
    within(dialog).getByText('Disable “检查过期待办”?'),
  ).toBeInTheDocument();
  await userEvent.click(
    within(dialog).getByRole('button', { name: 'Disable' }),
  );

  await waitFor(() =>
    expect(api.request).toHaveBeenCalledWith({
      path: 'scheduler/schedules/todos.check-overdue/disable',
      method: 'POST',
    }),
  );
  expect(toaster.show).toHaveBeenCalledWith({
    type: 'success',
    title: 'Disabled “检查过期待办”',
  });
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(
    screen.queryByRole('menuitem', { name: 'Disable' }),
  ).not.toBeInTheDocument();
});

it('enables a disabled plan without a confirmation step', async () => {
  api.request.mockImplementation(
    async ({ method }: { readonly method?: string }) =>
      method === 'POST'
        ? { data: scheduleFixture({ enabled: true, scheduleStatus: 'active' }) }
        : {
            data: [
              scheduleFixture({ enabled: false, scheduleStatus: 'paused' }),
            ],
          },
  );
  renderScheduler();

  await userEvent.click(
    await screen.findByRole('button', { name: 'Actions for 检查过期待办' }),
  );
  await userEvent.click(
    await screen.findByRole('menuitem', { name: 'Enable' }),
  );

  await waitFor(() =>
    expect(api.request).toHaveBeenCalledWith({
      path: 'scheduler/schedules/todos.check-overdue/enable',
      method: 'POST',
    }),
  );
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(toaster.show).toHaveBeenCalledWith({
    type: 'success',
    title: 'Enabled “检查过期待办”',
  });
});

it('reports a failed toggle and keeps the plan as it was', async () => {
  api.request.mockImplementation(
    async ({ method }: { readonly method?: string }) => {
      if (method === 'POST') throw new Error('boom');
      return { data: [scheduleFixture()] };
    },
  );
  renderScheduler();

  await userEvent.click(
    await screen.findByRole('button', { name: 'Actions for 检查过期待办' }),
  );
  await userEvent.click(
    await screen.findByRole('menuitem', { name: 'Disable' }),
  );
  await userEvent.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', {
      name: 'Disable',
    }),
  );

  await waitFor(() =>
    expect(toaster.show).toHaveBeenCalledWith({
      type: 'error',
      title: enUS.scheduler.actions.toggleFailed,
    }),
  );
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  await userEvent.click(
    screen.getByRole('button', { name: 'Actions for 检查过期待办' }),
  );
  expect(
    await screen.findByRole('menuitem', { name: 'Disable' }),
  ).toBeInTheDocument();
});

it('offers the same control as a header button on a plan page', async () => {
  api.request.mockResolvedValue({ data: scheduleFixture() });
  const onChanged = vi.fn();
  render(
    <MemoryRouter>
      <I18n>
        <ScheduleEnabledAction
          schedule={scheduleFixture()}
          onChanged={onChanged}
        />
      </I18n>
    </MemoryRouter>,
  );

  const button = screen.getByRole('button', { name: 'Disable' });
  await userEvent.click(button);

  const dialog = await screen.findByRole('alertdialog');
  expect(
    within(dialog).getByText('Disable “检查过期待办”?'),
  ).toBeInTheDocument();
});
