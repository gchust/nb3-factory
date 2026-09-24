import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import locales from '../../client/locales/index.js';
import CustomerMemosPage from '../../client/pages/customer-memos/index.tsx';

// The page reaches the server only through its own api module, so the test
// drives the same calls the page makes and never has to stand up HTTP.
const memoApi = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('../../client/pages/customer-memos/api.js', () => ({
  listCustomerMemos: (...args: unknown[]) => memoApi.list(...args),
  createCustomerMemo: (...args: unknown[]) => memoApi.create(...args),
  updateCustomerMemo: (...args: unknown[]) => memoApi.update(...args),
  deleteCustomerMemo: (...args: unknown[]) => memoApi.remove(...args),
}));

vi.mock('@nocobase/app-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nocobase/app-client')>();
  return { ...actual, useApiClient: () => ({}) };
});

interface Memo {
  id: number;
  name: string;
  notes: string | null;
  createdAt: string;
}

let records: Memo[];

async function renderPage() {
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: 'test-app',
  });
  runtime.registerApplicationNamespace('test-app', locales);
  await runtime.init('en-US');
  return render(
    <I18nProvider runtime={runtime}>
      <CustomerMemosPage />
    </I18nProvider>,
  );
}

/** Opens the row menu of the first record and clicks its Delete item. */
async function openDeleteDialog(index = 0): Promise<void> {
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Memo actions' })[index],
  );
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
  await screen.findByRole('alertdialog');
}

beforeEach(() => {
  records = [
    {
      id: 1,
      name: 'Acme Components',
      notes: 'Prefers email',
      createdAt: '2026-09-01T10:00:00.000Z',
    },
    {
      id: 2,
      name: 'Beacon Supplies',
      notes: null,
      createdAt: '2026-09-02T10:00:00.000Z',
    },
    {
      id: 3,
      name: 'Cedar Works',
      notes: 'Key account',
      createdAt: '2026-09-03T10:00:00.000Z',
    },
  ];
  vi.resetAllMocks();
  memoApi.list.mockImplementation(async () =>
    records.map((memo) => ({ ...memo })),
  );
  memoApi.remove.mockImplementation(async (_api: unknown, id: number) => {
    records = records.filter((memo) => memo.id !== id);
  });
});

describe('customer memos page', () => {
  it('filters by a partial customer name and restores the list when cleared', async () => {
    const user = userEvent.setup();
    await renderPage();

    await screen.findByText('Acme Components');
    expect(screen.getByText('Beacon Supplies')).toBeDefined();
    expect(screen.getByText('Cedar Works')).toBeDefined();

    const search = screen.getByLabelText('Search by customer name');
    await user.type(search, 'beacon');

    await waitFor(() =>
      expect(screen.queryByText('Acme Components')).toBeNull(),
    );
    expect(screen.getByText('Beacon Supplies')).toBeDefined();

    await user.clear(search);

    await screen.findByText('Acme Components');
    expect(screen.getByText('Cedar Works')).toBeDefined();
  });

  it('blocks an empty customer name before calling the API', async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByText('Acme Components');

    await user.click(screen.getByRole('button', { name: 'New memo' }));
    await screen.findByRole('heading', { name: 'New memo' });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Enter a customer name before saving.'),
    ).toBeDefined();
    expect(memoApi.create).not.toHaveBeenCalled();
  });

  it('creates a memo once a name is entered', async () => {
    const user = userEvent.setup();
    memoApi.create.mockResolvedValue({
      id: 4,
      name: 'Delta Freight',
      notes: null,
      createdAt: '2026-09-04T10:00:00.000Z',
    });
    await renderPage();
    await screen.findByText('Acme Components');

    await user.click(screen.getByRole('button', { name: 'New memo' }));
    await screen.findByRole('heading', { name: 'New memo' });
    await user.type(
      screen.getByLabelText('Customer name'),
      '  Delta Freight  ',
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(memoApi.create).toHaveBeenCalledWith(expect.anything(), {
        name: 'Delta Freight',
        notes: null,
      }),
    );
    expect(await screen.findByText('Customer memo created')).toBeDefined();
  });

  it('leaves records untouched when deletion is cancelled', async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByText('Acme Components');

    await openDeleteDialog();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(memoApi.remove).not.toHaveBeenCalled();
    expect(screen.getByText('Acme Components')).toBeDefined();
  });

  it('removes the record only after deletion is confirmed', async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByText('Acme Components');

    await openDeleteDialog();
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(memoApi.remove).toHaveBeenCalledWith(expect.anything(), 1),
    );
    await waitFor(() =>
      expect(screen.queryByText('Acme Components')).toBeNull(),
    );
    expect(screen.getByText('Beacon Supplies')).toBeDefined();
  });
});
