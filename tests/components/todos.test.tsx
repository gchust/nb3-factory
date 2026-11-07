import { renderWithApp, answerApi } from '@nocobase/app-testing/client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import TodosPage from '../../client/pages/todos/index.js';
import enUS from '../../client/locales/en-US.js';
import zhCN from '../../client/locales/zh-CN.js';

const namespace = '@nocobase/todos-test';
const namespaces = {
  [namespace]: {
    'en-US': async () => ({ default: enUS }),
    'zh-CN': async () => ({ default: zhCN }),
  },
};

const future = new Date(Date.now() + 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();

describe('todos page', () => {
  it('lists todos, creates one, marks it complete and deletes another', async () => {
    const user = userEvent.setup();
    let rows = [
      {
        id: 'todo-1',
        title: 'Future todo',
        dueAt: future,
        completed: false,
        expired: false,
      },
      {
        id: 'todo-2',
        title: 'Overdue todo',
        dueAt: past,
        completed: false,
        expired: true,
      },
    ];
    const calls = vi.fn(
      ({
        method,
        path,
        json,
      }: {
        method: string;
        path: string;
        json?: object;
      }) => {
        if (method === 'GET' && path === 'todos') {
          return {
            data: rows,
            meta: { page: 1, pageSize: 20, total: rows.length },
          };
        }
        if (method === 'POST' && path === 'todos') {
          const created = {
            id: 'todo-3',
            title: Reflect.get(json ?? {}, 'title') as string,
            dueAt: Reflect.get(json ?? {}, 'dueAt') as string,
            completed: false,
            expired: false,
          };
          rows = [...rows, created];
          return { data: created };
        }
        if (method === 'PATCH' && path.startsWith('todos/')) {
          const id = path.slice('todos/'.length);
          const updated = {
            ...rows.find((row) => row.id === id)!,
            ...(json ?? {}),
          };
          rows = rows.map((row) => (row.id === id ? updated : row));
          return { data: updated };
        }
        if (method === 'DELETE' && path.startsWith('todos/')) {
          const id = path.slice('todos/'.length);
          rows = rows.filter((row) => row.id !== id);
          return new Response(null, { status: 204 });
        }
        throw new Error(`Unanswered ${method} ${path}`);
      },
    );
    await renderWithApp(<TodosPage />, {
      namespace,
      namespaces,
      fetch: answerApi(calls),
    });

    expect(await screen.findByText('Future todo')).toBeVisible();
    expect(screen.getByText(enUS.todos.statuses.pending)).toBeVisible();
    expect(screen.getByText(enUS.todos.statuses.expired)).toBeVisible();

    const title = screen.getByRole('textbox', { name: enUS.todos.titleLabel });
    await user.type(title, 'New todo');
    await user.click(
      screen.getByRole('button', { name: enUS.todos.add, exact: true }),
    );
    await waitFor(() =>
      expect(calls).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: 'todos',
          json: expect.objectContaining({ title: 'New todo' }),
        }),
      ),
    );
    expect(await screen.findByText('New todo')).toBeVisible();

    await user.click(
      screen.getByRole('checkbox', {
        name: enUS.todos.markComplete.replace('{{title}}', 'Future todo'),
      }),
    );
    await waitFor(() =>
      expect(calls).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PATCH',
          path: 'todos/todo-1',
          json: { completed: true },
        }),
      ),
    );
    expect(
      screen.getByRole('checkbox', {
        name: enUS.todos.markIncomplete.replace('{{title}}', 'Future todo'),
      }),
    ).toBeChecked();

    await user.click(
      screen.getByRole('button', {
        name: enUS.todos.editNamed.replace('{{title}}', 'Overdue todo'),
      }),
    );
    const dialog = await screen.findByRole('dialog');
    const editTitle = within(dialog).getByRole('textbox', {
      name: enUS.todos.titleLabel,
    });
    await user.clear(editTitle);
    await user.type(editTitle, 'Updated overdue');
    await user.click(
      within(dialog).getByRole('button', {
        name: enUS.todos.save,
        exact: true,
      }),
    );
    await waitFor(() =>
      expect(calls).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PATCH',
          path: 'todos/todo-2',
          json: { title: 'Updated overdue' },
        }),
      ),
    );
    expect(await screen.findByText('Updated overdue')).toBeVisible();
    expect(screen.getByText(enUS.todos.statuses.expired)).toBeVisible();

    await user.click(
      screen.getByRole('button', {
        name: enUS.todos.deleteNamed.replace('{{title}}', 'Updated overdue'),
      }),
    );
    await user.click(
      screen.getByRole('button', { name: enUS.todos.delete, exact: true }),
    );
    await waitFor(() =>
      expect(calls).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'DELETE', path: 'todos/todo-2' }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByText('Updated overdue')).not.toBeInTheDocument(),
    );
  });
});
