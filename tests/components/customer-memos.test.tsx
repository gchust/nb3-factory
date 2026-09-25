import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';

import type { CustomerMemo } from '../../client/pages/customer-memos/types.js';
import appEnUS from '../../client/locales/en-US.ts';

/**
 * One API double shared by the whole file. Returning a new object on every
 * `useApiClient()` call would make the list effect re-request forever.
 */
const api = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock('@nocobase/app-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
}));

/** The real English wording, with `{{name}}`-style interpolation. */
const enUS: Record<string, unknown> = appEnUS;
function lookup(key: string): string | undefined {
  const flat = enUS[key];
  if (typeof flat === 'string') return flat;
  let node: unknown = enUS;
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

vi.mock('@nocobase/i18n/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nocobase/i18n/client')>()),
  useLocale: () => ({
    locale: 'en-US',
    locales: [],
    setLocale: async () => {},
    switching: false,
    error: undefined,
  }),
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: (key: string, options?: Record<string, unknown>) => {
      const template = lookup(key) ?? key;
      return template.replace(/\{\{(\w+)\}\}/gu, (whole, name: string) =>
        options && name in options ? String(options[name]) : whole,
      );
    },
  }),
}));

const PAGE = await import('../../client/pages/customer-memos/index.js');
const NEW = await import('../../client/pages/customer-memos/new.js');
const DETAIL =
  await import('../../client/pages/customer-memos/detail/index.js');
const EDIT = await import('../../client/pages/customer-memos/detail/edit.js');

let memos: CustomerMemo[];

function nextId(): number {
  return Math.max(0, ...memos.map((memo) => memo.id)) + 1;
}

function callList(search: string | undefined): { data: CustomerMemo[] } {
  const needle = (search ?? '').toLowerCase();
  return {
    data: memos.filter(
      (memo) =>
        needle === '' || memo.customerName.toLowerCase().includes(needle),
    ),
  };
}

async function requestDouble(options: {
  path: string;
  method?: string;
  query?: { search?: string };
  json?: unknown;
}): Promise<unknown> {
  const method = options.method ?? 'GET';
  const detail = /^customer-memos\/(\d+)$/u.exec(options.path);
  const id = detail ? Number(detail[1]) : undefined;

  if (method === 'GET' && !detail) {
    return callList(options.query?.search);
  }
  if (method === 'GET' && id !== undefined) {
    const memo = memos.find((entry) => entry.id === id);
    if (!memo) throw new Error('not found');
    return { data: memo };
  }
  if (method === 'POST') {
    const input = options.json as {
      customerName: string;
      remark: string | null;
    };
    const memo: CustomerMemo = {
      id: nextId(),
      customerName: input.customerName,
      remark: input.remark,
      createdAt: new Date('2025-10-01T09:00:00.000Z').toISOString(),
    };
    memos = [...memos, memo];
    return { data: memo };
  }
  if (method === 'PATCH' && id !== undefined) {
    const input = options.json as {
      customerName: string;
      remark: string | null;
    };
    memos = memos.map((memo) =>
      memo.id === id ? { ...memo, ...input } : memo,
    );
    return { data: memos.find((memo) => memo.id === id) };
  }
  if (method === 'DELETE' && id !== undefined) {
    memos = memos.filter((memo) => memo.id !== id);
    return { data: { deleted: true } };
  }
  throw new Error(`Unhandled request ${method} ${options.path}`);
}

function renderApp(initialEntry = '/customer-memos') {
  const router = createMemoryRouter(
    [
      {
        path: '/customer-memos',
        element: <PAGE.default />,
        children: [
          { path: 'new', element: <NEW.default /> },
          {
            path: ':memoId',
            element: <DETAIL.default />,
            children: [{ path: 'edit', element: <EDIT.default /> }],
          },
        ],
      },
    ],
    { initialEntries: [initialEntry] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

function listCallsWithSearch(): (string | undefined)[] {
  return api.request.mock.calls
    .map(
      ([options]) => options as { path: string; query?: { search?: string } },
    )
    .filter((options) => options.path === 'customer-memos')
    .map((options) => options.query?.search);
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
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  memos = [
    {
      id: 1,
      customerName: 'Acme Trading Co.',
      remark: 'Key account.',
      createdAt: '2025-09-01T09:00:00.000Z',
    },
    {
      id: 2,
      customerName: 'Northwind Logistics',
      remark: null,
      createdAt: '2025-09-10T02:30:00.000Z',
    },
    {
      id: 3,
      customerName: 'Globex Manufacturing',
      remark: 'New product line.',
      createdAt: '2025-09-18T07:15:00.000Z',
    },
  ];
  api.request.mockReset();
  api.request.mockImplementation(requestDouble);
});

describe('customer memos page', () => {
  it('lists the memos and searches by a partial customer name, and clears back to the full list', async () => {
    const user = userEvent.setup();
    renderApp();

    expect(await screen.findByText('Acme Trading Co.')).toBeInTheDocument();
    expect(screen.getByText('Northwind Logistics')).toBeInTheDocument();
    expect(screen.getByText('Globex Manufacturing')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Search by customer name'), 'north');
    await waitFor(() => expect(listCallsWithSearch()).toContain('north'));
    await waitFor(() =>
      expect(screen.queryByText('Acme Trading Co.')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Northwind Logistics')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    await waitFor(() =>
      expect(screen.getByText('Acme Trading Co.')).toBeInTheDocument(),
    );
    expect(screen.getByText('Globex Manufacturing')).toBeInTheDocument();
    expect(listCallsWithSearch().at(-1)).toBeUndefined();
  });

  it('blocks saving a memo without a customer name', async () => {
    const user = userEvent.setup();
    const router = renderApp();
    await screen.findByText('Acme Trading Co.');

    // The header action is a `Button` that renders a `Link`, so base-ui keeps
    // the button role on the anchor.
    await user.click(screen.getByRole('button', { name: 'New memo' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/customer-memos/new'),
    );

    await user.click(await screen.findByRole('button', { name: 'Create' }));

    expect(
      await screen.findByText('Enter a customer name.'),
    ).toBeInTheDocument();
    expect(
      api.request.mock.calls.some(
        ([options]) => (options as { method?: string }).method === 'POST',
      ),
    ).toBe(false);

    // A real name clears the error and reaches the endpoint.
    await user.type(screen.getByLabelText(/^Customer name/u), 'Contoso Ltd.');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() =>
      expect(
        api.request.mock.calls.some(
          ([options]) => (options as { method?: string }).method === 'POST',
        ),
      ).toBe(true),
    );
  });

  it('opens a memo, edits it and shows the saved values', async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByText('Acme Trading Co.');

    await user.click(screen.getByRole('link', { name: 'Acme Trading Co.' }));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('Key account.')).toBeInTheDocument();

    await user.click(within(drawer).getByRole('button', { name: 'Edit' }));
    const nameInput = await screen.findByLabelText(/^Customer name/u);
    expect(nameInput).toHaveValue('Acme Trading Co.');

    await user.clear(nameInput);
    await user.type(nameInput, 'Acme Trading Group');
    // The edit dialog stacks on top of the detail drawer.
    const dialogs = await screen.findAllByRole('dialog');
    const editDialog = dialogs[dialogs.length - 1]!;
    await user.click(within(editDialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(
        api.request.mock.calls.some(
          ([options]) => (options as { method?: string }).method === 'PATCH',
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(
        within(drawer).getAllByText('Acme Trading Group').length,
      ).toBeGreaterThan(0),
    );
  });

  it('asks before deleting: cancelling keeps the record, confirming removes it', async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByText('Acme Trading Co.');

    // Open the row menu and choose Delete.
    await user.click(
      screen.getByRole('button', {
        name: 'More actions for Acme Trading Co.',
      }),
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(
      within(dialog).getByText('Delete "Acme Trading Co."?'),
    ).toBeInTheDocument();

    // Cancelling leaves the record untouched and deletes nothing.
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );
    expect(
      api.request.mock.calls.some(
        ([options]) => (options as { method?: string }).method === 'DELETE',
      ),
    ).toBe(false);
    expect(screen.getByText('Acme Trading Co.')).toBeInTheDocument();

    // Confirming removes it and the refreshed list no longer shows it.
    await user.click(
      screen.getByRole('button', {
        name: 'More actions for Acme Trading Co.',
      }),
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    const confirmDialog = await screen.findByRole('alertdialog');
    await user.click(
      within(confirmDialog).getByRole('button', { name: 'Delete' }),
    );

    await waitFor(() =>
      expect(
        api.request.mock.calls.some(
          ([options]) => (options as { method?: string }).method === 'DELETE',
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(screen.queryByText('Acme Trading Co.')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Northwind Logistics')).toBeInTheDocument();
  });
});
