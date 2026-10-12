// The staff page: the list of people with their permission sets and account state, the permission editor it opens as
// a child route, and the disable action the acceptance criteria name (a disabled person loses access immediately).
import { ApiClientError } from '@nocobase/app-client';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import StaffPage from '../../client/pages/staff/index.js';
import StaffRolesPage from '../../client/pages/staff/roles.js';
import enUS from '../../client/locales/en-US.js';

const { api, toaster } = vi.hoisted(() => ({
  api: { request: vi.fn() },
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

const OPTIONS = {
  roleScopes: [
    {
      key: 'app',
      label: 'Permission sets',
      selection: 'multiple',
      hasAuthenticatedDefaultAccess: true,
      options: [
        {
          value: 'material-editor',
          label: 'Materials editor',
          description: 'Maintains the materials they own.',
        },
        {
          value: 'material-reader',
          label: 'Materials reader',
          description: 'Reads published, non-confidential materials.',
        },
        {
          value: 'root',
          label: 'Root',
          assignable: false,
        },
      ],
    },
  ],
};

const JIA = {
  id: 'jia',
  name: '资料员甲',
  username: 'material_jia',
  email: 'jia@example.com',
  emailVerified: true,
  disabledAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  roleScopes: { app: ['material-editor'] },
};

const YI = {
  id: 'yi',
  name: '阅读者乙',
  username: 'material_yi',
  email: 'yi@example.com',
  emailVerified: true,
  disabledAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  roleScopes: { app: ['material-reader'] },
};

const ROOT = {
  id: 'root',
  name: 'Super Admin',
  username: 'nocobase',
  email: 'admin@nocobase.com',
  emailVerified: true,
  disabledAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  roleScopes: { app: ['root'] },
};

function mockUsers(users: readonly Record<string, unknown>[]): void {
  api.request.mockImplementation((request: { readonly path: string }) => {
    if (request.path === 'users') {
      return Promise.resolve({
        data: users,
        meta: { total: users.length, page: 1, pageSize: 100 },
      });
    }
    if (request.path === 'users/options') {
      return Promise.resolve({ data: OPTIONS });
    }
    return Promise.resolve({ data: {} });
  });
}

function renderAt(url: string): void {
  const router = createMemoryRouter(
    [
      {
        path: '/settings/staff',
        element: <StaffPage />,
        children: [{ path: ':userId', element: <StaffRolesPage /> }],
      },
    ],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />, { wrapper: I18n });
}

describe('staff page', () => {
  beforeEach(() => {
    api.request.mockReset();
    toaster.show.mockReset();
  });

  it('lists people with their permission sets and account state', async () => {
    mockUsers([JIA, YI]);
    renderAt('/settings/staff');

    expect(await screen.findByText('资料员甲')).toBeInTheDocument();
    expect(screen.getByText('Materials editor')).toBeInTheDocument();
    expect(screen.getByText('阅读者乙')).toBeInTheDocument();
    expect(screen.getByText('Materials reader')).toBeInTheDocument();
    // Both seeded accounts are active.
    expect(screen.getAllByText(enUS['staff.status.enabled'])).toHaveLength(2);
  });

  it('edits one person\u2019s permission sets in the child route', async () => {
    mockUsers([JIA, YI]);
    renderAt('/settings/staff/yi');

    // The dialog names the person and shows every assignable set.
    expect(
      await screen.findByText(
        enUS['staff.roles.description'].replace('{{name}}', '阅读者乙'),
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Materials editor').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: enUS.actions.save }),
    ).toBeInTheDocument();
  });

  it('refuses to edit a protected built-in permission set', async () => {
    mockUsers([ROOT]);
    renderAt('/settings/staff/root');

    expect(
      await screen.findByText(enUS['staff.roles.locked']),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: enUS.actions.save }),
    ).not.toBeInTheDocument();
  });

  it('disables an account and refreshes the list', async () => {
    const user = userEvent.setup();
    mockUsers([YI]);
    renderAt('/settings/staff');

    await user.click(
      await screen.findByRole('button', {
        name: enUS['staff.actions.more'].replace('{{name}}', '阅读者乙'),
      }),
    );
    await user.click(
      await screen.findByRole('menuitem', {
        name: enUS['staff.status.disable.action'],
      }),
    );

    // The confirmation dialog names the person and explains the consequence.
    expect(
      await screen.findByText(enUS['staff.status.disable.title']),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: enUS['staff.status.disable.action'] }),
    );

    expect(api.request).toHaveBeenCalledWith({
      path: 'users/yi/disable',
      method: 'POST',
    });
    expect(toaster.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    );
  });

  it('shows the session-expired state when the list request is unauthenticated', async () => {
    api.request.mockRejectedValue(
      new ApiClientError('Unauthorized', {
        status: 401,
        method: 'GET',
        url: '/api/users',
      }),
    );
    renderAt('/settings/staff');

    expect(
      await screen.findByText(enUS['status.sessionExpired']),
    ).toBeInTheDocument();
  });
});
