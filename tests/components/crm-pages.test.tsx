import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ApiClient } from '@nocobase/app-client';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The three CRM pages against a stub `ApiClient`. The server is already covered
 * by the migration, seed, service and route tests; what only a rendered page can
 * show is that the columns, the customer total and the form validation actually
 * reach a reader. The stub answers the same request shapes the real routes do,
 * so the page also exercises the relative API paths it builds.
 */

const customers = [
  {
    id: 1,
    name: '星辰科技',
    industry: '软件服务',
    createdAt: '2026-09-28T00:00:00.000Z',
    updatedAt: '2026-09-28T00:00:00.000Z',
  },
  {
    id: 2,
    name: '蓝海制造',
    industry: '装备制造',
    createdAt: '2026-09-28T00:00:00.000Z',
    updatedAt: '2026-09-28T00:00:00.000Z',
  },
];

function initialOpportunities() {
  return [
    {
      id: 10,
      name: '企业版年度订阅',
      customerId: 1,
      amount: 120000,
      stage: 'following',
      createdAt: '2026-09-28T00:00:00.000Z',
      updatedAt: '2026-09-28T00:00:00.000Z',
    },
    {
      id: 11,
      name: '数据平台实施服务',
      customerId: 1,
      amount: 80000,
      stage: 'won',
      createdAt: '2026-09-28T00:00:00.000Z',
      updatedAt: '2026-09-28T00:00:00.000Z',
    },
    {
      id: 12,
      name: '生产线改造一期',
      customerId: 2,
      amount: 50000,
      stage: 'lost',
      createdAt: '2026-09-28T00:00:00.000Z',
      updatedAt: '2026-09-28T00:00:00.000Z',
    },
  ];
}

let opportunities = initialOpportunities();

const request = vi.fn();

vi.mock('@nocobase/app-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nocobase/app-client')>()),
  useApiClient: () => ({ request }) as unknown as ApiClient,
}));

vi.mock('@nocobase/i18n/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nocobase/i18n/client')>()),
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: (key: string, options?: Record<string, unknown>) =>
      (options?.defaultValue as string | undefined) ?? key,
  }),
}));

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
  opportunities = initialOpportunities();
  request.mockClear();
});

function customerDetail(id: number) {
  const own = opportunities.filter((row) => row.customerId === id);
  const customer = customers.find((row) => row.id === id);
  return {
    ...customer,
    contacts: [],
    opportunities: own,
    totalAmount: own.reduce((sum, row) => sum + row.amount, 0),
  };
}

interface RequestOptions {
  path: string;
  method?: string;
  query?: Record<string, unknown>;
  json?: Record<string, unknown>;
}

request.mockImplementation((options: RequestOptions) => {
  const { path, method = 'GET', query, json } = options;
  if (path === 'customers' && method === 'GET') {
    return Promise.resolve({ data: customers });
  }
  if (path.startsWith('customers/') && method === 'GET') {
    return Promise.resolve({
      data: customerDetail(Number(path.split('/')[1])),
    });
  }
  if (path === 'opportunities' && method === 'GET') {
    const stage = query?.stage;
    return Promise.resolve({
      data: stage
        ? opportunities.filter((row) => row.stage === stage)
        : opportunities,
    });
  }
  if (path === 'opportunities' && method === 'POST' && json) {
    const created = {
      id: Math.max(...opportunities.map((row) => row.id)) + 1,
      name: String(json.name),
      customerId: Number(json.customerId),
      amount: Number(json.amount),
      stage: String(json.stage),
      createdAt: '2026-09-28T00:00:00.000Z',
      updatedAt: '2026-09-28T00:00:00.000Z',
    };
    opportunities.push(created);
    return Promise.resolve({ data: created });
  }
  if (path === 'contacts' && method === 'GET') {
    return Promise.resolve({ data: [] });
  }
  return Promise.resolve({ data: null });
});

function renderPage(page: ReactElement): ReturnType<typeof render> {
  return render(<MemoryRouter>{page}</MemoryRouter>);
}

describe('CRM pages', () => {
  it('lists customers and shows a customer’s own opportunity total', async () => {
    const { default: CustomersPage } =
      await import('../../client/pages/customers/index.js');
    renderPage(<CustomersPage />);

    expect(await screen.findByText('星辰科技')).toBeTruthy();
    expect(screen.getByText('蓝海制造')).toBeTruthy();

    fireEvent.click(screen.getByText('星辰科技'));

    expect(await screen.findByText('Total opportunity amount')).toBeTruthy();
    // 120000 + 80000, formatted in the page’s language.
    expect(await screen.findByText('CN¥200,000.00')).toBeTruthy();
    expect(screen.getByText('数据平台实施服务')).toBeTruthy();
    // 蓝海制造’s opportunity is not part of 星辰科技’s detail.
    expect(screen.queryByText('生产线改造一期')).toBeNull();
  });

  it('renders opportunities with their stage and amount', async () => {
    const { default: OpportunitiesPage } =
      await import('../../client/pages/opportunities/index.js');
    renderPage(<OpportunitiesPage />);

    expect(await screen.findByText('企业版年度订阅')).toBeTruthy();
    expect(screen.getByText('won')).toBeTruthy();
    expect(screen.getByText('CN¥120,000.00')).toBeTruthy();
  });

  it('adds an opportunity from the customer detail and updates the total', async () => {
    const { default: CustomersPage } =
      await import('../../client/pages/customers/index.js');
    renderPage(<CustomersPage />);

    fireEvent.click(await screen.findByText('星辰科技'));
    expect(await screen.findByText('CN¥200,000.00')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'New opportunity' }));
    fireEvent.change(await screen.findByLabelText('Name'), {
      target: { value: '追加数据模块' },
    });
    fireEvent.change(screen.getByLabelText('Amount'), {
      target: { value: '50000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    // The panel reloads and the same customer’s total now includes the new
    // opportunity, without any other customer’s amounts.
    expect(await screen.findByText('CN¥250,000.00')).toBeTruthy();
    expect(await screen.findByText('追加数据模块')).toBeTruthy();
  });

  it('blocks a customer save with no name', async () => {
    const { CustomerDialog } =
      await import('../../client/pages/customers/customer-dialog.js');
    render(
      <CustomerDialog
        open
        customer={null}
        onOpenChange={() => {}}
        onSaved={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByText('Name is required.')).toBeTruthy();
    });
    // Nothing reached the server.
    expect(
      request.mock.calls.some(([options]) => options.method === 'POST'),
    ).toBe(false);
  });
});
