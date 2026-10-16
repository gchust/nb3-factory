import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import locales from '../../client/locales/index.js';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@nocobase/app-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nocobase/app-client')>();
  // One stable client, as the application resolves; a fresh object per render would re-run the page's load effect.
  const api = { request: mocks.request };
  return { ...actual, useApiClient: () => api };
});

import SchedulesPage from '../../client/pages/schedules/index.tsx';

let runtime: I18nRuntime;
beforeEach(async () => {
  mocks.request.mockReset();
  const schedule = {
    id: 'schedule-1',
    key: 'todos.check-expired',
    title: '检查过期待办',
    enabled: true,
  };
  mocks.request.mockImplementation(
    async ({ path }: { readonly path: string }) => {
      if (path === 'scheduler/schedules') {
        return { data: [schedule] };
      }
      if (path === 'scheduler/schedules/schedule-1/disable') {
        return { data: { ...schedule, enabled: false } };
      }
      if (path === 'scheduler/schedules/schedule-1/enable') {
        return { data: { ...schedule, enabled: true } };
      }
      if (path.endsWith('/occurrences')) {
        return {
          data: [
            {
              id: 'occurrence-1',
              scheduleId: 'schedule-1',
              status: 'succeeded',
              executionCount: 1,
              startedAt: '2026-10-07T08:00:00.000Z',
              resultSummary: { updatedCount: 1 },
            },
          ],
        };
      }
      throw new Error(`Unexpected request path: ${path}`);
    },
  );
  runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: 'test-app',
  });
  runtime.registerApplicationNamespace('test-app', locales);
  await runtime.init('en-US');
});

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={['/schedules']}>
      <I18nProvider runtime={runtime}>
        <SchedulesPage />
      </I18nProvider>
    </MemoryRouter>,
  );
}

it('lists a schedule with its name and enabled state', async () => {
  renderPage();

  expect(
    await screen.findByRole('heading', { name: 'Schedules', level: 1 }),
  ).toBeInTheDocument();
  expect(screen.getByText('检查过期待办')).toBeInTheDocument();
  expect(screen.getByText('todos.check-expired')).toBeInTheDocument();
  expect(screen.getByText('Enabled')).toBeInTheDocument();
});

it('enables a disabled schedule at once, without a confirmation', async () => {
  mocks.request.mockImplementationOnce(async () => ({
    data: [
      {
        id: 'schedule-1',
        key: 'todos.check-expired',
        title: '检查过期待办',
        enabled: false,
      },
    ],
  }));
  renderPage();

  const toggle = await screen.findByRole('switch', {
    name: 'Enable or disable 检查过期待办',
  });
  expect(toggle).not.toBeChecked();

  fireEvent.click(toggle);

  // Enabling is not destructive: it applies immediately (T4.3), with no confirmation dialog.
  expect(await screen.findByText('Enabled')).toBeInTheDocument();
  expect(mocks.request).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'POST',
      path: 'scheduler/schedules/schedule-1/enable',
    }),
  );
  expect(
    screen.queryByRole('button', { name: 'Disable' }),
  ).not.toBeInTheDocument();
});

it('opens the execution records the scheduler wrote when the target ran', async () => {
  renderPage();

  fireEvent.click(
    await screen.findByRole('button', { name: 'View executions' }),
  );

  expect(
    await screen.findByRole('heading', { name: 'Execution records' }),
  ).toBeInTheDocument();
  expect(screen.getByText('Succeeded')).toBeInTheDocument();
  expect(screen.getByText('Marked 1 todo(s) expired')).toBeInTheDocument();
});

it('disables a schedule through the Scheduler after confirmation', async () => {
  renderPage();

  const toggle = await screen.findByRole('switch', {
    name: 'Enable or disable 检查过期待办',
  });
  expect(toggle).toBeChecked();

  fireEvent.click(toggle);

  // Disabling is destructive, so it asks first (I2) and has not written yet.
  expect(mocks.request).not.toHaveBeenCalledWith(
    expect.objectContaining({ path: 'scheduler/schedules/schedule-1/disable' }),
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Disable' }));

  expect(await screen.findByText('Disabled')).toBeInTheDocument();
  // Confirming closes the dialog as it writes.
  await vi.waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  expect(mocks.request).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'POST',
      path: 'scheduler/schedules/schedule-1/disable',
    }),
  );
});
