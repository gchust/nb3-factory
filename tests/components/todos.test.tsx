import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TodosPage from '../../client/pages/todos';

const { request, apiClient } = vi.hoisted(() => {
  const request = vi.fn();
  return { request, apiClient: { request } };
});

vi.mock('@nocobase/app-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nocobase/app-client')>()),
  // The real hook resolves a stable service; the page effect depends on it, so
  // the double has to be stable too or every render restarts the request.
  useApiClient: () => apiClient,
}));

// The wording is checked by `locale-coverage.test.ts`; here the key itself is the
// stable text to assert on, so the test does not break when a sentence is reworded.
vi.mock('@nocobase/i18n/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nocobase/i18n/client')>()),
  useTranslation: () => ({ t: (key: string) => key }),
  useLocale: () => ({ locale: 'en-US' }),
}));

const sampleTodo = {
  id: 7,
  title: 'Walk the dog',
  completed: false,
  createdAt: '2026-09-24T09:00:00.000Z',
};

describe('TodosPage', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('renders the to-dos the API returns', async () => {
    request.mockResolvedValueOnce({ data: [sampleTodo] });

    render(<TodosPage />);

    expect(await screen.findByText('Walk the dog')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'todos' }),
    );
  });

  it('shows the empty state when there are no to-dos', async () => {
    request.mockResolvedValueOnce({ data: [] });

    render(<TodosPage />);

    expect(await screen.findByText('todos.emptyTitle')).toBeInTheDocument();
  });

  it('refuses to save a blank title and says why', async () => {
    request.mockResolvedValueOnce({ data: [] });
    const user = userEvent.setup();

    render(<TodosPage />);
    await screen.findByText('todos.emptyTitle');

    await user.click(screen.getByRole('button', { name: 'todos.addButton' }));

    expect(
      await screen.findByText('todos.validation.titleRequired'),
    ).toBeInTheDocument();
    // Only the initial list request was made; the rejected form did not reach the API.
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'todos' }),
    );
  });

  it('adds a to-do and appends it to the list', async () => {
    request.mockResolvedValueOnce({ data: [] });
    const user = userEvent.setup();

    render(<TodosPage />);
    await screen.findByText('todos.emptyTitle');

    request.mockResolvedValueOnce({
      data: { ...sampleTodo, id: 8, title: 'Read a book' },
    });
    await user.type(
      screen.getByPlaceholderText('todos.addPlaceholder'),
      'Read a book',
    );
    await user.click(screen.getByRole('button', { name: 'todos.addButton' }));

    expect(await screen.findByText('Read a book')).toBeInTheDocument();
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        path: 'todos',
        method: 'POST',
        json: { title: 'Read a book' },
      }),
    );
  });

  it('marks a to-do complete through the API when checked', async () => {
    request.mockResolvedValueOnce({ data: [sampleTodo] });
    const user = userEvent.setup();

    render(<TodosPage />);
    const checkbox = await screen.findByRole('checkbox', {
      name: 'todos.toggle',
    });

    request.mockResolvedValueOnce({
      data: { ...sampleTodo, completed: true },
    });
    await user.click(checkbox);

    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        path: 'todos/7',
        method: 'PATCH',
        json: { completed: true },
      }),
    );
  });
});
