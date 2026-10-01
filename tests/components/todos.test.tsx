import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import appEnUS from '../../client/locales/en-US.ts';

/**
 * The todo UI on its own: the shared create/edit form, the delete confirmation
 * and the status badge.
 *
 * The wording is looked up from the real English locale rather than replaced by
 * the key, so a string whose placeholder the component never substitutes, or a
 * key nobody translated, fails here as well.
 *
 * The API client and the toaster are the only application services a page
 * reaches for through a React context; both are replaced with recording fakes.
 * `ApiClientError` stays real, because the components branch on `instanceof`.
 */

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  show: vi.fn(),
  onSubmitted: vi.fn(),
  onSubmittingChange: vi.fn(),
  onNotFound: vi.fn(),
  onDeleted: vi.fn(),
  onOpenChange: vi.fn(),
}));

function lookup(key: string): string | undefined {
  const flat = (appEnUS as Record<string, unknown>)[key];
  if (typeof flat === 'string') return flat;
  let node: unknown = appEnUS;
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function translate(key: string, options?: Record<string, unknown>): string {
  const template = lookup(key);
  if (template === undefined) return key;
  return template.replace(/\{\{(\w+)\}\}/gu, (whole, name: string) =>
    options && name in options ? String(options[name]) : whole,
  );
}

vi.mock('@nocobase/i18n/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nocobase/i18n/client')>()),
  useTranslation: () => ({ i18n: { language: 'en-US' }, t: translate }),
}));

vi.mock('@nocobase/app-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nocobase/app-client')>();
  return {
    ...actual,
    useApiClient: () => ({ request: mocks.request }),
    useToaster: () => ({ show: mocks.show }),
  };
});

import { ApiClientError } from '@nocobase/app-client';

import { TodoStatusBadge } from '../../client/pages/todos/status-badge.tsx';
import { TodoDeleteDialog } from '../../client/pages/todos/todo-delete-dialog.tsx';
import { TodoForm } from '../../client/pages/todos/todo-form.tsx';
import type { Todo } from '../../client/pages/todos/types.ts';

const EXISTING: Todo = {
  id: 5,
  title: 'Buy groceries',
  notes: 'Milk and eggs',
  completed: false,
  createdAt: '2026-09-29T08:00:00.000Z',
};

function renderForm(todo?: Todo): void {
  render(
    <>
      <TodoForm
        {...(todo ? { todo } : {})}
        formId='todo-test-form'
        onSubmitted={mocks.onSubmitted}
        onSubmittingChange={mocks.onSubmittingChange}
        onNotFound={mocks.onNotFound}
      />
      <button type='submit' form='todo-test-form'>
        Save
      </button>
    </>,
  );
}

function apiError(status: number, method: 'PATCH' | 'DELETE'): ApiClientError {
  return new ApiClientError('Request failed', {
    method,
    status,
    url: `/api/todos/${EXISTING.id}`,
  });
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  globalThis.IntersectionObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TodoStatusBadge', () => {
  it('shows the completed and not-completed wording', () => {
    const { unmount } = render(<TodoStatusBadge completed />);
    expect(screen.getByText('Completed')).toBeVisible();
    unmount();

    render(<TodoStatusBadge completed={false} />);
    expect(screen.getByText('Not completed')).toBeVisible();
  });
});

describe('TodoForm', () => {
  it('refuses an empty title without calling the API', async () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('A title is required.')).toBeVisible();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('creates a todo, trimming the title and sending empty notes as null', async () => {
    mocks.request.mockResolvedValueOnce({
      data: { ...EXISTING, id: 9, title: 'Write report', notes: null },
    });
    renderForm();

    fireEvent.change(screen.getByRole('textbox', { name: /title/i }), {
      target: { value: '  Write report  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1));
    expect(mocks.request).toHaveBeenCalledWith({
      path: 'todos',
      method: 'POST',
      json: { title: 'Write report', notes: null },
    });
    await waitFor(() =>
      expect(mocks.onSubmitted).toHaveBeenCalledWith(
        expect.objectContaining({ id: 9 }),
      ),
    );
    expect(mocks.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    );
  });

  it('edits the loaded todo by updating only the changed fields', async () => {
    mocks.request.mockResolvedValueOnce({
      data: { ...EXISTING, title: 'Buy oat milk' },
    });
    renderForm(EXISTING);

    fireEvent.change(screen.getByRole('textbox', { name: /title/i }), {
      target: { value: 'Buy oat milk' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1));
    expect(mocks.request).toHaveBeenCalledWith({
      path: 'todos/5',
      method: 'PATCH',
      json: { title: 'Buy oat milk', notes: 'Milk and eggs' },
    });
  });

  it('reports a deleted record to the container instead of showing a field error', async () => {
    mocks.request.mockRejectedValueOnce(apiError(404, 'PATCH'));
    renderForm(EXISTING);

    fireEvent.change(screen.getByRole('textbox', { name: /title/i }), {
      target: { value: 'Buy oat milk' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mocks.onNotFound).toHaveBeenCalledTimes(1));
    expect(mocks.onSubmitted).not.toHaveBeenCalled();
  });

  it('shows a permission message when the endpoint refuses the write', async () => {
    mocks.request.mockRejectedValueOnce(apiError(403, 'PATCH'));
    renderForm(EXISTING);

    fireEvent.change(screen.getByRole('textbox', { name: /title/i }), {
      target: { value: 'Buy oat milk' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'You do not have permission to view these todos.',
      ),
    ).toBeVisible();
  });
});

describe('TodoDeleteDialog', () => {
  function renderDialog(todo: Pick<Todo, 'id' | 'title'> = EXISTING) {
    return render(
      <TodoDeleteDialog
        open
        todo={todo}
        onOpenChange={mocks.onOpenChange}
        onDeleted={mocks.onDeleted}
      />,
    );
  }

  it('confirms the titled action and deletes the record', async () => {
    mocks.request.mockResolvedValueOnce({});
    renderDialog();

    expect(await screen.findByText('Delete “Buy groceries”?')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith({
        path: 'todos/5',
        method: 'DELETE',
      }),
    );
    await waitFor(() => expect(mocks.onDeleted).toHaveBeenCalledTimes(1));
    expect(mocks.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    );
  });

  it('closes on an already-deleted record, because the goal was reached', async () => {
    mocks.request.mockRejectedValueOnce(apiError(404, 'DELETE'));
    renderDialog();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(mocks.onDeleted).toHaveBeenCalledTimes(1));
    expect(mocks.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'info' }),
    );
  });

  it('keeps the dialog open and explains a refused delete', async () => {
    mocks.request.mockRejectedValueOnce(apiError(403, 'DELETE'));
    renderDialog();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    expect(
      await screen.findByText(
        'You do not have permission to view these todos.',
      ),
    ).toBeVisible();
    expect(mocks.onDeleted).not.toHaveBeenCalled();
  });
});
