import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import locales from '../../client/locales/index.js';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@nocobase/app-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nocobase/app-client')>();
  return { ...actual, useApiClient: () => ({ request: mocks.request }) };
});

import TodosPage from '../../client/pages/todos/index.tsx';

let runtime: I18nRuntime;
beforeEach(async () => {
  mocks.request.mockReset();
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
    <MemoryRouter initialEntries={['/todos']}>
      <I18nProvider runtime={runtime}>
        <TodosPage />
      </I18nProvider>
    </MemoryRouter>,
  );
}

it('shows the four fields the expiry task maintains', async () => {
  mocks.request.mockResolvedValue({
    data: [
      {
        id: 1,
        title: '已过期待办',
        dueAt: '2026-10-01T08:00:00.000Z',
        completed: false,
        expired: true,
      },
      {
        id: 2,
        title: '已完成待办',
        dueAt: '2026-10-02T08:00:00.000Z',
        completed: true,
        expired: false,
      },
    ],
  });

  renderPage();

  expect(
    await screen.findByRole('heading', { name: 'Todos', level: 1 }),
  ).toBeInTheDocument();
  expect(mocks.request).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'todos' }),
  );
  expect(screen.getByText('已过期待办')).toBeInTheDocument();
  expect(screen.getByText('已完成待办')).toBeInTheDocument();
  // Title, due time, completed and expired: one header per column.
  expect(screen.getAllByRole('columnheader')).toHaveLength(4);
  // The overdue row is shown as expired and unfinished; the finished row is completed and not expired.
  expect(screen.getAllByText('Yes')).toHaveLength(2);
  expect(screen.getAllByText('No')).toHaveLength(2);
});

it('reads the list without creating or updating anything', async () => {
  mocks.request.mockResolvedValue({ data: [] });

  renderPage();

  await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1));
  const [call] = mocks.request.mock.calls[0] as [
    { readonly path: string; readonly method?: string },
  ];
  expect(call.path).toBe('todos');
  // No method means the client's default GET; the page never posts a change of its own.
  expect(call.method).toBeUndefined();
  expect(await screen.findByText('No todos')).toBeInTheDocument();
});

it('reports a failed load instead of an empty list', async () => {
  mocks.request.mockRejectedValue(new Error('offline'));

  renderPage();

  expect(
    await screen.findByText('Could not load the todos. Please try again.'),
  ).toBeInTheDocument();
});
