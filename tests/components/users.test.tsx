import type {
  ManagedUser,
  UsersOptions,
} from '@nocobase/app-plugin-users/client/user-client';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import UsersPage from '../../client/pages/users/index.js';

const { api, toaster } = vi.hoisted(() => ({
  api: { request: vi.fn() },
  toaster: { show: vi.fn(), close: vi.fn() },
}));

vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
  useToaster: () => toaster,
}));

const runtime = await createTestI18nRuntime({
  application: {
    namespace: '@nocobase/app-template-default',
    resources: enUS,
  },
});

function Providers({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <TestI18nProvider runtime={runtime}>
      <MemoryRouter>{children}</MemoryRouter>
    </TestI18nProvider>
  );
}

const options: UsersOptions = {
  roleScopes: [
    {
      key: 'app',
      label: 'Permission sets',
      selection: 'multiple',
      requiredOnCreate: false,
      hasAuthenticatedDefaultAccess: true,
      options: [
        {
          value: 'root',
          label: 'Root',
          assignable: false,
          removable: false,
        },
        {
          value: 'service-desk-engineer',
          label: enUS.serviceDesk.permissionSets.engineer,
        },
        {
          value: 'service-desk-manager',
          label: enUS.serviceDesk.permissionSets.manager,
        },
      ],
    },
  ],
};

const user: ManagedUser = {
  id: 'user-2',
  name: 'Grace Hopper',
  username: 'grace',
  email: 'grace@example.com',
  emailVerified: true,
  disabledAt: null,
  createdAt: '2026-01-01T09:00:00.000Z',
  updatedAt: '2026-01-01T09:00:00.000Z',
  roleScopes: { app: ['service-desk-engineer', 'root'] },
};

describe('user role management', () => {
  beforeEach(() => {
    api.request.mockReset();
    toaster.show.mockReset();
  });

  it('lists accounts and saves the additional roles a manager assigns', async () => {
    const userEventInstance = userEvent.setup();
    const updated: ManagedUser = {
      ...user,
      roleScopes: {
        app: ['service-desk-engineer', 'root', 'service-desk-manager'],
      },
    };
    api.request.mockImplementation(
      async (request: { path: string; method?: string; json?: unknown }) => {
        if (request.path === 'users/options') {
          return { data: options };
        }
        if (request.path === 'users' && request.method === undefined) {
          return {
            data: [user],
            meta: { page: 1, pageSize: 20, total: 1 },
          };
        }
        if (
          request.path === 'users/user-2/roleScopes/app' &&
          request.method === 'PUT'
        ) {
          return { data: updated };
        }
        throw new Error(`Unexpected request ${request.path}`);
      },
    );

    render(<UsersPage />, { wrapper: Providers });

    expect(await screen.findByText('Grace Hopper')).toBeVisible();
    expect(screen.getByText('grace@example.com · grace')).toBeVisible();
    expect(
      screen.getByText(enUS.serviceDesk.permissionSets.engineer),
    ).toBeVisible();
    expect(
      screen.getByText(enUS.serviceDesk.permissionSets.employee),
    ).toBeVisible();
    expect(
      screen.getByText(enUS.serviceDesk.users.defaultRoleHint),
    ).toBeVisible();

    await userEventInstance.click(
      screen.getByRole('button', {
        name: enUS.serviceDesk.users.manageRoles,
      }),
    );

    const root = screen.getByRole('checkbox', { name: 'Root' });
    expect(root).toBeChecked();
    expect(root).toHaveAttribute('aria-disabled', 'true');
    const engineer = screen.getByRole('checkbox', {
      name: enUS.serviceDesk.permissionSets.engineer,
    });
    expect(engineer).toBeChecked();
    expect(engineer).toBeEnabled();

    await userEventInstance.click(
      screen.getByRole('checkbox', {
        name: enUS.serviceDesk.permissionSets.manager,
      }),
    );
    await userEventInstance.click(
      screen.getByRole('button', {
        name: enUS.serviceDesk.users.saveRoles,
      }),
    );

    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith({
        path: 'users/user-2/roleScopes/app',
        method: 'PUT',
        json: {
          value: ['service-desk-engineer', 'root', 'service-desk-manager'],
        },
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(toaster.show).toHaveBeenCalledWith({
      type: 'success',
      title: enUS.serviceDesk.users.saved,
    });
  });

  it('explains a permission denial instead of rendering an empty list', async () => {
    const { ApiClientError } = await import('@nocobase/app-client');
    api.request.mockRejectedValue(
      new ApiClientError('Forbidden', {
        status: 403,
        method: 'GET',
        url: '/main/api/users/options',
      }),
    );

    render(<UsersPage />, { wrapper: Providers });

    expect(
      await screen.findByText(enUS.serviceDesk.users.deniedTitle),
    ).toBeVisible();
  });
});
