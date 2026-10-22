import { answerApi, renderWithApp } from '@nocobase/app-testing/client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import DevicesPage from '../../client/pages/devices/index.js';
import enUS from '../../client/locales/en-US.js';
import zhCN from '../../client/locales/zh-CN.js';

const namespace = '@nocobase/app-template-default';
const namespaces = {
  [namespace]: {
    'en-US': async () => ({ default: enUS }),
    'zh-CN': async () => ({ default: zhCN }),
  },
};

const devices = [
  {
    id: 'seed-device-0001',
    code: 'DEV-1001',
    name: 'ThinkPad T14 Laptop',
    status: 'available',
    notes: 'Office 3F, desk A-12.',
  },
  {
    id: 'seed-device-0002',
    code: 'DEV-1002',
    name: 'Epson EB-X06 Projector',
    status: 'borrowed',
    notes: null,
  },
];

const listAnswer = () => ({
  data: devices,
  meta: { page: 1, pageSize: 100, total: 2 },
});

describe('device ledger page', () => {
  it('lists devices with translated system statuses and keeps typed values out of translation', async () => {
    const calls = vi.fn(listAnswer);
    await renderWithApp(<DevicesPage />, {
      namespace,
      namespaces,
      fetch: answerApi(calls),
    });

    expect(await screen.findByText('ThinkPad T14 Laptop')).toBeVisible();
    expect(screen.getByText('DEV-1001')).toBeVisible();
    // The status is a system value, so it is translated; the notes are the device's own, so they are shown as typed.
    expect(screen.getByText('Available')).toBeVisible();
    expect(screen.getByText('Borrowed')).toBeVisible();
    expect(screen.getByText('Office 3F, desk A-12.')).toBeVisible();
  });

  it('renders the whole page in Chinese when the locale is Chinese', async () => {
    await renderWithApp(<DevicesPage />, {
      namespace,
      namespaces,
      locale: 'zh-CN',
      fetch: answerApi(() => ({
        data: devices,
        meta: { page: 1, pageSize: 100, total: 2 },
      })),
    });

    expect(
      await screen.findByRole('heading', { name: '设备台账' }),
    ).toBeVisible();
    expect(screen.getByText('可借用')).toBeVisible();
    expect(screen.getByText('已借出')).toBeVisible();
    expect(screen.getByRole('button', { name: '新增设备' })).toBeVisible();
    // The device's own name is never translated.
    expect(screen.getByText('ThinkPad T14 Laptop')).toBeVisible();
  });

  it('filters by status through the API', async () => {
    const user = userEvent.setup();
    const calls = vi.fn(listAnswer);
    await renderWithApp(<DevicesPage />, {
      namespace,
      namespaces,
      fetch: answerApi(calls),
    });
    await screen.findByText('ThinkPad T14 Laptop');

    await user.click(
      screen.getByRole('combobox', { name: 'Filter by status' }),
    );
    await user.click(await screen.findByRole('option', { name: 'Borrowed' }));

    await waitFor(() =>
      expect(calls).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'devices',
          method: 'GET',
          query: expect.objectContaining({ status: 'borrowed' }),
        }),
      ),
    );
  });

  it('shows a create button and an empty-state hint for a ledger with no devices', async () => {
    await renderWithApp(<DevicesPage />, {
      namespace,
      namespaces,
      fetch: answerApi(() => ({
        data: [],
        meta: { page: 1, pageSize: 100, total: 0 },
      })),
    });

    expect(await screen.findByText('No devices yet')).toBeVisible();
    expect(
      screen.getByText('Add the first device to start the ledger.'),
    ).toBeVisible();
    expect(
      screen.getAllByRole('button', { name: 'New device' }).length,
    ).toBeGreaterThan(0);
  });

  it('validates required fields in the selected language before calling the API', async () => {
    const user = userEvent.setup();
    const calls = vi.fn(listAnswer);
    await renderWithApp(<DevicesPage />, {
      namespace,
      namespaces,
      fetch: answerApi(calls),
    });
    await screen.findByText('ThinkPad T14 Laptop');

    await user.click(screen.getByRole('button', { name: 'New device' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Save' }));

    expect(await dialog.findByText('Enter a device code.')).toBeVisible();
    expect(dialog.getByText('Enter a device name.')).toBeVisible();
    expect(calls.mock.calls.some(([call]) => call.method === 'POST')).toBe(
      false,
    );
  });

  it('shows a translated save toast after creating a device', async () => {
    const user = userEvent.setup();
    const calls = vi.fn((call: { path: string; method: string }) =>
      call.method === 'POST'
        ? {
            data: {
              id: 'new-device',
              code: 'DEV-9001',
              name: 'New laptop',
              status: 'available',
              notes: null,
            },
          }
        : listAnswer(),
    );
    const rendered = await renderWithApp(<DevicesPage />, {
      namespace,
      namespaces,
      fetch: answerApi(calls),
    });
    await screen.findByText('ThinkPad T14 Laptop');

    await user.click(screen.getByRole('button', { name: 'New device' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.type(dialog.getByRole('textbox', { name: 'Code' }), 'DEV-9001');
    await user.type(
      dialog.getByRole('textbox', { name: 'Name' }),
      'New laptop',
    );
    await user.click(dialog.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(rendered.toasts()).toEqual([
        expect.objectContaining({
          title: 'Device "New laptop" was created.',
        }),
      ]),
    );
  });

  it('shows a duplicate code as a translated field error, never the server message', async () => {
    const user = userEvent.setup();
    const calls = vi.fn((call: { path: string; method: string }) =>
      call.method === 'POST'
        ? Response.json(
            {
              error: {
                status: 'ALREADY_EXISTS',
                reason: 'DEVICE_CODE_TAKEN',
                domain: 'devices',
                message: 'A device with the code DEV-1001 already exists.',
              },
            },
            { status: 409 },
          )
        : listAnswer(),
    );
    await renderWithApp(<DevicesPage />, {
      namespace,
      namespaces,
      fetch: answerApi(calls),
    });
    await screen.findByText('ThinkPad T14 Laptop');

    await user.click(screen.getByRole('button', { name: 'New device' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.type(dialog.getByRole('textbox', { name: 'Code' }), 'DEV-1001');
    await user.type(
      dialog.getByRole('textbox', { name: 'Name' }),
      'Another laptop',
    );
    await user.click(dialog.getByRole('button', { name: 'Save' }));

    expect(
      await dialog.findByText('This code is already used by another device.'),
    ).toBeVisible();
    expect(
      dialog.queryByText(/A device with the code/),
    ).not.toBeInTheDocument();
  });
});
