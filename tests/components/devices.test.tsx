import { useAppLocale } from '@nocobase/app-plugin-i18n/client';
import { answerApi, renderWithApp } from '@nocobase/app-testing/client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import zhCN from '../../client/locales/zh-CN.js';
import DevicesPage from '../../client/pages/devices/index.js';

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
    code: 'DEV-0001',
    name: '会议室投影仪',
    status: 'available',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'device-2',
    code: 'DEV-0002',
    name: '便携式录音笔',
    status: 'borrowed',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
] as const;

interface ApiCall {
  readonly path: string;
  readonly method?: string;
  readonly query?: Readonly<Record<string, string | readonly string[]>>;
  readonly json?: unknown;
}

function duplicateCodeResponse(): Response {
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

function LocaleSwitcher(): React.ReactElement {
  const { setLocale, switching } = useAppLocale();
  return (
    <button
      type='button'
      disabled={switching}
      onClick={() => void setLocale('zh-CN')}
    >
      Switch to Chinese
    </button>
  );
}

const renderPage = (
  locale: 'en-US' | 'zh-CN',
  calls: (call: ApiCall) => unknown,
) =>
  renderWithApp(<DevicesPage />, {
    namespace,
    namespaces,
    locale,
    fetch: answerApi(calls),
  });

describe('device ledger page', () => {
  it('shows the ledger in English with translated statuses', async () => {
    await renderPage('en-US', () => ({ data: devices }));

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: enUS.devices.title,
      }),
    ).toBeVisible();
    expect(screen.getByText('DEV-0001')).toBeVisible();
    expect(screen.getByText(enUS.devices.available)).toBeVisible();
    expect(screen.getByText(enUS.devices.borrowed)).toBeVisible();
    expect(
      screen.getByRole('button', { name: enUS.devices.add }),
    ).toBeVisible();
  });

  it('shows translated system copy in Chinese while keeping entered names unchanged', async () => {
    await renderPage('zh-CN', () => ({ data: devices }));

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: zhCN.devices.title,
      }),
    ).toBeVisible();
    expect(screen.getByText(zhCN.devices.available)).toBeVisible();
    expect(screen.getByText(zhCN.devices.borrowed)).toBeVisible();
    expect(screen.getByText('会议室投影仪')).toBeVisible();
    expect(screen.getByText('便携式录音笔')).toBeVisible();
    expect(screen.queryByText(enUS.devices.available)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: zhCN.devices.add }),
    ).toBeVisible();
  });

  it('switches language without losing the loaded devices or their names', async () => {
    const user = userEvent.setup();
    await renderWithApp(
      <>
        <DevicesPage />
        <LocaleSwitcher />
      </>,
      {
        namespace,
        namespaces,
        locale: 'en-US',
        fetch: answerApi((call: ApiCall) =>
          call.path === 'i18n/locale'
            ? { data: { locale: 'zh-CN' } }
            : { data: devices },
        ),
      },
    );

    expect(await screen.findByText(enUS.devices.available)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Switch to Chinese' }));

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: zhCN.devices.title,
      }),
    ).toBeVisible();
    expect(screen.getByText(zhCN.devices.available)).toBeVisible();
    expect(screen.getByText(zhCN.devices.borrowed)).toBeVisible();
    expect(screen.getByText('会议室投影仪')).toBeVisible();
    expect(screen.getByText('便携式录音笔')).toBeVisible();
  });

  it('shows localized status labels in the filter and the add form in English', async () => {
    const user = userEvent.setup();
    await renderPage('en-US', () => ({ data: devices }));

    const filter = await screen.findByRole('combobox', {
      name: enUS.devices.filterStatus,
    });
    expect(filter).toHaveTextContent(enUS.devices.allStatuses);
    expect(filter).not.toHaveTextContent('all');

    await user.click(
      await screen.findByRole('button', { name: enUS.devices.add }),
    );
    const status = screen.getByRole('combobox', {
      name: enUS.devices.status,
    });
    expect(status).toHaveTextContent(enUS.devices.available);
    expect(status).not.toHaveTextContent('available');
  });

  it('shows localized status labels in the filter and the add form in Chinese', async () => {
    const user = userEvent.setup();
    await renderPage('zh-CN', () => ({ data: devices }));

    const filter = await screen.findByRole('combobox', {
      name: zhCN.devices.filterStatus,
    });
    expect(filter).toHaveTextContent(zhCN.devices.allStatuses);
    expect(filter).not.toHaveTextContent('all');

    await user.click(
      await screen.findByRole('button', { name: zhCN.devices.add }),
    );
    const status = screen.getByRole('combobox', {
      name: zhCN.devices.status,
    });
    expect(status).toHaveTextContent(zhCN.devices.available);
    expect(status).not.toHaveTextContent('available');
  });

  it('filters the ledger by status through the API', async () => {
    const user = userEvent.setup();
    const calls: ApiCall[] = [];
    await renderPage('en-US', (call) => {
      calls.push(call);
      return {
        data:
          call.query?.status === 'borrowed'
            ? devices.filter((device) => device.status === 'borrowed')
            : devices,
      };
    });

    expect(await screen.findByText('DEV-0001')).toBeVisible();
    await user.click(
      screen.getByRole('combobox', { name: enUS.devices.filterStatus }),
    );
    await user.click(
      await screen.findByRole('option', { name: enUS.devices.borrowed }),
    );

    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.path === 'devices' && call.query?.status === 'borrowed',
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(screen.queryByText('DEV-0001')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('DEV-0002')).toBeVisible();
  });

  it('explains missing fields and a duplicate code in English', async () => {
    const user = userEvent.setup();
    await renderPage('en-US', (call) =>
      call.method === 'POST' ? duplicateCodeResponse() : { data: devices },
    );

    await user.click(
      await screen.findByRole('button', { name: enUS.devices.add }),
    );
    await user.click(screen.getByRole('button', { name: enUS.devices.save }));
    expect(await screen.findByText(enUS.devices.codeRequired)).toBeVisible();
    expect(screen.getByText(enUS.devices.nameRequired)).toBeVisible();

    await user.type(
      screen.getByRole('textbox', { name: enUS.devices.code }),
      'DEV-0001',
    );
    await user.type(
      screen.getByRole('textbox', { name: enUS.devices.name }),
      'Duplicate device',
    );
    await user.click(screen.getByRole('button', { name: enUS.devices.save }));

    expect(await screen.findByText(enUS.devices.duplicateCode)).toBeVisible();
    expect(screen.queryByText('DEVICE_CODE_TAKEN')).not.toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: enUS.devices.code }),
    ).toHaveValue('DEV-0001');
  });

  it('shows the empty ledger and localized errors in Chinese', async () => {
    const user = userEvent.setup();
    await renderPage('zh-CN', (call) =>
      call.method === 'POST' ? duplicateCodeResponse() : { data: [] },
    );

    expect(await screen.findByText(zhCN.devices.empty)).toBeVisible();
    await user.click(screen.getByRole('button', { name: zhCN.devices.add }));
    await user.click(screen.getByRole('button', { name: zhCN.devices.save }));
    expect(await screen.findByText(zhCN.devices.codeRequired)).toBeVisible();
    expect(screen.getByText(zhCN.devices.nameRequired)).toBeVisible();

    await user.type(
      screen.getByRole('textbox', { name: zhCN.devices.code }),
      'DEV-0001',
    );
    await user.type(
      screen.getByRole('textbox', { name: zhCN.devices.name }),
      '重复设备',
    );
    await user.click(screen.getByRole('button', { name: zhCN.devices.save }));

    expect(await screen.findByText(zhCN.devices.duplicateCode)).toBeVisible();
    expect(screen.queryByText('DEVICE_CODE_TAKEN')).not.toBeInTheDocument();
  });

  it('edits a device without translating its name', async () => {
    const user = userEvent.setup();
    const calls: ApiCall[] = [];
    await renderPage('en-US', (call) => {
      calls.push(call);
      return { data: devices };
    });

    await screen.findByText('DEV-0001');
    const firstRow = screen.getAllByRole('row')[1]!;
    await user.click(
      within(firstRow).getByRole('button', {
        name: enUS.devices.editDevice.replace('{{name}}', '会议室投影仪'),
      }),
    );
    const name = screen.getByRole('textbox', { name: enUS.devices.name });
    expect(name).toHaveValue('会议室投影仪');
    await user.clear(name);
    await user.type(name, '会议室投影仪（新）');
    await user.click(screen.getByRole('button', { name: enUS.devices.save }));

    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.method === 'PATCH' &&
            call.path === 'devices/device-1' &&
            Reflect.get(call.json ?? {}, 'name') === '会议室投影仪（新）',
        ),
      ).toBe(true),
    );
  });
});
