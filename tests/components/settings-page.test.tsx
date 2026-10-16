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

import SettingsPage from '../../client/pages/settings/index.tsx';

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
    <MemoryRouter initialEntries={['/settings']}>
      <I18nProvider runtime={runtime}>
        <SettingsPage />
      </I18nProvider>
    </MemoryRouter>,
  );
}

it('shows the scheduled task and its stored enabled state', async () => {
  renderPage();

  expect(
    await screen.findByRole('heading', { name: 'Settings', level: 1 }),
  ).toBeInTheDocument();
  expect(screen.getByText('检查过期待办')).toBeInTheDocument();
  expect(screen.getByText('Enabled')).toBeInTheDocument();
});

it('turns the scheduled task off through the Scheduler after confirmation', async () => {
  renderPage();

  const toggle = await screen.findByRole('switch', {
    name: 'Enable or disable 检查过期待办',
  });
  expect(toggle).toBeChecked();

  fireEvent.click(toggle);

  // Disabling is destructive, so it asks first (I2).
  fireEvent.click(await screen.findByRole('button', { name: 'Disable' }));

  expect(await screen.findByText('Disabled')).toBeInTheDocument();
  expect(mocks.request).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'POST',
      path: 'scheduler/schedules/schedule-1/disable',
    }),
  );
});

it('turns the scheduled task on at once, without a confirmation', async () => {
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
