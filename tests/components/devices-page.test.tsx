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

import enUS from '../../client/locales/en-US.js';
import DevicesPage from '../../client/pages/devices/index.js';
import NewDevicePage from '../../client/pages/devices/new.js';

// `vi.mock` factories run before this file's imports, so everything they use is created here.
const { api, toaster, refresh } = vi.hoisted(() => ({
  api: { request: vi.fn() },
  toaster: { show: vi.fn(), close: vi.fn() },
  refresh: vi.fn(),
}));

vi.mock('@nocobase/app-client', async (original) => ({
  // Keep the real module so `ApiClientError` stays the class the page compares with `instanceof`.
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
  useToaster: () => toaster,
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({ refresh }),
}));

// Strict: a key the locale lacks fails the test instead of rendering as text.
const runtime = await createTestI18nRuntime({
  application: {
    namespace: '@nocobase/app-template-default',
    resources: enUS,
  },
});

function I18n({ children }: { readonly children: ReactNode }): ReactElement {
  return <TestI18nProvider runtime={runtime}>{children}</TestI18nProvider>;
}

interface DeviceFixture {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: 'available' | 'borrowed';
}

function device(overrides: Partial<DeviceFixture> = {}): DeviceFixture {
  return {
    id: '1',
    code: 'DEV-1',
    name: 'Alpha',
    status: 'available',
    ...overrides,
  };
}

/** The page as the application routes it: the list at /devices with the create dialog as its child route. */
function renderAt(url: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/devices',
        element: <DevicesPage />,
        children: [
          { path: 'new', element: <NewDevicePage /> },
          { path: 'edit/:deviceId', element: <p>Edit</p> },
        ],
      },
    ],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />, { wrapper: I18n });
  return router;
}

beforeEach(() => {
  api.request.mockReset();
  toaster.show.mockReset();
  refresh.mockReset();
  // Base UI reads both while rendering.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

describe('devices list page', () => {
  it('lists the devices with translated statuses', async () => {
    api.request.mockResolvedValue({
      data: [
        device({ id: '1', code: 'DEV-1', name: 'Alpha', status: 'available' }),
        device({ id: '2', code: 'DEV-2', name: 'Beta', status: 'borrowed' }),
      ],
    });
    renderAt('/devices');

    expect(
      screen.getByRole('heading', { level: 1, name: enUS.devices.title }),
    ).toBeInTheDocument();
    expect(await screen.findByText('DEV-1')).toBeInTheDocument();
    expect(screen.getByText(enUS.devices.status.available)).toBeInTheDocument();
    expect(screen.getByText(enUS.devices.status.borrowed)).toBeInTheDocument();
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'devices' }),
    );
  });

  it('shows the empty state with a way to add the first device', async () => {
    api.request.mockResolvedValue({ data: [] });
    renderAt('/devices');

    expect(
      await screen.findByText(enUS.devices.empty.title),
    ).toBeInTheDocument();
    for (const add of screen.getAllByRole('button', {
      name: enUS.devices.add,
    })) {
      expect(add).toHaveAttribute('href', '/devices/new');
    }
  });

  it('reads the status filter from the URL and clears it', async () => {
    api.request.mockResolvedValue({
      data: [
        device({
          id: '9',
          code: 'B-1',
          name: 'Borrowed one',
          status: 'borrowed',
        }),
      ],
    });
    const router = renderAt('/devices?status=borrowed');

    expect(await screen.findByText('B-1')).toBeInTheDocument();
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'devices',
        query: { status: 'borrowed' },
      }),
    );

    await userEvent.click(
      screen.getByRole('button', { name: enUS.devices.filter.clear }),
    );

    await waitFor(() => expect(router.state.location.search).toBe(''));
    await waitFor(() =>
      expect(api.request).toHaveBeenLastCalledWith(
        expect.objectContaining({
          path: 'devices',
          query: { status: undefined },
        }),
      ),
    );
  });

  it('treats a 401 as an ended session, not as a failure to retry', async () => {
    api.request.mockRejectedValue(
      new ApiClientError('Unauthorized', {
        status: 401,
        method: 'GET',
        url: '/api/devices',
      }),
    );
    renderAt('/devices');

    const signInAgain = await screen.findByRole('button', {
      name: enUS.actions.signInAgain,
    });
    expect(
      screen.queryByRole('button', { name: enUS['status.retry'] }),
    ).toBeNull();

    await userEvent.click(signInAgain);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('offers a retry when the list fails for another reason', async () => {
    api.request.mockRejectedValue(
      new ApiClientError('Server error', {
        status: 500,
        method: 'GET',
        url: '/api/devices',
      }),
    );
    renderAt('/devices');

    expect(
      await screen.findByText(enUS.devices.errors.loadFailed),
    ).toBeInTheDocument();
    api.request.mockResolvedValue({ data: [] });
    await userEvent.click(
      screen.getByRole('button', { name: enUS['status.retry'] }),
    );
    expect(
      await screen.findByText(enUS.devices.empty.title),
    ).toBeInTheDocument();
  });

  it('opens the create dialog from its URL', async () => {
    api.request.mockResolvedValue({ data: [] });
    renderAt('/devices/new');

    expect(
      await screen.findByRole('dialog', { name: enUS.devices.create.title }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: enUS.actions.create }),
    ).toHaveAttribute('form', 'device-new-form');
  });
});
