import { ApiClientError } from '@nocobase/app-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Outlet, createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CustomerForm } from '../../client/pages/crm/customer-form';
import CustomersPage from '../../client/pages/crm/customers/index';
import CustomerDetailPage from '../../client/pages/crm/customers/detail/index';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock('@nocobase/app-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nocobase/app-client')>();
  return {
    ...actual,
    useApiClient: () => ({ request: mocks.request }),
  };
});

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      options?: Record<string, unknown> & { defaultValue?: string },
    ) =>
      (options?.defaultValue ?? key).replace(/{{(\w+)}}/g, (_, name: string) =>
        String(options?.[name]),
      ),
  }),
  useLocale: () => ({ locale: 'en-US' }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  mocks.request.mockReset();
});

describe('customers list page', () => {
  it('renders the customers the API returns', async () => {
    mocks.request.mockResolvedValue({
      data: [
        { id: 1, name: '星海科技', industry: '软件服务' },
        { id: 2, name: '恒远贸易', industry: null },
      ],
    });

    render(
      <RouterProvider
        router={createMemoryRouter(
          [{ path: '/crm/customers', element: <CustomersPage /> }],
          { initialEntries: ['/crm/customers'] },
        )}
      />,
    );

    expect(await screen.findByText('星海科技')).toBeInTheDocument();
    expect(screen.getByText('恒远贸易')).toBeInTheDocument();
    expect(mocks.request).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'crm/customers' }),
    );
  });
});

describe('customer detail page', () => {
  function renderDetail() {
    return render(
      <RouterProvider
        router={createMemoryRouter(
          [
            {
              path: '/crm/customers',
              element: <Outlet context={{ reload: () => undefined }} />,
              children: [
                { path: ':customerId', element: <CustomerDetailPage /> },
              ],
            },
          ],
          { initialEntries: ['/crm/customers/1'] },
        )}
      />,
    );
  }

  it('shows the industry, the contacts, the opportunities and the computed total', async () => {
    mocks.request.mockResolvedValue({
      data: {
        id: 1,
        name: '星海科技',
        industry: '软件服务',
        totalAmount: 430000,
        contacts: [
          {
            id: 11,
            name: '张伟',
            contactInfo: '13800000000',
            customerId: 1,
            customerName: '星海科技',
          },
        ],
        opportunities: [
          {
            id: 21,
            name: '企业官网改版',
            customerId: 1,
            customerName: '星海科技',
            amount: 120000,
            stage: 'following',
          },
          {
            id: 22,
            name: '年度采购合同',
            customerId: 1,
            customerName: '星海科技',
            amount: 310000,
            stage: 'won',
          },
        ],
      },
    });

    renderDetail();

    expect(await screen.findByText('张伟')).toBeInTheDocument();
    expect(screen.getByText('软件服务')).toBeInTheDocument();
    // The total is the sum of the two opportunity amounts above, formatted for the locale.
    expect(screen.getByText('430,000')).toBeInTheDocument();
    expect(screen.getByText('企业官网改版')).toBeInTheDocument();
    expect(screen.getByText('年度采购合同')).toBeInTheDocument();
    expect(screen.getByText('crm.stages.following')).toBeInTheDocument();
    expect(screen.getByText('crm.stages.won')).toBeInTheDocument();
  });

  it('shows a not-found message when the record no longer exists', async () => {
    mocks.request.mockRejectedValue(
      new ApiClientError('Not found', {
        status: 404,
        method: 'GET',
        url: '/api/crm/customers/1',
      }),
    );

    renderDetail();

    expect(
      await screen.findByText('crm.customers.detail.notFound'),
    ).toBeInTheDocument();
  });
});

describe('customer form', () => {
  it('reports a missing name instead of submitting', async () => {
    const onSubmitted = vi.fn();
    const { container } = render(
      <CustomerForm formId='customer-form' onSubmitted={onSubmitted} />,
    );

    fireEvent.submit(container.querySelector('form')!);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'crm.form.nameRequired',
    );
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('creates a customer with the values the user typed', async () => {
    const onSubmitted = vi.fn();
    mocks.request.mockResolvedValue({
      data: { id: 5, name: '新客户', industry: null },
    });
    const { container } = render(
      <CustomerForm formId='customer-form' onSubmitted={onSubmitted} />,
    );

    await userEvent.type(
      screen.getByLabelText(/crm\.customers\.fields\.name/),
      '新客户',
    );
    fireEvent.submit(container.querySelector('form')!);

    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith({
        path: 'crm/customers',
        method: 'POST',
        json: { name: '新客户', industry: null },
      }),
    );
    await waitFor(() =>
      expect(onSubmitted).toHaveBeenCalledWith({
        id: 5,
        name: '新客户',
        industry: null,
      }),
    );
  });
});
