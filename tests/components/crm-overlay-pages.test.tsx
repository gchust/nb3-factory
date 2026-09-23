import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import EditContactDialog from '../../client/pages/crm/contacts/edit.js';
import NewContactDialog from '../../client/pages/crm/contacts/new.js';
import EditCustomerDialog from '../../client/pages/crm/customers/edit.js';
import NewCustomerDialog from '../../client/pages/crm/customers/new.js';
import EditOpportunityDialog from '../../client/pages/crm/opportunities/edit.js';
import NewOpportunityDialog from '../../client/pages/crm/opportunities/new.js';

const apiRequest = vi.fn();

// The pages read `useRouteOverlay()` through a descendant of `RouteDialog`. This
// suite renders each page in a real router so a hook called in the page component
// that owns the dialog (outside the overlay provider) fails loudly instead of
// rendering 'Unable to load page'.
vi.mock('@nocobase/app-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nocobase/app-client')>()),
  useApiClient: () => ({ request: apiRequest }),
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const customer = {
  id: 1,
  name: 'Acme',
  industry: null,
  createdAt: '2026-01-01T00:00:00.000',
  updatedAt: '2026-01-01T00:00:00.000',
};
const contact = {
  id: 1,
  name: 'Jane',
  contactInfo: null,
  customerId: 1,
  customerName: 'Acme',
};
const opportunity = {
  id: 1,
  name: 'Renewal',
  customerId: 1,
  customerName: 'Acme',
  amount: 120000,
  stage: 'following' as const,
};
const customerDetail = {
  ...customer,
  contacts: [contact],
  opportunities: [opportunity],
  opportunityAmountTotal: 120000,
};

function respond({ path }: { path: string }): Promise<{ data: unknown }> {
  if (path === 'crm/customers') return Promise.resolve({ data: [customer] });
  if (path.startsWith('crm/customers/'))
    return Promise.resolve({ data: customerDetail });
  if (path === 'crm/contacts') return Promise.resolve({ data: [contact] });
  if (path === 'crm/opportunities')
    return Promise.resolve({ data: [opportunity] });
  return Promise.reject(new Error(`Unexpected path: ${path}`));
}

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(respond);
});

function renderAt(
  path: string,
  initialEntry: string,
  element: ReactElement,
): ReturnType<typeof createMemoryRouter> {
  const router = createMemoryRouter([{ path, element }], {
    initialEntries: [initialEntry],
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe('CRM overlay pages', () => {
  it('closes the add customer dialog through the overlay context', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/crm/customers',
          element: <Outlet />,
          children: [{ path: 'new', element: <NewCustomerDialog /> }],
        },
      ],
      { initialEntries: ['/crm/customers/new'] },
    );
    render(<RouterProvider router={router} />);

    expect(await screen.findByLabelText('crm.customers.name')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'crm.common.cancel' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/crm/customers'),
    );
  });

  it('renders the add contact form', async () => {
    renderAt('/crm/contacts/new', '/crm/contacts/new', <NewContactDialog />);
    expect(await screen.findByLabelText('crm.contacts.name')).toBeVisible();
  });

  it('renders the add opportunity form', async () => {
    renderAt(
      '/crm/opportunities/new',
      '/crm/opportunities/new',
      <NewOpportunityDialog />,
    );
    expect(
      await screen.findByLabelText('crm.opportunities.name'),
    ).toBeVisible();
  });

  it('renders the edit customer form with its record', async () => {
    renderAt(
      '/crm/customers/:customerId/edit',
      '/crm/customers/1/edit',
      <EditCustomerDialog />,
    );
    const name = await screen.findByLabelText('crm.customers.name');
    expect(name).toHaveValue('Acme');
  });

  it('renders the edit contact form with its record', async () => {
    renderAt(
      '/crm/contacts/:contactId/edit',
      '/crm/contacts/1/edit',
      <EditContactDialog />,
    );
    const name = await screen.findByLabelText('crm.contacts.name');
    expect(name).toHaveValue('Jane');
  });

  it('renders the edit opportunity form with its record', async () => {
    renderAt(
      '/crm/opportunities/:opportunityId/edit',
      '/crm/opportunities/1/edit',
      <EditOpportunityDialog />,
    );
    const name = await screen.findByLabelText('crm.opportunities.name');
    expect(name).toHaveValue('Renewal');
  });
});
