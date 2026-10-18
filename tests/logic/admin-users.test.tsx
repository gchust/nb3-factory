import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import locales from '../../client/locales/index.js';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  show: vi.fn(),
}));
vi.mock('@nocobase/app-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nocobase/app-client')>();
  const client = { request: mocks.request };
  return {
    ...actual,
    useApiClient: () => client,
    useToaster: () => ({ show: mocks.show, close: vi.fn() }),
  };
});
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({
    session: { user: { id: 'admin' } },
    isPending: false,
  }),
}));

import AdminUsersPage from '../../client/pages/admin/users/index.js';
import AdminUserPermissionsDialog from '../../client/pages/admin/users/permissions.js';

const ADMIN = {
  id: 'admin',
  name: 'Admin',
  email: 'admin@example.com',
  emailVerified: true,
  disabledAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  roleScopes: { app: ['root'] },
};
const LIN = {
  id: 'lin',
  name: '林知夏',
  email: 'zhixia.lin@example.com',
  emailVerified: true,
  disabledAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  roleScopes: { app: ['library.reader'] },
};
const OPTIONS = {
  roleScopes: [
    {
      key: 'app',
      label: 'Permission sets',
      selection: 'multiple',
      requiredOnCreate: false,
      hasAuthenticatedDefaultAccess: true,
      options: [
        {
          value: 'library.reader',
          label: 'Reader',
        },
        {
          value: 'library.librarian',
          label: 'Librarian',
        },
        {
          value: 'root',
          label: 'Root',
          assignable: false,
          removable: false,
        },
      ],
    },
  ],
};

let runtime: I18nRuntime;
let linDisabled = false;
let linRoles: string[] = ['library.reader'];

beforeEach(async () => {
  linDisabled = false;
  linRoles = ['library.reader'];
  mocks.request.mockReset();
  mocks.show.mockReset();
  mocks.request.mockImplementation(
    async ({
      path,
      method,
      json,
    }: {
      readonly path: string;
      readonly method?: string;
      readonly json?: { readonly value?: string | readonly string[] };
    }) => {
      if (path === 'users/options') return { data: OPTIONS };
      if (path === 'users') {
        return {
          data: [
            ADMIN,
            {
              ...LIN,
              disabledAt: linDisabled ? '2026-01-02T00:00:00.000Z' : null,
              roleScopes: { app: linRoles },
            },
          ],
          meta: { total: 2, page: 1, pageSize: 20 },
        };
      }
      if (path === 'users/lin/disable' && method === 'POST') {
        linDisabled = true;
        return { data: { ...LIN, disabledAt: '2026-01-02T00:00:00.000Z' } };
      }
      if (path === 'users/lin/roleScopes/app' && method === 'PUT') {
        linRoles = Array.isArray(json?.value)
          ? [...json.value]
          : [String(json?.value)];
        return { data: { ...LIN, roleScopes: { app: linRoles } } };
      }
      throw new Error(`Unexpected request: ${method ?? 'GET'} ${path}`);
    },
  );
  runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: 'test-app',
  });
  runtime.registerApplicationNamespace('test-app', locales);
  await runtime.init('en-US');
});

async function openRowMenu(row: HTMLElement): Promise<void> {
  const trigger = within(row).getByRole('button', { name: 'Actions' });
  act(() => trigger.focus());
  await userEvent.keyboard('{Enter}');
}

function renderPage(): void {
  const router = createMemoryRouter(
    [
      {
        path: '/admin/users',
        element: <AdminUsersPage />,
        children: [
          {
            path: ':userId/permissions',
            element: <AdminUserPermissionsDialog />,
          },
        ],
      },
    ],
    { initialEntries: ['/admin/users'] },
  );
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <I18nProvider runtime={runtime}>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

it('disables an account from the user management page', async () => {
  const user = userEvent.setup();
  renderPage();

  expect(
    await screen.findByRole('heading', { name: 'Users and permissions' }),
  ).toBeInTheDocument();
  const row = (await screen.findByText('林知夏')).closest('tr');
  expect(row).not.toBeNull();
  expect(within(row!).getByText('Reader')).toBeInTheDocument();

  await openRowMenu(row!);
  await user.click(
    await screen.findByRole('menuitem', { name: 'Disable account' }),
  );
  const dialog = await screen.findByRole('alertdialog');
  await user.click(
    within(dialog).getByRole('button', { name: 'Disable account' }),
  );

  await waitFor(() =>
    expect(mocks.request).toHaveBeenCalledWith({
      path: 'users/lin/disable',
      method: 'POST',
    }),
  );
  expect(await within(row!).findByText('Disabled')).toBeInTheDocument();
});

it('edits a person permission sets in a route dialog', async () => {
  const user = userEvent.setup();
  renderPage();

  const row = (await screen.findByText('林知夏')).closest('tr');
  expect(row).not.toBeNull();
  await openRowMenu(row!);
  await user.click(
    await screen.findByRole('menuitem', { name: 'Manage permissions' }),
  );

  expect(
    await screen.findByRole('dialog', { name: 'Manage permissions' }),
  ).toBeInTheDocument();
  const librarian = screen.getByRole('checkbox', { name: /Librarian/u });
  expect(librarian).not.toBeChecked();
  await user.click(librarian);
  await user.click(screen.getByRole('button', { name: 'Save permissions' }));

  await waitFor(() =>
    expect(mocks.request).toHaveBeenCalledWith({
      path: 'users/lin/roleScopes/app',
      method: 'PUT',
      json: { value: ['library.reader', 'library.librarian'] },
    }),
  );
  expect(
    await screen.findByRole('heading', { name: 'Users and permissions' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('dialog', { name: 'Manage permissions' }),
  ).not.toBeInTheDocument();
});
