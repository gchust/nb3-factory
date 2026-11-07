import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import locales from '../../client/locales/index.js';
import { TooltipProvider } from '../../client/components/ui/tooltip';

const mocks = vi.hoisted(() => ({
  session: { user: { id: 'admin-1' } } as { user: { id: string } } | null,
  request: vi.fn(),
  toastAdd: vi.fn(),
}));

vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({ session: mocks.session, isPending: false }),
}));
vi.mock('@nocobase/app-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nocobase/app-client')>();
  const client = { request: mocks.request };
  return {
    ...actual,
    useApiClient: () => client,
  };
});
vi.mock('#components/ui/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#components/ui/toast')>();
  return { ...actual, toast: { add: mocks.toastAdd } };
});

import DocumentAdministrationPage from '../../client/pages/settings/documents/index.tsx';

let runtime: I18nRuntime;

beforeEach(async () => {
  mocks.session = { user: { id: 'admin-1' } };
  mocks.request.mockReset();
  mocks.toastAdd.mockReset();
  mocks.request.mockImplementation(
    async ({
      path,
      method,
    }: {
      readonly path: string;
      readonly method?: string;
    }) => {
      if (path.startsWith('documentsAdministration/users?')) {
        return {
          data: {
            users: [
              {
                id: 'yi',
                name: 'Yi',
                email: 'yi@example.com',
                roles: ['documents.reader'],
                disabledAt: null,
              },
            ],
            total: 1,
          },
        };
      }
      if (path === 'users/yi/disable' && method === 'POST') {
        return { data: { disabledAt: '2026-10-02T09:00:00.000Z' } };
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

function Frame({
  children,
}: {
  readonly children: ReactElement;
}): ReactElement {
  return (
    <MemoryRouter>
      <I18nProvider runtime={runtime}>
        <TooltipProvider>{children}</TooltipProvider>
      </I18nProvider>
    </MemoryRouter>
  );
}

it('disables a departing account from People and roles', async () => {
  const user = userEvent.setup();
  render(
    <Frame>
      <DocumentAdministrationPage />
    </Frame>,
  );

  expect(await screen.findByText('Yi')).toBeInTheDocument();
  expect(screen.getByText('Active')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Manage roles' }));
  await user.click(
    await screen.findByRole('menuitem', { name: 'Disable account' }),
  );

  const dialog = await screen.findByRole('alertdialog');
  expect(within(dialog).getByText('Disable this account?')).toBeVisible();
  await user.click(
    within(dialog).getByRole('button', { name: 'Disable account' }),
  );

  await waitFor(() =>
    expect(mocks.request).toHaveBeenCalledWith({
      path: 'users/yi/disable',
      method: 'POST',
    }),
  );
  expect(await screen.findByText('Disabled')).toBeInTheDocument();
  expect(mocks.toastAdd).toHaveBeenCalledWith({
    title: 'Account disabled',
    type: 'success',
  });
});

it('enables a disabled account again', async () => {
  mocks.request.mockImplementation(
    async ({
      path,
      method,
    }: {
      readonly path: string;
      readonly method?: string;
    }) => {
      if (path.startsWith('documentsAdministration/users?')) {
        return {
          data: {
            users: [
              {
                id: 'yi',
                name: 'Yi',
                email: 'yi@example.com',
                roles: ['documents.reader'],
                disabledAt: '2026-10-02T09:00:00.000Z',
              },
            ],
            total: 1,
          },
        };
      }
      if (path === 'users/yi/enable' && method === 'POST') {
        return { data: { disabledAt: null } };
      }
      throw new Error(`Unexpected request: ${method ?? 'GET'} ${path}`);
    },
  );

  const user = userEvent.setup();
  render(
    <Frame>
      <DocumentAdministrationPage />
    </Frame>,
  );

  expect(await screen.findByText('Disabled')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Manage roles' }));
  await user.click(
    await screen.findByRole('menuitem', { name: 'Enable account' }),
  );

  await waitFor(() =>
    expect(mocks.request).toHaveBeenCalledWith({
      path: 'users/yi/enable',
      method: 'POST',
    }),
  );
  expect(await screen.findByText('Active')).toBeInTheDocument();
});
