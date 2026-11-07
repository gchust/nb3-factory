import { answerApi, renderWithApp } from '@nocobase/app-testing/client';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { expect, it, vi } from 'vitest';

import DevicesPage from '../../client/pages/devices/index.js';
import { DeviceForm } from '../../client/pages/devices/device-form.js';
import enUS from '../../client/locales/en-US.js';
import zhCN from '../../client/locales/zh-CN.js';

const namespace = '@nocobase/devices-test';
const namespaces = {
  [namespace]: {
    'en-US': async () => ({ default: enUS }),
    'zh-CN': async () => ({ default: zhCN }),
  },
};
const devices = [
  {
    id: 'device-1',
    code: 'DEV-1001',
    name: 'Aurora Projector',
    status: 'available',
    notes: 'Meeting room',
  },
  {
    id: 'device-2',
    code: 'DEV-1002',
    name: 'Field Camera',
    status: 'borrowed',
    notes: null,
  },
];

it('lists devices with localized labels and keeps the filter on the edit link', async () => {
  await renderWithApp(<DevicesPage />, {
    namespace,
    namespaces,
    route: '/devices?status=available',
    fetch: answerApi(() => ({
      data: devices,
      meta: { page: 1, pageSize: 20, total: devices.length },
    })),
  });

  expect(
    await screen.findByRole('heading', { name: enUS.devices.title }),
  ).toBeVisible();
  expect(screen.getByText('Aurora Projector')).toBeVisible();
  // Device names and notes are user data and are shown exactly as entered.
  expect(screen.getByText('Meeting room')).toBeVisible();
  const table = within(screen.getByRole('table'));
  expect(table.getByText(enUS.devices.status.available)).toBeVisible();
  expect(table.getByText(enUS.devices.status.borrowed)).toBeVisible();
  expect(
    screen.getAllByRole('button', { name: enUS.actions.edit })[0],
  ).toHaveAttribute('href', '/devices/edit/device-1?status=available');
  expect(
    screen.getByRole('button', { name: enUS.devices.create.action }),
  ).toHaveAttribute('href', '/devices/new?status=available');
});

it('localizes the empty filtered state in Chinese', async () => {
  await renderWithApp(<DevicesPage />, {
    namespace,
    namespaces,
    locale: 'zh-CN',
    route: '/devices?status=borrowed',
    fetch: answerApi(() => ({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    })),
  });

  expect(
    await screen.findByRole('heading', { name: zhCN.devices.title }),
  ).toBeVisible();
  expect(screen.getByText(zhCN.devices.empty.filteredTitle)).toBeVisible();
  expect(
    screen.getAllByRole('button', { name: zhCN.devices.filter.clear }),
  ).toHaveLength(2);
  expect(screen.queryByText('No devices match this filter')).toBeNull();
});

it('shows localized required-field and duplicate-code errors without server codes', async () => {
  const user = userEvent.setup();
  const request = vi.fn(() =>
    Response.json(
      {
        error: {
          reason: 'DEVICE_CODE_TAKEN',
          message: 'Another device already uses this code.',
          localizedMessage: {
            locale: 'en-US',
            message: 'This device code is already in use.',
          },
        },
      },
      { status: 409 },
    ),
  );
  const save = (): ReactElement => (
    <button form='device-form' type='submit'>
      Save
    </button>
  );

  await renderWithApp(
    <>
      <DeviceForm
        formId='device-form'
        busy={false}
        onBusyChange={() => undefined}
        onSaved={() => undefined}
        onMissing={() => undefined}
      />
      {save()}
    </>,
    { namespace, namespaces, fetch: answerApi(request) },
  );

  await user.type(
    screen.getByRole('textbox', { name: /Device code/u }),
    'DEV-1001',
  );
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText(enUS.devices.form.nameRequired)).toBeVisible();

  await user.type(
    screen.getByRole('textbox', { name: /Device name/u }),
    'Desk Lamp',
  );
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText(enUS.devices.form.codeTaken)).toBeVisible();
  expect(screen.queryByText('DEVICE_CODE_TAKEN')).not.toBeInTheDocument();
});
