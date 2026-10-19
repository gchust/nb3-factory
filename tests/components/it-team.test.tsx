import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { Outlet, RouterProvider, createMemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import ServiceDeskTeamPage from '../../client/pages/it-team/index.js';
import AddTeamMemberPage from '../../client/pages/it-team/new.js';

const { api, toaster } = vi.hoisted(() => ({
  api: { request: vi.fn() },
  toaster: { show: vi.fn(), close: vi.fn() },
}));

vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
  useToaster: () => toaster,
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useCan: () => ({
    can: true,
    isPending: false,
    error: undefined,
    retry: vi.fn(),
  }),
}));

const runtime = await createTestI18nRuntime({
  application: {
    namespace: '@nocobase/app-template-default',
    resources: enUS,
  },
});

const users = [
  {
    id: 'manager-1',
    name: 'Mo Manager',
    username: 'manager',
    email: 'manager@example.com',
    emailVerified: true,
    disabledAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    roleScopes: { app: ['it-service-desk'] },
  },
  {
    id: 'engineer-1',
    name: 'Erin Engineer',
    username: 'engineer',
    email: 'erin@example.com',
    emailVerified: true,
    disabledAt: null,
    createdAt: '2026-10-02T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    roleScopes: { app: ['it-engineer'] },
  },
];

function Wrapper({ children }: { readonly children: ReactNode }): ReactElement {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const router = createMemoryRouter(
    [
      {
        path: '/it-team',
        element: children,
        children: [{ path: 'new', element: <div /> }],
      },
    ],
    { initialEntries: ['/it-team'] },
  );
  return (
    <TestI18nProvider runtime={runtime}>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </TestI18nProvider>
  );
}

describe('service desk team page', () => {
  beforeEach(() => {
    api.request.mockReset();
    toaster.show.mockReset();
    api.request.mockImplementation(
      ({
        path,
        method,
      }: {
        readonly path: string;
        readonly method?: string;
      }) => {
        if (path === 'users' && method === 'POST') {
          return Promise.resolve({ data: users[1] });
        }
        if (path === 'users') {
          return Promise.resolve({
            data: users,
            meta: { total: users.length, page: 1, pageSize: 100 },
          });
        }
        if (path === 'tickets/sample-data') {
          return Promise.resolve({
            data: { loaded: true, overdueReminded: 1 },
          });
        }
        return Promise.reject(new Error(`Unexpected request: ${path}`));
      },
    );
  });

  it('lists the team with their roles and offers account creation', async () => {
    render(<ServiceDeskTeamPage />, { wrapper: Wrapper });

    expect(await screen.findByText('Mo Manager')).toBeVisible();
    expect(screen.getByText('Erin Engineer')).toBeVisible();
    expect(screen.getByText('manager@example.com')).toBeVisible();
    expect(
      screen.getByRole('link', {
        name: enUS.serviceDesk.actions.addMember,
      }),
    ).toHaveAttribute('href', '/it-team/new');
    expect(
      screen.getByRole('combobox', {
        name: `${enUS.serviceDesk.columns.role} · Erin Engineer`,
      }),
    ).toHaveTextContent(enUS.serviceDesk.roles['it-engineer']);
  });

  it('loads the demonstration data from the page', async () => {
    render(<ServiceDeskTeamPage />, { wrapper: Wrapper });

    await screen.findByText('Mo Manager');
    await userEvent.click(
      screen.getByRole('button', { name: enUS.serviceDesk.demo.load }),
    );

    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'tickets/sample-data',
          method: 'POST',
        }),
      ),
    );
    await waitFor(() =>
      expect(toaster.show).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          title: enUS.serviceDesk.demo.loaded,
        }),
      ),
    );
  });

  it('creates a team member with the chosen role and closes', async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const router = createMemoryRouter(
      [
        {
          path: '/it-team',
          element: (
            <div>
              Team roster
              <Outlet />
            </div>
          ),
          children: [{ path: 'new', element: <AddTeamMemberPage /> }],
        },
      ],
      { initialEntries: ['/it-team/new'] },
    );
    render(
      <TestI18nProvider runtime={runtime}>
        <QueryClientProvider client={client}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </TestI18nProvider>,
    );

    await userEvent.type(
      await screen.findByLabelText(enUS.serviceDesk.fields.name),
      'New Engineer',
    );
    await userEvent.type(
      screen.getByLabelText(enUS.serviceDesk.fields.email),
      'new.engineer@example.com',
    );
    await userEvent.type(
      screen.getByLabelText(enUS.serviceDesk.fields.password),
      'Demo123456!',
    );
    await userEvent.click(
      screen.getByRole('button', { name: enUS.serviceDesk.create.submit }),
    );

    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'users',
          method: 'POST',
          json: expect.objectContaining({
            name: 'New Engineer',
            email: 'new.engineer@example.com',
            roleScopes: { app: ['it-engineer'] },
          }),
        }),
      ),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/it-team'),
    );
  });
});
