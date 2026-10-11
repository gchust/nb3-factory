import { ApiClientError } from '@nocobase/app-client';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import { DeviceForm } from '../../client/pages/devices/device-form.js';
import type { Device } from '../../client/pages/devices/types.js';

const { api, toaster, refresh } = vi.hoisted(() => ({
  api: { request: vi.fn() },
  toaster: { show: vi.fn(), close: vi.fn() },
  refresh: vi.fn(),
}));

vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
  useToaster: () => toaster,
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

const FORM_ID = 'device-form';

/** The form plus the container's submit button, linked through `formId` as the dialogs link theirs. */
function Host({
  device,
  onSubmitted,
}: {
  readonly device?: Device;
  readonly onSubmitted: (device: Device) => void;
}): ReactElement {
  return (
    <>
      <DeviceForm formId={FORM_ID} device={device} onSubmitted={onSubmitted} />
      <button type='submit' form={FORM_ID}>
        Save
      </button>
    </>
  );
}

function renderForm(device?: Device) {
  const onSubmitted = vi.fn();
  render(<Host device={device} onSubmitted={onSubmitted} />, {
    wrapper: I18n,
  });
  return { onSubmitted, save: screen.getByRole('button', { name: 'Save' }) };
}

const code = (): HTMLElement =>
  screen.getByLabelText(new RegExp(enUS.devices.fields.code));
const name = (): HTMLElement =>
  screen.getByLabelText(new RegExp(enUS.devices.fields.name));

beforeEach(() => {
  api.request.mockReset();
  toaster.show.mockReset();
  refresh.mockReset();
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

describe('device form', () => {
  it('refuses a device without a name, in the current language', async () => {
    const { onSubmitted, save } = renderForm();
    await userEvent.type(code(), 'C-1');
    await userEvent.click(save);

    expect(
      await screen.findByText(enUS.devices.form.nameRequired),
    ).toBeInTheDocument();
    expect(api.request).not.toHaveBeenCalled();
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it('shows a duplicate code under the code field, not as a raw reason code', async () => {
    api.request.mockRejectedValue(
      new ApiClientError('Conflict', {
        status: 409,
        reason: 'DEVICE_CODE_TAKEN',
        method: 'POST',
        url: '/api/devices',
      }),
    );
    const { onSubmitted, save } = renderForm();
    await userEvent.type(code(), 'C-1');
    await userEvent.type(name(), 'Alpha');
    await userEvent.click(save);

    expect(
      await screen.findByText(enUS.devices.errors.codeTaken),
    ).toBeInTheDocument();
    expect(screen.queryByText('DEVICE_CODE_TAKEN')).toBeNull();
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it('trims, sends and reports a created device', async () => {
    const created: Device = {
      id: '5',
      code: 'C-1',
      name: 'Alpha',
      status: 'available',
    };
    api.request.mockResolvedValue({ data: created });
    const { onSubmitted, save } = renderForm();
    // The user's own text keeps its case and is only trimmed; nothing translates the name.
    await userEvent.type(code(), '  C-1  ');
    await userEvent.type(name(), 'Alpha');
    await userEvent.click(save);

    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'devices',
          method: 'POST',
          json: { code: 'C-1', name: 'Alpha', status: 'available' },
        }),
      ),
    );
    expect(toaster.show).toHaveBeenCalledWith({
      type: 'success',
      title: enUS.devices.create.success.replace('{{name}}', 'Alpha'),
    });
    expect(onSubmitted).toHaveBeenCalledWith(created);
  });

  it('updates an existing device through its own route', async () => {
    const existing: Device = {
      id: '7',
      code: 'E-1',
      name: 'Existing',
      status: 'borrowed',
    };
    const saved: Device = { ...existing, name: 'Edited' };
    api.request.mockResolvedValue({ data: saved });
    const { onSubmitted, save } = renderForm(existing);

    expect(name()).toHaveValue('Existing');
    await userEvent.clear(name());
    await userEvent.type(name(), 'Edited');
    await userEvent.click(save);

    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'devices/7',
          method: 'PATCH',
          json: { code: 'E-1', name: 'Edited', status: 'borrowed' },
        }),
      ),
    );
    expect(toaster.show).toHaveBeenCalledWith({
      type: 'success',
      title: enUS.devices.edit.success.replace('{{name}}', 'Edited'),
    });
    expect(onSubmitted).toHaveBeenCalledWith(saved);
  });
});
