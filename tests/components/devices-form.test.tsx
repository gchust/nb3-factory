import { ApiClientError } from '@nocobase/app-client';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DeviceForm } from '../../client/pages/devices/device-form.js';
import type { Device } from '../../client/pages/devices/types.js';
import enUS from '../../client/locales/en-US.js';

const { api, toaster } = vi.hoisted(() => ({
  api: { request: vi.fn() },
  toaster: { show: vi.fn(), close: vi.fn() },
}));

vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
  useToaster: () => toaster,
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

const device: Device = {
  id: '7',
  code: 'EQ-007',
  name: 'Microphone',
  status: 'available',
  notes: 'Kept in the cabinet',
  createdAt: '2026-01-05T09:00:00.000Z',
  updatedAt: null,
};

function renderForm({
  current,
  onSubmitted = vi.fn(),
  onNotFound = vi.fn(),
}: {
  readonly current?: Device;
  readonly onSubmitted?: (saved: Device) => void;
  readonly onNotFound?: () => void;
} = {}) {
  render(
    <I18n>
      <DeviceForm
        device={current}
        formId='device-test-form'
        onSubmitted={onSubmitted}
        onNotFound={onNotFound}
      />
      <button form='device-test-form' type='submit'>
        Submit
      </button>
    </I18n>,
  );
  return { onSubmitted, onNotFound };
}

describe('device form', () => {
  beforeEach(() => {
    api.request.mockReset();
    toaster.show.mockReset();
  });

  it('validates required fields before sending anything', async () => {
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(
      await screen.findByText(enUS.devices.form.codeRequired),
    ).toBeVisible();
    expect(screen.getByText(enUS.devices.form.nameRequired)).toBeVisible();
    expect(api.request).not.toHaveBeenCalled();
  });

  it('creates a device with trimmed values and an empty note stored as null', async () => {
    api.request.mockResolvedValue({ data: device });
    const { onSubmitted } = renderForm();

    await userEvent.type(
      screen.getByRole('textbox', { name: enUS.devices.fields.code }),
      '  EQ-007  ',
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: enUS.devices.fields.name }),
      '  Microphone  ',
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: enUS.devices.fields.notes }),
      '   ',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'devices',
        method: 'POST',
        json: {
          code: 'EQ-007',
          name: 'Microphone',
          status: 'available',
          notes: null,
        },
      }),
    );
    expect(onSubmitted).toHaveBeenCalledWith(device);
    expect(toaster.show).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
        title: 'Device “Microphone” created.',
      }),
    );
  });

  it('shows a duplicate code where the code is entered', async () => {
    api.request.mockRejectedValue(
      new ApiClientError('A device with code EQ-007 already exists.', {
        status: 409,
        reason: 'DEVICE_CODE_TAKEN',
        method: 'POST',
        url: '/api/devices',
      }),
    );
    const { onSubmitted } = renderForm();

    await userEvent.type(
      screen.getByRole('textbox', { name: enUS.devices.fields.code }),
      'EQ-007',
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: enUS.devices.fields.name }),
      'Microphone',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText(enUS.devices.form.codeTaken)).toBeVisible();
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(toaster.show).not.toHaveBeenCalled();
  });

  it('updates an existing device and reports a deleted record', async () => {
    api.request.mockRejectedValue(
      new ApiClientError('Device 7 does not exist.', {
        status: 404,
        method: 'PATCH',
        url: '/api/devices/7',
      }),
    );
    const { onSubmitted, onNotFound } = renderForm({ current: device });

    const notes = screen.getByRole('textbox', {
      name: enUS.devices.fields.notes,
    });
    await userEvent.clear(notes);
    await userEvent.type(notes, 'Moved to meeting room B');
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'devices/7',
        method: 'PATCH',
        json: {
          code: device.code,
          name: device.name,
          status: device.status,
          notes: 'Moved to meeting room B',
        },
      }),
    );
    expect(onNotFound).toHaveBeenCalledTimes(1);
    expect(onSubmitted).not.toHaveBeenCalled();
  });
});
