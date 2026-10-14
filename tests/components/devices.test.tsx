// The device ledger's page and form, exercised against the real components with the API client and the toaster
// replaced, following the page test harness in `page-harness.test.tsx`.
import { ApiClientError } from '@nocobase/app-client';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, type ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DevicesPage from '../../client/pages/devices/index.js';
import NewDevicePage from '../../client/pages/devices/new.js';
import enUS from '../../client/locales/en-US.js';
import zhCN from '../../client/locales/zh-CN.js';

const { api, toaster, refresh } = vi.hoisted(() => ({
  api: { request: vi.fn() },
  toaster: { show: vi.fn(), close: vi.fn() },
  refresh: vi.fn(),
}));

vi.mock('@nocobase/app-client', async (original) => ({
  // Keep the real module, so `ApiClientError` stays the class the page checks with `instanceof`.
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

const zhRuntime = await createTestI18nRuntime({
  application: {
    namespace: '@nocobase/app-template-default',
    resources: zhCN,
  },
});

function I18nZh({ children }: { readonly children: ReactNode }): ReactElement {
  return <TestI18nProvider runtime={zhRuntime}>{children}</TestI18nProvider>;
}

const device = {
  id: 'd1',
  reference: 'DEV-0001',
  name: '便携投影仪 / Portable projector',
  status: 'available',
  remark: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T03:04:00.000Z',
};

function meta(total = 1) {
  return { page: 1, pageSize: 100, total };
}

/** The page as the application routes it: the list at /devices with the create dialog as its child route. */
function renderAt(url: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/devices',
        element: <DevicesPage />,
        children: [{ path: 'new', element: <NewDevicePage /> }],
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
    toaster.show.mockReset();
    refresh.mockReset();
  });

  it('loads the list with the request the page is expected to send', async () => {
    api.request.mockResolvedValue({ data: [device], meta: meta() });
    renderAt('/devices');

    expect(await screen.findByText('DEV-0001')).toBeInTheDocument();
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'devices',
        query: { status: undefined, pageSize: 100 },
      }),
    );
  });

  it('renders the stored name unchanged and the status through its label', async () => {
    api.request.mockResolvedValue({ data: [device], meta: meta() });
    renderAt('/devices');

    // The device's own name is data: it is shown exactly as the user entered it, in either language.
    expect(
      await screen.findByText('便携投影仪 / Portable projector'),
    ).toBeVisible();
    // The status is the application's own vocabulary: it follows the chosen language.
    expect(screen.getByText(enUS.devices.status.available)).toBeVisible();
  });

  it('applies the status filter from the URL to the request', async () => {
    api.request.mockResolvedValue({
      data: [{ ...device, status: 'borrowed' }],
      meta: meta(),
    });
    renderAt('/devices?status=borrowed');

    await screen.findByText('DEV-0001');
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'devices',
        query: { status: 'borrowed', pageSize: 100 },
      }),
    );
    expect(
      within(screen.getByRole('table')).getByText(enUS.devices.status.borrowed),
    ).toBeVisible();
  });

  it('shows the empty state and its only create action when nothing exists', async () => {
    api.request.mockResolvedValue({ data: [], meta: meta(0) });
    renderAt('/devices');

    expect(await screen.findByText(enUS.devices.empty.title)).toBeVisible();
    expect(
      screen.getByRole('button', { name: enUS.devices.create.action }),
    ).toBeInTheDocument();
  });

  it('says when the page cap cut the list', async () => {
    api.request.mockResolvedValue({ data: [device], meta: meta(250) });
    renderAt('/devices');

    expect(
      await screen.findByText(enUS.devices.capNotice.replace('{{count}}', '1')),
    ).toBeVisible();
  });

  it('treats a 401 as an ended session and offers to sign in again', async () => {
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

  it('explains a 403 without offering a retry', async () => {
    api.request.mockRejectedValue(
      new ApiClientError('Forbidden', {
        status: 403,
        method: 'GET',
        url: '/api/devices',
      }),
    );
    renderAt('/devices');

    expect(await screen.findByText(enUS.devices.error.forbidden)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: enUS['status.retry'] }),
    ).not.toBeInTheDocument();
  });
  it('renders the application copy in Chinese when the language is zh-CN', async () => {
    api.request.mockResolvedValue({
      data: [{ ...device, status: 'borrowed' }],
      meta: meta(),
    });
    const router = createMemoryRouter(
      [
        {
          path: '/devices',
          element: <DevicesPage />,
          children: [{ path: 'new', element: <NewDevicePage /> }],
        },
      ],
      { initialEntries: ['/devices'] },
    );
    render(<RouterProvider router={router} />, { wrapper: I18nZh });

    expect(await screen.findByText('DEV-0001')).toBeVisible();
    // The device's own name is data and is never translated.
    expect(screen.getByText('便携投影仪 / Portable projector')).toBeVisible();
    // The system's own words follow the chosen language.
    expect(screen.getByText(zhCN.devices.status.borrowed)).toBeVisible();
    expect(
      screen.getByRole('button', { name: zhCN.devices.create.action }),
    ).toBeInTheDocument();
  });
});

describe('devices create dialog', () => {
  beforeEach(() => {
    api.request.mockReset();
    toaster.show.mockReset();
    refresh.mockReset();
    api.request.mockImplementation(({ method }: { method?: string }) =>
      method === 'POST'
        ? Promise.resolve({ data: { ...device, id: 'd2', name: 'New device' } })
        : Promise.resolve({ data: [], meta: meta(0) }),
    );
  });

  it('creates a device, reports it, and returns to the list', async () => {
    const router = renderAt('/devices/new');
    expect(
      await screen.findByRole('dialog', { name: enUS.devices.create.title }),
    ).toBeInTheDocument();

    await userEvent.type(
      screen.getByRole('textbox', { name: /Reference/ }),
      'DEV-3000',
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: /Name/ }),
      'New device',
    );
    await userEvent.click(
      screen.getByRole('button', { name: enUS.actions.create }),
    );

    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'devices',
          method: 'POST',
          json: {
            reference: 'DEV-3000',
            name: 'New device',
            status: 'available',
            remark: null,
          },
        }),
      ),
    );
    expect(toaster.show).toHaveBeenCalledWith({
      type: 'success',
      title: enUS.devices.create.success.replace('{{name}}', 'New device'),
    });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/devices'),
    );
  });

  it('shows a duplicate reference at the reference field, in the chosen language', async () => {
    api.request.mockImplementation(({ method }: { method?: string }) =>
      method === 'POST'
        ? Promise.reject(
            new ApiClientError('Conflict', {
              status: 409,
              reason: 'DEVICE_REFERENCE_TAKEN',
              method: 'POST',
              url: '/api/devices',
            }),
          )
        : Promise.resolve({ data: [], meta: meta(0) }),
    );
    renderAt('/devices/new');

    await userEvent.type(
      screen.getByRole('textbox', { name: /Reference/ }),
      'DEV-0001',
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: /Name/ }),
      'Another device',
    );
    await userEvent.click(
      screen.getByRole('button', { name: enUS.actions.create }),
    );

    expect(
      await screen.findByText(enUS.devices.form.referenceTaken),
    ).toBeVisible();
    expect(toaster.show).not.toHaveBeenCalled();
  });

  it('requires a reference and a name before submitting', async () => {
    renderAt('/devices/new');
    await screen.findByRole('dialog');

    await userEvent.click(
      screen.getByRole('button', { name: enUS.actions.create }),
    );

    expect(
      await screen.findByText(enUS.devices.form.referenceRequired),
    ).toBeVisible();
    expect(screen.getByText(enUS.devices.form.nameRequired)).toBeVisible();
    expect(api.request).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
