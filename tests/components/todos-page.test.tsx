import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import appEnUS from '../../client/locales/en-US.ts';

const { apiMock, ApiClientErrorMock } = vi.hoisted(() => {
  class ApiClientErrorMock extends Error {
    public readonly status: number;
    public constructor(status: number, message = 'request failed') {
      super(message);
      this.status = status;
    }
  }
  return {
    apiMock: { request: vi.fn() },
    ApiClientErrorMock,
  };
});

vi.mock('@nocobase/app-client', () => ({
  useApiClient: () => apiMock,
  ApiClientError: ApiClientErrorMock,
}));

// Reuse the real English wording, so a key the page reads but nobody translated
// fails here instead of printing its key to a reader.
function lookup(key: string): string {
  let node: unknown = appEnUS;
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object') return key;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : key;
}

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? lookup(key),
  }),
  useLocale: () => ({ locale: 'en-US' }),
}));

import TodosPage from '../../client/pages/todos/index.js';
import type { Todo } from '../../client/pages/todos/types.js';

const overdue = {
  id: 1,
  title: 'Submit the quarterly report',
  dueAt: '2026-09-22T10:00:00.000Z',
  completed: false,
  expired: true,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-23T00:00:00.000Z',
} satisfies Todo;

const future = {
  id: 2,
  title: 'Prepare next sprint backlog',
  dueAt: '2026-09-26T10:00:00.000Z',
  completed: false,
  expired: false,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
} satisfies Todo;

const completed = {
  id: 3,
  title: 'Archive last year documents',
  dueAt: '2026-09-21T10:00:00.000Z',
  completed: true,
  expired: false,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-22T00:00:00.000Z',
} satisfies Todo;

beforeEach(() => {
  apiMock.request.mockReset();
});

describe('TodosPage', () => {
  it('renders every todo with its completed and expired state', async () => {
    apiMock.request.mockResolvedValue({ data: [overdue, future, completed] });
    render(<TodosPage />);

    expect(await screen.findByText(overdue.title)).toBeInTheDocument();
    expect(screen.getByText(future.title)).toBeInTheDocument();
    expect(screen.getByText(completed.title)).toBeInTheDocument();

    // Read the state badges out of each row, not the table as a whole, so the
    // column headers cannot stand in for a badge.
    const overdueRow = screen.getByText(overdue.title).closest('tr')!;
    expect(
      within(overdueRow).getByText(lookup('todos.expired')),
    ).toBeInTheDocument();
    expect(
      within(overdueRow).getByText(lookup('todos.incomplete')),
    ).toBeInTheDocument();

    const futureRow = screen.getByText(future.title).closest('tr')!;
    expect(
      within(futureRow).getByText(lookup('todos.active')),
    ).toBeInTheDocument();

    const completedRow = screen.getByText(completed.title).closest('tr')!;
    expect(
      within(completedRow).getByText(lookup('todos.completed')),
    ).toBeInTheDocument();
    expect(
      within(completedRow).getByText(lookup('todos.active')),
    ).toBeInTheDocument();

    expect(
      screen.getByRole('heading', { name: lookup('todos.title') }),
    ).toBeInTheDocument();
  });

  it('shows the forbidden message without a retry when the list is refused', async () => {
    apiMock.request.mockRejectedValue(new ApiClientErrorMock(403));
    render(<TodosPage />);

    expect(
      await screen.findByText(lookup('todos.error.forbidden')),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: lookup('todos.error.retry') }),
    ).not.toBeInTheDocument();
  });

  it('offers a retry when the list request fails', async () => {
    apiMock.request.mockRejectedValueOnce(new ApiClientErrorMock(500));
    render(<TodosPage />);

    const retry = await screen.findByRole('button', {
      name: lookup('todos.error.retry'),
    });

    apiMock.request.mockResolvedValueOnce({ data: [overdue] });
    fireEvent.click(retry);

    expect(await screen.findByText(overdue.title)).toBeInTheDocument();
  });

  it('sends the completion toggle to the API and reflects the result', async () => {
    apiMock.request.mockImplementation(
      ({ method, path }: { method?: string; path: string }) => {
        if (method === 'PATCH') {
          expect(path).toBe(`todos/${overdue.id}`);
          return Promise.resolve({ data: { ...overdue, completed: true } });
        }
        return Promise.resolve({ data: [overdue, future, completed] });
      },
    );
    render(<TodosPage />);

    const [markComplete] = await screen.findAllByRole('button', {
      name: lookup('todos.markComplete'),
    });
    fireEvent.click(markComplete);

    await waitFor(() =>
      expect(apiMock.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: `todos/${overdue.id}`,
          method: 'PATCH',
          json: { completed: true },
        }),
      ),
    );
  });
});
