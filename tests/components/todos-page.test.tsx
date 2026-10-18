import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import TodosPage from '../../client/pages/todos/index.js';
import type { Todo } from '../../client/pages/todos/types.js';

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

const TODOS: readonly Todo[] = [
  {
    id: '1',
    title: 'Submit the overdue quarterly report',
    dueAt: '2026-01-01T00:00:00.000Z',
    completed: false,
    expired: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: '2',
    title: 'Review the design draft next week',
    dueAt: '2099-01-01T00:00:00.000Z',
    completed: false,
    expired: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: '3',
    title: 'Archive the completed meeting notes',
    dueAt: '2026-01-01T00:00:00.000Z',
    completed: true,
    expired: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('todos page', () => {
  let todos: readonly Todo[] = TODOS;
  let failLoad = false;

  beforeEach(() => {
    todos = TODOS;
    failLoad = false;
    request.mockReset();
    toaster.show.mockReset();
    request.mockImplementation(
      (options: {
        path: string;
        method?: string;
        json?: { completed: boolean };
      }) => {
        if (options.path === '/todos' && failLoad) {
          return Promise.reject(new Error('network'));
        }
        if (options.method === 'PATCH') {
          const id = options.path.split('/').pop();
          const current = todos.find((item) => item.id === id);
          const updated = {
            ...current,
            completed: options.json?.completed ?? false,
          } as Todo;
          todos = todos.map((item) => (item.id === id ? updated : item));
          return Promise.resolve({ data: updated });
        }
        return Promise.resolve({ data: todos, meta: { total: todos.length } });
      },
    );
  });

  it('shows every seeded state and completes a todo through the API', async () => {
    render(<TodosPage />, { wrapper: I18n });

    expect(
      await screen.findByText('Submit the overdue quarterly report'),
    ).toBeVisible();
    expect(screen.getByText(enUS.todos.status.expired)).toBeVisible();
    expect(screen.getByText(enUS.todos.status.completed)).toBeVisible();
    expect(screen.getByText(enUS.todos.status.pending)).toBeVisible();

    const row = screen
      .getByText('Submit the overdue quarterly report')
      .closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(
      within(row!).getByRole('button', { name: enUS.todos.action.complete }),
    );

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/todos/1',
          method: 'PATCH',
          json: { completed: true },
        }),
      ),
    );
    expect(toaster.show).toHaveBeenCalledWith({
      type: 'success',
      title: enUS.todos.toast.completed.replace(
        '{{title}}',
        'Submit the overdue quarterly report',
      ),
    });
  });

  it('shows the empty state when there are no todos', async () => {
    todos = [];
    render(<TodosPage />, { wrapper: I18n });

    expect(await screen.findByText(enUS.todos.empty.title)).toBeVisible();
  });

  it('reports a failed load and retries', async () => {
    failLoad = true;
    const user = userEvent.setup();
    render(<TodosPage />, { wrapper: I18n });

    expect(await screen.findByText(enUS.todos.error.title)).toBeVisible();
    failLoad = false;
    todos = [];
    await user.click(
      screen.getByRole('button', { name: enUS.todos.error.retry }),
    );
    expect(await screen.findByText(enUS.todos.empty.title)).toBeVisible();
  });
});
