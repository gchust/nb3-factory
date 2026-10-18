import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import TodosPage from '../../client/pages/todos/index.js';
import type { Todo } from '../../client/pages/todos/shared.js';

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

const overdue: Todo = {
  id: 1,
  title: 'Send the expense report',
  dueAt: '2026-10-16T09:00:00.000Z',
  completed: false,
  expired: true,
};

const future: Todo = {
  id: 2,
  title: 'Prepare the review deck',
  dueAt: '2026-10-21T09:00:00.000Z',
  completed: false,
  expired: false,
};

const completed: Todo = {
  id: 3,
  title: 'File the meeting notes',
  dueAt: '2026-10-17T09:00:00.000Z',
  completed: true,
  expired: false,
};

function listResponse(todos: readonly Todo[]) {
  return { data: todos };
}

function renderAt(url = '/todos') {
  const router = createMemoryRouter(
    [
      {
        path: '/todos',
        element: <TodosPage />,
        children: [
          { path: 'new', element: <p>Create route</p> },
          { path: 'edit/:todoId', element: <p>Edit route</p> },
        ],
      },
    ],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />, { wrapper: I18n });
  return router;
}

function table(): HTMLElement {
  return screen.getByRole('table');
}

async function findRowTitle(title: string): Promise<HTMLElement> {
  const loaded = await screen.findByRole('table');
  return within(loaded).findByText(title);
}

function rowFor(title: string): HTMLElement {
  const row = within(table())
    .getAllByRole('row')
    .find((candidate) => candidate.textContent?.includes(title));
  if (!row) {
    throw new Error(`No row for ${title}`);
  }
  return row;
}

describe('todos page', () => {
  beforeEach(() => {
    api.request.mockReset();
    toaster.show.mockReset();
  });

  it('loads todos and renders statuses in due order', async () => {
    api.request.mockResolvedValue(listResponse([overdue, completed, future]));

    renderAt();

    expect(screen.getByLabelText(enUS.todos.loading)).toBeInTheDocument();
    expect(await findRowTitle(overdue.title)).toBeInTheDocument();
    expect(api.request).toHaveBeenCalledWith({ path: '/todos' });

    const rows = within(table()).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining(overdue.title),
      expect.stringContaining(completed.title),
      expect.stringContaining(future.title),
    ]);
    expect(
      within(rowFor(overdue.title)).getByText(enUS.todos.status.expired),
    ).toBeInTheDocument();
    expect(
      within(rowFor(completed.title)).getByText(enUS.todos.status.completed),
    ).toBeInTheDocument();
    expect(
      within(rowFor(future.title)).getByText(enUS.todos.status.pending),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: enUS.todos.create.action }),
    ).toHaveAttribute('href', '/todos/new');
  });

  it('offers the create action when there is nothing yet', async () => {
    api.request.mockResolvedValue(listResponse([]));

    renderAt();

    expect(await screen.findByText(enUS.todos.empty.title)).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: enUS.todos.create.action }),
    ).toHaveLength(1);
  });

  it('filters by title and clears the search', async () => {
    const user = userEvent.setup();
    api.request.mockResolvedValue(listResponse([overdue, future]));
    const router = renderAt();

    await findRowTitle(overdue.title);
    await user.type(
      screen.getByRole('textbox', { name: enUS.todos.search.placeholder }),
      'review',
    );

    expect(router.state.location.search).toBe('?q=review');
    expect(within(table()).queryByText(overdue.title)).not.toBeInTheDocument();
    expect(within(table()).getByText(future.title)).toBeInTheDocument();

    await user.clear(
      screen.getByRole('textbox', { name: enUS.todos.search.placeholder }),
    );
    await user.type(
      screen.getByRole('textbox', { name: enUS.todos.search.placeholder }),
      'missing',
    );
    expect(screen.getByText(enUS.todos.noResults.title)).toBeInTheDocument();
    const clearSearch = screen.getAllByRole('button', {
      name: enUS.todos.noResults.action,
    });
    expect(clearSearch).toHaveLength(2);
    await user.click(clearSearch[1]!);

    expect(router.state.location.search).toBe('');
    expect(within(table()).getByText(overdue.title)).toBeInTheDocument();
  });

  it('toggles a todo and uses the server version of the record', async () => {
    const user = userEvent.setup();
    const toggled = { ...overdue, completed: true, expired: false };
    api.request.mockImplementation(
      ({ method, path }: { method: string; path: string }) =>
        method === 'PATCH' && path === '/todos/1'
          ? Promise.resolve({ data: toggled })
          : Promise.resolve(listResponse([overdue, future])),
    );
    renderAt();

    await findRowTitle(overdue.title);
    await user.click(
      within(rowFor(overdue.title)).getByRole('button', {
        name: enUS.todos.actions.markComplete,
      }),
    );

    await waitFor(() =>
      expect(
        within(rowFor(overdue.title)).getByText(enUS.todos.status.completed),
      ).toBeInTheDocument(),
    );
    expect(api.request).toHaveBeenCalledWith({
      method: 'PATCH',
      path: '/todos/1',
      json: { completed: true },
    });
  });

  it('deletes a todo after confirmation', async () => {
    const user = userEvent.setup();
    api.request.mockImplementation(({ method }: { method: string }) =>
      method === 'DELETE'
        ? Promise.resolve(undefined)
        : Promise.resolve(listResponse([overdue, future])),
    );
    renderAt();

    await findRowTitle(overdue.title);
    await user.click(
      within(rowFor(overdue.title)).getByRole('button', {
        name: enUS.todos.actions.menu,
      }),
    );
    await user.click(
      await screen.findByRole('menuitem', {
        name: enUS.todos.actions.delete,
      }),
    );
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      enUS.todos.delete.description.replace('{{title}}', overdue.title),
    );
    await user.click(
      within(dialog).getByRole('button', { name: enUS.todos.delete.action }),
    );

    await waitFor(() =>
      expect(
        within(table()).queryByText(overdue.title),
      ).not.toBeInTheDocument(),
    );
    expect(api.request).toHaveBeenCalledWith({
      method: 'DELETE',
      path: '/todos/1',
    });
    expect(toaster.show).toHaveBeenCalledWith({
      type: 'success',
      title: enUS.todos.toast.deleted,
    });
  });

  it('keeps the error in the page and retries the load', async () => {
    const user = userEvent.setup();
    api.request
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(listResponse([future]));
    renderAt();

    expect(
      await screen.findByText(enUS.todos.loadError.title),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: enUS['status.retry'] }),
    );

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(within(table()).getByText(future.title)).toBeInTheDocument();
  });
});
