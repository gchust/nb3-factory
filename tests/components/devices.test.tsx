import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import DevicesPage from '../../client/pages/devices/index.js';
import { DeviceForm } from '../../client/pages/devices/device-form.js';
import EditDevicePage from '../../client/pages/devices/edit.js';
import NewDevicePage from '../../client/pages/devices/new.js';
import type { DeviceListResponse } from '../../client/pages/devices/types.js';
import enUS from '../../client/locales/en-US.js';
import zhCN from '../../client/locales/zh-CN.js';

const namespace = '@nocobase/devices-test';
const namespaces = {
  [namespace]: {
    'en-US': async () => ({ default: enUS }),
    'zh-CN': async () => ({ default: zhCN }),
  },
};

const camera = {
  id: 'device-ledger-001',
  code: 'DEV-001',
  name: 'Field camera kit',
  status: 'available' as const,
};
const projector = {
  id: 'device-ledger-002',
  code: 'DEV-002',
  name: 'Portable projector',
  status: 'borrowed' as const,
};

function devicesResponse(devices = [camera, projector]): DeviceListResponse {
  return {
    data: devices,
    meta: { page: 1, pageSize: 10, total: devices.length },
  };
}

describe('device ledger page', () => {
  it('renders localized columns and filters the server list by status', async () => {
    const user = userEvent.setup();
    const calls = vi.fn((call: ApiCall) => {
      if (call.query?.status === 'borrowed') {
        return devicesResponse([projector]);
      }
      return devicesResponse();
    });

    await renderWithApp(<DevicesPage />, {
      namespace,
      namespaces,
      fetch: answerApi(calls),
    });

    expect(await screen.findByText(camera.name)).toBeVisible();
    expect(screen.getByText(projector.name)).toBeVisible();
    expect(
      screen.getByRole('columnheader', { name: enUS.devices.fields.code }),
    ).toBeVisible();
    expect(
      screen.getByRole('columnheader', { name: enUS.devices.fields.name }),
    ).toBeVisible();
    expect(screen.getByText(enUS.devices.status.available)).toBeVisible();
    expect(screen.getByText(enUS.devices.status.borrowed)).toBeVisible();
    const statusFilter = screen.getByRole('combobox', {
      name: enUS.devices.filters.status,
    });
    expect(statusFilter).toHaveTextContent(enUS.devices.filters.allStatuses);

    await user.click(statusFilter);
    await user.click(
      await screen.findByRole('option', {
        name: enUS.devices.status.borrowed,
      }),
    );
    await waitFor(() =>
      expect(statusFilter).toHaveTextContent(enUS.devices.status.borrowed),
    );

    await waitFor(() =>
      expect(calls).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'devices',
          query: expect.objectContaining({
            page: '1',
            pageSize: '10',
            status: 'borrowed',
          }),
        }),
      ),
    );
    expect(await screen.findByText(projector.name)).toBeVisible();
    expect(screen.queryByText(camera.name)).not.toBeInTheDocument();
  });

  it('keeps the ledger and its statuses in Chinese', async () => {
    await renderWithApp(<DevicesPage />, {
      namespace,
      namespaces,
      locale: 'zh-CN',
      fetch: answerApi(() => devicesResponse([projector])),
    });

    expect(
      await screen.findByRole('heading', { name: zhCN.devices.title }),
    ).toBeVisible();
    expect(
      screen.getByRole('columnheader', { name: zhCN.devices.fields.code }),
    ).toBeVisible();
    expect(
      screen.getByRole('columnheader', { name: zhCN.devices.fields.name }),
    ).toBeVisible();
    expect(screen.getByText(zhCN.devices.status.borrowed)).toBeVisible();
    expect(
      screen.getByRole('combobox', { name: zhCN.devices.filters.status }),
    ).toHaveTextContent(zhCN.devices.filters.allStatuses);
    expect(
      screen.getByRole('button', { name: zhCN.devices.create.action }),
    ).toBeVisible();
  });
});

describe('device form', () => {
  it('shows localized required errors and an inline duplicate-code error', async () => {
    const user = userEvent.setup();
    const calls = vi.fn((call: ApiCall) => {
      if (call.method === 'POST') {
        return Response.json(
          {
            error: {
              code: 409,
              status: 'ALREADY_EXISTS',
              reason: 'DEVICE_CODE_TAKEN',
              domain: 'devices',
              message: 'A device with this code already exists.',
            },
          },
          { status: 409 },
        );
      }
      return { data: [] };
    });

    await renderWithApp(
      <>
        <DeviceForm mode='create' onSubmitted={vi.fn()} />
        <button type='submit' form='new-device'>
          Submit
        </button>
      </>,
      {
        namespace,
        namespaces,
        fetch: answerApi(calls),
      },
    );

    expect(
      screen.getByRole('combobox', { name: enUS.devices.fields.status }),
    ).toHaveTextContent(enUS.devices.status.available);
    const submit = screen.getByRole('button', { name: 'Submit' });
    await user.click(submit);
    expect(screen.getByText(enUS.devices.form.codeRequired)).toBeVisible();
    expect(screen.getByText(enUS.devices.form.nameRequired)).toBeVisible();
    expect(calls).not.toHaveBeenCalled();

    const code = screen.getByRole('textbox', {
      name: new RegExp(enUS.devices.fields.code),
    });
    const name = screen.getByRole('textbox', {
      name: new RegExp(enUS.devices.fields.name),
    });
    await user.type(code, '  DEV-900  ');
    await user.type(name, '  Desk microphone  ');
    await user.click(submit);

    expect(await screen.findByText(enUS.devices.form.codeTaken)).toBeVisible();
    expect(code).toHaveAttribute('aria-invalid', 'true');
    expect(calls).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'devices',
        method: 'POST',
        json: {
          code: 'DEV-900',
          name: 'Desk microphone',
          status: 'available',
        },
      }),
    );
  });

  it('retranslates selected status values without remounting or losing the choice', async () => {
    const user = userEvent.setup();
    const view = await renderWithApp(
      <>
        <DevicesPage />
        <DeviceForm mode='create' onSubmitted={vi.fn()} />
      </>,
      {
        namespace,
        namespaces,
        fetch: answerApi(() => devicesResponse()),
      },
    );

    const statusFilter = await screen.findByRole('combobox', {
      name: enUS.devices.filters.status,
    });
    const formStatus = screen.getByRole('combobox', {
      name: enUS.devices.fields.status,
    });
    expect(statusFilter).toHaveTextContent(enUS.devices.filters.allStatuses);
    expect(formStatus).toHaveTextContent(enUS.devices.status.available);

    await act(() => view.app.runtime.i18n.changeLanguage('zh-CN'));
    expect(
      screen.getByRole('combobox', { name: zhCN.devices.filters.status }),
    ).toHaveTextContent(zhCN.devices.filters.allStatuses);
    expect(
      screen.getByRole('combobox', { name: zhCN.devices.fields.status }),
    ).toHaveTextContent(zhCN.devices.status.available);

    await user.click(
      screen.getByRole('combobox', { name: zhCN.devices.fields.status }),
    );
    await user.click(
      await screen.findByRole('option', {
        name: zhCN.devices.status.borrowed,
      }),
    );
    expect(
      screen.getByRole('combobox', { name: zhCN.devices.fields.status }),
    ).toHaveTextContent(zhCN.devices.status.borrowed);

    await act(() => view.app.runtime.i18n.changeLanguage('en-US'));
    expect(
      screen.getByRole('combobox', { name: enUS.devices.filters.status }),
    ).toHaveTextContent(enUS.devices.filters.allStatuses);
    expect(
      screen.getByRole('combobox', { name: enUS.devices.fields.status }),
    ).toHaveTextContent(enUS.devices.status.borrowed);
  });

  it('adds a device from the route overlay and refreshes the ledger', async () => {
    const user = userEvent.setup();
    let devices = [camera];
    const calls = vi.fn((call: ApiCall) => {
      if (call.method === 'POST') {
        const input = call.json as {
          code: string;
          name: string;
          status: 'available' | 'borrowed';
        };
        const created = { id: 'device-new', ...input };
        devices = [...devices, created];
        return Response.json({ data: created }, { status: 201 });
      }
      return {
        data: devices,
        meta: { page: 1, pageSize: 10, total: devices.length },
      };
    });

    function DevicesRoutes() {
      return (
        <Routes>
          <Route path='/devices' element={<DevicesPage />}>
            <Route path='create' element={<NewDevicePage />} />
          </Route>
        </Routes>
      );
    }

    await renderWithApp(<DevicesRoutes />, {
      namespace,
      namespaces,
      route: '/devices',
      fetch: answerApi(calls),
    });

    expect(await screen.findByText(camera.name)).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: enUS.devices.create.action }),
    );

    const dialog = await screen.findByRole('dialog', {
      name: enUS.devices.create.title,
    });
    await user.type(
      within(dialog).getByRole('textbox', {
        name: new RegExp(enUS.devices.fields.code),
      }),
      'DEV-300',
    );
    await user.type(
      within(dialog).getByRole('textbox', {
        name: new RegExp(enUS.devices.fields.name),
      }),
      'New handheld scanner',
    );
    await user.click(
      within(dialog).getByRole('button', {
        name: enUS.devices.create.submit,
      }),
    );

    await waitFor(() =>
      expect(calls).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'devices',
          method: 'POST',
          json: {
            code: 'DEV-300',
            name: 'New handheld scanner',
            status: 'available',
          },
        }),
      ),
    );
    expect(await screen.findByText('New handheld scanner')).toBeVisible();
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: enUS.devices.create.title }),
      ).not.toBeInTheDocument(),
    );
  });

  it('prefills an existing device and saves its edited name and status', async () => {
    const user = userEvent.setup();
    let devices = [camera];
    const calls = vi.fn((call: ApiCall) => {
      if (call.method === 'PATCH') {
        const input = call.json as {
          code: string;
          name: string;
          status: 'available' | 'borrowed';
        };
        const updated = { ...camera, ...input };
        devices = [updated];
        return { data: updated };
      }
      if (call.path === `devices/${camera.id}`) {
        return { data: camera };
      }
      return {
        data: devices,
        meta: { page: 1, pageSize: 10, total: devices.length },
      };
    });

    function DevicesRoutes() {
      return (
        <Routes>
          <Route path='/devices' element={<DevicesPage />}>
            <Route path=':deviceId/edit' element={<EditDevicePage />} />
          </Route>
        </Routes>
      );
    }

    await renderWithApp(<DevicesRoutes />, {
      namespace,
      namespaces,
      route: `/devices/${camera.id}/edit`,
      fetch: answerApi(calls),
    });

    const dialog = await screen.findByRole('dialog', {
      name: enUS.devices.edit.title,
    });
    const name = within(dialog).getByRole('textbox', {
      name: new RegExp(enUS.devices.fields.name),
    });
    await waitFor(() => expect(name).toHaveValue(camera.name));
    expect(
      within(dialog).getByRole('textbox', {
        name: new RegExp(enUS.devices.fields.code),
      }),
    ).toHaveValue(camera.code);

    await user.clear(name);
    await user.type(name, 'Studio camera kit');
    await user.click(
      within(dialog).getByRole('combobox', {
        name: enUS.devices.fields.status,
      }),
    );
    await user.click(
      await screen.findByRole('option', {
        name: enUS.devices.status.borrowed,
      }),
    );
    await user.click(
      within(dialog).getByRole('button', { name: enUS.devices.edit.submit }),
    );

    await waitFor(() =>
      expect(calls).toHaveBeenCalledWith(
        expect.objectContaining({
          path: `devices/${camera.id}`,
          method: 'PATCH',
          json: {
            code: camera.code,
            name: 'Studio camera kit',
            status: 'borrowed',
          },
        }),
      ),
    );
    expect(await screen.findByText('Studio camera kit')).toBeVisible();
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: enUS.devices.edit.title }),
      ).not.toBeInTheDocument(),
    );
  });
});
