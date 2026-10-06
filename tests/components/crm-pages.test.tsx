// Exercises the CRM pages the way the browser does: the list loads its data, a child route opens its dialog, the
// detail drawer shows one customer's own contacts, opportunities and amount total, and the forms reject invalid input.
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, type ReactNode } from 'react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import CustomersPage from '../../client/pages/crm/customers/index.js';
import NewCustomerPage from '../../client/pages/crm/customers/new.js';
import EditCustomerPage from '../../client/pages/crm/customers/edit.js';
import CustomerDetailPage from '../../client/pages/crm/customers/detail/index.js';
import OpportunitiesPage from '../../client/pages/crm/opportunities/index.js';
import NewOpportunityPage from '../../client/pages/crm/opportunities/new.js';
import EditOpportunityPage from '../../client/pages/crm/opportunities/edit.js';
import enUS from '../../client/locales/en-US.js';

const { api, toaster, refresh } = vi.hoisted(() => ({
  api: { request: vi.fn() },
  toaster: { show: vi.fn(), close: vi.fn() },
  refresh: vi.fn(),
}));

vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
  useToaster: () => toaster,
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({ refresh }),
}));

const runtime = await createTestI18nRuntime({
  application: {
    namespace: '@nocobase/app-template-default',
    resources: enUS,
  },
});

function I18n({ children }: { readonly children: ReactNode }): ReactElement {
  return <TestI18nProvider runtime={runtime}>{children}</TestI18nProvider>;
}

const CUSTOMER = {
  id: 'c1',
  name: 'Acme',
  industry: 'Software',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

const OPPORTUNITY = {
  id: 'o1',
  name: 'Acme upgrade',
  customerId: 'c1',
  customerName: 'Acme',
  amount: 150000,
  stage: 'won' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

function routes() {
  return [
    {
      path: '/customers',
      element: <CustomersPage />,
      children: [
        { path: 'new', element: <NewCustomerPage /> },
        { path: 'edit/:customerId', element: <EditCustomerPage /> },
        {
          path: ':customerId',
          element: <CustomerDetailPage />,
          children: [{ path: 'edit', element: <EditCustomerPage /> }],
        },
      ],
    },
    {
      path: '/opportunities',
      element: <OpportunitiesPage />,
      children: [
        { path: 'new', element: <NewOpportunityPage /> },
        { path: 'edit/:opportunityId', element: <EditOpportunityPage /> },
      ],
    },
  ];
}

function renderAt(url: string) {
  const router = createMemoryRouter(routes(), { initialEntries: [url] });
  render(<RouterProvider router={router} />, { wrapper: I18n });
  return router;
}

beforeEach(() => {
  api.request.mockReset();
  toaster.show.mockReset();
  refresh.mockReset();
});

describe('CRM pages', () => {
  it('loads the customer list and links to the create dialog', async () => {
    api.request.mockResolvedValue({ data: [CUSTOMER], meta: { total: 1 } });
    renderAt('/customers');

    expect(await screen.findByText('Acme')).toBeInTheDocument();
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'customers' }),
    );
    expect(
      screen.getByRole('button', { name: enUS.customers.create.action }),
    ).toHaveAttribute('href', '/customers/new');
  });

  it('requires a customer name before creating', async () => {
    api.request.mockResolvedValue({ data: [], meta: { total: 0 } });
    renderAt('/customers/new');

    expect(
      await screen.findByRole('dialog', { name: enUS.customers.create.title }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: enUS.actions.create }),
    );

    expect(
      await screen.findByText(enUS.customers.form.nameRequired),
    ).toBeInTheDocument();
    expect(api.request).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('shows one customer\u2019s contacts, opportunities and amount total in its drawer', async () => {
    api.request.mockImplementation((options: { path: string }) => {
      if (options.path === 'customers/c1') {
        return Promise.resolve({
          data: {
            ...CUSTOMER,
            contacts: [
              {
                id: 'p1',
                name: '\u5f20\u4f1f',
                contact: '13800000001',
                customerId: 'c1',
                customerName: 'Acme',
                createdAt: CUSTOMER.createdAt,
                updatedAt: CUSTOMER.updatedAt,
              },
            ],
            opportunities: [OPPORTUNITY],
            opportunityAmountTotal: 150000,
          },
        });
      }
      return Promise.resolve({ data: [CUSTOMER], meta: { total: 1 } });
    });
    renderAt('/customers/c1');

    expect(
      await screen.findByText(enUS.customers.detail.total),
    ).toBeInTheDocument();
    // The total is 150000 here; the opportunity's own amount repeats it in the list below.
    expect(await screen.findAllByText('150000')).not.toHaveLength(0);
    expect(screen.getByText('\u5f20\u4f1f')).toBeInTheDocument();
    expect(screen.getByText(enUS.opportunities.stage.won)).toBeInTheDocument();
  });

  it('filters the opportunity list by stage through the URL', async () => {
    api.request.mockResolvedValue({ data: [OPPORTUNITY], meta: { total: 1 } });
    renderAt('/opportunities?stage=won');

    expect(await screen.findByText('Acme upgrade')).toBeInTheDocument();
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'opportunities',
        query: expect.objectContaining({ stage: 'won' }),
      }),
    );
  });

  it('rejects a negative amount in the opportunity form', async () => {
    api.request.mockResolvedValue({ data: [], meta: { total: 0 } });
    renderAt('/opportunities/new');

    await screen.findByRole('dialog', {
      name: enUS.opportunities.create.title,
    });
    await userEvent.type(
      screen.getByLabelText(new RegExp(enUS.opportunities.fields.name)),
      'Deal',
    );
    const amount = screen.getByLabelText(
      new RegExp(enUS.opportunities.fields.amount),
    );
    await userEvent.clear(amount);
    await userEvent.type(amount, '-5');
    await userEvent.click(
      screen.getByRole('button', { name: enUS.actions.create }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(enUS.opportunities.form.amountInvalid),
      ).toBeInTheDocument(),
    );
  });
});
