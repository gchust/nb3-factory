import { ApiClientError } from '@nocobase/app-client';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DevicesPage from '../../client/pages/devices/index.js';
import enUS from '../../client/locales/en-US.js';

const { api, refresh } = vi.hoisted(() => ({
  api: { request: vi.fn() },
  refresh: vi.fn(),
}));

vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
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

const device = {
  id: '3',
  code: 'EQ-003',
  name: 'Projector',
  status: 'borrowed',
  notes: null,
  createdAt: '2026-01-05T09:00:00.000Z',
  updatedAt: null,
};

function renderAt(url: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/devices',
        element: <DevicesPage />,
        children: [
          { path: 'new', element: <p>Create device</p> },
          { path: ':deviceId', element: <p>Edit device</p> },
        ],
      },
    ],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />, { wrapper: I18n });
  return router;
}

describe('devices page', () => {
  beforeEach(() => {
    api.request.mockReset();
    refresh.mockReset();
  });

  it('loads the requested page and keeps the filter in the create link', async () => {
    api.request.mockResolvedValue({
      data: [device],
      meta: { page: 1, pageSize: 20, total: 1 },
    });
    renderAt('/devices?status=borrowed');

    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      enUS['status.loading'],
    );
    expect(await screen.findByText('EQ-003')).toBeVisible();
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'devices?page=1&pageSize=20&status=borrowed',
      }),
    );
    expect(
      screen.getByRole('button', { name: enUS.devices.create.action }),
    ).toHaveAttribute('href', '/devices/new?status=borrowed');
    expect(screen.getByText('Projector')).toBeVisible();
    expect(
      screen.getAllByText(enUS.devices.status.borrowed).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(enUS.devices.list.noNotes)).toBeVisible();
  });

  it('opens a row edit route with the current query', async () => {
    api.request.mockResolvedValue({
      data: [device],
      meta: { page: 1, pageSize: 20, total: 1 },
    });
    const router = renderAt('/devices?status=borrowed&page=1');

    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Actions for Projector',
      }),
    );
    const edit = await screen.findByRole('menuitem', {
      name: enUS.actions.edit,
    });
    expect(edit).toHaveAttribute('href', '/devices/3?status=borrowed&page=1');

    await userEvent.click(edit);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/devices/3'),
    );
    expect(router.state.location.search).toBe('?status=borrowed&page=1');
  });

  it('applies a status filter from the page controls', async () => {
    api.request.mockResolvedValue({
      data: [device],
      meta: { page: 1, pageSize: 20, total: 1 },
    });
    const router = renderAt('/devices');

    await screen.findByText('EQ-003');
    await userEvent.click(
      screen.getByRole('combobox', { name: enUS.devices.filters.status }),
    );
    await userEvent.click(
      await screen.findByRole('option', {
        name: enUS.devices.status.available,
      }),
    );

    await waitFor(() =>
      expect(router.state.location.search).toBe('?status=available'),
    );
    await waitFor(() =>
      expect(api.request).toHaveBeenLastCalledWith(
        expect.objectContaining({
          path: 'devices?page=1&pageSize=20&status=available',
        }),
      ),
    );
  });

  it('offers the only create action in the empty state', async () => {
    api.request.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });
    renderAt('/devices');

    expect(await screen.findByText(enUS.devices.empty.title)).toBeVisible();
    expect(
      screen.getByRole('button', { name: enUS.devices.create.action }),
    ).toHaveAttribute('href', '/devices/new');
  });

  it('clears a filter that matches nothing and reloads without it', async () => {
    api.request.mockResolvedValueOnce({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });
    const router = renderAt('/devices?status=borrowed');

    expect(
      await screen.findByText(enUS.devices.empty.filteredTitle),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', { name: enUS.devices.filters.clear }),
    );

    await waitFor(() => expect(router.state.location.search).toBe(''));
    await waitFor(() =>
      expect(api.request).toHaveBeenLastCalledWith(
        expect.objectContaining({ path: 'devices?page=1&pageSize=20' }),
      ),
    );
  });

  it('explains an ended session instead of offering a retry', async () => {
    api.request.mockRejectedValue(
      new ApiClientError('Unauthorized', {
        status: 401,
        method: 'GET',
        url: '/api/devices',
      }),
    );
    renderAt('/devices');

    expect(
      await screen.findByText(enUS['status.sessionExpired']),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: enUS['status.retry'] }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: enUS.actions.signInAgain }),
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
