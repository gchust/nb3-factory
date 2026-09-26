import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiClientError } from '@nocobase/app-client';
import { MemoryRouter } from 'react-router';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import appEnUS from '../../client/locales/en-US.ts';
import { CustomerMemoForm } from '../../client/pages/customer-memos/customer-memo-form.tsx';
import CustomerMemosPage from '../../client/pages/customer-memos/index.tsx';
import type { CustomerMemo } from '../../client/pages/customer-memos/types.ts';

/**
 * The list page against the real English wording and a small in-memory API.
 *
 * The middle of this feature is browser-side: the search box filters the table's
 * `name` column, and deleting goes through a confirmation nobody can skip. Both
 * are behaviors no static check reaches, so they are exercised here.
 */

// One object for the whole file: `useApiClient()` returning a fresh value on
// every render would re-run the page's fetch effect forever.
const { api } = vi.hoisted(() => ({ api: { request: vi.fn() } }));
const { toastAdd } = vi.hoisted(() => ({ toastAdd: vi.fn() }));

vi.mock('@nocobase/app-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
}));

vi.mock('@/components/ui/toast', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/toast')>()),
  toast: { add: toastAdd },
}));

vi.mock('@nocobase/i18n/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nocobase/i18n/client')>()),
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: mockTranslate,
  }),
}));

const MEMOS: readonly CustomerMemo[] = [
  {
    id: 3,
    name: 'Riverstone Clinic',
    note: null,
    createdAt: '2026-01-03T09:00:00.000Z',
  },
  {
    id: 2,
    name: 'Blue Harbor Cafe',
    note: 'Prefers a phone call before 10 a.m.',
    createdAt: '2026-01-02T09:00:00.000Z',
  },
  {
    id: 1,
    name: 'Acme Trading Co.',
    note: 'Annual plan renewal quote requested; follow up next week.',
    createdAt: '2026-01-01T09:00:00.000Z',
  },
];

let stored: CustomerMemo[] = [];

beforeEach(() => {
  stored = MEMOS.map((memo) => ({ ...memo }));
  api.request.mockReset();
  toastAdd.mockReset();
  api.request.mockImplementation(
    (options: { readonly path: string; readonly method?: string }) => {
      const method = options.method ?? 'GET';
      if (method === 'GET' && options.path === 'customer-memos') {
        return Promise.resolve({ data: stored.map((memo) => ({ ...memo })) });
      }
      if (method === 'DELETE') {
        const id = Number(options.path.split('/')[1]);
        stored = stored.filter((memo) => memo.id !== id);
        return Promise.resolve(undefined);
      }
      throw new Error(`Unexpected ${method} ${options.path}`);
    },
  );
});

// Browser APIs jsdom does not implement, which Base UI's popups reach for.
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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/customer-memos']}>
      <CustomerMemosPage />
    </MemoryRouter>,
  );
}

describe('customer memos page', () => {
  it('lists the customer memos', async () => {
    renderPage();

    expect(await screen.findByText('Acme Trading Co.')).toBeInTheDocument();
    expect(screen.getByText('Blue Harbor Cafe')).toBeInTheDocument();
    expect(screen.getByText('Riverstone Clinic')).toBeInTheDocument();
  });

  it('filters by a partial name and restores the list when cleared', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Acme Trading Co.');

    const search = screen.getByRole('searchbox', {
      name: 'Search by customer name',
    });
    await user.type(search, 'harbor');

    await waitFor(() =>
      expect(screen.queryByText('Acme Trading Co.')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Blue Harbor Cafe')).toBeInTheDocument();
    expect(screen.queryByText('Riverstone Clinic')).not.toBeInTheDocument();

    await user.clear(search);

    expect(await screen.findByText('Acme Trading Co.')).toBeInTheDocument();
    expect(screen.getByText('Riverstone Clinic')).toBeInTheDocument();
  });

  it('keeps the memo when the deletion is cancelled', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Acme Trading Co.');

    await user.click(
      within(rowFor('Acme Trading Co.')).getByRole('button', {
        name: 'Open actions',
      }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/Acme Trading Co\./)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );
    expect(api.request).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(
      screen.getByRole('row', { name: /Acme Trading Co\./ }),
    ).toBeInTheDocument();
  });

  it('removes the memo after the deletion is confirmed', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Acme Trading Co.');

    await user.click(
      within(rowFor('Acme Trading Co.')).getByRole('button', {
        name: 'Open actions',
      }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('row', { name: /Acme Trading Co\./ }),
      ).not.toBeInTheDocument(),
    );
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'DELETE',
        path: 'customer-memos/1',
      }),
    );
    // The other records are untouched.
    expect(screen.getByText('Blue Harbor Cafe')).toBeInTheDocument();
    expect(screen.getByText('Riverstone Clinic')).toBeInTheDocument();
  });
});

describe('customer memo form', () => {
  it('blocks saving a memo with no customer name', async () => {
    const onSubmitted = vi.fn();
    api.request.mockReset();
    const { container } = render(
      <CustomerMemoForm formId='new-form' onSubmitted={onSubmitted} />,
    );

    fireEvent.submit(formIn(container));

    expect(
      await screen.findByText('Enter the customer name.'),
    ).toBeInTheDocument();
    expect(api.request).not.toHaveBeenCalled();
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it('creates a memo through the API after a valid submit', async () => {
    const onSubmitted = vi.fn();
    api.request.mockReset();
    api.request.mockResolvedValue({
      data: {
        id: 4,
        name: 'Northwind Traders',
        note: null,
        createdAt: '2026-02-01T09:00:00.000Z',
      },
    });
    const { container } = render(
      <CustomerMemoForm formId='new-form' onSubmitted={onSubmitted} />,
    );

    await userEvent.type(
      screen.getByLabelText('Customer name'),
      'Northwind Traders',
    );
    fireEvent.submit(formIn(container));

    await waitFor(() =>
      expect(onSubmitted).toHaveBeenCalledWith(
        expect.objectContaining({ id: 4, name: 'Northwind Traders' }),
      ),
    );
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: 'customer-memos',
        json: { name: 'Northwind Traders', note: '' },
      }),
    );
    expect(toastAdd).toHaveBeenCalled();
  });

  it('shows the server validation message on the name field', async () => {
    api.request.mockReset();
    api.request.mockRejectedValue(
      new ApiClientError('Name is required.', {
        status: 400,
        code: 'CUSTOMER_MEMO_NAME_REQUIRED',
        method: 'POST',
        url: '/api/customer-memos',
      }),
    );
    const { container } = render(
      <CustomerMemoForm formId='new-form' onSubmitted={vi.fn()} />,
    );

    await userEvent.type(screen.getByLabelText('Customer name'), 'Acme');
    fireEvent.submit(formIn(container));

    expect(
      await screen.findByText('Enter the customer name.'),
    ).toBeInTheDocument();
  });
});

function formIn(container: HTMLElement): HTMLFormElement {
  const form = container.querySelector('form');
  if (!form) throw new Error('No form was rendered.');
  return form;
}

function rowFor(name: string): HTMLElement {
  return screen.getByRole('row', {
    name: new RegExp(name.replaceAll('.', '\\.')),
  });
}

function mockTranslate(key: string, options?: Record<string, unknown>): string {
  const template = lookup(key);
  if (template === undefined) return key;
  return template.replace(/\{\{(\w+)\}\}/gu, (whole, name: string) =>
    options && name in options ? String(options[name]) : whole,
  );
}

function lookup(key: string): string | undefined {
  // Most keys are nested groups, but the older ones are flat with dots in the name.
  const flat = (appEnUS as Record<string, unknown>)[key];
  if (typeof flat === 'string') return flat;
  let node: unknown = appEnUS;
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}
