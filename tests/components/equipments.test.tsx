import { ApiClientError } from '@nocobase/app-client';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, type ReactNode } from 'react';
import {
  createMemoryRouter,
  RouterProvider,
  type RouteObject,
} from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EquipmentForm } from '../../client/pages/equipments/equipment-form.js';
import EditEquipmentPage from '../../client/pages/equipments/edit.js';
import EquipmentsPage from '../../client/pages/equipments/index.js';
import NewEquipmentPage from '../../client/pages/equipments/new.js';
import type { Equipment } from '../../client/pages/equipments/api.js';
import enUS from '../../client/locales/en-US.js';
import zhCN from '../../client/locales/zh-CN.js';

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
const chineseRuntime = await createTestI18nRuntime({
  locale: 'zh-CN',
  application: {
    namespace: '@nocobase/app-template-default',
    resources: zhCN,
  },
});

function I18n({ children }: { readonly children: ReactNode }): ReactElement {
  return <TestI18nProvider runtime={runtime}>{children}</TestI18nProvider>;
}

function ChineseI18n({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <TestI18nProvider runtime={chineseRuntime}>{children}</TestI18nProvider>
  );
}

const equipment: Equipment = {
  id: '1',
  code: 'EQ-001',
  name: 'Field Camera',
  status: 'available',
  notes: 'Used for site surveys.',
};
const borrowed: Equipment = {
  id: '2',
  code: 'EQ-002',
  name: 'Portable Projector',
  status: 'borrowed',
  notes: null,
};

function page(rows: readonly Equipment[], total = rows.length) {
  return {
    data: rows,
    meta: { page: 1, pageSize: 10, total },
  };
}

function renderLedger(
  initialEntry = '/equipments',
  children: RouteObject[] = [],
) {
  const router = createMemoryRouter(
    [
      {
        path: '/equipments',
        element: <EquipmentsPage />,
        children,
      },
    ],
    { initialEntries: [initialEntry] },
  );
  render(<RouterProvider router={router} />, { wrapper: I18n });
  return router;
}

beforeEach(() => {
  api.request.mockReset();
  toaster.show.mockReset();
});

describe('equipment ledger', () => {
  it('lists the page, links into create and edit, and filters by status', async () => {
    const user = userEvent.setup();
    api.request.mockImplementation(
      async ({ query }: { query?: Record<string, unknown> }) =>
        query?.status === 'borrowed'
          ? page([borrowed])
          : page([equipment, borrowed]),
    );

    const router = renderLedger();

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: enUS.equipment.title,
      }),
    ).toBeVisible();
    expect(await screen.findByText('EQ-001')).toBeVisible();
    expect(screen.getByText('Field Camera')).toBeVisible();
    expect(screen.getByText('Used for site surveys.')).toHaveAttribute(
      'title',
      'Used for site surveys.',
    );
    expect(
      screen.getAllByText(enUS.equipment.status.available),
    ).not.toHaveLength(0);
    expect(
      screen.getByRole('button', { name: enUS.equipment.actions.add }),
    ).toHaveAttribute('href', '/equipments/new');
    expect(
      screen.getAllByRole('button', { name: enUS.equipment.actions.edit })[0],
    ).toHaveAttribute('href', '/equipments/edit/1');

    await user.click(
      screen.getByRole('combobox', { name: enUS.equipment.filter.label }),
    );
    await user.click(
      await screen.findByRole('option', {
        name: enUS.equipment.status.borrowed,
      }),
    );

    await waitFor(() =>
      expect(api.request).toHaveBeenLastCalledWith(
        expect.objectContaining({
          path: 'equipments',
          query: expect.objectContaining({ status: 'borrowed', page: 1 }),
        }),
      ),
    );
    expect(await screen.findByText('EQ-002')).toBeVisible();
    expect(screen.queryByText('EQ-001')).not.toBeInTheDocument();
    expect(router.state.location.search).toBe('?status=borrowed');
    expect(
      screen.getByRole('button', { name: enUS.equipment.actions.add }),
    ).toHaveAttribute('href', '/equipments/new?status=borrowed');
    expect(
      screen.getByRole('button', { name: enUS.equipment.actions.edit }),
    ).toHaveAttribute('href', '/equipments/edit/2?status=borrowed');

    await user.click(
      screen.getByRole('button', { name: enUS.equipment.actions.clearFilters }),
    );
    await waitFor(() =>
      expect(api.request).toHaveBeenLastCalledWith(
        expect.objectContaining({
          path: 'equipments',
          query: expect.not.objectContaining({ status: 'borrowed' }),
        }),
      ),
    );
    expect(router.state.location.search).toBe('');
    expect(await screen.findByText('EQ-001')).toBeVisible();
  });

  it('keeps the header action for an empty filter and clears the filter from the empty state', async () => {
    const user = userEvent.setup();
    api.request.mockResolvedValue(page([]));
    const router = renderLedger('/equipments?status=borrowed');

    expect(
      await screen.findByText(enUS.equipment.empty.filteredTitle),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: enUS.equipment.actions.add }),
    ).toHaveAttribute('href', '/equipments/new?status=borrowed');
    const clearButtons = screen.getAllByRole('button', {
      name: enUS.equipment.actions.clearFilters,
    });
    expect(clearButtons).toHaveLength(2);

    await user.click(clearButtons[1]);
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(await screen.findByText(enUS.equipment.empty.title)).toBeVisible();
  });

  it('differentiates an empty ledger from an empty filter and names the reason for a load failure', async () => {
    api.request.mockResolvedValueOnce(page([]));
    renderLedger();
    expect(await screen.findByText(enUS.equipment.empty.title)).toBeVisible();
    expect(
      screen.getByRole('button', { name: enUS.equipment.actions.add }),
    ).toHaveAttribute('href', '/equipments/new');

    api.request.mockRejectedValueOnce(
      new ApiClientError('network', {
        status: 500,
        reason: 'INTERNAL',
        method: 'GET',
        url: '/api/equipments',
      }),
    );
    renderLedger('/equipments?retry=1');
    expect(
      await screen.findByText(enUS.equipment.errors.loadFailed),
    ).toBeVisible();
    expect(screen.getByText(enUS.equipment.errors.generic)).toBeVisible();

    api.request.mockResolvedValue(page([equipment]));
    fireEvent.click(
      screen.getByRole('button', { name: enUS.equipment.actions.retry }),
    );
    expect(await screen.findByText('EQ-001')).toBeVisible();
  });
});

describe('equipment form', () => {
  it('keeps its required-field copy in the selected language', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { container } = render(
      <EquipmentForm formId='form' onSubmit={onSubmit} />,
      { wrapper: ChineseI18n },
    );

    expect(screen.getByLabelText(zhCN.equipment.fields.code)).toBeVisible();
    expect(screen.getByLabelText(zhCN.equipment.fields.status)).toBeVisible();
    await user.type(
      screen.getByLabelText(zhCN.equipment.fields.code),
      'EQ-009',
    );
    fireEvent.submit(container.querySelector('form')!);

    expect(
      await screen.findByText(zhCN.equipment.validation.nameRequired),
    ).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('puts a duplicate code under the code field and trims notes', async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiClientError('conflict', {
          status: 409,
          reason: 'EQUIPMENT_CODE_TAKEN',
          method: 'POST',
          url: '/api/equipments',
        }),
      )
      .mockResolvedValueOnce(undefined);
    render(<EquipmentForm formId='form' onSubmit={onSubmit} />, {
      wrapper: I18n,
    });

    await user.type(
      screen.getByLabelText(enUS.equipment.fields.code),
      'EQ-001',
    );
    await user.type(
      screen.getByLabelText(enUS.equipment.fields.name),
      'Field Camera',
    );
    await user.type(
      screen.getByLabelText(enUS.equipment.fields.notes),
      '  Site surveys.  ',
    );
    fireEvent.submit(screen.getByRole('button', { hidden: true }));
    expect(
      await screen.findByText(enUS.equipment.errors.codeTaken),
    ).toBeVisible();
    expect(screen.getByLabelText(enUS.equipment.fields.code)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(
      screen.queryByText(enUS.equipment.errors.saveFailed),
    ).not.toBeInTheDocument();
    expect(onSubmit).toHaveBeenLastCalledWith({
      code: 'EQ-001',
      name: 'Field Camera',
      status: 'available',
      notes: 'Site surveys.',
    });
  });
});

describe('equipment child routes', () => {
  it('creates a device, reloads the ledger, notifies, and closes the dialog', async () => {
    const user = userEvent.setup();
    api.request.mockImplementation(async ({ path, method }) =>
      method === 'POST' && path === 'equipments'
        ? { data: equipment }
        : page([equipment]),
    );
    const router = renderLedger('/equipments/new', [
      { path: 'new', element: <NewEquipmentPage /> },
    ]);

    expect(
      await screen.findByRole('heading', {
        name: enUS.equipment.create.title,
      }),
    ).toBeVisible();
    await user.type(
      screen.getByLabelText(enUS.equipment.fields.code),
      'EQ-009',
    );
    await user.type(
      screen.getByLabelText(enUS.equipment.fields.name),
      'Tripod',
    );
    await user.click(
      screen.getByRole('button', { name: enUS.equipment.actions.save }),
    );

    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith({
        path: 'equipments',
        method: 'POST',
        json: {
          code: 'EQ-009',
          name: 'Tripod',
          status: 'available',
          notes: null,
        },
      }),
    );
    await waitFor(() =>
      expect(toaster.show).toHaveBeenCalledWith({
        type: 'success',
        title: enUS.equipment.toast.created,
      }),
    );
    await waitFor(() => {
      const reads = api.request.mock.calls.filter(
        ([request]) =>
          request.path === 'equipments' && request.method !== 'POST',
      );
      expect(reads).toHaveLength(2);
    });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/equipments'),
    );
  });

  it('loads current values, saves an edit, and reports a missing record', async () => {
    const user = userEvent.setup();
    api.request.mockImplementation(
      async ({ path, method }: { path: string; method?: string }) => {
        if (path === 'equipments/1' && method === 'PATCH') {
          return { data: { ...equipment, name: 'Updated' } };
        }
        if (path === 'equipments/1') return { data: equipment };
        return page([equipment]);
      },
    );
    const router = renderLedger('/equipments/edit/1', [
      { path: 'edit/:id', element: <EditEquipmentPage /> },
    ]);

    const name = await screen.findByLabelText(enUS.equipment.fields.name);
    expect(name).toHaveValue('Field Camera');
    await user.clear(name);
    await user.type(name, 'Updated');
    await user.click(
      screen.getByRole('button', { name: enUS.equipment.actions.save }),
    );

    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith({
        path: 'equipments/1',
        method: 'PATCH',
        json: {
          code: 'EQ-001',
          name: 'Updated',
          status: 'available',
          notes: 'Used for site surveys.',
        },
      }),
    );
    await waitFor(() =>
      expect(toaster.show).toHaveBeenCalledWith({
        type: 'success',
        title: enUS.equipment.toast.updated,
      }),
    );
    await waitFor(() => {
      const reads = api.request.mock.calls.filter(
        ([request]) =>
          request.path === 'equipments' &&
          (request.method === undefined || request.method === 'GET'),
      );
      expect(reads).toHaveLength(2);
    });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/equipments'),
    );

    api.request.mockImplementation(async ({ path }: { path: string }) => {
      if (path === 'equipments/404') {
        throw new ApiClientError('missing', {
          status: 404,
          reason: 'EQUIPMENT_NOT_FOUND',
          method: 'GET',
          url: '/api/equipments/404',
        });
      }
      return page([equipment]);
    });
    renderLedger('/equipments/edit/404', [
      { path: 'edit/:id', element: <EditEquipmentPage /> },
    ]);
    expect(
      await screen.findByText(enUS.equipment.errors.notFound),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: enUS.equipment.actions.save }),
    ).toBeDisabled();
  });
});
