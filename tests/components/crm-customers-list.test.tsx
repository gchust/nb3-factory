// The customers list stays mounted while one of its child routes (a customer
// detail or the CSV import) is shown, so a customer created there is invisible
// until the list reloads. The page keys its loader on `location.key`, which
// changes on every navigation, so returning to the list refetches it. This test
// pins that navigation actually triggers a reload.
import { render, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import CustomersPage from '../../client/pages/crm/customers/index.js';

const { fetchCustomers } = vi.hoisted(() => ({
  fetchCustomers: vi.fn(),
}));

vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => ({ request: vi.fn() }),
}));

vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useCan: () => ({
    can: true,
    isPending: false,
    error: undefined,
    retry: vi.fn(),
  }),
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  useLocale: () => ({ locale: 'en-US' }),
}));

vi.mock('../../client/pages/crm/api.js', () => ({
  fetchCustomers,
  deleteCustomer: vi.fn(),
}));

describe('CRM customers list', () => {
  beforeEach(() => {
    fetchCustomers.mockReset();
    fetchCustomers.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });
  });

  it('reloads when returning from a child route, so imported rows appear', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/crm/customers',
          element: <CustomersPage />,
          children: [{ path: 'import', element: <p>import page</p> }],
        },
      ],
      { initialEntries: ['/crm/customers'] },
    );
    render(<RouterProvider router={router} />);

    await waitFor(() => expect(fetchCustomers).toHaveBeenCalledTimes(1));

    await router.navigate('/crm/customers/import');
    const beforeReturn = fetchCustomers.mock.calls.length;

    await router.navigate('/crm/customers');
    await waitFor(() =>
      expect(fetchCustomers.mock.calls.length).toBeGreaterThan(beforeReturn),
    );
  });
});
