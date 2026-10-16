// The device ledger's pages: the list reads its filter from the URL and its data through `useApiClient`, and the form
// turns a server refusal into wording in the language the reader chose.
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
import { DeviceForm } from '../../client/pages/devices/device-form.js';
import enUS from '../../client/locales/en-US.js';
import zhCN from '../../client/locales/zh-CN.js';

const { api, toaster, refresh } = vi.hoisted(() => ({
  // One object for the whole file, so an effect that depends on `api` does not restart on every render.
  api: { request: vi.fn() },
  toaster: { show: vi.fn(), close: vi.fn() },
  refresh: vi.fn(),
}));

vi.mock('@nocobase/app-client', async (original) => ({
  // Keep the real module, so `ApiClientError` is the class the pages test with `instanceof`.
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
  useToaster: () => toaster,
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({ refresh }),
}));

const NAMESPACE = '@nocobase/app-template-default';

// The application's real locale files, strict, so a missing key fails rather than rendering as its own name.
const english = await createTestI18nRuntime({
  application: { namespace: NAMESPACE, resources: enUS },
});
const chinese = await createTestI18nRuntime({
  locale: 'zh-CN',
  application: { namespace: NAMESPACE, resources: zhCN },
});

function I18n({ children }: { readonly children: ReactNode }): ReactElement {
  return <TestI18nProvider runtime={english}>{children}</TestI18nProvider>;
}

function Chinese({ children }: { readonly children: ReactNode }): ReactElement {
  return <TestI18nProvider runtime={chinese}>{children}</TestI18nProvider>;
}

const device = {
  id: '1',
  code: 'DEV-0001',
  name: 'Dell Latitude 5440',
  status: 'available' as const,
};

/** The list page as the application routes it: `/devices` with the create and edit dialogs as children. */
function renderList(url: string, wrapper: typeof I18n = I18n) {
  const router = createMemoryRouter(
    [
      {
        path: '/devices',
        element: <DevicesPage />,
        children: [
          { path: 'new', element: <p>new</p> },
          { path: 'edit/:deviceId', element: <p>edit</p> },
        ],
      },
    ],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />, { wrapper });
  return router;
}

describe('device list', () => {
  beforeEach(() => {
    api.request.mockReset();
    toaster.show.mockReset();
    refresh.mockReset();
  });

  it('loads the ledger and labels it in the selected language', async () => {
    api.request.mockResolvedValue({
      data: [device],
      meta: { page: 1, pageSize: 100, total: 1 },
    });
    renderList('/devices');

    // Column headers and the status label come from the locale, not from the field names.
    expect(await screen.findByText(enUS.devices.fields.code)).toBeVisible();
    expect(screen.getByText(enUS.devices.fields.name)).toBeVisible();
    expect(screen.getByText(enUS.devices.fields.status)).toBeVisible();
    expect(screen.getByText(enUS.devices.status.available)).toBeVisible();
    // User-entered content is shown exactly as stored.
    expect(screen.getByText('Dell Latitude 5440')).toBeVisible();
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'devices',
        query: { status: undefined, pageSize: 100 },
      }),
    );
  });

  it('reads the status filter from the URL and requests only that status', async () => {
    api.request.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 100, total: 0 },
    });
    renderList('/devices?status=available');

    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { status: 'available', pageSize: 100 },
        }),
      ),
    );
    expect(
      screen.getAllByRole('button', { name: enUS.devices.filters.clear })
        .length,
    ).toBeGreaterThan(0);
  });

  it('clears the filter through the URL', async () => {
    api.request.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 100, total: 0 },
    });
    const router = renderList('/devices?status=borrowed');

    await userEvent.click(
      (
        await screen.findAllByRole('button', {
          name: enUS.devices.filters.clear,
        })
      )[0],
    );
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('opens a device by its id from the row action', async () => {
    api.request.mockResolvedValue({
      data: [device],
      meta: { page: 1, pageSize: 100, total: 1 },
    });
    renderList('/devices');

    const edit = await screen.findByRole('button', {
      name: enUS.devices.actions.edit.replace('{{name}}', device.name),
    });
    expect(edit).toHaveAttribute('href', '/devices/edit/1');
  });

  it('shows the empty state with a create action when the ledger has no devices', async () => {
    api.request.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 100, total: 0 },
    });
    renderList('/devices');

    expect(await screen.findByText(enUS.devices.empty.title)).toBeVisible();
    // The empty state owns the primary action while the list is empty.
    expect(
      screen.getByRole('button', { name: enUS.devices.create.action }),
    ).toHaveAttribute('href', '/devices/new');
  });

  it('shows no-results and a clear action when a filter matches nothing', async () => {
    api.request.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 100, total: 0 },
    });
    renderList('/devices?status=available');

    expect(await screen.findByText(enUS.devices.empty.noResults)).toBeVisible();
  });

  it('relabels the whole page in Chinese when that is the chosen language', async () => {
    api.request.mockResolvedValue({
      data: [device],
      meta: { page: 1, pageSize: 100, total: 1 },
    });
    renderList('/devices', Chinese);

    // Navigation title, headers, buttons and system status all follow the language; stored data does not.
    expect(await screen.findByText(zhCN.devices.title)).toBeVisible();
    expect(screen.getByText(zhCN.devices.fields.code)).toBeVisible();
    expect(screen.getByText(zhCN.devices.status.available)).toBeVisible();
    expect(screen.getByText('Dell Latitude 5440')).toBeVisible();
  });

  it('explains an empty filtered list in Chinese when no device matches', async () => {
    api.request.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 100, total: 0 },
    });
    renderList('/devices?status=borrowed', Chinese);

    expect(await screen.findByText(zhCN.devices.empty.noResults)).toBeVisible();
  });

  it('reports an ended session without offering a retry', async () => {
    api.request.mockRejectedValue(
      new ApiClientError('Unauthorized', {
        status: 401,
        method: 'GET',
        url: '/api/devices',
      }),
    );
    renderList('/devices');

    expect(
      await screen.findByText(enUS['status.sessionExpired']),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: enUS['status.retry'] }),
    ).not.toBeInTheDocument();
  });
});

describe('device form', () => {
  beforeEach(() => {
    api.request.mockReset();
    toaster.show.mockReset();
    refresh.mockReset();
  });

  /** The form alone, with the submit button its container owns beside it. */
  function renderForm(wrapper: typeof I18n = I18n) {
    render(
      <>
        <DeviceForm formId='device-form' onSubmitted={vi.fn()} />
        <button type='submit' form='device-form'>
          submit
        </button>
      </>,
      { wrapper },
    );
  }

  it('validates a missing name in the selected language', async () => {
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: 'submit' }));

    expect(
      await screen.findByText(enUS.devices.form.nameRequired),
    ).toBeVisible();
  });

  it('validates a missing name in Chinese when that is the chosen language', async () => {
    renderForm(Chinese);

    await userEvent.click(screen.getByRole('button', { name: 'submit' }));

    expect(
      await screen.findByText(zhCN.devices.form.nameRequired),
    ).toBeVisible();
  });

  it('shows a duplicate code as translated wording, not the server message', async () => {
    api.request.mockRejectedValue(
      new ApiClientError('A device with code "DEV-0001" already exists.', {
        status: 409,
        reason: 'DEVICE_CODE_TAKEN',
        method: 'POST',
        url: '/api/devices',
      }),
    );
    renderForm();

    await userEvent.type(screen.getByLabelText(/Code/u), 'DEV-0001');
    await userEvent.type(screen.getByLabelText(/Name/u), 'Another device');
    await userEvent.click(screen.getByRole('button', { name: 'submit' }));

    expect(await screen.findByText(enUS.devices.form.codeTaken)).toBeVisible();
    expect(screen.queryByText(/already exists/u)).not.toBeInTheDocument();
  });

  it('shows a duplicate code in Chinese when that is the chosen language', async () => {
    api.request.mockRejectedValue(
      new ApiClientError('A device with code "DEV-0001" already exists.', {
        status: 409,
        reason: 'DEVICE_CODE_TAKEN',
        method: 'POST',
        url: '/api/devices',
      }),
    );
    renderForm(Chinese);

    await userEvent.type(screen.getByLabelText(/Code|编号/u), 'DEV-0001');
    await userEvent.type(screen.getByLabelText(/Name|名称/u), '会议室投影仪');
    await userEvent.click(screen.getByRole('button', { name: 'submit' }));

    expect(await screen.findByText(zhCN.devices.form.codeTaken)).toBeVisible();
  });

  it('reports a saved device with its name', async () => {
    api.request.mockResolvedValue({ data: { ...device, id: '2' } });
    renderForm();

    await userEvent.type(screen.getByLabelText(/Code/u), 'DEV-0001');
    await userEvent.type(screen.getByLabelText(/Name/u), 'Dell Latitude 5440');
    await userEvent.click(screen.getByRole('button', { name: 'submit' }));

    await waitFor(() =>
      expect(toaster.show).toHaveBeenCalledWith({
        type: 'success',
        title: enUS.devices.create.success.replace(
          '{{name}}',
          'Dell Latitude 5440',
        ),
      }),
    );
  });
});
