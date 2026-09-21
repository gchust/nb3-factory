import {
  apiClientToken,
  ClientApplicationContext,
  type ClientApplication,
} from '@nocobase/app-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import CustomerMemosPage from '../../client/pages/customer-memos/index.tsx';

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'name' in options) {
        return `${key}:${String((options as { name: unknown }).name)}`;
      }
      return key;
    },
  }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

interface Memo {
  readonly id: number;
  readonly customerName: string;
  readonly note: string | null;
  readonly createdAt: string;
}

interface RequestOptions {
  readonly path: string;
  readonly method?: string;
  readonly query?: Record<string, string>;
  readonly json?: { customerName: string; note: string | null };
}

interface FakeBackend {
  readonly memos: () => Memo[];
  readonly request: ReturnType<typeof vi.fn>;
}

function createBackend(initial: Memo[]): FakeBackend {
  let memos = [...initial];
  let nextId = Math.max(0, ...memos.map((memo) => memo.id)) + 1;

  const request = vi.fn(async (options: RequestOptions) => {
    const method = options.method ?? 'GET';

    if (options.path === 'customer-memos') {
      if (method === 'GET') {
        const term = options.query?.search ?? '';
        const data = term
          ? memos.filter((memo) => memo.customerName.includes(term))
          : memos;
        return { data };
      }

      if (method === 'POST') {
        const memo: Memo = {
          createdAt: new Date().toISOString(),
          customerName: options.json!.customerName,
          id: nextId++,
          note: options.json!.note,
        };
        memos = [memo, ...memos];
        return { data: memo };
      }
    }

    const match = /^customer-memos\/(\d+)$/.exec(options.path);
    if (match) {
      const id = Number(match[1]);

      if (method === 'PATCH') {
        const updated: Memo = {
          ...memos.find((memo) => memo.id === id)!,
          customerName: options.json!.customerName,
          note: options.json!.note,
        };
        memos = memos.map((memo) => (memo.id === id ? updated : memo));
        return { data: updated };
      }

      if (method === 'DELETE') {
        memos = memos.filter((memo) => memo.id !== id);
        return undefined;
      }
    }

    throw new Error(`Unhandled request ${method} ${options.path}`);
  });

  return { memos: () => memos, request };
}

function renderPage(backend: FakeBackend): void {
  // Keep one stable client object: the page's effect depends on the resolved
  // API client, and a fresh object on each render would refetch in a loop.
  const apiClient = { request: backend.request };
  const app = {
    services: {
      resolve: (token: unknown) => {
        if (token === apiClientToken) {
          return apiClient;
        }
        throw new Error(`Unexpected service token: ${String(token)}`);
      },
    },
  } as unknown as ClientApplication;

  render(
    <ClientApplicationContext.Provider value={app}>
      <CustomerMemosPage />
    </ClientApplicationContext.Provider>,
  );
}

const sample: Memo[] = [
  {
    createdAt: '2026-09-01T08:00:00.000Z',
    customerName: 'Acme',
    id: 1,
    note: 'First note',
  },
  {
    createdAt: '2026-09-05T09:30:00.000Z',
    customerName: 'Bravo',
    id: 2,
    note: null,
  },
];

describe('customer memos page', () => {
  it('lists memos and filters by a partial customer name', async () => {
    const backend = createBackend(sample);
    renderPage(backend);

    expect(await screen.findByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('Bravo')).toBeInTheDocument();

    const search = screen.getByRole('textbox', {
      name: 'customerMemos.searchLabel',
    });
    fireEvent.change(search, { target: { value: 'Ac' } });

    await waitFor(() =>
      expect(screen.queryByText('Bravo')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Acme')).toBeVisible();
    expect(backend.request).toHaveBeenCalledWith(
      expect.objectContaining({ query: { search: 'Ac' } }),
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'customerMemos.clearSearch' }),
    );

    await waitFor(() => expect(screen.getByText('Bravo')).toBeVisible());
    expect(screen.getByText('Acme')).toBeVisible();
  });

  it('refuses to save a memo without a customer name', async () => {
    const backend = createBackend(sample);
    renderPage(backend);

    await screen.findByText('Acme');
    fireEvent.click(
      screen.getByRole('button', { name: 'customerMemos.create' }),
    );

    const nameInput = screen.getByRole('textbox', {
      name: 'customerMemos.customerName',
    });
    fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));

    await waitFor(() =>
      expect(
        screen.getByText('customerMemos.customerNameRequired'),
      ).toBeVisible(),
    );
    expect(
      backend.request.mock.calls.filter(
        ([options]) => options.method === 'POST',
      ),
    ).toHaveLength(0);

    fireEvent.change(nameInput, { target: { value: 'Charlie' } });
    fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));

    await waitFor(() => expect(screen.getByText('Charlie')).toBeVisible());
    expect(backend.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('edits an existing memo', async () => {
    const backend = createBackend(sample);
    renderPage(backend);

    expect(await screen.findByText('Acme')).toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole('button', { name: 'customerMemos.edit' })[0]!,
    );

    const nameInput = screen.getByRole('textbox', {
      name: 'customerMemos.customerName',
    });
    expect(nameInput).toHaveValue('Acme');

    fireEvent.change(nameInput, { target: { value: 'Acme Updated' } });
    fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));

    expect(await screen.findByText('Acme Updated')).toBeVisible();
    expect(backend.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'PATCH', path: 'customer-memos/1' }),
    );
  });

  it('deletes a memo only after confirmation', async () => {
    const backend = createBackend(sample);
    renderPage(backend);

    expect(await screen.findByText('Bravo')).toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole('button', { name: 'customerMemos.delete' })[1]!,
    );

    expect(
      await screen.findByText('customerMemos.deleteDescription:Bravo'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'actions.cancel' }));
    await waitFor(() =>
      expect(
        screen.queryByText('customerMemos.deleteDescription:Bravo'),
      ).not.toBeInTheDocument(),
    );
    expect(
      backend.request.mock.calls.filter(
        ([options]) => options.method === 'DELETE',
      ),
    ).toHaveLength(0);
    expect(screen.getByText('Bravo')).toBeVisible();

    fireEvent.click(
      screen.getAllByRole('button', { name: 'customerMemos.delete' })[1]!,
    );
    await screen.findByText('customerMemos.deleteDescription:Bravo');
    fireEvent.click(
      screen.getByRole('button', { name: 'customerMemos.deleteConfirm' }),
    );

    await waitFor(() =>
      expect(screen.queryByText('Bravo')).not.toBeInTheDocument(),
    );
    expect(backend.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'DELETE', path: 'customer-memos/2' }),
    );
  });
});
