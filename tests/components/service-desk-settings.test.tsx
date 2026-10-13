// The service desk staff page: who may open it, the merged staff and directory list, and changing one person's role.
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import ServiceDeskSettingsPage from '../../client/pages/settings/service-desk/index.js';
import type {
  ServiceDeskMe,
  StaffMember,
} from '../../client/hooks/service-desk.js';

interface RequestOptions {
  readonly path: string;
  readonly method?: string;
  readonly json?: unknown;
}

const { api, toaster } = vi.hoisted(() => ({
  api: { request: vi.fn<(options: RequestOptions) => Promise<unknown>>() },
  toaster: { show: vi.fn(), close: vi.fn() },
}));

vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
  useToaster: () => toaster,
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({ refresh: vi.fn() }),
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

const T = enUS.serviceDesk.settings;

function me(helpdesk: boolean): ServiceDeskMe {
  return {
    userId: 'u1',
    name: 'Dana',
    email: 'dana@example.com',
    helpdesk,
    engineer: false,
  };
}

const staff: readonly StaffMember[] = [
  {
    user: { id: 'u1', name: 'Dana', email: 'dana@example.com' },
    role: 'helpdesk',
  },
  {
    user: { id: 'u2', name: 'Erin', email: 'erin@example.com' },
    role: 'engineer',
  },
];

function renderPage(): void {
  const router = createMemoryRouter(
    [{ path: '/settings/service-desk', element: <ServiceDeskSettingsPage /> }],
    { initialEntries: ['/settings/service-desk'] },
  );
  render(<RouterProvider router={router} />, { wrapper: I18n });
}

describe('the service desk staff page', () => {
  beforeEach(() => {
    api.request.mockReset();
    toaster.show.mockReset();
  });

  it('shows the staff and the directory only to the service desk', async () => {
    api.request.mockImplementation(async ({ path }) => {
      if (path === 'serviceDesk/me') return { data: me(true) };
      if (path === 'serviceDesk/staff') return { data: staff };
      return {
        data: [{ id: 'u3', name: 'Frank', email: 'frank@example.com' }],
      };
    });
    renderPage();

    expect(await screen.findByText('Dana')).toBeVisible();
    expect(screen.getByText('Erin')).toBeVisible();
    // The directory user who is not on the staff list is shown as an ordinary employee.
    expect(screen.getByText('Frank')).toBeVisible();
    expect(screen.getAllByLabelText(T.roleLabel)).toHaveLength(3);
  });

  it('refuses the page to everyone else', async () => {
    api.request.mockImplementation(async ({ path }) => {
      if (path === 'serviceDesk/me') return { data: me(false) };
      return { data: [] };
    });
    renderPage();

    expect(await screen.findByText(T.helpdeskOnly)).toBeVisible();
    expect(screen.queryByText('Erin')).not.toBeInTheDocument();
  });

  it('saves a role change and reloads the list', async () => {
    const user = userEvent.setup();
    api.request.mockImplementation(async ({ path }) => {
      if (path === 'serviceDesk/me') return { data: me(true) };
      if (path === 'serviceDesk/staff') return { data: staff };
      return {
        data: [{ id: 'u3', name: 'Frank', email: 'frank@example.com' }],
      };
    });
    renderPage();

    const selects = await screen.findAllByLabelText(T.roleLabel);
    // The third row is Frank, the directory employee.
    await user.click(selects[2]);
    await user.click(
      await screen.findByRole('option', {
        name: T.role.engineer,
      }),
    );

    await waitFor(() => {
      const saved = api.request.mock.calls
        .map(([options]) => options)
        .find((options) => options.path === 'serviceDesk/staff/u3');
      expect(saved?.method).toBe('PUT');
      expect(saved?.json).toMatchObject({ role: 'engineer' });
    });
  });
});
