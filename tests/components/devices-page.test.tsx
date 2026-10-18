// The device ledger pages: the list, the status filter, and the create and edit
// dialogs. The pages are the real ones; only the API client and the session are
// stubbed, so the test exercises the requests, the copy and the error handling the
// application actually ships.
import { ApiClientError } from '@nocobase/app-client';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, type ReactNode } from 'react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DevicesPage from '../../client/pages/devices/index.js';
import EditDevicePage from '../../client/pages/devices/edit.js';
import NewDevicePage from '../../client/pages/devices/new.js';
import enUS from '../../client/locales/en-US.js';

const { api, toaster, refresh } = vi.hoisted(() => ({
  api: { request: vi.fn() },
  toaster: { show: vi.fn(), close: vi.fn() },
  refresh: vi.fn(),
}));

vi.mock('@nocobase/app-client', async (original) => ({
  // Keep the real module, so `ApiClientError` stays the class the pages check.
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
  useToaster: () => toaster,
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({ refresh }),
}));

// The real runtime, strict: a key the resources lack fails the test instead of
// rendering as text. `enUS` is the application's own copy, so this also proves the
// devices keys are present in the locale file the application ships.
const runtime = await createTestI18nRuntime({
  application: {
    namespace: '@nocobase/app-template-default',
    resources: enUS,
  },
});

function I18n({ children }: { readonly children: ReactNode }): ReactElement {
  return <TestI18nProvider runtime={runtime}>{children}</TestI18nProvider>;
}

const sample = [
  { id: '1', code: 'DEV-001', name: '会议室投影仪', status: 'available' },
  { id: '2', code: 'DEV-002', name: '笔记本电脑', status: 'borrowed' },
] as const;

/** The pages as the application routes them: the list with both dialogs as child routes. */
function renderAt(url: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/devices',
        element: <DevicesPage />,
        children: [
          { path: 'new', element: <NewDevicePage /> },
          { path: 'edit/:deviceId', element: <EditDevicePage /> },
        ],
      },
    ],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />, { wrapper: I18n });
  return router;
}

function listResponse(data: readonly unknown[] = sample) {
  return { data, meta: { page: 1, pageSize: 100, total: data.length } };
}

describe('device ledger pages', () => {
  beforeEach(() => {
    api.request.mockReset();
    toaster.show.mockReset();
    refresh.mockReset();
  });

  it('lists every device with its code, name and translated status', async () => {
    api.request.mockResolvedValue(listResponse());
    renderAt('/devices');

    expect(await screen.findByText('DEV-001')).toBeInTheDocument();
    expect(screen.getByText('会议室投影仪')).toBeInTheDocument();
    expect(screen.getByText('DEV-002')).toBeInTheDocument();
    expect(screen.getByText('笔记本电脑')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByText('Borrowed')).toBeInTheDocument();

    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'devices',
        query: { status: undefined, pageSize: 100 },
      }),
    );
  });

  it('asks the endpoint for only the status in the URL', async () => {
    api.request.mockResolvedValue(
      listResponse(sample.filter((device) => device.status === 'borrowed')),
    );
    renderAt('/devices?status=borrowed');

    expect(await screen.findByText('DEV-002')).toBeInTheDocument();
    expect(screen.queryByText('DEV-001')).not.toBeInTheDocument();
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'devices',
        query: { status: 'borrowed', pageSize: 100 },
      }),
    );
  });

  it('shows the empty state, and its create action, when there are no devices', async () => {
    api.request.mockResolvedValue(listResponse([]));
    renderAt('/devices');

    expect(
      await screen.findByText(enUS.devices.empty.title),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: enUS.devices.create.action }),
    ).toHaveAttribute('href', '/devices/new');
  });

  it('treats a 401 as an ended session rather than a failure to retry', async () => {
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
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: enUS['status.retry'] }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: enUS.actions.signInAgain }),
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('reports a missing code and name in the language the user reads', async () => {
    api.request.mockResolvedValue(listResponse([]));
    renderAt('/devices/new');

    expect(
      await screen.findByRole('dialog', { name: enUS.devices.create.title }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: enUS.actions.create }),
    );

    expect(
      await screen.findByText(enUS.devices.form.codeRequired),
    ).toBeInTheDocument();
    expect(
      screen.getByText(enUS.devices.form.nameRequired),
    ).toBeInTheDocument();
    expect(api.request).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('reports a code another device already uses instead of an internal error', async () => {
    api.request.mockImplementation(
      ({ method }: { readonly method?: string }) =>
        method === 'POST'
          ? Promise.reject(
              new ApiClientError('Conflict', {
                status: 409,
                reason: 'DEVICE_CODE_TAKEN',
                domain: 'devices',
                method: 'POST',
                url: '/api/devices',
              }),
            )
          : Promise.resolve(listResponse([])),
    );
    renderAt('/devices/new');

    await screen.findByRole('dialog', { name: enUS.devices.create.title });
    await userEvent.type(
      screen.getByLabelText(new RegExp(enUS.devices.fields.code)),
      'DEV-001',
    );
    await userEvent.type(
      screen.getByLabelText(new RegExp(enUS.devices.fields.name)),
      '会议室投影仪',
    );
    await userEvent.click(
      screen.getByRole('button', { name: enUS.actions.create }),
    );

    expect(
      await screen.findByText(enUS.devices.form.codeTaken),
    ).toBeInTheDocument();
    expect(toaster.show).not.toHaveBeenCalled();
  });

  it('creates a device, shows the success message and returns to the list', async () => {
    const created = {
      id: '3',
      code: 'DEV-003',
      name: '手持终端',
      status: 'available',
    };
    api.request.mockImplementation(
      ({ method }: { readonly method?: string }) =>
        method === 'POST'
          ? Promise.resolve({ data: created })
          : Promise.resolve(listResponse([])),
    );
    const router = renderAt('/devices/new');

    await screen.findByRole('dialog', { name: enUS.devices.create.title });
    await userEvent.type(
      screen.getByLabelText(new RegExp(enUS.devices.fields.code)),
      'DEV-003',
    );
    await userEvent.type(
      screen.getByLabelText(new RegExp(enUS.devices.fields.name)),
      '手持终端',
    );
    await userEvent.click(
      screen.getByRole('button', { name: enUS.actions.create }),
    );

    await waitFor(() =>
      expect(toaster.show).toHaveBeenCalledWith({
        type: 'success',
        title: enUS.devices.create.success.replace('{{name}}', '手持终端'),
      }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/devices'),
    );
  });

  it('loads a device into the edit dialog and saves it with PATCH', async () => {
    api.request.mockImplementation(
      ({
        path,
        method,
      }: {
        readonly path: string;
        readonly method?: string;
      }) => {
        if (method === 'PATCH') {
          return Promise.resolve({
            data: { ...sample[1], name: '笔记本电脑（新）' },
          });
        }
        if (path === 'devices/2') {
          return Promise.resolve({ data: sample[1] });
        }
        return Promise.resolve(listResponse());
      },
    );
    const router = renderAt('/devices/edit/2');

    expect(
      await screen.findByRole('dialog', { name: enUS.devices.edit.title }),
    ).toBeInTheDocument();
    const nameInput = await screen.findByLabelText(
      new RegExp(enUS.devices.fields.name),
    );
    expect(nameInput).toHaveValue('笔记本电脑');

    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, '笔记本电脑（新）');
    await userEvent.click(
      screen.getByRole('button', { name: enUS.actions.save }),
    );

    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'devices/2',
          method: 'PATCH',
          json: {
            code: 'DEV-002',
            name: '笔记本电脑（新）',
            status: 'borrowed',
          },
        }),
      ),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/devices'),
    );
  });
});
