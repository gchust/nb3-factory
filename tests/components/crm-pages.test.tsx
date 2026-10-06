import { render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import CustomerDetailPage from '../../client/pages/crm/customers/detail/index.tsx';
import OpportunitiesPage from '../../client/pages/crm/opportunities/index.tsx';
import { formatAmount } from '../../client/pages/crm/format.ts';
import type {
  CustomerDetail,
  Opportunity,
} from '../../client/pages/crm/types.ts';

/**
 * The CRM pages against a stubbed API client.
 *
 * The server contract is covered by `crm-domain.test.ts` and `crm-routes.test.ts`; what those cannot see is the
 * browser half — that the customer detail page actually prints the contacts, the opportunities and the amount
 * total it was handed, and that the opportunity list asks the server for the stage chosen in the URL.
 */

const { apiClient } = vi.hoisted(() => ({
  apiClient: { request: vi.fn() },
}));

vi.mock('@nocobase/app-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nocobase/app-client')>()),
  useApiClient: () => apiClient,
}));

vi.mock('@nocobase/i18n/client', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@nocobase/i18n/client')>();
  const enUS = (await import('../../client/locales/en-US.ts')).default;

  function lookup(key: string): string | undefined {
    const flat = (enUS as Record<string, unknown>)[key];
    if (typeof flat === 'string') return flat;
    let node: unknown = enUS;
    for (const part of key.split('.')) {
      if (!node || typeof node !== 'object') return undefined;
      node = (node as Record<string, unknown>)[part];
    }
    return typeof node === 'string' ? node : undefined;
  }

  return {
    ...original,
    useLocale: () => ({
      locale: 'en-US',
      locales: [],
      setLocale: async () => {},
      switching: false,
      error: undefined,
    }),
    useTranslation: () => ({
      i18n: { language: 'en-US' },
      t: (key: string, options?: Record<string, unknown>) =>
        (lookup(key) ?? key).replace(
          /\{\{(\w+)\}\}/gu,
          (whole, name: string) =>
            options && name in options ? String(options[name]) : whole,
        ),
    }),
  };
});

const DETAIL: CustomerDetail = {
  id: 1,
  name: '蓝海科技',
  industry: '信息技术',
  createdAt: '2026-02-01T02:00:00.000',
  updatedAt: '2026-02-01T02:00:00.000',
  contacts: [
    {
      id: 11,
      name: '张伟',
      phone: '13800000001',
      email: 'zhangwei@lanhai.example.com',
      customerId: 1,
      customerName: '蓝海科技',
      createdAt: '2026-02-01T02:00:00.000',
      updatedAt: '2026-02-01T02:00:00.000',
    },
  ],
  opportunities: [
    {
      id: 21,
      name: '数据平台续约',
      customerId: 1,
      customerName: '蓝海科技',
      amount: 120000,
      stage: 'following',
      createdAt: '2026-02-01T02:00:00.000',
      updatedAt: '2026-02-01T02:00:00.000',
    },
    {
      id: 22,
      name: '云迁移项目',
      customerId: 1,
      customerName: '蓝海科技',
      amount: 80000,
      stage: 'won',
      createdAt: '2026-02-01T02:00:00.000',
      updatedAt: '2026-02-01T02:00:00.000',
    },
  ],
  opportunityAmountTotal: 200000,
};

const OPPORTUNITIES: readonly Opportunity[] = [
  {
    id: 21,
    name: '数据平台续约',
    customerId: 1,
    customerName: '蓝海科技',
    amount: 120000,
    stage: 'following',
    createdAt: '2026-02-01T02:00:00.000',
    updatedAt: '2026-02-01T02:00:00.000',
  },
  {
    id: 22,
    name: '云迁移项目',
    customerId: 1,
    customerName: '蓝海科技',
    amount: 80000,
    stage: 'won',
    createdAt: '2026-02-01T02:00:00.000',
    updatedAt: '2026-02-01T02:00:00.000',
  },
];

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
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

beforeEach(() => {
  apiClient.request.mockReset();
});

describe('customer detail page', () => {
  it('shows the customer contacts, opportunities and amount total', async () => {
    apiClient.request.mockResolvedValue({ data: DETAIL });

    render(
      <MemoryRouter initialEntries={['/customers/1']}>
        <Routes>
          <Route
            path='/customers'
            element={<Outlet context={{ reload: () => {} }} />}
          >
            <Route path=':customerId' element={<CustomerDetailPage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: '蓝海科技' }),
    ).toBeVisible();
    // The total comes from the endpoint, formatted for the reader — not recomputed from the rows on screen.
    expect(
      screen.getByText(formatAmount('en-US', DETAIL.opportunityAmountTotal)),
    ).toBeVisible();
    expect(screen.getByText('张伟')).toBeVisible();
    expect(screen.getByText('数据平台续约')).toBeVisible();
    expect(screen.getByText('云迁移项目')).toBeVisible();
  });

  it('reports a record that no longer exists instead of a blank page', async () => {
    const { ApiClientError } = await import('@nocobase/app-client');
    apiClient.request.mockRejectedValue(
      new ApiClientError('Not found', {
        status: 404,
        code: 'NOT_FOUND',
        method: 'GET',
        url: '/api/crm/customers/999',
      }),
    );

    render(
      <MemoryRouter initialEntries={['/customers/999']}>
        <Routes>
          <Route
            path='/customers'
            element={<Outlet context={{ reload: () => {} }} />}
          >
            <Route path=':customerId' element={<CustomerDetailPage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Record not found')).toBeVisible();
  });
});

describe('opportunity list page', () => {
  it('asks the server for the stage selected in the URL and shows only those rows', async () => {
    apiClient.request.mockResolvedValue({ data: [OPPORTUNITIES[1]] });

    render(
      <MemoryRouter initialEntries={['/opportunities?stage=won']}>
        <Routes>
          <Route path='/opportunities' element={<OpportunitiesPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('云迁移项目')).toBeVisible();
    expect(
      apiClient.request.mock.calls.some((call) => {
        const options = call[0] as {
          readonly path?: string;
          readonly query?: { readonly stage?: string };
        };
        return (
          options.path === 'crm/opportunities' && options.query?.stage === 'won'
        );
      }),
    ).toBe(true);
  });
});
