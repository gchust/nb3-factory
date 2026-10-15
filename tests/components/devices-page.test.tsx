import { ApiClientError } from '@nocobase/app-client';
import type { Locale } from '@nocobase/i18n';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '../../client/components/ui/tooltip.js';
import locales from '../../client/locales/index.js';
import DevicesPage from '../../client/pages/devices/index.js';
import NewDevicePage from '../../client/pages/devices/new.js';
import type { Device } from '../../client/pages/devices/types.js';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  toaster: { show: vi.fn(), close: vi.fn() },
}));

// The real `ApiClientError` stays in place: the page branches on `instanceof` and on its `status`.
vi.mock('@nocobase/app-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nocobase/app-client')>()),
  useApiClient: () => ({ request: mocks.request }),
  useToaster: () => mocks.toaster,
}));

const projector: Device = {
  id: '1',
  code: 'DEV-001',
  name: '会议室投影仪',
  status: 'available',
  notes: '三层 A 会议室，含遥控器和 HDMI 线。',
};
const tablet: Device = {
  id: '2',
  code: 'DEV-002',
  name: 'Field Measurement Tablet',
  status: 'borrowed',
  notes: null,
};

async function createRuntime(locale: Locale): Promise<I18nRuntime> {
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: 'nb3-factory-app',
  });
  // The application's own locale files decide what the page says, exactly as they do in the browser.
  runtime.registerApplicationNamespace('nb3-factory-app', locales);
  await runtime.init(locale);
  return runtime;
}

function renderDevices(
  runtime: I18nRuntime,
  path = '/devices',
): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <I18nProvider runtime={runtime}>
        <TooltipProvider>
          <Routes>
            <Route path='/devices' element={<DevicesPage />}>
              <Route path='new' element={<NewDevicePage />} />
            </Route>
          </Routes>
        </TooltipProvider>
      </I18nProvider>
    </MemoryRouter>,
  );
}

function answerList(devices: readonly Device[], filtered = false): void {
  mocks.request.mockImplementation(async () => ({
    data: [...devices],
    meta: { total: devices.length, filtered },
  }));
}

beforeEach(() => {
  mocks.request.mockReset();
  mocks.toaster.show.mockReset();
});

describe('device ledger page', () => {
  it('lists the devices with the statuses translated and the names shown as they were stored', async () => {
    answerList([projector, tablet]);
    const runtime = await createRuntime('en-US');
    renderDevices(runtime);

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Device ledger',
      }),
    ).toBeInTheDocument();
    // The codes identify the devices and the names are ordinary text, in whichever language they were typed.
    expect(screen.getByText('DEV-001')).toBeInTheDocument();
    expect(screen.getByText('会议室投影仪')).toBeInTheDocument();
    expect(screen.getByText('Field Measurement Tablet')).toBeInTheDocument();
    // The statuses are the system's own values, translated.
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByText('Borrowed')).toBeInTheDocument();
    // A device without notes shows a placeholder rather than nothing at all.
    expect(screen.getByText('—')).toBeInTheDocument();

    expect(mocks.request).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'devices' }),
    );
  });

  it('renders in the chosen language without translating what a user typed', async () => {
    answerList([projector, tablet]);
    const runtime = await createRuntime('zh-CN');
    renderDevices(runtime);

    expect(
      await screen.findByRole('heading', { level: 1, name: '设备台账' }),
    ).toBeInTheDocument();
    expect(screen.getByText('可借用')).toBeInTheDocument();
    expect(screen.getByText('已借出')).toBeInTheDocument();
    // The device names are business data: the Chinese one and the English one both stay exactly as stored.
    expect(screen.getByText('会议室投影仪')).toBeInTheDocument();
    expect(screen.getByText('Field Measurement Tablet')).toBeInTheDocument();
    // The filter and the create action are the application's own wording, so they follow the language too.
    expect(
      screen.getByRole('button', { name: /新增设备/u }),
    ).toBeInTheDocument();
  });

  it('explains the ledger is empty and offers to add the first device', async () => {
    answerList([]);
    const runtime = await createRuntime('en-US');
    renderDevices(runtime);

    expect(await screen.findByText('No devices yet')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Add device/u }),
    ).toBeInTheDocument();
  });

  it('asks the endpoint for one status when the filter is in the URL', async () => {
    answerList([tablet], true);
    const runtime = await createRuntime('en-US');
    renderDevices(runtime, '/devices?status=borrowed');

    await screen.findByText('DEV-002');
    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'devices',
          query: { status: 'borrowed' },
        }),
      ),
    );
    // The filter value is one of the system's, so it is translated on screen.
    expect(
      screen.getByRole('combobox', { name: 'Filter by status' }),
    ).toHaveTextContent('Borrowed');
  });

  it('shows why the list failed and offers to retry', async () => {
    mocks.request.mockImplementation(async () => {
      throw new ApiClientError('failed', {
        status: 500,
        method: 'GET',
        url: 'http://localhost/api/devices',
      });
    });
    const runtime = await createRuntime('en-US');
    renderDevices(runtime);

    expect(
      await screen.findByText('Something went wrong. Please try again.'),
    ).toBeInTheDocument();
    mocks.request.mockImplementation(async () => ({
      data: [projector],
      meta: { total: 1 },
    }));
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('DEV-001')).toBeInTheDocument();
  });
});

describe('adding a device', () => {
  it('requires a code and a name', async () => {
    answerList([projector]);
    const runtime = await createRuntime('en-US');
    renderDevices(runtime, '/devices/new');

    // The dialog is open over the list, and its submit button belongs to the form by id.
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Create' }),
    );

    expect(
      await within(dialog).findByText('Enter a code.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Enter a name.')).toBeInTheDocument();
    // Nothing was sent: the form refused the empty values first.
    expect(mocks.request).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('says the code is taken when the endpoint refuses it', async () => {
    mocks.request.mockImplementation(async (request: RequestOptions) => {
      if (request.method === 'POST') {
        throw new ApiClientError('code taken', {
          status: 409,
          reason: 'DEVICE_CODE_TAKEN',
          domain: 'app',
          method: 'POST',
          url: 'http://localhost/api/devices',
        });
      }
      return { data: [projector], meta: { total: 1 } };
    });
    const runtime = await createRuntime('zh-CN');
    renderDevices(runtime, '/devices/new');

    const dialog = await screen.findByRole('dialog');
    // The labels are the application's own, so they are Chinese here.
    await userEvent.type(
      within(dialog).getByLabelText('编码', { exact: false }),
      'DEV-001',
    );
    await userEvent.type(
      within(dialog).getByLabelText('名称', { exact: false }),
      '测试设备',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: '新建' }));

    expect(
      await within(dialog).findByText('已有其他设备使用该编码。'),
    ).toBeInTheDocument();
    // The message is on the code field, beside the value to change.
    expect(
      within(dialog).getByLabelText('编码', { exact: false }),
    ).toHaveFocus();
  });

  it('sends what was typed, exactly as typed, and reports the save', async () => {
    mocks.request.mockImplementation(async (request: RequestOptions) =>
      request.method === 'POST'
        ? { data: projector }
        : { data: [projector], meta: { total: 1 } },
    );
    const runtime = await createRuntime('en-US');
    renderDevices(runtime, '/devices/new');

    const dialog = await screen.findByRole('dialog');
    await userEvent.type(
      within(dialog).getByLabelText('Code', { exact: false }),
      'DEV-001',
    );
    await userEvent.type(
      within(dialog).getByLabelText('Name', { exact: false }),
      '会议室投影仪',
    );
    await userEvent.type(
      within(dialog).getByLabelText('Notes', { exact: false }),
      '三层 A 会议室。',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Create' }),
    );

    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'devices',
          method: 'POST',
          // The Chinese name and notes travel as typed; nothing translates business data on the way out.
          json: expect.objectContaining({
            code: 'DEV-001',
            name: '会议室投影仪',
            notes: '三层 A 会议室。',
          }),
        }),
      ),
    );
    await waitFor(() =>
      expect(mocks.toaster.show).toHaveBeenCalledWith({
        type: 'success',
        title: '“会议室投影仪” was added.',
      }),
    );
  });
});

interface RequestOptions {
  readonly path: string;
  readonly method?: string;
  readonly json?: unknown;
  readonly query?: unknown;
  readonly signal?: AbortSignal;
}
