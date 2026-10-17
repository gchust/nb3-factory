// The todo page and its create dialog, driven the way the application routes them: `/todos` with `new` as its child
// route. What the schedule does to `expired` is covered by the server tests; this file is about what the person sees.
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
import TodosPage from '../../client/pages/todos/index.js';
import NewTodoPage from '../../client/pages/todos/new.js';

const { api, toaster } = vi.hoisted(() => ({
  // One object for the whole file: a new one per call would restart every effect that depends on `api`.
  api: { request: vi.fn() },
  toaster: { show: vi.fn(), close: vi.fn() },
}));

vi.mock('@nocobase/app-client', async (original) => ({
  // Keep the real module, so `ApiClientError` stays the class the page checks with `instanceof`.
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
  useToaster: () => toaster,
}));

// The application's own copy, strict: a key the resources lack fails the test instead of rendering as text.
const runtime = await createTestI18nRuntime({
  application: { namespace: 'nb3-factory', resources: enUS },
});

function I18n({ children }: { readonly children: ReactNode }): ReactElement {
  return <TestI18nProvider runtime={runtime}>{children}</TestI18nProvider>;
}

interface Todo {
  readonly id: string;
  readonly title: string;
  readonly dueAt: string;
  readonly completed: boolean;
  readonly expired: boolean;
  readonly createdAt: string;
}

const overdue: Todo = {
  id: '11111111-1111-4111-8111-111111111111',
  title: '提交月度报表',
  dueAt: '2020-01-02T02:00:00.000Z',
  completed: false,
  expired: true,
  createdAt: '2026-01-05T09:00:00.000Z',
};

const future: Todo = {
  id: '22222222-2222-4222-8222-222222222222',
  title: '预约年度体检',
  dueAt: '2099-01-01T02:00:00.000Z',
  completed: false,
  expired: false,
  createdAt: '2026-01-05T09:00:00.000Z',
};

function listOf(todos: readonly Todo[]) {
  return {
    data: todos,
    meta: { page: 1, pageSize: 100, total: todos.length },
  };
}

function requestPath(request: unknown): string {
  return (request as { path: string }).path;
}

/** Answers each call by what it is, so a page that refetches after a write stays consistent. */
function serveList(todos: readonly Todo[]) {
  api.request.mockImplementation((request: unknown) => {
    if (requestPath(request) !== 'todos') {
      return Promise.resolve({ data: { ...overdue, completed: true } });
    }
    return Promise.resolve(listOf(todos));
  });
}

function renderPage(url = '/todos') {
  const router = createMemoryRouter(
    [
      {
        path: '/todos',
        element: <TodosPage />,
        children: [{ path: 'new', element: <NewTodoPage /> }],
      },
    ],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />, { wrapper: I18n });
  return router;
}

describe('todo page', () => {
  beforeEach(() => {
    api.request.mockReset();
    toaster.show.mockReset();
  });

  it('shows every todo with its due time and the status the schedule left it in', async () => {
    serveList([overdue, future]);
    renderPage();

    expect(await screen.findByText(overdue.title)).toBeInTheDocument();
    expect(screen.getByText(future.title)).toBeInTheDocument();
    expect(screen.getByText(enUS.todos.status.expired)).toBeInTheDocument();
    expect(screen.getByText(enUS.todos.status.open)).toBeInTheDocument();
  });

  it('keeps the create action in the header once there are rows', async () => {
    serveList([overdue]);
    renderPage();

    expect(
      await screen.findByRole('link', { name: enUS.todos.createAction }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: enUS.todos.createAction }),
    ).toHaveLength(1);
  });

  it('moves the only create action into the empty state while the list is empty', async () => {
    serveList([]);
    renderPage();

    expect(await screen.findByText(enUS.todos.empty.title)).toBeInTheDocument();
    expect(screen.getByText(enUS.todos.empty.description)).toBeInTheDocument();
    const actions = screen.getAllByRole('link', {
      name: enUS.todos.createAction,
    });
    expect(actions).toHaveLength(1);
  });

  it('explains a 403 without offering a retry', async () => {
    api.request.mockRejectedValue(
      new ApiClientError('Forbidden', {
        status: 403,
        method: 'GET',
        url: '/api/todos',
      }),
    );
    renderPage();

    expect(
      await screen.findByText(enUS.todos.error.forbidden),
    ).toBeInTheDocument();
    expect(
      screen.getByText(enUS.todos.error.forbiddenDescription),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: enUS.todos.error.retry }),
    ).not.toBeInTheDocument();
  });

  it('marks a todo done through the API and shows the answer, without refetching', async () => {
    serveList([overdue]);
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole('button', { name: enUS.todos.complete }),
    );

    expect(await screen.findByText(enUS.todos.status.completed)).toBeVisible();
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `todos/${overdue.id}`,
        method: 'PATCH',
        json: { completed: true },
      }),
    );
    // One list request only: the row was updated from the response.
    expect(
      api.request.mock.calls.filter(
        ([request]) => requestPath(request) === 'todos',
      ),
    ).toHaveLength(1);
  });

  it('creates a todo from the dialog and returns to the list', async () => {
    serveList([]);
    const created = { ...future, title: '交周报' };
    api.request.mockImplementation((request: unknown) => {
      const path = requestPath(request);
      if (
        path === 'todos' &&
        (request as { method?: string }).method === 'POST'
      ) {
        return Promise.resolve({ data: created });
      }
      return Promise.resolve(listOf([]));
    });

    const user = userEvent.setup();
    const router = renderPage();

    await user.click(
      await screen.findByRole('link', { name: enUS.todos.createAction }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(/Title/),
      `  ${created.title}  `,
    );
    await user.click(
      within(dialog).getByRole('button', { name: enUS.todos.create.submit }),
    );

    await waitFor(() => {
      expect(api.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'todos',
          method: 'POST',
          json: {
            title: created.title,
            dueAt: expect.any(String),
          },
        }),
      );
    });
    const post = api.request.mock.calls.find(
      ([request]) =>
        requestPath(request) === 'todos' &&
        (request as { method?: string }).method === 'POST',
    ) as [{ json: { dueAt: string } }];
    // A due time in the near future, not the past: a new todo does not start out expired.
    expect(Date.parse(post[0].json.dueAt)).toBeGreaterThan(Date.now());
    await waitFor(() => expect(router.state.location.pathname).toBe('/todos'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(toaster.show).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
        title: enUS.todos.create.success.replace('{{title}}', created.title),
      }),
    );
  });
});
